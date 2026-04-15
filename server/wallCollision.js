'use strict';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clonePosition(position) {
  if (!position || typeof position !== 'object') return null;
  return {
    x: Number(position.x) || 0,
    y: Number(position.y) || 0
  };
}

function sanitizeVector(vector) {
  if (!vector || typeof vector !== 'object') return { x: 0, y: 0 };
  const x = Number(vector.x);
  const y = Number(vector.y);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0
  };
}

function normalizeInputVector(input) {
  const rawX = Number(input?.x);
  const rawY = Number(input?.y);
  const x = Number.isFinite(rawX) ? clamp(rawX, -1, 1) : 0;
  const y = Number.isFinite(rawY) ? clamp(rawY, -1, 1) : 0;
  const magnitude = Math.hypot(x, y);
  if (magnitude <= 0) return { x: 0, y: 0 };
  if (magnitude <= 1) return { x, y };
  return {
    x: x / magnitude,
    y: y / magnitude
  };
}

function getPerpendicularUnit(direction) {
  const normalizedDirection = normalizeInputVector(direction);
  if (normalizedDirection.x === 0 && normalizedDirection.y === 0) {
    return { x: 0, y: 1 };
  }
  return {
    x: -normalizedDirection.y,
    y: normalizedDirection.x
  };
}

function getWallHalfLength(wall, defaultHalfLength = 1) {
  return Math.max(0.05, Number(wall?.halfLength) || defaultHalfLength);
}

function getWallHalfThickness(wall, defaultHalfThickness = 1) {
  return Math.max(0.04, Number(wall?.halfThickness) || defaultHalfThickness);
}

function getWallDirection(wall) {
  const normalized = normalizeInputVector(wall?.direction);
  if (normalized.x === 0 && normalized.y === 0) {
    return { x: 1, y: 0 };
  }
  return normalized;
}

function isWallActive(wall, timestamp = Date.now()) {
  if (!wall || typeof wall !== 'object') return false;
  const now = Number(timestamp) || Date.now();
  const spawnedAt = Number(wall.spawnedAt) || 0;
  const expiresAt = Number(wall.expiresAt) || 0;
  if (spawnedAt > now) return false;
  if (expiresAt <= 0) return true;
  return now < expiresAt;
}

function getWallAxes(wall) {
  const forward = getWallDirection(wall);
  const side = getPerpendicularUnit(forward);
  return { forward, side };
}

function isPointInsideWall(point, wall, options = {}) {
  if (!point || !wall) return false;
  const position = clonePosition(point);
  if (!position) return false;
  const center = clonePosition(wall.position) || { x: 0, y: 0 };
  const { forward, side } = getWallAxes(wall);
  const relX = position.x - center.x;
  const relY = position.y - center.y;
  const localForward = (relX * forward.x) + (relY * forward.y);
  const localSide = (relX * side.x) + (relY * side.y);
  const padding = Math.max(0, Number(options.padding) || 0);
  const halfLength = getWallHalfLength(wall, options.defaultHalfLength) + padding;
  const halfThickness = getWallHalfThickness(wall, options.defaultHalfThickness) + padding;
  return Math.abs(localForward) <= halfThickness && Math.abs(localSide) <= halfLength;
}

function findBlockingWallForPoint(point, walls, options = {}) {
  if (!Array.isArray(walls) || !walls.length) return null;
  const now = Number(options.timestamp) || Date.now();
  for (const wall of walls) {
    if (!isWallActive(wall, now)) continue;
    if (isPointInsideWall(point, wall, options)) {
      return wall;
    }
  }
  return null;
}

function findBlockingWallForMovement(start, end, walls, options = {}) {
  if (!Array.isArray(walls) || !walls.length) return null;
  const from = clonePosition(start) || { x: 0, y: 0 };
  const to = clonePosition(end) || from;
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const distance = Math.hypot(deltaX, deltaY);
  const steps = Math.max(1, Math.ceil(distance / 0.22));

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const sample = {
      x: from.x + (deltaX * t),
      y: from.y + (deltaY * t)
    };
    const wall = findBlockingWallForPoint(sample, walls, options);
    if (wall) return wall;
  }
  return null;
}

function resolvePointAgainstWalls(targetPosition, fallbackPosition, walls, options = {}) {
  const desired = clonePosition(targetPosition);
  const fallback = clonePosition(fallbackPosition) || desired || { x: 0, y: 0 };
  if (!desired) return fallback;
  if (!Array.isArray(walls) || !walls.length) return desired;
  if (!findBlockingWallForPoint(desired, walls, options)) return desired;

  const deltaX = desired.x - fallback.x;
  const deltaY = desired.y - fallback.y;
  for (let step = 10; step >= 0; step -= 1) {
    const t = step / 10;
    const candidate = {
      x: fallback.x + (deltaX * t),
      y: fallback.y + (deltaY * t)
    };
    if (!findBlockingWallForPoint(candidate, walls, options)) {
      return candidate;
    }
  }
  return fallback;
}

module.exports = {
  getWallHalfLength,
  getWallHalfThickness,
  getWallDirection,
  isWallActive,
  isPointInsideWall,
  findBlockingWallForPoint,
  findBlockingWallForMovement,
  resolvePointAgainstWalls
};
