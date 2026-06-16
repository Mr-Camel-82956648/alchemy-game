import { apiKeyHint, boolEnv, clean, resolveForgeLlmConfig } from '../config.js';

export class AIConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AIConfigError';
  }
}

export function aiAuthRequired() {
  return boolEnv('FORGE_REQUIRE_AI_AUTH', true);
}

export function resolveRequestLlmOverride(config) {
  if (!config) {
    if (aiAuthRequired()) throw new AIConfigError('AI engine is not connected');
    return null;
  }

  const mode = (clean(config.mode) || 'internal').toLowerCase();
  if (mode === 'internal') {
    validateInternalPassword(config.internalPassword);
    return null;
  }

  if (mode === 'personal') {
    const baseUrl = normalizeBaseUrl(config.baseUrl);
    const apiKey = clean(config.apiKey);
    const model = normalizeGptModel(config.model);
    if (!apiKey) throw new AIConfigError('API key is required');
    return { base_url: baseUrl, api_key: apiKey, model };
  }

  throw new AIConfigError('Unsupported AI config mode');
}

export async function testAiConfig(config) {
  let override = resolveRequestLlmOverride(config);
  let mode = 'personal';
  if (!override) {
    const resolved = resolveForgeLlmConfig();
    if (resolved.missing.length) {
      throw new AIConfigError(`Missing env LLM config: ${resolved.missing.join(', ')}`);
    }
    override = {
      base_url: resolved.baseUrl,
      api_key: resolved.apiKey,
      model: resolved.model,
    };
    mode = 'internal';
  }
  await probeOpenAiCompat(override);
  return {
    ok: true,
    mode,
    model: override.model,
    baseUrl: override.base_url,
    apiKeyHint: apiKeyHint(override.api_key),
    message: 'connected',
  };
}

async function probeOpenAiCompat(config) {
  const url = `${config.base_url.replace(/\/+$/, '')}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.api_key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: 'Return exactly OK.' },
        { role: 'user', content: 'Connection test.' },
      ],
      temperature: 0,
    }),
    signal: AbortSignal.timeout(20_000),
  }).catch((error) => {
    throw new AIConfigError(`LLM request failed: ${error.message}`);
  });

  if (!response.ok) {
    const snippet = (await response.text()).replace(/\s+/g, ' ').slice(0, 200);
    throw new AIConfigError(`LLM HTTP ${response.status}: ${snippet}`);
  }
  const body = await response.json().catch((error) => {
    throw new AIConfigError(`LLM response error: ${error.message}`);
  });
  if (!Array.isArray(body.choices) || body.choices.length === 0) {
    throw new AIConfigError('LLM response missing choices');
  }
}

function validateInternalPassword(value) {
  const expected = String(process.env.INTERNAL_API_PASSWORD || '3284');
  if (String(value || '') !== expected) throw new AIConfigError('Internal password is incorrect');
}

function normalizeBaseUrl(value) {
  const text = (clean(value) || '').replace(/\/+$/, '');
  if (!text) throw new AIConfigError('Base URL is required');
  if (!/^https?:\/\//i.test(text)) throw new AIConfigError('Base URL must start with http:// or https://');
  return text;
}

function normalizeGptModel(value) {
  const model = clean(value) || 'gpt-5.4';
  if (!model.toLowerCase().startsWith('gpt-')) throw new AIConfigError('Only gpt-* models are supported');
  return model;
}
