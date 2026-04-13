// Centralized rank definitions for UI/progression display.
(function () {
  const PLACEHOLDER_BADGE = '/docs/art/ranks/20.png';
  const MASTER_BADGE = '/docs/art/ranks/Master.png';
  const BADGE_BY_RANK_NUMBER = {
    1: '/docs/art/ranks/1.png',
    2: '/docs/art/ranks/2.png',
    3: '/docs/art/ranks/3.png',
    4: '/docs/art/ranks/4.png',
    5: '/docs/art/ranks/5.png',
    6: '/docs/art/ranks/6.png',
    7: '/docs/art/ranks/7.png',
    8: '/docs/art/ranks/8.png',
    9: '/docs/art/ranks/9.png',
    10: '/docs/art/ranks/10.png',
    11: '/docs/art/ranks/11.png',
    12: '/docs/art/ranks/12.png',
    13: '/docs/art/ranks/13.png',
    14: '/docs/art/ranks/14.png',
    15: '/docs/art/ranks/15.png',
    16: '/docs/art/ranks/16.png',
    17: '/docs/art/ranks/17.png',
    18: '/docs/art/ranks/18.png',
    19: '/docs/art/ranks/19.png',
    20: '/docs/art/ranks/20.png',
  };
  const MMR_PER_STAR = 20;

  function getStarCountForRankNumber(rankNumber) {
    if (!Number.isFinite(Number(rankNumber))) return 0; // Master / non-numeric ranks
    const rank = Number(rankNumber);
    if (rank >= 16) return 2;
    if (rank >= 11) return 3;
    if (rank >= 1) return 5;
    return 0;
  }

  const rankRows = [
    { id: '20', rankNumber: 20, name: 'Spark Initiate', label: 'Rank 20 \u2014 Spark Initiate' },
    { id: '19', rankNumber: 19, name: 'Kindled Recruit', label: 'Rank 19 \u2014 Kindled Recruit' },
    { id: '18', rankNumber: 18, name: 'Ember Apprentice', label: 'Rank 18 \u2014 Ember Apprentice' },
    { id: '17', rankNumber: 17, name: 'Ashbound Novice', label: 'Rank 17 \u2014 Ashbound Novice' },
    { id: '16', rankNumber: 16, name: 'Flicker Adept', label: 'Rank 16 \u2014 Flicker Adept' },
    { id: '15', rankNumber: 15, name: 'Flame Wielder', label: 'Rank 15 \u2014 Flame Wielder' },
    { id: '14', rankNumber: 14, name: 'Blaze Striker', label: 'Rank 14 \u2014 Blaze Striker' },
    { id: '13', rankNumber: 13, name: 'Heatbinder', label: 'Rank 13 \u2014 Heatbinder' },
    { id: '12', rankNumber: 12, name: 'Infernal Duelist', label: 'Rank 12 \u2014 Infernal Duelist' },
    { id: '11', rankNumber: 11, name: 'Cinder Tactician', label: 'Rank 11 \u2014 Cinder Tactician' },
    { id: '10', rankNumber: 10, name: 'Pyre Guardian', label: 'Rank 10 \u2014 Pyre Guardian' },
    { id: '9', rankNumber: 9, name: 'Scorch Vanguard', label: 'Rank 9 \u2014 Scorch Vanguard' },
    { id: '8', rankNumber: 8, name: 'Molten Controller', label: 'Rank 8 \u2014 Molten Controller' },
    { id: '7', rankNumber: 7, name: 'Volcanic Hunter', label: 'Rank 7 \u2014 Volcanic Hunter' },
    { id: '6', rankNumber: 6, name: 'Lava Strategist', label: 'Rank 6 \u2014 Lava Strategist' },
    { id: '5', rankNumber: 5, name: 'Inferno Commander', label: 'Rank 5 \u2014 Inferno Commander' },
    { id: '4', rankNumber: 4, name: 'Rift Conqueror', label: 'Rank 4 \u2014 Rift Conqueror' },
    { id: '3', rankNumber: 3, name: 'Arena Dominator', label: 'Rank 3 \u2014 Arena Dominator' },
    { id: '2', rankNumber: 2, name: 'Outlaw Ascendant', label: 'Rank 2 \u2014 Outlaw Ascendant' },
    { id: '1', rankNumber: 1, name: 'Prime Warlock', label: 'Rank 1 \u2014 Prime Warlock' },
    { id: 'master', rankNumber: null, name: 'Master', label: 'Master' },
  ];

  let runningMmr = 0;
  const ranks = rankRows.map((row) => {
    const isMaster = row.id === 'master';
    const stars = getStarCountForRankNumber(row.rankNumber);
    const tierSpan = Math.max(0, stars) * MMR_PER_STAR;
    const minMmr = runningMmr;
    const maxMmr = isMaster ? Infinity : Math.max(minMmr, minMmr + tierSpan - 1);
    const badge = isMaster
      ? MASTER_BADGE
      : (BADGE_BY_RANK_NUMBER[row.rankNumber] || PLACEHOLDER_BADGE);

    if (!isMaster) {
      runningMmr += tierSpan;
    }

    return {
      id: row.id,
      rankNumber: row.rankNumber,
      name: row.name,
      label: row.label,
      badge,
      stars,
      minMmr,
      maxMmr,
    };
  });

  const byId = {};
  for (const rank of ranks) {
    byId[rank.id] = rank;
  }

  const progressionTiers = ranks.map((rank) => ({
    id: rank.id,
    key: `rank_${rank.id}`,
    name: rank.name,
    label: rank.label,
    rankNumber: rank.rankNumber,
    badge: rank.badge,
    stars: rank.stars,
    min: rank.minMmr,
    max: rank.maxMmr,
  }));

  function getById(id) {
    const key = String(id ?? '').toLowerCase();
    return byId[key] || null;
  }

  function getByMmr(mmr) {
    const safeMmr = Math.max(0, Number(mmr) || 0);
    for (const rank of ranks) {
      if (safeMmr >= rank.minMmr && safeMmr <= rank.maxMmr) return rank;
    }
    return ranks[0] || null;
  }

  const preloadedBadges = new Set();
  function preloadBadges() {
    if (typeof Image === 'undefined') return;
    for (const rank of ranks) {
      const src = typeof rank.badge === 'string' ? rank.badge : '';
      if (!src || preloadedBadges.has(src)) continue;
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      preloadedBadges.add(src);
    }
  }

  preloadBadges();

  window.OUTRA_RANKS = {
    placeholderBadge: PLACEHOLDER_BADGE,
    mmrPerStar: MMR_PER_STAR,
    all: ranks,
    byId,
    progressionTiers,
    getById,
    getByMmr,
    preloadBadges,
  };
})();
