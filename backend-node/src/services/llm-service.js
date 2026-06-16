import fs from 'node:fs';
import path from 'node:path';
import { resourcesRoot, resolveForgeLlmConfig } from '../config.js';

const promptsDir = path.join(resourcesRoot, 'prompts', 'forge');

const SYSTEM_PROMPT = loadPrompt(
  'system_prompt.txt',
  'You are an alchemy semantic parser. Return strict JSON with fields: name, attrSet, themeText.'
);
const USER_PROMPT_TEMPLATE = loadPrompt(
  'user_prompt.txt',
  'input_state: {input_state}\nallowed_attrs: {allowed_attrs}\ninput JSON:\n{inputs_json}'
);

function loadPrompt(filename, fallback) {
  try {
    return fs.readFileSync(path.join(promptsDir, filename), 'utf8').trim();
  } catch {
    return fallback;
  }
}

export async function callForgeSemanticLlm({ inputState, spellA, spellB, llmOverride = null }) {
  const config = resolveForgeLlmConfig(llmOverride);
  if (config.provider !== 'openai_compat') return null;
  if (config.missing.length || !config.baseUrl || !config.apiKey || !config.model) return null;

  const userPrompt = buildUserPrompt({ inputState, spellA, spellB });
  const totalAttempts = 1 + Math.max(0, Number(config.maxRetries || 0));
  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.4,
        }),
        signal: AbortSignal.timeout(Math.max(1, Number(config.timeoutSeconds || 30)) * 1000),
      });
      if (!response.ok) {
        const text = await response.text();
        console.warn('[llm-service] HTTP error:', response.status, text.slice(0, 200));
        continue;
      }
      const body = await response.json();
      const content = extractMessageText(body?.choices?.[0]?.message?.content);
      const parsed = JSON.parse(extractJsonText(content));
      const validated = validateForgeResult(parsed);
      if (validated) return validated;
    } catch (error) {
      console.warn('[llm-service] request failed:', error.message);
    }
  }
  return null;
}

function buildUserPrompt({ inputState, spellA, spellB }) {
  return USER_PROMPT_TEMPLATE.replaceAll('{input_state}', inputState)
    .replaceAll('{allowed_attrs}', 'fire, ice, thunder, blight')
    .replaceAll(
      '{inputs_json}',
      JSON.stringify(
        {
          inputState,
          slotA: serializeSpell(spellA),
          slotB: serializeSpell(spellB),
        },
        null,
        2
      )
    );
}

function serializeSpell(spell) {
  if (!spell) return null;
  return {
    slot: spell.slot,
    type: spell.type || 'spell',
    name: spell.name || '',
    attrSet: [...(spell.attr_set || [])],
    themeText: spell.theme_text || '',
    generation: spell.generation || 1,
  };
}

function extractMessageText(message) {
  if (typeof message === 'string') return message.trim();
  if (Array.isArray(message)) {
    return message
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item?.type === 'text') return item.text || '';
        return '';
      })
      .join('\n')
      .trim();
  }
  return String(message || '').trim();
}

function extractJsonText(text) {
  let cleaned = String(text || '').trim();
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split(/\r?\n/);
    if (lines.length) lines.shift();
    if (lines.at(-1)?.trim() === '```') lines.pop();
    cleaned = lines.join('\n').trim();
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1);
  return cleaned;
}

function validateForgeResult(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim();
  const themeText = String(raw.themeText || '').trim();
  const attrSet = coerceAttrSet(raw.attrSet);
  if (!name) return null;
  return {
    name: name.slice(0, 20),
    attrSet: attrSet.slice(0, 3),
    themeText: themeText ? themeText.slice(0, 400) : '',
  };
}

function coerceAttrSet(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .replaceAll('，', ',')
      .replaceAll('、', ',')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}
