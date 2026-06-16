import crypto from 'node:crypto';
import { resolvePixVerseConfig } from '../config.js';
import { clone, nowMs } from '../state-store.js';
import {
  getPlayerGeneratedAssetByCard,
  loadPersistedVideoTasks,
  saveVideoTask,
  syncCardAssetWithVideoTask,
} from './asset-service.js';
import { getTaskStatus } from './forge-service.js';

const videoTasks = new Map(Object.entries(loadPersistedVideoTasks()));
const activeWorkers = new Set();

export function createVideoTaskFromForgeTask(forgeTaskId) {
  const forgeTask = getTaskStatus(forgeTaskId);
  if (!forgeTask) throw new Error('Forge task not found');
  if (forgeTask.status !== 'completed' || !forgeTask.result) {
    throw new Error('Forge task is not completed yet');
  }
  const prompt = String(forgeTask.result.videoPrompt || '').trim();
  if (!prompt) throw new Error('Forge result has no videoPrompt');

  const active = findActiveTaskByForge(forgeTaskId);
  if (active) return active;
  return createVideoTask({
    prompt,
    forgeTaskId,
    cardId: null,
    promptSummary: forgeTask.result.name || forgeTask.result.themeText || 'forge_result',
  });
}

export function createVideoTaskFromCard(cardId) {
  const asset = getPlayerGeneratedAssetByCard(cardId);
  if (!asset) throw new Error('Card video asset not registered yet');
  const prompt = String(asset.videoPrompt || '').trim();
  if (!prompt) throw new Error('Card video asset has no videoPrompt');

  const reusable = findReusableTaskByCard(cardId);
  if (reusable) return reusable;
  return createVideoTask({
    prompt,
    forgeTaskId: asset.forgeTaskId || null,
    cardId,
    promptSummary: asset.name || asset.themeText || 'card_asset',
  });
}

export function getVideoTask(videoTaskId) {
  const task = videoTasks.get(videoTaskId);
  return task ? publicTask(task) : null;
}

export function listVideoTasks({ limit = 20, forgeTaskId = null, cardId = null } = {}) {
  let tasks = [...videoTasks.values()];
  if (forgeTaskId) tasks = tasks.filter((task) => task.forgeTaskId === forgeTaskId);
  if (cardId) tasks = tasks.filter((task) => task.cardId === cardId);
  tasks.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  return tasks.slice(0, Math.max(1, Number(limit) || 20)).map(publicTask);
}

export function getPixVerseConfigSnapshot() {
  const { apiKey, ...publicConfig } = resolvePixVerseConfig();
  return publicConfig;
}

export function getVideoTaskDebug(videoTaskId) {
  const task = videoTasks.get(videoTaskId);
  if (!task) return null;
  return {
    task: publicTask(task),
    config: getPixVerseConfigSnapshot(),
    latestSubmitCall: task.latestSubmitCall || null,
    latestPollCall: task.latestPollCall || null,
  };
}

function createVideoTask({ prompt, forgeTaskId, cardId, promptSummary }) {
  const now = nowMs();
  const config = resolvePixVerseConfig();
  const videoTaskId = `vtask_${crypto.randomBytes(6).toString('hex')}`;
  const task = {
    videoTaskId,
    cardId,
    forgeTaskId,
    pixverseVideoId: null,
    traceId: null,
    lastPollTraceId: null,
    status: 'queued',
    providerStatus: null,
    providerErrCode: null,
    providerErrMsg: null,
    error: null,
    resultUrl: null,
    promptSummary,
    promptLength: prompt.length,
    submitAttempts: 0,
    pollCount: 0,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    events: [],
    configSnapshot: sanitizeConfig(config),
    latestSubmitCall: null,
    latestPollCall: null,
    _prompt: prompt,
  };
  videoTasks.set(videoTaskId, task);
  appendEvent(videoTaskId, { kind: 'queued', message: 'PixVerse video task created' });
  persistTask(task);
  startVideoWorker(videoTaskId);
  return publicTask(task);
}

async function runVideoTask(videoTaskId) {
  try {
    const task = videoTasks.get(videoTaskId);
    if (!task) return;
    const config = resolvePixVerseConfig();
    if (config.missing.length) {
      markFailed(videoTaskId, `Missing PixVerse config: ${config.missing.join(', ')}`);
      return;
    }

    const submitResult = await submitPixVerse(task, config);
    if (!submitResult) return;
    const videoId = submitResult.videoId;
    const deadline = Date.now() + Math.max(5, Number(config.timeoutSeconds || 120)) * 1000;
    const pollIntervalMs = Math.max(500, Number(config.pollIntervalSeconds || 5) * 1000);

    while (Date.now() < deadline) {
      await sleep(pollIntervalMs);
      const pollResult = await pollPixVerse(videoTaskId, videoId, config);
      if (!pollResult) continue;
      if (pollResult.status === 1) {
        if (!pollResult.url) {
          markFailed(videoTaskId, 'PixVerse returned status=1 but Resp.url is empty');
          return;
        }
        updateTask(videoTaskId, {
          status: 'succeeded',
          resultUrl: pollResult.url,
          providerStatus: 1,
          providerErrCode: 0,
          providerErrMsg: 'Success',
          finishedAt: nowMs(),
          error: null,
        });
        appendEvent(videoTaskId, {
          kind: 'completed',
          message: 'PixVerse task completed and MP4 URL is ready',
          providerStatus: 1,
          errCode: 0,
          errMsg: 'Success',
        });
        return;
      }
      if (pollResult.status === 5) continue;
      if (pollResult.status === 7) {
        markFailed(videoTaskId, 'PixVerse moderation failed (status=7)');
        return;
      }
      if (pollResult.status === 8) {
        markFailed(videoTaskId, 'PixVerse generation failed (status=8)');
        return;
      }
      markFailed(videoTaskId, `PixVerse returned unexpected status=${pollResult.status}`);
      return;
    }
    markFailed(videoTaskId, `PixVerse timed out after ${config.timeoutSeconds}s without a terminal status`);
  } finally {
    activeWorkers.delete(videoTaskId);
  }
}

async function submitPixVerse(task, config) {
  const totalAttempts = 1 + Math.max(0, Number(config.maxRetries || 0));
  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    const traceId = crypto.randomUUID();
    updateTask(task.videoTaskId, {
      status: 'submitting',
      traceId,
      submitAttempts: attempt,
      error: null,
      providerErrCode: null,
      providerErrMsg: null,
    });
    appendEvent(task.videoTaskId, {
      kind: 'submit_attempt',
      message: `Submit attempt ${attempt}/${totalAttempts}`,
      traceId,
    });
    try {
      const diagnostic = makeDiagnostic({
        phase: 'submit',
        method: 'POST',
        url: config.submitUrl,
        traceId,
        requestHeaders: {
          'API-KEY': config.apiKeyHint || '',
          'Ai-trace-id': traceId,
          'Content-Type': 'application/json',
        },
        requestSummary: {
          model: config.model,
          quality: config.quality,
          aspectRatio: config.aspectRatio,
          durationSeconds: config.durationSeconds,
          waterMark: config.waterMark,
          seed: config.seed,
          generateAudioSwitch: config.generateAudioSwitch,
          promptLength: task._prompt.length,
        },
      });
      const response = await fetch(config.submitUrl, {
        method: 'POST',
        headers: {
          'API-KEY': config.apiKey,
          'Ai-trace-id': traceId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          aspect_ratio: config.aspectRatio,
          duration: config.durationSeconds,
          model: config.model,
          prompt: task._prompt,
          quality: config.quality,
          seed: config.seed,
          water_mark: config.waterMark,
          generate_audio_switch: config.generateAudioSwitch,
        }),
        signal: AbortSignal.timeout(Math.min(Math.max(Number(config.timeoutSeconds || 120), 10), 30) * 1000),
      });
      diagnostic.httpStatus = response.status;
      const text = await response.text();
      const body = safeJson(text);
      diagnostic.responseSummary = summarizeProviderBody(body, text);
      diagnostic.providerErrCode = toInt(body?.ErrCode);
      diagnostic.providerErrMsg = body?.ErrMsg || null;
      if (!response.ok) throw new Error(`PixVerse HTTP ${response.status}: ${diagnostic.providerErrMsg || text.slice(0, 200)}`);
      if (!body || body.ErrCode !== 0) throw new Error(`PixVerse ErrCode=${body?.ErrCode}: ${body?.ErrMsg || 'unknown error'}`);
      const videoId = toInt(body?.Resp?.video_id);
      if (videoId == null) throw new Error('PixVerse generate succeeded but Resp.video_id is missing');
      diagnostic.providerStatus = 5;
      updateTask(task.videoTaskId, {
        status: 'polling',
        pixverseVideoId: videoId,
        providerStatus: 5,
        providerErrCode: 0,
        providerErrMsg: 'Success',
        latestSubmitCall: diagnostic,
        error: null,
      });
      appendEvent(task.videoTaskId, {
        kind: 'submit_success',
        message: `PixVerse accepted request, video_id=${videoId}`,
        traceId,
        providerStatus: 5,
        errCode: 0,
        errMsg: 'Success',
      });
      return { videoId };
    } catch (error) {
      updateTask(task.videoTaskId, { error: error.message });
      appendEvent(task.videoTaskId, {
        kind: 'submit_failed',
        message: error.message,
        traceId,
      });
      if (attempt >= totalAttempts) {
        markFailed(task.videoTaskId, `PixVerse submit failed after ${attempt} attempt(s): ${error.message}`);
        return null;
      }
      await sleep(1000);
    }
  }
  return null;
}

async function pollPixVerse(videoTaskId, videoId, config) {
  const current = videoTasks.get(videoTaskId);
  if (!current) return null;
  const traceId = crypto.randomUUID();
  const pollCount = Number(current.pollCount || 0) + 1;
  updateTask(videoTaskId, {
    status: 'polling',
    lastPollTraceId: traceId,
    pollCount,
  });
  const url = config.resultUrlTemplate.replace('{id}', String(videoId));
  const diagnostic = makeDiagnostic({
    phase: 'poll',
    method: 'GET',
    url,
    traceId,
    requestHeaders: {
      'API-KEY': config.apiKeyHint || '',
      'Ai-trace-id': traceId,
    },
    requestSummary: { videoId },
  });
  try {
    const response = await fetch(url, {
      headers: {
        'API-KEY': config.apiKey,
        'Ai-trace-id': traceId,
      },
      signal: AbortSignal.timeout(Math.min(Math.max(Number(config.timeoutSeconds || 120), 10), 30) * 1000),
    });
    diagnostic.httpStatus = response.status;
    const text = await response.text();
    const body = safeJson(text);
    diagnostic.responseSummary = summarizeProviderBody(body, text);
    diagnostic.providerErrCode = toInt(body?.ErrCode);
    diagnostic.providerErrMsg = body?.ErrMsg || null;
    if (!response.ok) throw new Error(`PixVerse HTTP ${response.status}: ${diagnostic.providerErrMsg || text.slice(0, 200)}`);
    if (!body || body.ErrCode !== 0) throw new Error(`PixVerse ErrCode=${body?.ErrCode}: ${body?.ErrMsg || 'unknown error'}`);
    const providerStatus = toInt(body?.Resp?.status);
    const resultUrl = String(body?.Resp?.url || '').trim() || null;
    diagnostic.providerStatus = providerStatus;
    updateTask(videoTaskId, {
      providerStatus,
      providerErrCode: 0,
      providerErrMsg: 'Success',
      latestPollCall: diagnostic,
      error: null,
    });
    appendEvent(videoTaskId, {
      kind: 'poll_result',
      message: `Poll #${pollCount} returned status=${providerStatus}`,
      traceId,
      providerStatus,
      errCode: 0,
      errMsg: 'Success',
    });
    return { status: providerStatus, url: resultUrl };
  } catch (error) {
    updateTask(videoTaskId, {
      latestPollCall: diagnostic,
      error: error.message,
    });
    appendEvent(videoTaskId, {
      kind: 'poll_error',
      message: error.message,
      traceId,
    });
    return null;
  }
}

function findActiveTaskByForge(forgeTaskId) {
  for (const task of videoTasks.values()) {
    if (task.forgeTaskId === forgeTaskId && ['queued', 'submitting', 'polling'].includes(task.status)) {
      return publicTask(task);
    }
  }
  return null;
}

function findReusableTaskByCard(cardId) {
  let completed = null;
  for (const task of videoTasks.values()) {
    if (task.cardId !== cardId) continue;
    if (['queued', 'submitting', 'polling'].includes(task.status)) return publicTask(task);
    if (task.status === 'succeeded' && task.resultUrl) completed = task;
  }
  return completed ? publicTask(completed) : null;
}

function startVideoWorker(videoTaskId) {
  if (activeWorkers.has(videoTaskId)) return;
  activeWorkers.add(videoTaskId);
  setTimeout(() => {
    void runVideoTask(videoTaskId);
  }, 10);
}

function resumePendingVideoTasks() {
  for (const task of videoTasks.values()) {
    if (['queued', 'submitting', 'polling'].includes(task.status)) startVideoWorker(task.videoTaskId);
  }
}

function updateTask(videoTaskId, updates) {
  const task = videoTasks.get(videoTaskId);
  if (!task) return;
  Object.assign(task, updates, { updatedAt: nowMs() });
  persistTask(task);
}

function appendEvent(videoTaskId, event) {
  const task = videoTasks.get(videoTaskId);
  if (!task) return;
  const events = Array.isArray(task.events) ? task.events : [];
  events.push({
    at: nowMs(),
    kind: event.kind,
    message: event.message,
    traceId: event.traceId || null,
    providerStatus: event.providerStatus ?? null,
    errCode: event.errCode ?? null,
    errMsg: event.errMsg ?? null,
  });
  task.events = events.slice(-20);
  task.updatedAt = nowMs();
  persistTask(task);
}

function markFailed(videoTaskId, reason) {
  updateTask(videoTaskId, {
    status: 'failed',
    error: reason,
    finishedAt: nowMs(),
  });
  appendEvent(videoTaskId, { kind: 'failed', message: reason });
}

function persistTask(task) {
  saveVideoTask(task);
  syncCardAssetWithVideoTask(task);
}

function publicTask(task) {
  const output = clone(task);
  delete output._prompt;
  delete output.configSnapshot;
  return output;
}

function sanitizeConfig(config) {
  const { apiKey, ...publicConfig } = config;
  return publicConfig;
}

function makeDiagnostic({ phase, method, url, traceId, requestHeaders, requestSummary }) {
  return {
    at: nowMs(),
    phase,
    method,
    url,
    traceId,
    requestHeaders,
    requestSummary,
    httpStatus: null,
    providerErrCode: null,
    providerErrMsg: null,
    providerStatus: null,
    responseSummary: {},
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function summarizeProviderBody(body, rawText) {
  if (!body || typeof body !== 'object') return { rawTextPreview: String(rawText || '').slice(0, 200) };
  const resp = body.Resp;
  const summary = {
    topLevelKeys: Object.keys(body).sort(),
    ErrCode: toInt(body.ErrCode),
    ErrMsg: String(body.ErrMsg || '').trim() || null,
  };
  if (resp && typeof resp === 'object') {
    summary.respKeys = Object.keys(resp).sort();
    if ('video_id' in resp) summary.videoId = toInt(resp.video_id);
    if ('id' in resp) summary.resultId = toInt(resp.id);
    if ('status' in resp) summary.providerStatus = toInt(resp.status);
    if ('url' in resp) summary.hasUrl = Boolean(String(resp.url || '').trim());
  }
  return summary;
}

function toInt(value) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

resumePendingVideoTasks();
