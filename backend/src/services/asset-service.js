import fs from 'node:fs';
import path from 'node:path';
import {
  cardAssetStatePath,
  resourcesRoot,
  staticCardAssetDir,
  staticCardAssetUrlBase,
} from '../config.js';
import { clone, nowMs, readJson, writeJson } from '../state-store.js';

const DEFAULT_STATE = {
  version: 1,
  playerGeneratedAssets: {},
  videoTasks: {},
};

const STATUS_NOT_GENERATED = 'not_generated';
const STATUS_GENERATING = 'generating';
const STATUS_COMPLETED = 'completed';
const STATUS_FAILED = 'failed';
const ALLOWED_SOURCE_TYPES = new Set(['built_in', 'player_generated', 'curated']);
const ATTR_ALIASES = {
  poison: 'blight',
  venom: 'blight',
  toxic: 'blight',
  blight: 'blight',
  fire: 'fire',
  ice: 'ice',
  frost: 'ice',
  thunder: 'thunder',
  lightning: 'thunder',
};

function loadState() {
  const state = readJson(cardAssetStatePath, DEFAULT_STATE);
  state.playerGeneratedAssets ||= {};
  state.videoTasks ||= {};
  return state;
}

function saveState(state) {
  writeJson(cardAssetStatePath, state);
}

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function cleanUrl(value) {
  const text = cleanText(value);
  if (!text) return null;
  if (text.includes('://') || text.startsWith('data:')) return text;
  return text.replaceAll('\\', '/');
}

function normalizeSourceType(value, fallback = 'player_generated') {
  const text = String(value ?? '').trim().toLowerCase();
  return ALLOWED_SOURCE_TYPES.has(text) ? text : fallback;
}

export function normalizeAttrSet(values) {
  const rawValues = Array.isArray(values) ? values : values ? [values] : [];
  const result = [];
  const seen = new Set();
  for (const item of rawValues) {
    const key = String(item ?? '').trim().toLowerCase();
    const attr = ATTR_ALIASES[key] || key;
    if (!attr || seen.has(attr)) continue;
    seen.add(attr);
    result.push(attr);
  }
  return result.slice(0, 3);
}

function normalizeStatus(value, fallback = STATUS_NOT_GENERATED) {
  const text = String(value ?? '').trim().toLowerCase();
  if (['not_generated', 'none', 'idle'].includes(text)) return STATUS_NOT_GENERATED;
  if (['generating', 'queued', 'submitting', 'polling', 'running', 'in_progress'].includes(text)) {
    return STATUS_GENERATING;
  }
  if (['completed', 'ready', 'succeeded', 'success'].includes(text)) return STATUS_COMPLETED;
  if (['failed', 'error'].includes(text)) return STATUS_FAILED;
  return fallback;
}

function makePlayerAssetId(cardId) {
  return `player_generated:${cardId}`;
}

function coerceTimestampMs(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function resolveStaticAssetPath(assetDir, metadataPath, rawValue) {
  const relText = cleanText(rawValue);
  if (!relText) return [null, null];
  const normalized = relText.replaceAll('\\', '/');
  if (path.isAbsolute(normalized)) return [null, null];
  const resolved = path.resolve(assetDir, normalized);
  const assetRoot = path.resolve(assetDir);
  if (resolved !== assetRoot && !resolved.startsWith(`${assetRoot}${path.sep}`)) return [null, null];
  const relToAsset = path.relative(assetRoot, resolved).replaceAll(path.sep, '/');
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return [relToAsset, null];
  }
  const relToStaticRoot = path
    .relative(path.resolve(staticCardAssetDir), resolved)
    .replaceAll(path.sep, '/');
  const cacheBuster = Math.trunc(fs.statSync(resolved).mtimeMs);
  return [relToAsset, `${staticCardAssetUrlBase}/${encodeURI(relToStaticRoot)}?v=${cacheBuster}`];
}

function collectMissingMedia({ thumbnailValue, thumbnailUrl, videoValue, videoUrl, sfxValue, sfxUrl }) {
  const missing = [];
  if (cleanText(thumbnailValue) && !thumbnailUrl) missing.push('thumbnail');
  if (cleanText(videoValue) && !videoUrl) missing.push('video');
  if (cleanText(sfxValue) && !sfxUrl) missing.push('sfx');
  return missing;
}

export function loadPersistedVideoTasks() {
  return clone(loadState().videoTasks || {});
}

export function saveVideoTask(task) {
  const taskId = cleanText(task?.videoTaskId);
  if (!taskId) return;
  const state = loadState();
  state.videoTasks[taskId] = clone(task);
  saveState(state);
}

export function listPlayerGeneratedAssets() {
  const assets = Object.values(loadState().playerGeneratedAssets || {});
  assets.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  return clone(assets);
}

export function getPlayerGeneratedAssetByCard(cardId) {
  const cardKey = cleanText(cardId);
  if (!cardKey) return null;
  return clone(loadState().playerGeneratedAssets?.[makePlayerAssetId(cardKey)] || null);
}

export function registerGeneratedCards(cards = []) {
  return cards.map(registerGeneratedCard).filter(Boolean);
}

export function registerGeneratedCard(card = {}) {
  const cardId = cleanText(card.cardId);
  if (!cardId) return null;

  const now = nowMs();
  const state = loadState();
  const assets = state.playerGeneratedAssets;
  const assetId = makePlayerAssetId(cardId);
  const existing = clone(assets[assetId] || {});
  const playableUrl = cleanText(card.videoUrl) || cleanText(card.resultUrl);
  const incomingStatus = cleanText(card.status);
  const normalizedStatus = incomingStatus
    ? normalizeStatus(incomingStatus)
    : playableUrl
      ? STATUS_COMPLETED
      : null;

  const asset = existing.assetId
    ? existing
    : {
        assetId,
        cardId,
        sourceType: 'player_generated',
        status: STATUS_NOT_GENERATED,
        name: null,
        attrSet: [],
        generation: 1,
        themeText: null,
        videoPrompt: null,
        thumbnailUrl: null,
        forgeTaskId: null,
        videoTaskId: null,
        pixverseVideoId: null,
        providerStatus: null,
        submitAttempts: 0,
        pollCount: 0,
        error: null,
        resultUrl: null,
        videoUrl: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        metadataPath: null,
        assetDir: null,
      };

  asset.sourceType = normalizeSourceType(card.sourceType, asset.sourceType || 'player_generated');
  asset.name = cleanText(card.name) || asset.name;
  asset.attrSet = normalizeAttrSet(card.attrSet).length ? normalizeAttrSet(card.attrSet) : asset.attrSet || [];
  asset.generation = Number.parseInt(String(card.generation ?? asset.generation ?? 1), 10) || 1;
  asset.themeText = cleanText(card.themeText) || asset.themeText;
  asset.videoPrompt = cleanText(card.videoPrompt) || asset.videoPrompt;
  asset.thumbnailUrl = cleanText(card.thumbnailUrl) || asset.thumbnailUrl;
  asset.forgeTaskId = cleanText(card.forgeTaskId) || asset.forgeTaskId;
  asset.videoTaskId = cleanText(card.videoTaskId) || asset.videoTaskId;
  asset.pixverseVideoId = card.pixverseVideoId ?? asset.pixverseVideoId ?? null;
  asset.providerStatus = card.providerStatus ?? asset.providerStatus ?? null;
  asset.submitAttempts = Number.parseInt(String(card.submitAttempts ?? asset.submitAttempts ?? 0), 10) || 0;
  asset.pollCount = Number.parseInt(String(card.pollCount ?? asset.pollCount ?? 0), 10) || 0;
  if (normalizedStatus) asset.status = normalizedStatus;
  if (playableUrl) {
    asset.resultUrl = playableUrl;
    asset.videoUrl = playableUrl;
    asset.status = STATUS_COMPLETED;
    asset.completedAt = Number.parseInt(String(card.completedAt ?? asset.completedAt ?? now), 10) || now;
  }
  const incomingError = cleanText(card.error);
  if (incomingError || asset.status === STATUS_FAILED) {
    asset.error = incomingError || asset.error;
  } else if ([STATUS_GENERATING, STATUS_COMPLETED].includes(asset.status)) {
    asset.error = null;
  }
  asset.updatedAt = Number.parseInt(String(card.updatedAt ?? now), 10) || now;

  assets[assetId] = asset;
  saveState(state);
  return clone(asset);
}

export function syncCardAssetWithVideoTask(task) {
  const cardId = cleanText(task?.cardId);
  if (!cardId) return null;
  const now = nowMs();
  const state = loadState();
  const assetId = makePlayerAssetId(cardId);
  const existing = clone(state.playerGeneratedAssets[assetId] || {});
  const asset = existing.assetId
    ? existing
    : {
        assetId,
        cardId,
        sourceType: 'player_generated',
        status: STATUS_NOT_GENERATED,
        name: task.promptSummary || null,
        attrSet: [],
        generation: 1,
        themeText: null,
        videoPrompt: null,
        thumbnailUrl: null,
        forgeTaskId: task.forgeTaskId || null,
        videoTaskId: null,
        pixverseVideoId: null,
        providerStatus: null,
        submitAttempts: 0,
        pollCount: 0,
        error: null,
        resultUrl: null,
        videoUrl: null,
        createdAt: Number(task.createdAt || now),
        updatedAt: Number(task.updatedAt || now),
        completedAt: null,
        metadataPath: null,
        assetDir: null,
      };

  asset.forgeTaskId = cleanText(task.forgeTaskId) || asset.forgeTaskId;
  asset.videoTaskId = cleanText(task.videoTaskId) || asset.videoTaskId;
  asset.pixverseVideoId = task.pixverseVideoId ?? null;
  asset.providerStatus = task.providerStatus ?? null;
  asset.submitAttempts = Number(task.submitAttempts || 0);
  asset.pollCount = Number(task.pollCount || 0);
  asset.updatedAt = Number(task.updatedAt || now);

  const status = cleanText(task.status);
  if (status) asset.status = normalizeStatus(status);
  if (task.status === 'succeeded') {
    const resultUrl = cleanText(task.resultUrl);
    asset.status = STATUS_COMPLETED;
    asset.resultUrl = resultUrl;
    asset.videoUrl = resultUrl;
    asset.error = null;
    asset.completedAt = Number(task.finishedAt || now);
  } else if (task.status === 'failed') {
    asset.status = STATUS_FAILED;
    asset.error = cleanText(task.error) || cleanText(task.providerErrMsg);
  } else if (['queued', 'submitting', 'polling'].includes(task.status)) {
    asset.status = STATUS_GENERATING;
    asset.error = null;
  }

  state.playerGeneratedAssets[assetId] = asset;
  saveState(state);
  return clone(asset);
}

export function listCardAssets({ sourceType = null } = {}) {
  const normalizedSource = sourceType ? normalizeSourceType(sourceType, '') : null;
  let merged = [...scanStaticAssets(), ...listPlayerGeneratedAssets()];
  if (normalizedSource) merged = merged.filter((asset) => asset.sourceType === normalizedSource);
  merged.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  return merged;
}

export function getCardAsset(assetId) {
  const assetKey = cleanText(assetId);
  if (!assetKey) return null;
  const state = loadState();
  if (state.playerGeneratedAssets?.[assetKey]) return clone(state.playerGeneratedAssets[assetKey]);
  return scanStaticAssets().find((asset) => asset.assetId === assetKey) || null;
}

export function scanStaticAssets() {
  if (!fs.existsSync(staticCardAssetDir)) return [];
  const metadataFiles = [];
  collectMetadataFiles(staticCardAssetDir, metadataFiles);
  const assets = [];
  for (const metadataPath of metadataFiles.sort()) {
    try {
      const payload = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      if (!payload || typeof payload !== 'object') continue;
      const assetDir = path.dirname(metadataPath);
      const metadataMtimeMs = Math.trunc(fs.statSync(metadataPath).mtimeMs);
      const [thumbnailPath, resolvedThumbnailUrl] = resolveStaticAssetPath(
        assetDir,
        metadataPath,
        payload.thumbnailPath
      );
      const [videoPath, resolvedVideoUrl] = resolveStaticAssetPath(assetDir, metadataPath, payload.videoPath);
      const [sfxPath, resolvedSfxUrl] = resolveStaticAssetPath(assetDir, metadataPath, payload.sfxPath);
      const thumbnailUrl = resolvedThumbnailUrl || cleanUrl(payload.thumbnailUrl);
      const videoUrl = resolvedVideoUrl || cleanUrl(payload.videoUrl);
      const sfxUrl = resolvedSfxUrl || cleanUrl(payload.sfxUrl);
      const missingMedia = collectMissingMedia({
        thumbnailValue: payload.thumbnailPath,
        thumbnailUrl,
        videoValue: payload.videoPath,
        videoUrl,
        sfxValue: payload.sfxPath,
        sfxUrl,
      });
      const updatedAt = coerceTimestampMs(payload.updatedAt, metadataMtimeMs);
      const createdAt = coerceTimestampMs(payload.createdAt, updatedAt);
      const completedAt = coerceTimestampMs(payload.completedAt, videoUrl ? updatedAt : 0) || null;
      const asset = {
        assetId: cleanText(payload.id) || path.basename(assetDir),
        cardId: null,
        forgeTaskId: null,
        sourceType: normalizeSourceType(payload.sourceType, 'built_in'),
        status: videoUrl ? STATUS_COMPLETED : STATUS_NOT_GENERATED,
        name: cleanText(payload.name) || path.basename(assetDir),
        attrSet: normalizeAttrSet(payload.attrSet),
        generation: Number.parseInt(String(payload.generation ?? 1), 10) || 1,
        category: cleanText(payload.category),
        inputPhrase: cleanText(payload.inputPhrase),
        themeText: cleanText(payload.themeText),
        videoPrompt: cleanText(payload.videoPrompt),
        description: cleanText(payload.description),
        thumbnailPath,
        thumbnailUrl,
        videoPath,
        sfxPath,
        sfxUrl,
        mediaReady: missingMedia.length === 0,
        missingMedia,
        videoTaskId: null,
        pixverseVideoId: null,
        providerStatus: videoUrl ? 1 : null,
        submitAttempts: 0,
        pollCount: 0,
        error: null,
        resultUrl: videoUrl,
        videoUrl,
        origin: cleanText(payload.origin),
        originCardId: cleanText(payload.originCardId),
        curationNote: cleanText(payload.curationNote),
        createdAt,
        updatedAt,
        completedAt,
        metadataPath: path.relative(resourcesRoot, metadataPath).replaceAll(path.sep, '/'),
        assetDir: path.relative(resourcesRoot, assetDir).replaceAll(path.sep, '/'),
      };
      assets.push(asset);
    } catch (error) {
      console.warn('[asset-service] metadata read failed:', metadataPath, error.message);
    }
  }
  return assets;
}

function collectMetadataFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) collectMetadataFiles(fullPath, out);
    else if (entry.isFile() && entry.name === 'metadata.json') out.push(fullPath);
  }
}
