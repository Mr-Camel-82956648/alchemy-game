import fs from 'node:fs';
import path from 'node:path';
import { resourcesRoot, resolveGlyphRouterConfig } from '../config.js';

const cardsDir = path.join(resourcesRoot, 'glyph-router-templates', 'cards');
const fullTemplateDir = path.join(resourcesRoot, 'glyph-router-templates', 'full');
const FORMAL_TEMPLATE_CODES = ['A', 'B1', 'B2', 'C', 'D', 'E', 'F'];
const ALLOWED_TEMPLATE_CODES = new Set(FORMAL_TEMPLATE_CODES);
const FULL_TEMPLATE_MAP = {
  A: 'A_container_full',
  B1: 'B1_fallback_full',
  B2: 'B2_rain_full',
  C: 'C_eruption_full',
  D: 'D_trail_full',
  E: 'E_burst_full',
  F: 'F_manifest_full',
};

export function buildPromptFallback(themeText) {
  const cleaned = String(themeText || '').trim();
  if (!cleaned) {
    return 'Standard isometric 2.5D game skill effect asset, pure black background, one controlled alchemy glyph with clear boundaries and a focused center.';
  }
  return `Standard isometric 2.5D game skill effect asset, pure black background, one controlled alchemy glyph. ${cleaned}`;
}

export async function runPromptRouter(themeText, { taskId = null } = {}) {
  const started = Date.now();
  const cleaned = String(themeText || '').trim();
  if (!cleaned) throw new Error('themeText empty: skipped glyph router');

  const routeStarted = Date.now();
  const route = await routeTheme(cleaned);
  const routeElapsedMs = Date.now() - routeStarted;

  let fallbackApplied = false;
  let finalRouteCode = route.selected_template;
  let finalTemplate = FULL_TEMPLATE_MAP[finalRouteCode];
  if (!finalTemplate && route.fallback_needed && route.fallback_target) {
    finalRouteCode = route.fallback_target;
    finalTemplate = FULL_TEMPLATE_MAP[finalRouteCode];
    fallbackApplied = Boolean(finalTemplate);
  }
  if (!finalTemplate) throw new Error(`missing_full_template_mapping=${finalRouteCode}`);

  const generationStarted = Date.now();
  const templateMarkdown = loadFullTemplate(finalTemplate);
  const prompt = await generatePrompt(cleaned, templateMarkdown);
  const generationElapsedMs = Date.now() - generationStarted;
  const totalElapsedMs = Date.now() - started;
  const config = resolveGlyphRouterConfig();
  return {
    final_prompt: prompt,
    route_selected: route.selected_template,
    route_reason: route.route_reason || `gpt route for task ${taskId || '-'}`,
    fallback_applied: fallbackApplied,
    final_template: finalTemplate,
    model: config.model,
    llm_source_family: config.sourceFamily,
    llm_base_url: config.baseUrl,
    llm_api_key_hint: config.apiKey ? `${config.apiKey.slice(0, 4)}...${config.apiKey.slice(-4)}` : null,
    llm_field_sources: config.fieldSources,
    llm_env_files: config.envFilesLoaded,
    route_elapsed_ms: routeElapsedMs,
    generation_elapsed_ms: generationElapsedMs,
    total_elapsed_ms: totalElapsedMs,
  };
}

async function routeTheme(theme) {
  const cards = loadCards();
  const cardBlock = cards
    .map((card) => `Template code: ${card.code}\nTemplate file: ${card.name}\n${card.content}`)
    .join('\n\n');
  const text = await chatOpenAiCompat(
    [
      {
        role: 'system',
        content:
          'You are a template router for video-prompt generation. Choose the best template code only from A, B1, B2, C, D, E, F. Return one JSON object only, with no markdown.',
      },
      {
        role: 'user',
        content:
          `Theme:\n${theme}\n\n` +
          'Return JSON fields: selected_template, route_reason, fallback_needed, fallback_target.\n' +
          'selected_template must be one of A/B1/B2/C/D/E/F. fallback_needed must be true or false. fallback_target should be null when not needed. route_reason should be concise.\n\n' +
          cardBlock,
      },
    ],
    0
  );
  const data = parseJsonObject(text);
  const selectedTemplate = String(data.selected_template || '').trim().toUpperCase();
  if (!ALLOWED_TEMPLATE_CODES.has(selectedTemplate)) {
    throw new Error(`invalid_selected_template=${selectedTemplate}`);
  }
  let fallbackTarget = data.fallback_target;
  if (fallbackTarget === '' || String(fallbackTarget).toLowerCase() === 'null') fallbackTarget = null;
  if (fallbackTarget != null) {
    fallbackTarget = String(fallbackTarget).trim().toUpperCase();
    if (!ALLOWED_TEMPLATE_CODES.has(fallbackTarget)) fallbackTarget = null;
  }
  return {
    selected_template: selectedTemplate,
    route_reason: String(data.route_reason || '').trim(),
    fallback_needed: toBool(data.fallback_needed),
    fallback_target: fallbackTarget,
  };
}

async function generatePrompt(theme, templateMarkdown) {
  const text = await chatOpenAiCompat(
    [
      {
        role: 'system',
        content:
          'You are a Chinese video-generation prompt writer. Generate one complete final Chinese prompt strictly from the given template. Output only the final prompt text, with no title, no explanation, no bullet list, and no markdown.',
      },
      {
        role: 'user',
        content: `Theme:\n${theme}\n\nFull template:\n${templateMarkdown}`,
      },
    ],
    0.7
  );
  return cleanGeneratedPrompt(text);
}

function loadCards() {
  const entries = fs.readdirSync(cardsDir, { withFileTypes: true });
  const cards = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const code = entry.name.split('_', 1)[0].toUpperCase();
    if (!ALLOWED_TEMPLATE_CODES.has(code)) continue;
    const filePath = path.join(cardsDir, entry.name);
    cards.push({
      code,
      name: entry.name.replace(/\.md$/i, ''),
      content: fs.readFileSync(filePath, 'utf8').trim(),
    });
  }
  cards.sort((a, b) => FORMAL_TEMPLATE_CODES.indexOf(a.code) - FORMAL_TEMPLATE_CODES.indexOf(b.code));
  if (!cards.length) throw new Error('no_template_cards');
  return cards;
}

function loadFullTemplate(templateStem) {
  const filename = templateStem.endsWith('.md') ? templateStem : `${templateStem}.md`;
  try {
    return fs.readFileSync(path.join(fullTemplateDir, filename), 'utf8').trim();
  } catch {
    throw new Error(`missing_full_template=${templateStem}`);
  }
}

async function chatOpenAiCompat(messages, temperature) {
  const config = resolveGlyphRouterConfig();
  if (config.provider !== 'openai_compat') {
    throw new Error(`unsupported_provider=${config.provider}`);
  }
  if (config.missing.length || !config.baseUrl || !config.apiKey || !config.model) {
    throw new Error(`config_missing_env=${config.missing.join(',') || 'LLM_BASE_URL,LLM_API_KEY,OPENAI_COMPAT_MODEL'}`);
  }

  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const totalAttempts = 1 + Math.max(0, Number(config.maxRetries || 0));
  let lastError = null;
  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature,
        }),
        signal: AbortSignal.timeout(Math.max(1, Number(config.timeoutSeconds || 30)) * 1000),
      });
      const rawText = await response.text();
      if (!response.ok) {
        throw new Error(`llm_http_error status=${response.status} body=${rawText.slice(0, 200)}`);
      }
      const body = JSON.parse(rawText);
      const content = extractOpenAiMessageText(body?.choices?.[0]?.message?.content);
      if (!content) throw new Error('empty_llm_content');
      return content;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`llm_request_error: ${lastError?.message || 'unknown'}`);
}

function parseJsonObject(rawText) {
  let cleaned = String(rawText || '').trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('```'))
      .join('\n')
      .trim();
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('route_response_not_json');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function cleanGeneratedPrompt(text) {
  let cleaned = String(text || '').trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('```'))
      .join('\n')
      .trim();
  }
  return cleaned.replace(/^["']|["']$/g, '').trim();
}

function extractOpenAiMessageText(message) {
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

function toBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return Boolean(value);
}
