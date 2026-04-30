/**
 * forgeAPI.js — 合成 API 封装（mock / real 切换）
 */
const ForgeAPI = (() => {
    const USE_MOCK = true;
    const API_BASE = 'http://localhost:8000';

    function startForge(cardA, cardB) {
        const a = SpellDefs.normalizeCard(cardA);
        const b = SpellDefs.normalizeCard(cardB);

        if (USE_MOCK) return mockForge(a, b);
        return realForge(a, b);
    }

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

    async function realForge(cardA, cardB) {
        const res = await fetch(`${API_BASE}/api/forge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                spellA: { id: cardA.id, name: cardA.name, mainAttr: cardA.mainAttr },
                spellB: { id: cardB.id, name: cardB.name, mainAttr: cardB.mainAttr }
            })
        });
        const { taskId } = await res.json();
        GameStorage.setPending(taskId, cardA.id, cardB.id);
        return taskId;
    }

    async function checkStatus(taskId) {
        if (USE_MOCK) return null;
        try {
            const res = await fetch(`${API_BASE}/api/forge/status/${taskId}`);
            return await res.json();
        } catch (e) {
            console.warn('[ForgeAPI] checkStatus failed:', e);
            return null;
        }
    }

    return { startForge, checkStatus, USE_MOCK };
})();
