/**
 * spellDefs.js — 法阵结构定义与规范化
 */
const SpellDefs = (() => {
    const ELEMENTS = ['fire', 'ice', 'thunder', 'poison'];
    const ELEMENT_ALIASES = {
        fire: 'fire',
        ice: 'ice',
        thunder: 'thunder',
        poison: 'poison',
        blight: 'poison'
    };

    const ELEMENT_LABELS = {
        fire: '火', ice: '冰', thunder: '雷', poison: '蚀', blight: '蚀'
    };

    const ELEMENT_COLORS = {
        fire: '#ff6600',
        ice: '#00ccff',
        thunder: '#cc88ff',
        poison: '#44ff66',
        blight: '#44ff66'
    };

    const ELEMENT_GLOWS = {
        fire: 'rgba(255,100,0,0.6)',
        ice: 'rgba(0,200,255,0.6)',
        thunder: 'rgba(200,150,255,0.6)',
        poison: 'rgba(0,255,80,0.6)',
        blight: 'rgba(0,255,80,0.6)'
    };

    function calcBaseAtk(generation) {
        return 100 * (1 + 0.3 * (Math.max(1, generation) - 1));
    }

    // Normalize legacy/frontend-poison and backend/blight into one frontend-safe value.
    function normalizeElement(element) {
        if (!element) return null;
        const key = String(element).trim().toLowerCase();
        return ELEMENT_ALIASES[key] || key;
    }

    /**
     * 将任意旧格式 card 规范化为包含新字段的结构。
     * 不修改原对象，返回新对象。
     */
    function normalizeCard(raw) {
        const card = { ...raw };

        if (!card.status) {
            if (card.type === 'basic') card.status = 'legacy';
            else if (card.type === 'text') card.status = 'legacy';
            else if (card.type === 'spell' && card.videoUrl) card.status = 'partial';
            else card.status = 'legacy';
        }

        card.element = normalizeElement(card.element);
        card.mainAttr = normalizeElement(card.mainAttr) || card.element;
        card.subAttr = normalizeElement(card.subAttr);

        if (!card.element && card.mainAttr) card.element = card.mainAttr;

        const parsedGeneration = Number(card.generation);
        card.generation = Number.isFinite(parsedGeneration) && parsedGeneration > 0 ? Math.floor(parsedGeneration) : 1;

        const parsedBaseAtk = Number(card.baseAtk);
        card.baseAtk = Number.isFinite(parsedBaseAtk) && parsedBaseAtk > 0
            ? parsedBaseAtk
            : calcBaseAtk(card.generation);

        return card;
    }

    function getElementColor(element) {
        return ELEMENT_COLORS[normalizeElement(element)] || '#aaaaaa';
    }

    function getElementGlow(element) {
        return ELEMENT_GLOWS[normalizeElement(element)] || 'rgba(170,170,170,0.6)';
    }

    function getElementLabel(element) {
        const normalized = normalizeElement(element);
        return ELEMENT_LABELS[normalized] || normalized || '?';
    }

    return {
        ELEMENTS, ELEMENT_ALIASES, ELEMENT_LABELS, ELEMENT_COLORS, ELEMENT_GLOWS,
        normalizeElement,
        calcBaseAtk, normalizeCard,
        getElementColor, getElementGlow, getElementLabel
    };
})();
