/**
 * combat.js — 最小战斗计算模块
 *
 * Phase 1 规则：
 * - 普通怪：法阵 mainAttr 命中怪物 immuneAttrs → 伤害为 0，否则为 fallbackDamage
 * - Boss：同上（immuneAttrs 有 2 个属性）
 * - 无 mainAttr 的攻击（如大招）跳过免疫判定，直接造成伤害
 * - 副属性不参与战斗结算
 *
 * Phase 2 待做：用 baseAtk 替代 fallbackDamage，重平衡怪物 HP
 */
const Combat = (() => {

    /**
     * @param {object} spellData   - { mainAttr: string|null }
     * @param {object} monsterData - { immuneAttrs: string[] }
     * @param {number} fallbackDamage - 当前阶段使用的固定伤害值
     * @returns {number} 实际伤害
     */
    function calcDamage(spellData, monsterData, fallbackDamage) {
        const mainAttr = spellData?.mainAttr || null;
        const immuneAttrs = monsterData?.immuneAttrs || [];

        if (mainAttr && immuneAttrs.length > 0 && immuneAttrs.includes(mainAttr)) {
            return 0;
        }

        return fallbackDamage;
    }

    function isImmune(spellMainAttr, monsterImmuneAttrs) {
        if (!spellMainAttr || !monsterImmuneAttrs || monsterImmuneAttrs.length === 0) return false;
        return monsterImmuneAttrs.includes(spellMainAttr);
    }

    return { calcDamage, isImmune };
})();
