/**
 * monsterDefs.js — 怪物属性定义表
 *
 * 为现有怪物种族 + 阶级定义 immuneAttrs（免疫属性列表）。
 * 普通怪免疫 1 个属性，Boss 免疫 2 个属性。
 */
const MonsterDefs = (() => {
    const DEFS = {
        'stitch-ghoul': {
            minion: { immuneAttrs: ['poison'] },
            elite:  { immuneAttrs: ['poison'] },
            boss:   { immuneAttrs: ['poison', 'ice'] }
        },
        'plague-scavenger': {
            minion: { immuneAttrs: ['fire'] },
            elite:  { immuneAttrs: ['fire'] },
            boss:   { immuneAttrs: ['fire', 'thunder'] }
        }
    };

    function getImmuneAttrs(species, tier) {
        const specDef = DEFS[species];
        if (!specDef) return [];
        const tierDef = specDef[tier];
        return tierDef ? [...tierDef.immuneAttrs] : [];
    }

    return { DEFS, getImmuneAttrs };
})();
