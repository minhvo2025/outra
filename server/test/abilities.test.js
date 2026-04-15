'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  rooms,
  playerRoomBySocketId,
  ABILITY_IDS,
  MATCH_PHASE_COMBAT,
  ROOM_STATES,
  createRoomPlayer,
  createMatchForRoom,
  processMatchTickForRoom,
  handleAbilityCastRequest,
  executeAbilityCast,
  getAbilityDef,
  setAbilityReadyAt,
  getAbilityRemainingMs,
  cleanupRoomMatchState
} = require('../index');

const DRAFTED_ABILITY_IDS = [
  ABILITY_IDS.BLINK,
  ABILITY_IDS.SHIELD,
  ABILITY_IDS.GUST,
  ABILITY_IDS.CHARGE,
  ABILITY_IDS.SHOCK,
  ABILITY_IDS.HOOK,
  ABILITY_IDS.WALL,
  ABILITY_IDS.REWIND
];
let fixtureCounter = 0;

function clearSharedState() {
  rooms.clear();
  playerRoomBySocketId.clear();
}

function setLoadout(matchPlayer, draftedSpells) {
  const drafted = Array.isArray(draftedSpells) ? draftedSpells.slice(0, 3) : [];
  matchPlayer.draftedSpells = drafted.slice();
  matchPlayer.loadoutSpells = drafted.slice();
  matchPlayer.loadout = ['fireblast', ...drafted];
}

function createCombatFixture(options = {}) {
  fixtureCounter += 1;
  const roomCode = options.roomCode || `T${String(fixtureCounter).padStart(5, '0')}`;
  const socketA = options.socketA || 'socket-a';
  const socketB = options.socketB || 'socket-b';
  const room = {
    code: roomCode,
    players: [createRoomPlayer(socketA, 1), createRoomPlayer(socketB, 2)],
    match: null,
    state: ROOM_STATES.WAITING,
    createdAt: Date.now()
  };
  rooms.set(roomCode, room);
  playerRoomBySocketId.set(socketA, roomCode);
  playerRoomBySocketId.set(socketB, roomCode);
  createMatchForRoom(room);
  room.match.phase = MATCH_PHASE_COMBAT;
  room.state = ROOM_STATES.COMBAT;

  const player1 = room.match.players.find((player) => Number(player.matchPlayerNumber) === 1);
  const player2 = room.match.players.find((player) => Number(player.matchPlayerNumber) === 2);
  assert.ok(player1, 'player1 must exist');
  assert.ok(player2, 'player2 must exist');

  setLoadout(player1, options.player1DraftedSpells || []);
  setLoadout(player2, options.player2DraftedSpells || []);
  return {
    room,
    player1,
    player2,
    socketA,
    socketB
  };
}

function castBySocket(socketId, abilityId, payload = {}) {
  const events = [];
  const socket = {
    id: socketId,
    emit(eventName, eventPayload) {
      events.push({ eventName, eventPayload });
    }
  };

  return new Promise((resolve) => {
    handleAbilityCastRequest(
      socket,
      abilityId,
      {
        abilityId,
        ...payload
      },
      (ackPayload) => {
        resolve({ ackPayload, events });
      }
    );
  });
}

function tickRoom(room, steps = 1, stepMs = 50) {
  let tickAt = Number(room.match?.lastTickAt) || Date.now();
  for (let index = 0; index < steps; index += 1) {
    tickAt += stepMs;
    processMatchTickForRoom(room, tickAt);
  }
  return tickAt;
}

test.beforeEach(() => {
  clearSharedState();
  fixtureCounter = 0;
});

test.afterEach(() => {
  clearSharedState();
});

for (const abilityId of DRAFTED_ABILITY_IDS) {
  test(`cast validation ${abilityId} accepts drafted, rejects undrafted, then rejects cooldown`, async () => {
    const acceptedFixture = createCombatFixture({
      player1DraftedSpells: [abilityId]
    });
    const accepted = await castBySocket(acceptedFixture.socketA, abilityId, { direction: { x: 1, y: 0 } });
    assert.equal(accepted.ackPayload.ok, true, `expected ${abilityId} to cast successfully`);

    await new Promise((resolve) => setTimeout(resolve, 80));
    const cooldown = await castBySocket(acceptedFixture.socketA, abilityId, { direction: { x: 1, y: 0 } });
    assert.equal(cooldown.ackPayload.ok, false, `expected ${abilityId} cooldown rejection`);
    assert.equal(cooldown.ackPayload.code, 'ABILITY_COOLDOWN');

    clearSharedState();
    const rejectedFixture = createCombatFixture({
      player1DraftedSpells: []
    });
    const rejected = await castBySocket(rejectedFixture.socketA, abilityId, { direction: { x: 1, y: 0 } });
    assert.equal(rejected.ackPayload.ok, false, `expected ${abilityId} undrafted rejection`);
    assert.equal(rejected.ackPayload.code, 'ABILITY_NOT_DRAFTED');
  });
}

test('cast validation fireblast accepts base cast and enforces cooldown', async () => {
  const fixture = createCombatFixture({
    player1DraftedSpells: []
  });
  const accepted = await castBySocket(fixture.socketA, ABILITY_IDS.FIREBLAST, { direction: { x: 1, y: 0 } });
  assert.equal(accepted.ackPayload.ok, true, 'expected fireblast to cast successfully');

  await new Promise((resolve) => setTimeout(resolve, 80));
  const cooldown = await castBySocket(fixture.socketA, ABILITY_IDS.FIREBLAST, { direction: { x: 1, y: 0 } });
  assert.equal(cooldown.ackPayload.ok, false, 'expected fireblast cooldown rejection');
  assert.equal(cooldown.ackPayload.code, 'ABILITY_COOLDOWN');
});

test('blink runtime: repositions player in cast direction', () => {
  const fixture = createCombatFixture({
    player1DraftedSpells: [ABILITY_IDS.BLINK]
  });
  const blinkDef = getAbilityDef(ABILITY_IDS.BLINK);
  assert.ok(blinkDef, 'blink ability def should exist');
  fixture.player1.position = { x: -5, y: 0 };

  const blink = executeAbilityCast(fixture.room, fixture.player1, blinkDef, { direction: { x: 1, y: 0 } }, Date.now());
  assert.equal(blink.ok, true);
  assert.ok(fixture.player1.position.x > -2.2, 'blink should move player forward');
});

test('shield runtime: blocks incoming fireblast hit', () => {
  const fixture = createCombatFixture({
    player1DraftedSpells: [ABILITY_IDS.FIREBLAST],
    player2DraftedSpells: [ABILITY_IDS.SHIELD]
  });
  const shieldDef = getAbilityDef(ABILITY_IDS.SHIELD);
  const fireblastDef = getAbilityDef(ABILITY_IDS.FIREBLAST);
  assert.ok(shieldDef, 'shield ability def should exist');
  assert.ok(fireblastDef, 'fireblast ability def should exist');
  fixture.player1.position = { x: -2, y: 0 };
  fixture.player2.position = { x: 2, y: 0 };

  const shield = executeAbilityCast(fixture.room, fixture.player2, shieldDef, {}, Date.now());
  assert.equal(shield.ok, true);
  const blast = executeAbilityCast(fixture.room, fixture.player1, fireblastDef, { direction: { x: 1, y: 0 } }, Date.now() + 5);
  assert.equal(blast.ok, true);

  tickRoom(fixture.room, 20, 50);
  assert.equal(
    fixture.room.match.hitEvents.some((event) => event.type === 'fireblast_hit'),
    false,
    'shield should block fireblast hit events'
  );
  assert.equal(
    fixture.room.match.hitEvents.some((event) => event.type === 'shield_block'),
    true,
    'shield block event should be emitted'
  );
});

test('gust runtime: in-range hits and out-of-range misses', () => {
  const fixture = createCombatFixture({
    player1DraftedSpells: [ABILITY_IDS.GUST]
  });
  const gustDef = getAbilityDef(ABILITY_IDS.GUST);
  assert.ok(gustDef, 'gust ability def should exist');
  fixture.player1.position = { x: 0, y: 0 };
  fixture.player2.position = { x: 2.4, y: 0 };

  const hit = executeAbilityCast(fixture.room, fixture.player1, gustDef, { direction: { x: 1, y: 0 } }, Date.now());
  assert.equal(hit.ok, true);
  assert.equal(hit.hit, true);
  assert.ok(fixture.player2.velocity.x > 0, 'gust hit should push target');

  fixture.player2.position = { x: 8, y: 0 };
  fixture.player2.velocity = { x: 0, y: 0 };
  const miss = executeAbilityCast(fixture.room, fixture.player1, gustDef, { direction: { x: 1, y: 0 } }, Date.now() + 800);
  assert.equal(miss.ok, true);
  assert.equal(miss.hit, false);
});

test('charge runtime: hit and miss outcomes are deterministic', async () => {
  const hitFixture = createCombatFixture({
    player1DraftedSpells: [ABILITY_IDS.CHARGE]
  });
  hitFixture.player1.position = { x: -1.0, y: 0 };
  hitFixture.player2.position = { x: -0.2, y: 0 };
  const castHit = await castBySocket(hitFixture.socketA, ABILITY_IDS.CHARGE, { direction: { x: 1, y: 0 } });
  assert.equal(castHit.ackPayload.ok, true);
  tickRoom(hitFixture.room, 8, 50);
  assert.ok(
    hitFixture.room.match.hitEvents.some((event) => event.type === 'charge_hit'),
    'charge hit event should exist'
  );
  assert.ok(hitFixture.player2.velocity.x > 0, 'charge hit should push target forward');

  clearSharedState();
  const missFixture = createCombatFixture({
    player1DraftedSpells: [ABILITY_IDS.CHARGE]
  });
  missFixture.player1.position = { x: -6, y: 0 };
  missFixture.player2.position = { x: 6, y: 0 };
  const castMiss = await castBySocket(missFixture.socketA, ABILITY_IDS.CHARGE, { direction: { x: 1, y: 0 } });
  assert.equal(castMiss.ackPayload.ok, true);
  tickRoom(missFixture.room, 32, 50);
  assert.equal(
    missFixture.room.match.hitEvents.filter((event) => event.type === 'charge_hit').length,
    0,
    'charge miss should not create a hit event'
  );
  assert.equal(Boolean(missFixture.player1.activeEffects?.charge?.active), false, 'charge should end');
});

test('shock runtime: front hit succeeds and side cast misses', () => {
  const fixture = createCombatFixture({
    player1DraftedSpells: [ABILITY_IDS.SHOCK]
  });
  fixture.player1.position = { x: 0, y: 0 };
  fixture.player2.position = { x: 2.1, y: 0 };
  const shockDef = getAbilityDef(ABILITY_IDS.SHOCK);
  assert.ok(shockDef, 'shock ability def should exist');

  const hit = executeAbilityCast(fixture.room, fixture.player1, shockDef, { direction: { x: 1, y: 0 } }, Date.now());
  assert.equal(hit.ok, true);
  assert.equal(hit.hit, true);

  fixture.player2.position = { x: 0, y: 2.2 };
  const miss = executeAbilityCast(fixture.room, fixture.player1, shockDef, { direction: { x: 1, y: 0 } }, Date.now() + 1000);
  assert.equal(miss.ok, true);
  assert.equal(miss.hit, false);
});

test('hook runtime: hit pulls target and miss expires cleanly', () => {
  const hitFixture = createCombatFixture({
    player1DraftedSpells: [ABILITY_IDS.HOOK]
  });
  hitFixture.player1.position = { x: -2, y: 0 };
  hitFixture.player2.position = { x: 2, y: 0 };
  const hookDef = getAbilityDef(ABILITY_IDS.HOOK);
  assert.ok(hookDef, 'hook ability def should exist');

  const castHit = executeAbilityCast(
    hitFixture.room,
    hitFixture.player1,
    hookDef,
    { direction: { x: 1, y: 0 } },
    Date.now()
  );
  assert.equal(castHit.ok, true);
  tickRoom(hitFixture.room, 24, 50);
  assert.ok(
    hitFixture.room.match.hitEvents.some((event) => event.type === 'hook_pull'),
    'hook pull event should exist'
  );
  assert.ok(hitFixture.player2.position.x < 2, 'hook hit should pull target');

  clearSharedState();
  const missFixture = createCombatFixture({
    player1DraftedSpells: [ABILITY_IDS.HOOK]
  });
  missFixture.player1.position = { x: -2, y: 0 };
  missFixture.player2.position = { x: 2, y: 5 };
  const castMiss = executeAbilityCast(
    missFixture.room,
    missFixture.player1,
    hookDef,
    { direction: { x: 1, y: 0 } },
    Date.now()
  );
  assert.equal(castMiss.ok, true);
  tickRoom(missFixture.room, 26, 50);
  assert.equal(
    missFixture.room.match.hitEvents.filter((event) => event.type === 'hook_pull').length,
    0,
    'hook miss should not produce pull event'
  );
  assert.equal(missFixture.room.match.projectiles.length, 0, 'hook projectile should expire cleanly');
});

test('wall runtime: blocks fireblast and movement path', () => {
  const fixture = createCombatFixture({
    player1DraftedSpells: [ABILITY_IDS.WALL]
  });
  fixture.player1.position = { x: 0, y: 0 };
  fixture.player2.position = { x: 4, y: 0 };
  const wallDef = getAbilityDef(ABILITY_IDS.WALL);
  const fireblastDef = getAbilityDef(ABILITY_IDS.FIREBLAST);
  assert.ok(wallDef, 'wall ability def should exist');
  assert.ok(fireblastDef, 'fireblast ability def should exist');

  const wallCast = executeAbilityCast(
    fixture.room,
    fixture.player1,
    wallDef,
    { direction: { x: 1, y: 0 } },
    Date.now()
  );
  assert.equal(wallCast.ok, true);
  assert.equal(fixture.room.match.walls.length, 1, 'wall should spawn');

  const blastCast = executeAbilityCast(
    fixture.room,
    fixture.player2,
    fireblastDef,
    { direction: { x: -1, y: 0 } },
    Date.now() + 10
  );
  assert.equal(blastCast.ok, true);
  tickRoom(fixture.room, 30, 50);
  assert.equal(
    fixture.room.match.hitEvents.filter((event) => event.type === 'fireblast_hit').length,
    0,
    'fireblast should not pass through wall'
  );

  fixture.player2.position = { x: 2.5, y: 0 };
  fixture.player2.input = { x: -1, y: 0 };
  tickRoom(fixture.room, 3, 50);
  assert.ok(fixture.player2.position.x > 1.95, 'wall should block movement through barrier');
});

test('rewind runtime: rewinds to stable previous position', () => {
  const fixture = createCombatFixture({
    player1DraftedSpells: [ABILITY_IDS.REWIND]
  });
  const rewindDef = getAbilityDef(ABILITY_IDS.REWIND);
  assert.ok(rewindDef, 'rewind ability def should exist');

  const now = Date.now();
  fixture.player1.position = { x: 2.4, y: 0.2 };
  fixture.player1.positionHistory = [
    { x: -2.1, y: 0, timestamp: now - 1300 },
    { x: -1.7, y: 0.1, timestamp: now - 1020 },
    { x: 1.2, y: 0.2, timestamp: now - 250 }
  ];

  const rewind = executeAbilityCast(fixture.room, fixture.player1, rewindDef, {}, now);
  assert.equal(rewind.ok, true);
  assert.ok(rewind.destination.x < -1.4, 'rewind should move player close to 1s-old position');
});

test('cleanup resets temporary state and cooldowns for all new abilities', () => {
  const fixture = createCombatFixture({
    player1DraftedSpells: DRAFTED_ABILITY_IDS.slice(0, 3),
    player2DraftedSpells: DRAFTED_ABILITY_IDS.slice(2, 5)
  });
  const now = Date.now();

  setAbilityReadyAt(fixture.player1, ABILITY_IDS.CHARGE, now + 4000);
  setAbilityReadyAt(fixture.player1, ABILITY_IDS.SHOCK, now + 4000);
  setAbilityReadyAt(fixture.player1, ABILITY_IDS.HOOK, now + 4000);
  setAbilityReadyAt(fixture.player1, ABILITY_IDS.WALL, now + 4000);
  setAbilityReadyAt(fixture.player1, ABILITY_IDS.REWIND, now + 4000);
  fixture.player1.activeEffects = {
    ...(fixture.player1.activeEffects || {}),
    charge: {
      active: true,
      direction: { x: 1, y: 0 },
      remainingDistance: 2
    }
  };
  fixture.room.match.walls.push({
    wallId: 'W-test',
    ownerPlayerNumber: 1,
    position: { x: 1.6, y: 0 },
    direction: { x: 1, y: 0 },
    halfLength: 1.9,
    halfThickness: 0.36,
    spawnedAt: now,
    expiresAt: now + 2000
  });
  fixture.room.match.projectiles.push({
    projectileId: 'P-test',
    abilityId: ABILITY_IDS.HOOK,
    ownerPlayerNumber: 1,
    position: { x: 0, y: 0 },
    direction: { x: 1, y: 0 },
    speed: 12,
    hitRadius: 0.35,
    spawnedAt: now,
    expiresAt: now + 800
  });
  fixture.room.match.hitEvents.push({
    hitId: 'H-test',
    type: 'hook_pull',
    abilityId: ABILITY_IDS.HOOK,
    sourcePlayerNumber: 1,
    targetPlayerNumber: 2,
    timestamp: now,
    knockback: { x: 1, y: 0 }
  });

  const previousMatch = fixture.room.match;
  const cleaned = cleanupRoomMatchState(fixture.room, 'test_cleanup', now + 100);
  assert.equal(cleaned, true);
  assert.equal(fixture.room.match, null, 'room match should be cleared');
  assert.equal(previousMatch.projectiles.length, 0, 'projectiles should be cleaned');
  assert.equal(previousMatch.walls.length, 0, 'walls should be cleaned');
  assert.equal(previousMatch.hitEvents.length, 0, 'hit events should be cleaned');

  for (const player of previousMatch.players) {
    for (const abilityId of DRAFTED_ABILITY_IDS) {
      assert.equal(
        getAbilityRemainingMs(player, abilityId, now + 120),
        0,
        `cooldown should reset for ${abilityId}`
      );
    }
    assert.equal(Boolean(player.activeEffects?.charge?.active), false, 'charge state should be reset');
  }
});
