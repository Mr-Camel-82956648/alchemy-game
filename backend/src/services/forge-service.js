import crypto from 'node:crypto';
import { boolEnv } from '../config.js';
import { consumeQuotaOrThrow, getPlayerQuota } from './quota-service.js';
import { normalizeAttrSet } from './asset-service.js';
import { callForgeSemanticLlm } from './llm-service.js';
import { buildPromptFallback, runPromptRouter } from './prompt-router-service.js';

const ELEMENTS = ['fire', 'ice', 'thunder', 'blight'];
const ELEMENT_LABELS = {
  fire: 'fire',
  ice: 'ice',
  thunder: 'thunder',
  blight: 'blight',
};
const OPENING_POOL = [
  {
    name: '熔岩法阵',
    attrSet: ['fire'],
    themeText: 'A molten fire-themed alchemy glyph unfolds on the floor with a stable compressed core and controlled embers.',
    generation: 1,
  },
  {
    name: '冰凌法阵',
    attrSet: ['ice'],
    themeText: 'An ice-themed alchemy glyph forms with sharp crystal lines, cold mist, and a controlled circular boundary.',
    generation: 1,
  },
  {
    name: '星环法阵',
    attrSet: ['thunder'],
    themeText: 'A thunder-themed alchemy glyph brightens with electric arcs, star-ring geometry, and focused pulsing energy.',
    generation: 1,
  },
  {
    name: '剧毒法阵',
    attrSet: ['blight'],
    themeText: 'A blight-themed alchemy glyph spreads with low toxic fog, green corrosion light, and a restrained boundary.',
    generation: 1,
  },
];

const ATTR_KEYWORDS = {
  fire: ['fire', 'flame', 'ember', 'blaze', 'burn', 'magma', 'lava', 'pyro', '火', '炎', '燃'],
  ice: ['ice', 'frost', 'snow', 'freeze', 'frozen', 'glacier', 'crystal', '冰', '霜', '寒'],
  thunder: ['thunder', 'lightning', 'storm', 'bolt', 'shock', 'spark', '雷', '电', '闪'],
  blight: ['blight', 'poison', 'venom', 'toxic', 'plague', 'rot', 'decay', 'corrupt', '毒', '腐'],
};

const tasks = new Map();

export function calcBaseAtk(generation) {
  return 100 * (1 + 0.3 * (Math.max(1, generation) - 1));
}

export function normalizeAttr(value) {
  const key = String(value ?? '').trim().toLowerCase();
  if (!key) return null;
  const aliases = {
    poison: 'blight',
    venom: 'blight',
    toxic: 'blight',
    frost: 'ice',
    lightning: 'thunder',
  };
  return aliases[key] || key;
}

export function mergeAttrSets(...attrSets) {
  const counts = new Map();
  const firstSeen = new Map();
  let cursor = 0;
  for (const group of attrSets) {
    for (const attr of normalizeAttrSet(group)) {
      counts.set(attr, (counts.get(attr) || 0) + 1);
      if (!firstSeen.has(attr)) firstSeen.set(attr, cursor++);
    }
  }
  return [...counts.keys()]
    .sort((a, b) => counts.get(b) - counts.get(a) || firstSeen.get(a) - firstSeen.get(b))
    .slice(0, 3);
}

export function createForgeTask({ playerId, spellA, spellB, llmConfig = null }) {
  const hasInput = Boolean(spellA || spellB);
  if (hasInput) consumeQuotaOrThrow(playerId);
  const taskId = `task_${crypto.randomBytes(6).toString('hex')}`;
  tasks.set(taskId, { status: 'pending', result: null, error: null });
  setTimeout(() => {
    void processForge(taskId, spellA, spellB, llmConfig);
  }, 10);
  return taskId;
}

export function getTaskStatus(taskId) {
  return tasks.get(taskId) || null;
}

export function resolveSpellPayload(spell, slot) {
  if (!spell) return null;
  const attrSet = normalizeAttrSet(spell.attrSet || (spell.mainAttr ? [spell.mainAttr] : []));
  const name = String(spell.name || '').trim();
  const themeText = String(spell.themeText || '').trim();
  const type = String(spell.type || '').trim() || null;
  if (!name && !themeText && attrSet.length === 0) return null;
  return {
    slot,
    id: spell.id || null,
    type,
    name,
    attr_set: attrSet,
    theme_text: themeText,
    generation: Number(spell.generation || 1),
  };
}

async function processForge(taskId, spellA, spellB, llmConfig) {
  try {
    const inputs = [spellA, spellB].filter(Boolean);
    const inputState = resolveInputState(spellA, spellB);
    const result =
      inputState === 'empty'
        ? await buildOpeningPoolResult({ taskId, inputState })
        : await buildSemanticResult({ taskId, inputState, spellA, spellB, inputs, llmConfig });
    tasks.set(taskId, { status: 'completed', result, error: null });
  } catch (error) {
    tasks.set(taskId, { status: 'failed', result: null, error: error.message || String(error) });
  }
}

async function buildOpeningPoolResult({ taskId, inputState }) {
  const seed = OPENING_POOL[Math.floor(Math.random() * OPENING_POOL.length)];
  const attrSet = normalizeAttrSet(seed.attrSet);
  const generation = Number(seed.generation || 1);
  const promptMeta = await generateVideoPrompt(seed.themeText, { taskId });
  return makeForgeResult({
    name: seed.name,
    attrSet,
    themeText: seed.themeText,
    generation,
    promptMeta,
    source: 'opening_pool',
    inputState,
  });
}

async function buildSemanticResult({ taskId, inputState, spellA, spellB, inputs, llmConfig }) {
  const generation = Math.max(...inputs.map((item) => Number(item.generation || 1))) + 1;
  let llmResult = null;
  if (boolEnv('FORGE_USE_REAL_LLM', false)) {
    llmResult = await callForgeSemanticLlm({ inputState, spellA, spellB, llmOverride: llmConfig });
  }
  const llmAttrSet = llmResult ? normalizeAttrSet(llmResult.attrSet) : [];
  const fallbackAttrSet = inferAttrSetByKeywords(inputs);
  const attrSet =
    llmAttrSet.length ||
    fallbackAttrSet.length ||
    mergeAttrSets(...inputs.map((item) => item.attr_set || [])).length
      ? llmAttrSet.length
        ? llmAttrSet
        : fallbackAttrSet.length
          ? fallbackAttrSet
          : mergeAttrSets(...inputs.map((item) => item.attr_set || []))
      : [ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)]];
  const parentNames = inputs.map((item) => String(item.name || '').trim()).filter(Boolean);
  const llmName = String(llmResult?.name || '').trim();
  const name = llmName && !isMechanicalName(llmName, parentNames) ? llmName : generateFallbackName(attrSet);
  const themeText =
    String(llmResult?.themeText || '').trim() || buildThemeTextFallback({ name, attrSet, inputs });
  const promptMeta = await generateVideoPrompt(themeText, { taskId });
  return makeForgeResult({
    name,
    attrSet,
    themeText,
    generation,
    promptMeta,
    source: llmResult ? 'llm' : 'fallback',
    inputState,
  });
}

function makeForgeResult({ name, attrSet, themeText, generation, promptMeta, source, inputState }) {
  const mainAttr = attrSet[0] || null;
  const subAttr = attrSet[1] || null;
  return {
    name,
    attrSet,
    themeText,
    mainAttr,
    subAttr,
    element: mainAttr,
    generation,
    baseAtk: calcBaseAtk(generation),
    videoPrompt: promptMeta.videoPrompt,
    promptRoute: promptMeta.promptRoute,
    promptRouteReason: promptMeta.promptRouteReason,
    promptFallbackApplied: promptMeta.promptFallbackApplied,
    promptTemplate: promptMeta.promptTemplate,
    promptModel: promptMeta.promptModel,
    promptRouteElapsedMs: promptMeta.promptRouteElapsedMs,
    promptGenerationElapsedMs: promptMeta.promptGenerationElapsedMs,
    promptTotalElapsedMs: promptMeta.promptTotalElapsedMs,
    videoUrl: null,
    status: 'partial',
    source,
    inputState,
  };
}

async function generateVideoPrompt(themeText, { taskId }) {
  const started = Date.now();
  try {
    const payload = await runPromptRouter(themeText, { taskId });
    return {
      videoPrompt: payload.final_prompt,
      promptRoute: payload.route_selected,
      promptRouteReason: payload.route_reason,
      promptFallbackApplied: Boolean(payload.fallback_applied),
      promptTemplate: payload.final_template,
      promptModel: payload.model,
      promptRouteElapsedMs: payload.route_elapsed_ms,
      promptGenerationElapsedMs: payload.generation_elapsed_ms,
      promptTotalElapsedMs: payload.total_elapsed_ms,
    };
  } catch (error) {
    const elapsed = Date.now() - started;
    return {
      videoPrompt: buildPromptFallback(themeText),
      promptRoute: 'local_fallback',
      promptRouteReason: error.message || 'glyph router unavailable',
      promptFallbackApplied: true,
      promptTemplate: null,
      promptModel: null,
      promptRouteElapsedMs: null,
      promptGenerationElapsedMs: null,
      promptTotalElapsedMs: elapsed,
    };
  }
}

function inferAttrSetByKeywords(inputs) {
  const text = inputs
    .map((item) => `${item.name || ''} ${item.theme_text || ''}`.toLowerCase())
    .join(' ');
  const scores = new Map();
  const firstSeen = new Map();
  for (const [attr, keywords] of Object.entries(ATTR_KEYWORDS)) {
    for (const keyword of keywords) {
      const index = text.indexOf(keyword.toLowerCase());
      if (index < 0) continue;
      scores.set(attr, (scores.get(attr) || 0) + 1);
      firstSeen.set(attr, Math.min(firstSeen.get(attr) ?? index, index));
    }
  }
  return [...scores.keys()]
    .sort((a, b) => scores.get(b) - scores.get(a) || firstSeen.get(a) - firstSeen.get(b))
    .slice(0, 3);
}

function buildThemeTextFallback({ name, attrSet, inputs }) {
  const attrText = attrSet.map((attr) => ELEMENT_LABELS[attr] || attr).join('/');
  const inputNames = inputs.map((item) => item.name).filter(Boolean).join(' + ');
  if (inputNames) {
    return `${name} rebuilds the motifs of ${inputNames} into a controlled ${attrText} alchemy glyph with a clear boundary and focused energy core.`;
  }
  return `${name} is a controlled ${attrText} alchemy glyph with a clear boundary, stable center, and restrained skill effect motion.`;
}

function generateFallbackName(attrSet) {
  const labels = {
    fire: 'Ember',
    ice: 'Frost',
    thunder: 'Storm',
    blight: 'Venom',
  };
  const tail = ['Sigil', 'Ring', 'Glyph', 'Seal'][Math.floor(Math.random() * 4)];
  return `${labels[attrSet[0]] || 'Arcane'} ${tail}`;
}

function isMechanicalName(name, parentNames) {
  if (!name) return true;
  if (['+', 'fusion', 'merge'].some((token) => name.toLowerCase().includes(token))) return true;
  return parentNames.some((parent) => parent && (name === parent || (parent.length >= 3 && name.includes(parent))));
}

function resolveInputState(spellA, spellB) {
  if (spellA && spellB) return 'dual';
  if (spellA || spellB) return 'single';
  return 'empty';
}

export function quotaSnapshot(playerId) {
  return getPlayerQuota(playerId);
}
