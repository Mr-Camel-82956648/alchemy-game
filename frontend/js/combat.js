/**
 * combat.js - 最小战斗结算模块
 *
 * 当前阶段说明：
 * - 技能命中以 spell.attrSet 为准
 * - 当前正式出场怪物按单属性怪处理，monster.attrSet 先只放 1 个属性
 * - 双属性怪资源与数据保留，后续扩展时再细化规则
 */
const Combat = (() => {
    const RESIST_ABSORB_HP_RATIO = 0.15;
    const RESIST_ABSORB_SCALE_DELTA = 0.08;
    const RESIST_ABSORB_MAX_STACKS = 3;

    function normalizeAttr(attr) {
        if (!attr) return null;
        if (typeof SpellDefs !== 'undefined' && SpellDefs.normalizeElement) {
            return SpellDefs.normalizeElement(attr);
        }
        return String(attr).trim().toLowerCase();
    }

    function normalizeAttrSet(values) {
        if (typeof SpellDefs !== 'undefined' && SpellDefs.normalizeAttrSet) {
            return SpellDefs.normalizeAttrSet(values);
        }
        if (!values) return [];
        return (Array.isArray(values) ? values : [values])
            .map(normalizeAttr)
            .filter(Boolean);
    }

    function calcSpellDamage(spellData, fallbackDamage) {
        const baseDamage = Number(fallbackDamage) || 0;
        const baseAtk = Number(spellData?.baseAtk);
        if (!Number.isFinite(baseAtk) || baseAtk <= 0) return baseDamage;

        return Math.max(1, Math.round(baseDamage * (baseAtk / 100)));
    }

    function hasMatchingAttr(spellAttrSet, monsterAttrSet) {
        const spellAttrs = normalizeAttrSet(spellAttrSet);
        const monsterAttrs = normalizeAttrSet(monsterAttrSet);
        if (spellAttrs.length === 0 || monsterAttrs.length === 0) return false;
        return spellAttrs.some(attr => monsterAttrs.includes(attr));
    }

    /**
     * @param {object} spellData   - { attrSet: string[], baseAtk?: number|null }
     * @param {object} monsterData - { attrSet: string[] }
     * @param {number} fallbackDamage
     * @returns {object} 结构化结算结果
     */
    function calcHitResult(spellData, monsterData, fallbackDamage) {
        const spellAttrs = normalizeAttrSet(spellData?.attrSet || spellData?.mainAttr);
        const monsterAttrs = normalizeAttrSet(monsterData?.attrSet);
        const matched = hasMatchingAttr(spellAttrs, monsterAttrs);
        const damage = matched ? calcSpellDamage(spellData, fallbackDamage) : 0;

        return {
            damage,
            matched,
            absorbed: !matched,
            absorbHpRatio: RESIST_ABSORB_HP_RATIO,
            absorbScaleDelta: RESIST_ABSORB_SCALE_DELTA,
            maxAbsorbStacks: RESIST_ABSORB_MAX_STACKS
        };
    }

    function calcDamage(spellData, monsterData, fallbackDamage) {
        return calcHitResult(spellData, monsterData, fallbackDamage).damage;
    }

    return {
        RESIST_ABSORB_HP_RATIO,
        RESIST_ABSORB_SCALE_DELTA,
        RESIST_ABSORB_MAX_STACKS,
        calcSpellDamage,
        hasMatchingAttr,
        calcHitResult,
        calcDamage
    };
})();
