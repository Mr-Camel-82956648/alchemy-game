import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, '..', '..');
export const nodeBackendRoot = path.resolve(__dirname, '..');
export const resourcesRoot = path.join(nodeBackendRoot, 'resources');
export const dataDir = path.join(nodeBackendRoot, 'data');
export const cardAssetStatePath = path.join(dataDir, 'card_asset_state.json');
export const quotaStatePath = path.join(dataDir, 'quota_state.json');
export const staticCardAssetDir = path.join(resourcesRoot, 'assets', 'cards');
export const staticCardAssetUrlBase = '/api/assets/files/cards';

const envFilesLoaded = [];
let envLoaded = false;

export function ensureEnvLoaded() {
  if (envLoaded) return envFilesLoaded;
  envLoaded = true;
  loadEnvFile(path.join(nodeBackendRoot, '.env'));
  return envFilesLoaded;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equals = line.indexOf('=');
    if (equals < 0) continue;
    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
  envFilesLoaded.push(path.relative(repoRoot, filePath).replaceAll(path.sep, '/'));
  return true;
}

export function getEnvFilesLoaded() {
  ensureEnvLoaded();
  return [...envFilesLoaded];
}

export function clean(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

export function boolEnv(name, defaultValue = false) {
  const value = String(process.env[name] ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return defaultValue;
}

export function intEnv(name, defaultValue) {
  const value = Number.parseInt(String(process.env[name] ?? '').trim(), 10);
  return Number.isFinite(value) ? value : defaultValue;
}

export function floatEnv(name, defaultValue) {
  const value = Number.parseFloat(String(process.env[name] ?? '').trim());
  return Number.isFinite(value) ? value : defaultValue;
}

export function apiKeyHint(value) {
  const text = clean(value);
  if (!text) return null;
  if (text.length <= 8) return '*'.repeat(text.length);
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

export function resolveForgeLlmConfig(override = null) {
  ensureEnvLoaded();
  if (override) {
    return {
      provider: 'openai_compat',
      sourceFamily: 'request',
      baseUrl: clean(override.base_url || override.baseUrl),
      apiKey: clean(override.api_key || override.apiKey),
      model: clean(override.model) || 'gpt-5.4',
      timeoutSeconds: intEnv('LLM_TIMEOUT_SECONDS', 30),
      maxRetries: intEnv('LLM_MAX_RETRIES', 1),
      missing: [],
      fieldSources: {
        base_url: 'request',
        api_key: 'request',
        model: 'request',
      },
      envFilesLoaded: getEnvFilesLoaded(),
    };
  }

  const provider = normalizeProvider(process.env.LLM_PROVIDER) || 'openai_compat';
  const baseUrl = clean(process.env.LLM_BASE_URL);
  const apiKey = clean(process.env.LLM_API_KEY);
  const model = clean(process.env.OPENAI_COMPAT_MODEL) || 'gpt-5.4';
  const missing = [];
  if (provider === 'openai_compat') {
    if (!baseUrl) missing.push('LLM_BASE_URL');
    if (!apiKey) missing.push('LLM_API_KEY');
    if (!model) missing.push('OPENAI_COMPAT_MODEL');
  }

  return {
    provider,
    sourceFamily: 'env',
    baseUrl,
    apiKey,
    model,
    timeoutSeconds: intEnv('LLM_TIMEOUT_SECONDS', 30),
    maxRetries: intEnv('LLM_MAX_RETRIES', 1),
    missing,
    fieldSources: {
      provider: clean(process.env.LLM_PROVIDER) ? 'LLM_PROVIDER' : 'default:openai_compat',
      base_url: 'LLM_BASE_URL',
      api_key: 'LLM_API_KEY',
      model: clean(process.env.OPENAI_COMPAT_MODEL) ? 'OPENAI_COMPAT_MODEL' : 'default:gpt-5.4',
    },
    envFilesLoaded: getEnvFilesLoaded(),
  };
}

export function resolveGlyphRouterConfig() {
  const config = resolveForgeLlmConfig();
  return {
    ...config,
    fieldSources: { ...config.fieldSources },
  };
}

export function buildRuntimeSnapshot() {
  const forge = resolveForgeLlmConfig();
  const glyphRouter = resolveGlyphRouterConfig();
  const summarize = (config) => ({
    provider: config.provider,
    sourceFamily: config.sourceFamily,
    baseUrl: config.baseUrl,
    apiKeyHint: apiKeyHint(config.apiKey),
    model: config.model,
    timeoutSeconds: config.timeoutSeconds,
    maxRetries: config.maxRetries,
    missing: config.missing,
    fieldSources: config.fieldSources,
    envFilesLoaded: config.envFilesLoaded,
  });
  const aligned =
    forge.provider === glyphRouter.provider &&
    forge.baseUrl === glyphRouter.baseUrl &&
    forge.model === glyphRouter.model;

  return {
    forge: summarize(forge),
    glyphRouter: summarize(glyphRouter),
    forgeFallback: {
      provider: 'disabled',
      model: null,
      missing: [],
    },
    aligned,
    alignmentNote: aligned ? 'forge and glyph router share the same config' : 'config differs',
    ignoredEnvFiles: [],
  };
}

function normalizeProvider(value) {
  const text = clean(value);
  if (!text) return null;
  const lowered = text.toLowerCase();
  if (['openai', 'openai_compat', 'openai-compatible', 'gpt'].includes(lowered)) {
    return 'openai_compat';
  }
  return lowered;
}

export function resolvePixVerseConfig() {
  ensureEnvLoaded();
  const baseUrl = clean(process.env.PIXVERSE_BASE_URL) || 'https://app-api.pixverse.ai/openapi/v2';
  const apiKey = clean(process.env.PIXVERSE_API_KEY);
  const missing = apiKey ? [] : ['PIXVERSE_API_KEY'];

  return {
    configSource: 'backend-node/.env',
    baseUrl: baseUrl.replace(/\/+$/, ''),
    submitUrl: `${baseUrl.replace(/\/+$/, '')}/video/text/generate`,
    resultUrlTemplate: `${baseUrl.replace(/\/+$/, '')}/video/result/{id}`,
    apiKey,
    apiKeyHint: apiKeyHint(apiKey),
    model: clean(process.env.PIXVERSE_MODEL) || 'c1',
    quality: clean(process.env.PIXVERSE_QUALITY) || '360p',
    aspectRatio: clean(process.env.PIXVERSE_ASPECT_RATIO) || '1:1',
    durationSeconds: intEnv('PIXVERSE_DURATION_SECONDS', 1),
    waterMark: boolEnv('PIXVERSE_WATERMARK', false),
    seed: intEnv('PIXVERSE_SEED', 1320994540),
    generateAudioSwitch: boolEnv('PIXVERSE_GENERATE_AUDIO_SWITCH', true),
    maxRetries: intEnv('PIXVERSE_MAX_RETRIES', 1),
    pollIntervalSeconds: floatEnv('PIXVERSE_POLL_INTERVAL_SECONDS', 5),
    timeoutSeconds: floatEnv('PIXVERSE_TIMEOUT_SECONDS', 120),
    missing,
    fieldSources: {
      base_url: clean(process.env.PIXVERSE_BASE_URL)
        ? 'PIXVERSE_BASE_URL'
        : 'default:https://app-api.pixverse.ai/openapi/v2',
      api_key: 'PIXVERSE_API_KEY',
      model: clean(process.env.PIXVERSE_MODEL) ? 'PIXVERSE_MODEL' : 'default:c1',
      quality: clean(process.env.PIXVERSE_QUALITY) ? 'PIXVERSE_QUALITY' : 'default:360p',
      aspect_ratio: clean(process.env.PIXVERSE_ASPECT_RATIO)
        ? 'PIXVERSE_ASPECT_RATIO'
        : 'default:1:1',
    },
  };
}
