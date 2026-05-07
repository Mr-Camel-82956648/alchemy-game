/**
 * spellDefs.js - 法阵结构定义与规范化
 *
 * 当前阶段说明：
 * - 战斗命中以 attrSet 为准
 * - mainAttr / subAttr 仅作为兼容旧数据与旧 UI 的派生字段保留
 */
const SpellDefs = (() => {
    const MAX_ATTR_SET_SIZE = 3;
    const ELEMENTS = ['fire', 'ice', 'thunder', 'blight'];
    const ELEMENT_ALIASES = {
        fire: 'fire',
        flame: 'fire',
        ice: 'ice',
        frost: 'ice',
        thunder: 'thunder',
        lightning: 'thunder',
        poison: 'blight',
        blight: 'blight'
    };

    const ELEMENT_LABELS = {
        fire: '火',
        ice: '冰',
        thunder: '雷',
        blight: '蚀'
    };

    const ELEMENT_COLORS = {
        fire: '#CB4446',
        ice: '#508EB5',
        thunder: '#FFC653',
        blight: '#2B9E57'
    };

    const ELEMENT_GLOWS = {
        fire: 'rgba(203,68,70,0.6)',
        ice: 'rgba(80,142,181,0.6)',
        thunder: 'rgba(255,198,83,0.6)',
        blight: 'rgba(43,158,87,0.6)'
    };

    function calcBaseAtk(generation) {
        return 100 * (1 + 0.3 * (Math.max(1, generation) - 1));
    }

    function normalizeElement(element) {
        if (!element) return null;
        const key = String(element).trim().toLowerCase();
        return ELEMENT_ALIASES[key] || key;
    }

    function normalizeAttrSet(...sources) {
        const values = [];
        const seen = new Set();

        sources.forEach(source => {
            if (!source) return;
            const list = Array.isArray(source) ? source : [source];
            list.forEach(item => {
                const attr = normalizeElement(item);
                if (!attr || seen.has(attr)) return;
                seen.add(attr);
                values.push(attr);
            });
        });

        return values.slice(0, MAX_ATTR_SET_SIZE);
    }

    function mergeAttrSets(...attrSets) {
        const counts = new Map();
        const firstSeen = new Map();
        let cursor = 0;

        attrSets.forEach(set => {
            normalizeAttrSet(set).forEach(attr => {
                counts.set(attr, (counts.get(attr) || 0) + 1);
                if (!firstSeen.has(attr)) {
                    firstSeen.set(attr, cursor);
                    cursor += 1;
                }
            });
        });

        return [...counts.keys()]
            .sort((a, b) => (counts.get(b) - counts.get(a)) || (firstSeen.get(a) - firstSeen.get(b)))
            .slice(0, MAX_ATTR_SET_SIZE);
    }

    function getCardAttrSet(card) {
        return normalizeAttrSet(card?.attrSet, card?.mainAttr, card?.subAttr, card?.element);
    }

    function normalizeCard(raw) {
        if (!raw) return null;
        const card = { ...raw };

        if (!card.status) {
            if (card.type === 'basic') card.status = 'legacy';
            else if (card.type === 'text') card.status = 'legacy';
            else if (card.type === 'spell' && card.videoUrl) card.status = 'partial';
            else card.status = 'legacy';
        }

        const legacyElement = normalizeElement(card.element);
        const legacyMainAttr = normalizeElement(card.mainAttr) || legacyElement;
        const legacySubAttr = normalizeElement(card.subAttr);

        card.attrSet = normalizeAttrSet(card.attrSet, legacyMainAttr, legacySubAttr, legacyElement);
        card.mainAttr = card.attrSet[0] || legacyMainAttr || null;
        card.subAttr = card.attrSet[1] || legacySubAttr || null;
        card.element = card.mainAttr || legacyElement || null;

        const themeText = typeof card.themeText === 'string' ? card.themeText.trim() : '';
        const legacyVisualDesc = typeof card.visualDesc === 'string' ? card.visualDesc.trim() : '';
        const videoPrompt = typeof card.videoPrompt === 'string' ? card.videoPrompt.trim() : '';
        const legacyFusionPrompt = typeof card.fusionPrompt === 'string' ? card.fusionPrompt.trim() : '';

        card.themeText = themeText || legacyVisualDesc || null;
        card.videoPrompt = videoPrompt || legacyFusionPrompt || null;
        card.promptRoute = card.promptRoute || null;
        card.promptRouteReason = card.promptRouteReason || null;
        card.promptFallbackApplied = Boolean(card.promptFallbackApplied);
        card.promptTemplate = card.promptTemplate || null;
        card.promptModel = card.promptModel || null;
        card.promptRouteElapsedMs = Number.isFinite(Number(card.promptRouteElapsedMs))
            ? Number(card.promptRouteElapsedMs)
            : null;
        card.promptGenerationElapsedMs = Number.isFinite(Number(card.promptGenerationElapsedMs))
            ? Number(card.promptGenerationElapsedMs)
            : null;
        card.promptTotalElapsedMs = Number.isFinite(Number(card.promptTotalElapsedMs))
            ? Number(card.promptTotalElapsedMs)
            : null;
        card.inputState = card.inputState || null;
        card.source = card.source || null;

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
        ELEMENTS,
        ELEMENT_ALIASES,
        ELEMENT_LABELS,
        ELEMENT_COLORS,
        ELEMENT_GLOWS,
        MAX_ATTR_SET_SIZE,
        normalizeElement,
        normalizeAttrSet,
        mergeAttrSets,
        getCardAttrSet,
        calcBaseAtk,
        normalizeCard,
        getElementColor,
        getElementGlow,
        getElementLabel
    };
})();
