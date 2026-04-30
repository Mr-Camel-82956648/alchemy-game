/**
 * forgeAPI.js — 合成 API 封装（mock / real 切换）
 *
 * USE_MOCK = true  → 前端本地模拟，不需要后端
 * USE_MOCK = false → 请求 FastAPI 后端（默认 http://localhost:18001）
 *
 * 两种模式都将结果写入 localStorage（pendingGeneration.status = 'done'），
 * battle.js 和 alchemy.js 只读 localStorage，无需关心模式差异。
 */
const ForgeAPI = (() => {
    const USE_MOCK = false;
    const API_BASE = 'http://localhost:18001';

    let _pollTimer = null;
    let _pollCount = 0;
    const MAX_POLLS = 60;

    function startForge(cardA, cardB) {
        const a = SpellDefs.normalizeCard(cardA);
        const b = SpellDefs.normalizeCard(cardB);

        if (USE_MOCK) return mockForge(a, b);
        realForge(a, b);
    }

    // ---- Mock mode: local setTimeout, writes directly to localStorage ----

    function mockForge(cardA, cardB) {
        const taskId = 'task_' + Date.now();
        GameStorage.setPending(taskId, cardA.id, cardB.id);

        setTimeout(() => {
            const data = GameStorage.load();
            if (data.pendingGeneration && data.pendingGeneration.taskId === taskId) {
                const gen = Math.max(cardA.generation || 1, cardB.generation || 1) + 1;
                const elements = SpellDefs.ELEMENTS;
                const mainAttr = elements[Math.floor(Math.random() * elements.length)];
                const remaining = elements.filter(e => e !== mainAttr);
                const subAttr = remaining[Math.floor(Math.random() * remaining.length)] || null;

                data.pendingGeneration.status = 'done';
                data.pendingGeneration.result = {
                    name: `${cardA.name}·${cardB.name}之阵`,
                    mainAttr: mainAttr,
                    subAttr: subAttr,
                    element: mainAttr,
                    generation: gen,
                    baseAtk: SpellDefs.calcBaseAtk(gen),
                    videoUrl: null,
                    status: 'complete'
                };
                GameStorage.save(data);
            }
        }, 8000 + Math.random() * 7000);

        return taskId;
    }

    // ---- Real mode: POST to backend, then poll until completed ----

    function realForge(cardA, cardB) {
        const tempTaskId = 'task_' + Date.now();
        GameStorage.setPending(tempTaskId, cardA.id, cardB.id);

        fetch(`${API_BASE}/api/forge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                spellA: { id: cardA.id, name: cardA.name, mainAttr: cardA.mainAttr, generation: cardA.generation || 1 },
                spellB: { id: cardB.id, name: cardB.name, mainAttr: cardB.mainAttr, generation: cardB.generation || 1 }
            })
        })
        .then(res => res.json())
        .then(resp => {
            const realTaskId = resp.taskId;
            const data = GameStorage.load();
            if (data.pendingGeneration && data.pendingGeneration.taskId === tempTaskId) {
                data.pendingGeneration.taskId = realTaskId;
                GameStorage.save(data);
            }
            console.log('[ForgeAPI] Task created:', realTaskId);
            startPolling(realTaskId);
        })
        .catch(err => {
            console.error('[ForgeAPI] realForge failed, backend may not be running:', err);
        });
    }

    function startPolling(taskId) {
        stopPolling();
        _pollCount = 0;
        _pollTimer = setInterval(() => {
            _pollCount++;
            if (_pollCount > MAX_POLLS) {
                console.warn('[ForgeAPI] Polling timed out after', MAX_POLLS, 'attempts');
                stopPolling();
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
                            console.log('[ForgeAPI] Forge completed:', data.result.name);
                        }
                    } else if (data.status === 'failed') {
                        stopPolling();
                        console.error('[ForgeAPI] Forge task failed:', data.error);
                    }
                })
                .catch(err => {
                    console.warn('[ForgeAPI] Poll error:', err.message);
                });
        }, 3000);
    }

    function stopPolling() {
        if (_pollTimer) {
            clearInterval(_pollTimer);
            _pollTimer = null;
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
