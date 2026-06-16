import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildRuntimeSnapshot,
  ensureEnvLoaded,
  repoRoot,
  staticCardAssetDir,
} from './config.js';
import {
  parseUrl,
  readJsonBody,
  route,
  sendEmpty,
  sendError,
  sendJson,
  serveFile,
} from './http-utils.js';
import { AIConfigError, resolveRequestLlmOverride, testAiConfig } from './services/ai-config-service.js';
import {
  getCardAsset,
  getPlayerGeneratedAssetByCard,
  listCardAssets,
  registerGeneratedCards,
} from './services/asset-service.js';
import {
  createForgeTask,
  getTaskStatus,
  quotaSnapshot,
  resolveSpellPayload,
} from './services/forge-service.js';
import { adminResetOrAdjust, getPlayerQuota } from './services/quota-service.js';
import {
  createVideoTaskFromCard,
  createVideoTaskFromForgeTask,
  getPixVerseConfigSnapshot,
  getVideoTask,
  getVideoTaskDebug,
  listVideoTasks,
} from './services/pixverse-service.js';

ensureEnvLoaded();

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || process.env.BACKEND_PORT || 18001);
const serveStatic = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.ALCHEMY_SERVE_STATIC || '').toLowerCase()
);

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      sendEmpty(res);
      return;
    }
    const url = parseUrl(req);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith('/api/assets/files/cards/')) {
      const rel = pathname.slice('/api/assets/files/cards/'.length);
      if (serveFile(res, path.join(staticCardAssetDir, rel), { root: staticCardAssetDir, cacheControl: 'public, max-age=300' })) {
        return;
      }
      sendError(res, 404, 'Asset file not found');
      return;
    }
    if (serveStatic && req.method === 'GET' && pathname === '/' && handleStatic(res, pathname)) return;
    if (await handleApi(req, res, url, pathname)) return;
    if (serveStatic && handleStatic(res, pathname)) return;
    sendError(res, 404, 'Not found');
  } catch (error) {
    console.error('[server] request failed:', error);
    sendError(res, 500, error.message || 'Internal server error');
  }
});

server.listen(port, host, () => {
  console.log(`[backend-node] listening at http://${host}:${port}`);
  console.log('[backend-node] runtime snapshot', JSON.stringify(buildRuntimeSnapshot()));
});

async function handleApi(req, res, url, pathname) {
  if (req.method === 'GET' && (pathname === '/' || pathname === '/api/health')) {
    const snapshot = buildRuntimeSnapshot();
    sendJson(res, 200, {
      message: 'Alchemy Game Node Backend',
      status: 'running',
      forge_use_real_llm: process.env.FORGE_USE_REAL_LLM || 'false',
      llm_provider: snapshot.forge.provider,
      llm_model: snapshot.forge.model,
      llm_fallback_provider: 'disabled',
      llm_fallback_model: null,
      glyph_router_model: snapshot.glyphRouter.model,
      llm_config_aligned: snapshot.aligned,
    });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/debug/llm-config') {
    sendJson(res, 200, buildRuntimeSnapshot());
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/debug/pixverse/config') {
    sendJson(res, 200, getPixVerseConfigSnapshot());
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/debug/pixverse/tasks') {
    sendJson(
      res,
      200,
      {
        count: listVideoTasks({
          limit: Number(url.searchParams.get('limit') || 20),
          forgeTaskId: url.searchParams.get('forgeTaskId'),
          cardId: url.searchParams.get('cardId'),
        }).length,
        tasks: listVideoTasks({
          limit: Number(url.searchParams.get('limit') || 20),
          forgeTaskId: url.searchParams.get('forgeTaskId'),
          cardId: url.searchParams.get('cardId'),
        }),
      }
    );
    return true;
  }

  let params = route('*', pathname, '/api/debug/pixverse/tasks/:videoTaskId');
  if (req.method === 'GET' && params) {
    const debug = getVideoTaskDebug(params.videoTaskId);
    if (!debug) sendError(res, 404, 'PixVerse task not found');
    else sendJson(res, 200, debug);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/player/quota') {
    const playerId = url.searchParams.get('playerId');
    if (!playerId || playerId.length < 6) sendError(res, 422, 'playerId is required');
    else sendJson(res, 200, getPlayerQuota(playerId));
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/admin/quota/reset') {
    const body = await readJsonBody(req);
    sendJson(
      res,
      200,
      adminResetOrAdjust({
        playerId: body.playerId || null,
        applyToAll: Boolean(body.applyToAll),
        usedCount: Number(body.usedCount || 0),
        dailyLimit: body.dailyLimit ?? null,
      })
    );
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/assets/cards') {
    const assets = listCardAssets({ sourceType: url.searchParams.get('sourceType') });
    sendJson(res, 200, { count: assets.length, assets });
    return true;
  }

  params = route('*', pathname, '/api/assets/cards/:assetId');
  if (req.method === 'GET' && params) {
    const asset = getCardAsset(params.assetId);
    if (!asset) sendError(res, 404, 'Card asset not found');
    else sendJson(res, 200, asset);
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/forge') {
    const body = await readJsonBody(req);
    const spellA = resolveSpellPayload(body.spellA, 'A');
    const spellB = resolveSpellPayload(body.spellB, 'B');
    let llmConfig = null;
    try {
      llmConfig = resolveRequestLlmOverride(body.aiConfig);
    } catch (error) {
      if (error instanceof AIConfigError) {
        sendError(res, 401, { code: 'ai_config_invalid', message: error.message });
        return true;
      }
      throw error;
    }
    try {
      const taskId = createForgeTask({
        playerId: body.playerId,
        spellA,
        spellB,
        llmConfig,
      });
      sendJson(res, 200, { taskId, status: 'pending' });
    } catch (error) {
      if (error.code === 'quota_exhausted') {
        sendError(res, 429, {
          code: 'quota_exhausted',
          message: error.message,
          quota: quotaSnapshot(body.playerId),
        });
        return true;
      }
      throw error;
    }
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/ai-config/test') {
    const body = await readJsonBody(req);
    try {
      sendJson(res, 200, await testAiConfig(body.aiConfig));
    } catch (error) {
      if (error instanceof AIConfigError) {
        sendError(res, 400, { code: 'ai_config_invalid', message: error.message });
        return true;
      }
      throw error;
    }
    return true;
  }

  params = route('*', pathname, '/api/forge/status/:taskId');
  if (req.method === 'GET' && params) {
    const task = getTaskStatus(params.taskId);
    if (!task) sendError(res, 404, 'Task not found');
    else sendJson(res, 200, { taskId: params.taskId, status: task.status, result: task.result, error: task.error || null });
    return true;
  }

  params = route('*', pathname, '/api/video/pixverse/from-forge/:forgeTaskId');
  if (req.method === 'POST' && params) {
    try {
      sendJson(res, 200, createVideoTaskFromForgeTask(params.forgeTaskId));
    } catch (error) {
      sendError(res, 400, error.message);
    }
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/video/pixverse/cards/register') {
    const body = await readJsonBody(req);
    const cards = registerGeneratedCards(Array.isArray(body.cards) ? body.cards : []);
    sendJson(res, 200, { count: cards.length, cards });
    return true;
  }

  params = route('*', pathname, '/api/video/pixverse/card/:cardId');
  if (req.method === 'GET' && params) {
    const asset = getPlayerGeneratedAssetByCard(params.cardId);
    if (!asset) sendError(res, 404, 'Card video asset not found');
    else sendJson(res, 200, asset);
    return true;
  }

  params = route('*', pathname, '/api/video/pixverse/from-card/:cardId');
  if (req.method === 'POST' && params) {
    const asset = getPlayerGeneratedAssetByCard(params.cardId);
    if (!asset) {
      sendError(res, 404, 'Card video asset not registered yet');
      return true;
    }
    if (asset.status === 'completed' && asset.resultUrl) {
      sendJson(res, 200, asset);
      return true;
    }
    try {
      createVideoTaskFromCard(params.cardId);
      const latest = getPlayerGeneratedAssetByCard(params.cardId);
      sendJson(res, 200, latest);
    } catch (error) {
      sendError(res, 400, error.message);
    }
    return true;
  }

  params = route('*', pathname, '/api/video/pixverse/status/:videoTaskId');
  if (req.method === 'GET' && params) {
    const task = getVideoTask(params.videoTaskId);
    if (!task) sendError(res, 404, 'PixVerse task not found');
    else sendJson(res, 200, task);
    return true;
  }

  return pathname.startsWith('/api/') ? (sendError(res, 404, 'API route not found'), true) : false;
}

function handleStatic(res, pathname) {
  const normalized = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.join(repoRoot, normalized.replace(/^\/+/, ''));
  const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
  if (stat?.isDirectory()) filePath = path.join(filePath, 'index.html');
  return serveFile(res, filePath, { root: repoRoot, cacheControl: 'no-cache' });
}
