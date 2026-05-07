/**
 * forgeAPI.js - 合成 API 封装（mock / real 切换）
 */
const ForgeAPI = (() => {
    const USE_MOCK = false;
    const API_BASE = 'http://localhost:18001';

    console.log('[ForgeAPI] loaded, USE_MOCK=' + USE_MOCK + ', API_BASE=' + API_BASE);

    let pollTimer = null;
    let pollCount = 0;
    const MAX_POLLS = 60;

    function clearPendingTask(taskId) {
        const data = GameStorage.load();
        if (!data.pendingGeneration) return false;
        if (taskId && data.pendingGeneration.taskId !== taskId) return false;
        data.pendingGeneration = null;
        GameStorage.save(data);
        return true;
    }

    function logPromptRoutingAudit(taskId, result, source) {
        if (!result) return;
        console.log('[ForgeAPI] prompt routing audit:', {
            source,
            taskId,
            inputState: result.inputState || null,
            inputSummary: result.inputSummary || null,
            promptRoute: result.promptRoute || null,
            promptRouteReason: result.promptRouteReason || null,
            promptFallbackApplied: Boolean(result.promptFallbackApplied),
            promptTemplate: result.promptTemplate || null,
            promptModel: result.promptModel || null,
            themeText: result.themeText || null
        });
    }

    function buildInputState(cardA, cardB) {
        const inputs = [cardA, cardB].filter(Boolean);
        return inputs.length === 0 ? 'empty' : (inputs.length === 1 ? 'single' : 'dual');
    }

    function describeInputCard(card) {
        if (!card) return null;
        const normalized = SpellDefs.normalizeCard(card);
        const name = String(normalized?.name || '').trim();
        if (name) return name;
        const attrs = SpellDefs.getCardAttrSet(normalized)
            .map(attr => SpellDefs.getElementLabel ? SpellDefs.getElementLabel(attr) : attr)
            .filter(Boolean);
        return attrs.join('/') || '未命名输入';
    }

    function buildInputSummary(cardA, cardB) {
        const left = describeInputCard(cardA);
        const right = describeInputCard(cardB);
        if (!left && !right) return '空输入';
        if (left && right) return `${left} + ${right}`;
        return left || right || '未知输入';
    }

    function buildPendingMetadata(taskId, cardA, cardB) {
        return {
            taskId,
            cardAId: cardA?.id || null,
            cardBId: cardB?.id || null,
            inputState: buildInputState(cardA, cardB),
            inputSummary: buildInputSummary(cardA, cardB),
            source: null,
            requestedAt: Date.now()
        };
    }

    function startForge(cardA, cardB) {
        const a = cardA ? SpellDefs.normalizeCard(cardA) : null;
        const b = cardB ? SpellDefs.normalizeCard(cardB) : null;

        if (USE_MOCK) return mockForge(a, b);
        return realForge(a, b);
    }

    function buildRequestSpell(card) {
        if (!card) return null;
        const normalized = SpellDefs.normalizeCard(card);
        return {
            id: normalized.id,
            type: normalized.type,
            name: normalized.name,
            attrSet: SpellDefs.getCardAttrSet(normalized),
            mainAttr: normalized.mainAttr,
            themeText: normalized.themeText || null,
            generation: normalized.generation || 1
        };
    }

    function buildMockResult(cardA, cardB) {
        const inputs = [cardA, cardB].filter(Boolean);
        const inputState = inputs.length === 0 ? 'empty' : (inputs.length === 1 ? 'single' : 'dual');

        if (inputState === 'empty') {
            return {
                name: '熔岩法阵',
                attrSet: ['fire'],
                themeText: '一枚熔岩主题的炼金法阵贴地展开，中心像被压缩的熔火核心般稳定脉动。',
                mainAttr: 'fire',
                subAttr: null,
                element: 'fire',
                generation: 1,
                baseAtk: SpellDefs.calcBaseAtk(1),
                videoPrompt: '标准等距2.5D游戏俯视视角，纯黑背景，仅展示一个独立技能特效资产。熔岩主题法阵贴地展开，中心熔火核心稳定脉动。',
                promptRoute: 'local_fallback',
                promptRouteReason: 'mock fallback',
                promptFallbackApplied: true,
                promptTemplate: null,
                promptModel: null,
                promptRouteElapsedMs: null,
                promptGenerationElapsedMs: null,
                promptTotalElapsedMs: 0,
                videoUrl: null,
                status: 'partial',
                source: 'opening_pool',
                inputState
            };
        }

        const generation = Math.max(...inputs.map(card => card.generation || 1)) + 1;
        const attrSet = SpellDefs.mergeAttrSets(...inputs.map(card => SpellDefs.getCardAttrSet(card)));
        const mainAttr = attrSet[0] || SpellDefs.ELEMENTS[0];
        const subAttr = attrSet[1] || null;
        const names = inputs.map(card => card.name).join(' / ');

        return {
            name: names.replace(/\s*\/\s*/g, '').slice(0, 6) || '新法阵',
            attrSet,
            themeText: `${names} 的语义被重铸为一枚新法阵，边界清晰，中心主体凝聚，能量在技能范围内受控流动。`,
            mainAttr,
            subAttr,
            element: mainAttr,
            generation,
            baseAtk: SpellDefs.calcBaseAtk(generation),
            videoPrompt: `标准等距2.5D游戏俯视视角，纯黑背景，仅展示一个独立技能特效资产。${names} 的语义被重铸为一枚新法阵。`,
            promptRoute: 'local_fallback',
            promptRouteReason: 'mock fallback',
            promptFallbackApplied: true,
            promptTemplate: null,
            promptModel: null,
            promptRouteElapsedMs: null,
            promptGenerationElapsedMs: null,
            promptTotalElapsedMs: 0,
            videoUrl: null,
            status: 'partial',
            source: 'fallback',
            inputState
        };
    }

    function mockForge(cardA, cardB) {
        const taskId = 'task_' + Date.now();
        GameStorage.setPending(taskId, buildPendingMetadata(taskId, cardA, cardB));

        setTimeout(() => {
            const pending = GameStorage.writePendingResult(taskId, buildMockResult(cardA, cardB));
            if (pending?.result) {
                console.log('[ForgeAPI] mock result written:', pending.result.name);
                logPromptRoutingAudit(taskId, pending.result, 'mock');
            }
        }, 1500);

        return Promise.resolve({ ok: true, taskId });
    }

    function realForge(cardA, cardB) {
        return fetch(`${API_BASE}/api/forge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                playerId: GameStorage.getPlayerId(),
                spellA: buildRequestSpell(cardA),
                spellB: buildRequestSpell(cardB)
            })
        })
            .then(async res => {
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                    const message = data?.detail?.message || data?.detail || `HTTP ${res.status}`;
                    throw new Error(message);
                }
                return data;
            })
            .then(resp => {
                const realTaskId = resp.taskId;
                const pendingMeta = buildPendingMetadata(realTaskId, cardA, cardB);
                GameStorage.setPending(realTaskId, pendingMeta);
                console.log('[ForgeAPI] task created:', {
                    taskId: realTaskId,
                    inputState: pendingMeta.inputState,
                    inputSummary: pendingMeta.inputSummary
                });
                startPolling(realTaskId);
                return { ok: true, taskId: realTaskId };
            })
            .catch(err => {
                console.error('[ForgeAPI] POST /api/forge failed:', err);
                return {
                    ok: false,
                    error: err?.message || '炼金请求失败'
                };
            });
    }

    function startPolling(taskId) {
        stopPolling();
        pollCount = 0;
        pollTimer = setInterval(() => {
            pollCount += 1;
            if (pollCount > MAX_POLLS) {
                console.warn('[ForgeAPI] polling timed out');
                stopPolling();
                clearPendingTask(taskId);
                return;
            }
            fetch(`${API_BASE}/api/forge/status/${taskId}`)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                })
                .then(data => {
                    if (data.status === 'completed' && data.result) {
                        stopPolling();
                        const pending = GameStorage.writePendingResult(taskId, data.result);
                        if (pending?.result) {
                            console.log('[ForgeAPI] forge completed:', pending.result.name, '(source=' + (pending.result.source || '?') + ')');
                            console.log('[ForgeAPI] forge result payload:', pending.result);
                            logPromptRoutingAudit(taskId, pending.result, 'poll');
                        }
                    } else if (data.status === 'failed') {
                        stopPolling();
                        clearPendingTask(taskId);
                        console.error('[ForgeAPI] forge task failed:', data.error);
                    }
                })
                .catch(err => {
                    console.warn('[ForgeAPI] poll error:', err.message);
                });
        }, 3000);
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    async function checkStatus(taskId) {
        if (USE_MOCK) return null;
        try {
            const res = await fetch(`${API_BASE}/api/forge/status/${taskId}`);
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            console.warn('[ForgeAPI] checkStatus failed:', e);
            return null;
        }
    }

    return { startForge, checkStatus, stopPolling, USE_MOCK };
})();
