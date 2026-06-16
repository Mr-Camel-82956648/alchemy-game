import { spawn } from 'node:child_process';

const host = '127.0.0.1';
const port = Number(process.env.SMOKE_PORT || 18101);
const baseUrl = `http://${host}:${port}`;

const child = spawn(process.execPath, ['src/server.js'], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    HOST: host,
    PORT: String(port),
    FORGE_REQUIRE_AI_AUTH: 'false',
    FORGE_USE_REAL_LLM: 'false',
    LLM_API_KEY: '',
    PIXVERSE_API_KEY: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

child.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
child.stderr.on('data', (chunk) => process.stderr.write(`[server:err] ${chunk}`));

try {
  await waitForReady(`${baseUrl}/`);
  await expectOk('GET /', fetchJson('/'));
  const assets = await expectOk('GET /api/assets/cards', fetchJson('/api/assets/cards?sourceType=built_in'));
  if (!Array.isArray(assets.assets) || assets.assets.length === 0) {
    throw new Error('expected built-in assets');
  }
  const quota = await expectOk(
    'GET /api/player/quota',
    fetchJson('/api/player/quota?playerId=player_smoke')
  );
  if (quota.playerId !== 'player_smoke') throw new Error('quota playerId mismatch');

  const forge = await expectOk(
    'POST /api/forge',
    fetchJson('/api/forge', {
      method: 'POST',
      body: {
        playerId: 'player_smoke',
        spellA: null,
        spellB: null,
        aiConfig: null,
      },
    })
  );
  if (!forge.taskId) throw new Error('forge taskId missing');
  const forgeStatus = await waitForForge(forge.taskId);
  if (forgeStatus.status !== 'completed' || !forgeStatus.result) {
    throw new Error(`forge did not complete: ${JSON.stringify(forgeStatus)}`);
  }

  const cardId = `smoke_${Date.now()}`;
  const registered = await expectOk(
    'POST /api/video/pixverse/cards/register',
    fetchJson('/api/video/pixverse/cards/register', {
      method: 'POST',
      body: {
        cards: [
          {
            cardId,
            forgeTaskId: forge.taskId,
            name: forgeStatus.result.name,
            attrSet: forgeStatus.result.attrSet,
            generation: forgeStatus.result.generation,
            themeText: forgeStatus.result.themeText,
            videoPrompt: forgeStatus.result.videoPrompt,
            sourceType: 'player_generated',
            status: 'not_generated',
          },
        ],
      },
    })
  );
  if (registered.count !== 1) throw new Error('expected one registered card');
  const cardStatus = await expectOk(
    'GET /api/video/pixverse/card/:cardId',
    fetchJson(`/api/video/pixverse/card/${encodeURIComponent(cardId)}`)
  );
  if (cardStatus.cardId !== cardId) throw new Error('card status mismatch');

  console.log('[smoke] OK');
} finally {
  child.kill();
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function expectOk(label, promise) {
  try {
    const result = await promise;
    console.log(`[smoke] ${label} OK`);
    return result;
  } catch (error) {
    throw new Error(`${label} failed: ${error.message}`);
  }
}

async function waitForReady(url) {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // retry
    }
    await sleep(200);
  }
  throw new Error('server did not become ready');
}

async function waitForForge(taskId) {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    const status = await fetchJson(`/api/forge/status/${encodeURIComponent(taskId)}`);
    if (status.status !== 'pending') return status;
    await sleep(300);
  }
  throw new Error('forge timed out');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
