import { quotaStatePath } from '../config.js';
import { readJson, writeJson } from '../state-store.js';

const DEFAULT_STATE = { version: 1, players: {} };

function getDailyLimit() {
  const value = Number.parseInt(process.env.FORGE_DAILY_QUOTA || '50', 10);
  return Number.isFinite(value) ? value : 50;
}

function getQuotaDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.FORGE_QUOTA_TIMEZONE || 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function getResetAt() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.FORGE_QUOTA_TIMEZONE || 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const today = formatter.format(now);
  const tomorrow = new Date(now.getTime() + 36 * 60 * 60 * 1000);
  const tomorrowDate = formatter.format(tomorrow);
  return `${tomorrowDate}T00:00:00+08:00`.replace(today, tomorrowDate);
}

function loadState() {
  const state = readJson(quotaStatePath, DEFAULT_STATE);
  state.players ||= {};
  return state;
}

function ensureTodayRow(state, playerId) {
  const today = getQuotaDate();
  const defaultLimit = getDailyLimit();
  const existing = state.players[playerId];
  if (!existing) {
    state.players[playerId] = {
      playerId,
      quotaDate: today,
      used: 0,
      dailyLimit: defaultLimit,
      updatedAt: new Date().toISOString(),
    };
    return state.players[playerId];
  }
  if (existing.quotaDate !== today) {
    existing.quotaDate = today;
    existing.used = 0;
    existing.dailyLimit = Math.max(Number(existing.dailyLimit) || 0, defaultLimit);
    existing.updatedAt = new Date().toISOString();
  } else if ((Number(existing.dailyLimit) || 0) < defaultLimit) {
    existing.dailyLimit = defaultLimit;
    existing.updatedAt = new Date().toISOString();
  }
  return existing;
}

export function getPlayerQuota(playerId) {
  const state = loadState();
  const row = ensureTodayRow(state, playerId);
  writeJson(quotaStatePath, state);
  const dailyLimit = Number(row.dailyLimit) || getDailyLimit();
  const used = Number(row.used) || 0;
  return {
    playerId,
    quotaDate: row.quotaDate,
    dailyLimit,
    used,
    remaining: Math.max(0, dailyLimit - used),
    resetAt: getResetAt(),
  };
}

export function consumeQuotaOrThrow(playerId) {
  const state = loadState();
  const row = ensureTodayRow(state, playerId);
  const dailyLimit = Number(row.dailyLimit) || getDailyLimit();
  const used = Number(row.used) || 0;
  if (used >= dailyLimit) {
    const error = new Error('Daily forge quota has been used up');
    error.code = 'quota_exhausted';
    throw error;
  }
  row.used = used + 1;
  row.updatedAt = new Date().toISOString();
  writeJson(quotaStatePath, state);
}

export function adminResetOrAdjust({ playerId, applyToAll = false, usedCount = 0, dailyLimit = null }) {
  const state = loadState();
  const today = getQuotaDate();
  let updated = 0;
  const applyRow = (id) => {
    const row = ensureTodayRow(state, id);
    row.quotaDate = today;
    row.used = Math.max(0, Number(usedCount) || 0);
    if (dailyLimit != null) row.dailyLimit = Math.max(0, Number(dailyLimit) || 0);
    row.updatedAt = new Date().toISOString();
    updated += 1;
  };

  if (applyToAll && !playerId) {
    Object.keys(state.players).forEach(applyRow);
  } else if (playerId) {
    applyRow(playerId);
  }
  writeJson(quotaStatePath, state);
  return {
    updatedPlayers: updated,
    quotaDate: today,
    dailyLimit,
  };
}
