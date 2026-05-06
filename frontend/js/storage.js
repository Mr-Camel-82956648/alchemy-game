/**
 * storage.js - localStorage 数据管理
 */
const GameStorage = (() => {
    const STORAGE_KEY = 'alchemy-forge-data';
    const SEED_VERSION = 4;

    const DEFAULT_DATA = {
        playerId: null,
        cards: [],
        currentSlotA: null,
        currentSlotB: null,
        loadout: [null, null, null, null],
        pendingGeneration: null,
        tutorialDone: false,
        seedVersion: 0
    };

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return structuredClone(DEFAULT_DATA);
            return { ...structuredClone(DEFAULT_DATA), ...JSON.parse(raw) };
        } catch {
            return structuredClone(DEFAULT_DATA);
        }
    }

    function save(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function getPlayerId() {
        const data = load();
        if (data.playerId) return data.playerId;
        data.playerId = `player_${generateId()}`;
        save(data);
        return data.playerId;
    }

    function normalizeStoredAttrSet(cardLike) {
        if (typeof SpellDefs !== 'undefined' && SpellDefs.normalizeAttrSet) {
            return SpellDefs.normalizeAttrSet(cardLike.attrSet, cardLike.mainAttr, cardLike.subAttr, cardLike.element);
        }
        return Array.isArray(cardLike.attrSet) ? [...cardLike.attrSet] : [];
    }

    function normalizeCardForRead(card) {
        if (!card) return null;
        if (typeof SpellDefs !== 'undefined' && SpellDefs.normalizeCard) {
            return SpellDefs.normalizeCard(card);
        }
        return { ...card };
    }

    async function seedIfNeeded() {
        const data = load();
        if (data.seedVersion >= SEED_VERSION) return;

        try {
            const res = await fetch('assets/data/seed_cards.json');
            const seeds = await res.json();

            data.cards = data.cards.filter(c => c.type === 'text');

            seeds.forEach(seed => {
                const attrSet = normalizeStoredAttrSet(seed);
                data.cards.push({
                    id: generateId(),
                    name: seed.name,
                    type: seed.type,
                    status: seed.status || null,
                    videoUrl: seed.videoUrl || null,
                    spellImgUrl: seed.spellImgUrl || null,
                    thumbnailUrl: seed.thumbnailUrl || null,
                    thumbnail: null,
                    attrSet,
                    element: attrSet[0] || seed.element || seed.mainAttr || null,
                    mainAttr: attrSet[0] || seed.mainAttr || seed.element || null,
                    subAttr: attrSet[1] || seed.subAttr || null,
                    generation: seed.generation || null,
                    baseAtk: seed.baseAtk || null,
                    parentA: null,
                    parentB: null,
                    createdAt: Date.now()
                });
            });

            const spells = data.cards.filter(c => c.type === 'spell');
            data.loadout = [
                spells[0]?.id || null,
                spells[1]?.id || null,
                spells[2]?.id || null,
                spells[3]?.id || null
            ];

            if (!data.playerId) data.playerId = `player_${generateId()}`;
            data.seedVersion = SEED_VERSION;
            save(data);
            console.log(`[Storage] Seeded ${seeds.length} cards`);
        } catch (e) {
            console.warn('[Storage] Seed failed:', e);
        }
    }

    function getCards() {
        return load().cards.map(normalizeCardForRead);
    }

    function getSpellCards() {
        return getCards().filter(c => c.type === 'spell');
    }

    function getCard(id) {
        return getCards().find(c => c.id === id) || null;
    }

    function addCard(card) {
        const data = load();
        const attrSet = normalizeStoredAttrSet(card);
        const newCard = {
            id: generateId(),
            name: card.name || '未命名',
            type: card.type || 'text',
            status: card.status || null,
            videoUrl: card.videoUrl || null,
            spellImgUrl: card.spellImgUrl || null,
            thumbnailUrl: card.thumbnailUrl || null,
            thumbnail: card.thumbnail || null,
            attrSet,
            element: attrSet[0] || card.element || card.mainAttr || null,
            mainAttr: attrSet[0] || card.mainAttr || card.element || null,
            subAttr: attrSet[1] || card.subAttr || null,
            generation: card.generation || null,
            baseAtk: card.baseAtk || null,
            parentA: card.parentA || null,
            parentB: card.parentB || null,
            createdAt: Date.now()
        };
        data.cards.push(newCard);
        save(data);
        return normalizeCardForRead(newCard);
    }

    function removeCard(id) {
        const data = load();
        data.cards = data.cards.filter(c => c.id !== id);
        if (data.currentSlotA === id) data.currentSlotA = null;
        if (data.currentSlotB === id) data.currentSlotB = null;
        data.loadout = data.loadout.map(slotId => slotId === id ? null : slotId);
        save(data);
    }

    function getSlot(slot) {
        const data = load();
        const id = slot === 'A' ? data.currentSlotA : data.currentSlotB;
        return id ? getCard(id) : null;
    }

    function setSlot(slot, cardId) {
        const data = load();
        if (slot === 'A') data.currentSlotA = cardId;
        else data.currentSlotB = cardId;
        save(data);
    }

    function clearSlots() {
        const data = load();
        data.currentSlotA = null;
        data.currentSlotB = null;
        save(data);
    }

    function areBothSlotsFilled() {
        const data = load();
        return data.currentSlotA !== null && data.currentSlotB !== null;
    }

    function getLoadout() {
        const data = load();
        return (data.loadout || [null, null, null, null]).map(id => id ? getCard(id) : null);
    }

    function setLoadoutSlot(index, cardId) {
        const data = load();
        if (!data.loadout) data.loadout = [null, null, null, null];
        data.loadout[index] = cardId;
        save(data);
    }

    function getLoadoutIds() {
        return load().loadout || [null, null, null, null];
    }

    function setPending(taskId, cardAId, cardBId) {
        const data = load();
        data.pendingGeneration = { taskId, cardAId, cardBId, status: 'generating' };
        save(data);
    }

    function getPending() {
        return load().pendingGeneration;
    }

    function clearPending() {
        const data = load();
        data.pendingGeneration = null;
        save(data);
    }

    function isTutorialDone() {
        return load().tutorialDone;
    }

    function markTutorialDone() {
        const data = load();
        data.tutorialDone = true;
        save(data);
    }

    function getCardThumb(card) {
        return card.thumbnailUrl || card.thumbnail || null;
    }

    function generateTextThumbnail(text) {
        const c = document.createElement('canvas');
        c.width = 180;
        c.height = 250;
        const ctx = c.getContext('2d');

        ctx.fillStyle = '#3a3530';
        ctx.fillRect(0, 0, 180, 250);

        ctx.fillStyle = '#e0d8c8';
        ctx.font = 'bold 22px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const maxWidth = 150;
        const words = text.split('');
        let line = '';
        const lines = [];
        for (const ch of words) {
            const test = line + ch;
            if (ctx.measureText(test).width > maxWidth && line) {
                lines.push(line);
                line = ch;
            } else {
                line = test;
            }
        }
        if (line) lines.push(line);

        const lineHeight = 28;
        const startY = 125 - ((lines.length - 1) * lineHeight) / 2;
        lines.forEach((value, index) => {
            ctx.fillText(value, 90, startY + index * lineHeight);
        });

        return c.toDataURL('image/png');
    }

    return {
        load,
        save,
        generateId,
        getPlayerId,
        seedIfNeeded,
        getCards,
        getSpellCards,
        getCard,
        addCard,
        removeCard,
        deleteCard: removeCard,
        getSlot,
        setSlot,
        clearSlots,
        areBothSlotsFilled,
        getLoadout,
        setLoadoutSlot,
        getLoadoutIds,
        setPending,
        getPending,
        clearPending,
        isTutorialDone,
        markTutorialDone,
        getCardThumb,
        generateTextThumbnail
    };
})();
