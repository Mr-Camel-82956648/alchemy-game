/**
 * combat.js — 最小战斗计算模块
 *
 * 当前职责：
 * - 统一属性免疫判定
 * - 提供战斗伤害基础缩放
 * - 为后续“抗性吸收”保留结构化结算结果
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

    function calcSpellDamage(spellData, fallbackDamage) {
        const baseDamage = Number(fallbackDamage) || 0;
        const baseAtk = Number(spellData?.baseAtk);
        if (!Number.isFinite(baseAtk) || baseAtk <= 0) return baseDamage;

        // Gen01(baseAtk=100) keeps current live damage; higher generations scale up smoothly.
        return Math.max(1, Math.round(baseDamage * (baseAtk / 100)));
    }

    /**
     * @param {object} spellData   - { mainAttr: string|null, baseAtk?: number|null }
     * @param {object} monsterData - { immuneAttrs: string[] }
     * @param {number} fallbackDamage - 当前阶段使用的固定伤害值
     * @returns {object} 结构化结算结果
     */
    function calcHitResult(spellData, monsterData, fallbackDamage) {
        const mainAttr = normalizeAttr(spellData?.mainAttr);
        const immuneAttrs = (monsterData?.immuneAttrs || []).map(normalizeAttr).filter(Boolean);
        const immune = !!(mainAttr && immuneAttrs.length > 0 && immuneAttrs.includes(mainAttr));
        const damage = immune ? 0 : calcSpellDamage(spellData, fallbackDamage);

        return {
            damage,
            immune,
            absorbed: immune,
            absorbHpRatio: RESIST_ABSORB_HP_RATIO,
            absorbScaleDelta: RESIST_ABSORB_SCALE_DELTA,
            maxAbsorbStacks: RESIST_ABSORB_MAX_STACKS
        };
    }

    /**
     * Backward-compatible numeric API used by the current battle loop.
     */
    function calcDamage(spellData, monsterData, fallbackDamage) {
        return calcHitResult(spellData, monsterData, fallbackDamage).damage;
    }

    function isImmune(spellMainAttr, monsterImmuneAttrs) {
        const mainAttr = normalizeAttr(spellMainAttr);
        if (!mainAttr || !monsterImmuneAttrs || monsterImmuneAttrs.length === 0) return false;
        return monsterImmuneAttrs.map(normalizeAttr).includes(mainAttr);
    }

    return {
        RESIST_ABSORB_HP_RATIO,
        RESIST_ABSORB_SCALE_DELTA,
        RESIST_ABSORB_MAX_STACKS,
        calcSpellDamage,
        calcHitResult,
        calcDamage,
        isImmune
    };
})();
