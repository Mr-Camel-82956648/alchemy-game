/**
 * monsterDefs.js — 怪物战斗参数定义
 *
 * Phase 4 minimal:
 * - 普通怪单抗
 * - 精英 / 更大体型怪双抗
 * - 提供最小行为差异参数给 battle.js 使用
 */
const MonsterDefs = (() => {
    const DEFAULT_PROFILE = {
        immuneAttrs: [],
        movePattern: 'direct',
        groupPattern: 'cluster',
        hpScale: 1,
        sizeScale: 1,
        speedScale: 1
    };

    const DEFS = {
        'stitch-ghoul': {
            minion: {
                immuneAttrs: ['poison'],
                movePattern: 'direct',
                groupPattern: 'cluster',
                hpScale: 1,
                sizeScale: 1.02,
                speedScale: 0.95
            },
            elite: {
                immuneAttrs: ['poison', 'ice'],
                movePattern: 'arc',
                groupPattern: 'wedge',
                hpScale: 1.6,
                sizeScale: 1.18,
                speedScale: 0.92
            },
            boss: {
                immuneAttrs: ['poison', 'ice'],
                movePattern: 'burst',
                groupPattern: 'ringLoose',
                hpScale: 2.4,
                sizeScale: 1.3,
                speedScale: 0.88
            }
        },
        'plague-scavenger': {
            minion: {
                immuneAttrs: ['fire'],
                movePattern: 'sway',
                groupPattern: 'line',
                hpScale: 0.9,
                sizeScale: 0.94,
                speedScale: 1.08
            },
            elite: {
                immuneAttrs: ['fire', 'thunder'],
                movePattern: 'burst',
                groupPattern: 'wedge',
                hpScale: 1.35,
                sizeScale: 1.08,
                speedScale: 1.15
            },
            boss: {
                immuneAttrs: ['fire', 'thunder'],
                movePattern: 'arc',
                groupPattern: 'ringLoose',
                hpScale: 2,
                sizeScale: 1.2,
                speedScale: 1.02
            }
        }
    };

    function getCombatProfile(species, tier) {
        const specDef = DEFS[species];
        const tierDef = specDef ? specDef[tier] : null;
        return {
            ...DEFAULT_PROFILE,
            ...(tierDef || {})
        };
    }

    function getImmuneAttrs(species, tier) {
        return [...getCombatProfile(species, tier).immuneAttrs];
    }

    return { DEFS, getCombatProfile, getImmuneAttrs };
})();
