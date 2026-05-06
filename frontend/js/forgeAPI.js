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

    function startForge(cardA, cardB) {
        const a = SpellDefs.normalizeCard(cardA);
        const b = SpellDefs.normalizeCard(cardB);

        if (USE_MOCK) return mockForge(a, b);
        realForge(a, b);
        return null;
    }

    function buildRequestSpell(card) {
        const normalized = SpellDefs.normalizeCard(card);
        return {
            id: normalized.id,
            name: normalized.name,
            attrSet: SpellDefs.getCardAttrSet(normalized),
            mainAttr: normalized.mainAttr,
            generation: normalized.generation || 1
        };
    }

    function buildMockResult(cardA, cardB) {
        const generation = Math.max(cardA.generation || 1, cardB.generation || 1) + 1;
        const attrSet = SpellDefs.mergeAttrSets(
            SpellDefs.getCardAttrSet(cardA),
            SpellDefs.getCardAttrSet(cardB)
        );
        const mainAttr = attrSet[0] || SpellDefs.ELEMENTS[0];
        const subAttr = attrSet[1] || null;

        return {
            name: `${cardA.name}${cardB.name}`.slice(0, 6) || '新法阵',
            attrSet,
            mainAttr,
            subAttr,
            element: mainAttr,
            generation,
            baseAtk: SpellDefs.calcBaseAtk(generation),
            videoUrl: null,
            status: 'partial',
            source: 'fallback'
        };
    }

    function mockForge(cardA, cardB) {
        const taskId = 'task_' + Date.now();
        GameStorage.setPending(taskId, cardA.id, cardB.id);

        setTimeout(() => {
            const data = GameStorage.load();
            if (data.pendingGeneration && data.pendingGeneration.taskId === taskId) {
                data.pendingGeneration.status = 'done';
                data.pendingGeneration.result = buildMockResult(cardA, cardB);
                GameStorage.save(data);
                console.log('[ForgeAPI] mock result written:', data.pendingGeneration.result.name);
            }
        }, 1500);

        return taskId;
    }

    function realForge(cardA, cardB) {
        const tempTaskId = 'task_' + Date.now();
        GameStorage.setPending(tempTaskId, cardA.id, cardB.id);

        fetch(`${API_BASE}/api/forge`, {
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
                const data = GameStorage.load();
                if (data.pendingGeneration && data.pendingGeneration.taskId === tempTaskId) {
                    data.pendingGeneration.taskId = realTaskId;
                    GameStorage.save(data);
                }
                console.log('[ForgeAPI] task created:', realTaskId);
                startPolling(realTaskId);
            })
            .catch(err => {
                clearPendingTask(tempTaskId);
                console.error('[ForgeAPI] POST /api/forge failed:', err);
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
                        const storageData = GameStorage.load();
                        if (storageData.pendingGeneration && storageData.pendingGeneration.taskId === taskId) {
                            storageData.pendingGeneration.status = 'done';
                            storageData.pendingGeneration.result = data.result;
                            GameStorage.save(storageData);
                            console.log('[ForgeAPI] forge completed:', data.result.name, '(source=' + (data.result.source || '?') + ')');
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
