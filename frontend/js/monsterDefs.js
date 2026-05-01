/**
 * monsterDefs.js — 怪物战斗参数定义
 *
 * Phase 5:
 * - 对齐 frontend/assets/monsters 下的正式怪物资源映射
 * - 继续复用 battle.js 的现有抗性吸收 / 成长 / 行为系统
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

    function buildProfiles(minion, eliteOverrides = {}, bossOverrides = {}) {
        return {
            minion: {
                ...DEFAULT_PROFILE,
                ...minion
            },
            elite: {
                ...DEFAULT_PROFILE,
                ...minion,
                ...eliteOverrides
            },
            boss: {
                ...DEFAULT_PROFILE,
                ...minion,
                ...bossOverrides
            }
        };
    }

    const DEFS = {
        'stitch-ghoul': buildProfiles(
            { immuneAttrs: ['poison'], movePattern: 'direct', groupPattern: 'cluster', hpScale: 1.02, sizeScale: 1.02, speedScale: 0.94 },
            { immuneAttrs: ['poison', 'ice'], movePattern: 'arc', groupPattern: 'wedge', hpScale: 1.48, sizeScale: 1.08, speedScale: 0.96 },
            { immuneAttrs: ['poison', 'ice'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 2.2, sizeScale: 1.12, speedScale: 0.88 }
        ),
        'plague-scavenger': buildProfiles(
            { immuneAttrs: ['fire'], movePattern: 'sway', groupPattern: 'line', hpScale: 0.92, sizeScale: 0.98, speedScale: 1.14 },
            { immuneAttrs: ['fire', 'thunder'], movePattern: 'arc', groupPattern: 'wedge', hpScale: 1.28, sizeScale: 1.04, speedScale: 1.16 },
            { immuneAttrs: ['fire', 'thunder'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 1.92, sizeScale: 1.08, speedScale: 1.04 }
        ),
        'slag-ooze': buildProfiles(
            { immuneAttrs: ['poison'], movePattern: 'direct', groupPattern: 'cluster', hpScale: 1.22, sizeScale: 1.02, speedScale: 0.82 },
            { immuneAttrs: ['poison', 'fire'], movePattern: 'direct', groupPattern: 'wedge', hpScale: 1.72, sizeScale: 1.08, speedScale: 0.8 },
            { immuneAttrs: ['poison', 'fire'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 2.38, sizeScale: 1.12, speedScale: 0.72 }
        ),
        'eclipse-wraith': buildProfiles(
            { immuneAttrs: ['thunder'], movePattern: 'arc', groupPattern: 'cluster', hpScale: 0.98, sizeScale: 1.02, speedScale: 1.08 },
            { immuneAttrs: ['thunder', 'poison'], movePattern: 'sway', groupPattern: 'wedge', hpScale: 1.34, sizeScale: 1.08, speedScale: 1.1 },
            { immuneAttrs: ['thunder', 'poison'], movePattern: 'arc', groupPattern: 'ringLoose', hpScale: 2.04, sizeScale: 1.12, speedScale: 0.98 }
        ),
        'ember-sprinter': buildProfiles(
            { immuneAttrs: ['fire'], movePattern: 'sway', groupPattern: 'line', hpScale: 0.84, sizeScale: 0.96, speedScale: 1.2 },
            { immuneAttrs: ['fire', 'ice'], movePattern: 'arc', groupPattern: 'line', hpScale: 1.16, sizeScale: 1.02, speedScale: 1.18 },
            { immuneAttrs: ['fire', 'ice'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 1.8, sizeScale: 1.08, speedScale: 1.04 }
        ),
        'furnace-thrall': buildProfiles(
            { immuneAttrs: ['fire'], movePattern: 'direct', groupPattern: 'line', hpScale: 1.26, sizeScale: 1.02, speedScale: 0.88 },
            { immuneAttrs: ['fire', 'thunder'], movePattern: 'direct', groupPattern: 'wedge', hpScale: 1.84, sizeScale: 1.08, speedScale: 0.84 },
            { immuneAttrs: ['fire', 'thunder'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 2.62, sizeScale: 1.12, speedScale: 0.76 }
        ),
        'cinder-guard': buildProfiles(
            { immuneAttrs: ['fire'], movePattern: 'burst', groupPattern: 'cluster', hpScale: 1.06, sizeScale: 1, speedScale: 1.02 },
            { immuneAttrs: ['fire', 'poison'], movePattern: 'arc', groupPattern: 'wedge', hpScale: 1.42, sizeScale: 1.06, speedScale: 1.04 },
            { immuneAttrs: ['fire', 'poison'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 2.08, sizeScale: 1.1, speedScale: 0.92 }
        ),
        'bone-cage-brute': buildProfiles(
            { immuneAttrs: ['ice'], movePattern: 'direct', groupPattern: 'cluster', hpScale: 1.4, sizeScale: 1.02, speedScale: 0.76 },
            { immuneAttrs: ['ice', 'poison'], movePattern: 'direct', groupPattern: 'line', hpScale: 1.98, sizeScale: 1.08, speedScale: 0.72 },
            { immuneAttrs: ['ice', 'poison'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 2.74, sizeScale: 1.14, speedScale: 0.66 }
        ),
        'frost-warden': buildProfiles(
            { immuneAttrs: ['ice'], movePattern: 'direct', groupPattern: 'cluster', hpScale: 0.96, sizeScale: 1, speedScale: 1.04 },
            { immuneAttrs: ['ice', 'thunder'], movePattern: 'arc', groupPattern: 'wedge', hpScale: 1.3, sizeScale: 1.06, speedScale: 1.06 },
            { immuneAttrs: ['ice', 'thunder'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 1.98, sizeScale: 1.1, speedScale: 0.94 }
        ),
        'frost-wisp': buildProfiles(
            { immuneAttrs: ['ice'], movePattern: 'arc', groupPattern: 'line', hpScale: 0.9, sizeScale: 0.98, speedScale: 1.16 },
            { immuneAttrs: ['ice', 'fire'], movePattern: 'sway', groupPattern: 'wedge', hpScale: 1.2, sizeScale: 1.04, speedScale: 1.14 },
            { immuneAttrs: ['ice', 'fire'], movePattern: 'arc', groupPattern: 'ringLoose', hpScale: 1.88, sizeScale: 1.08, speedScale: 1.02 }
        ),
        'alchemy-beholder': buildProfiles(
            { immuneAttrs: ['thunder'], movePattern: 'sway', groupPattern: 'cluster', hpScale: 0.9, sizeScale: 1.02, speedScale: 1.1 },
            { immuneAttrs: ['thunder', 'fire'], movePattern: 'arc', groupPattern: 'wedge', hpScale: 1.22, sizeScale: 1.08, speedScale: 1.08 },
            { immuneAttrs: ['thunder', 'fire'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 1.92, sizeScale: 1.12, speedScale: 0.98 }
        ),
        'storm-idol': buildProfiles(
            { immuneAttrs: ['thunder'], movePattern: 'arc', groupPattern: 'line', hpScale: 1.04, sizeScale: 1, speedScale: 1.08 },
            { immuneAttrs: ['thunder', 'poison'], movePattern: 'sway', groupPattern: 'wedge', hpScale: 1.38, sizeScale: 1.06, speedScale: 1.06 },
            { immuneAttrs: ['thunder', 'poison'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 2.06, sizeScale: 1.1, speedScale: 0.94 }
        ),
        'frostshade-alpha': buildProfiles(
            { immuneAttrs: ['ice', 'poison'], movePattern: 'arc', groupPattern: 'ringLoose', hpScale: 1.5, sizeScale: 1, speedScale: 0.96 },
            {},
            { immuneAttrs: ['ice', 'poison'], movePattern: 'arc', groupPattern: 'ringLoose', hpScale: 2.5, sizeScale: 1.04, speedScale: 0.88 }
        ),
        'frostshade-omega': buildProfiles(
            { immuneAttrs: ['ice', 'poison'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 1.56, sizeScale: 1, speedScale: 0.94 },
            {},
            { immuneAttrs: ['ice', 'poison'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 2.72, sizeScale: 1.06, speedScale: 0.82 }
        ),
        'stormshade-alpha': buildProfiles(
            { immuneAttrs: ['thunder', 'poison'], movePattern: 'arc', groupPattern: 'ringLoose', hpScale: 1.5, sizeScale: 1, speedScale: 0.98 },
            {},
            { immuneAttrs: ['thunder', 'poison'], movePattern: 'arc', groupPattern: 'ringLoose', hpScale: 2.46, sizeScale: 1.04, speedScale: 0.9 }
        ),
        'stormshade-omega': buildProfiles(
            { immuneAttrs: ['thunder', 'poison'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 1.58, sizeScale: 1, speedScale: 0.94 },
            {},
            { immuneAttrs: ['thunder', 'poison'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 2.8, sizeScale: 1.06, speedScale: 0.82 }
        ),
        'cinderfrost-alpha': buildProfiles(
            { immuneAttrs: ['fire', 'ice'], movePattern: 'arc', groupPattern: 'ringLoose', hpScale: 1.54, sizeScale: 1, speedScale: 0.96 },
            {},
            { immuneAttrs: ['fire', 'ice'], movePattern: 'arc', groupPattern: 'ringLoose', hpScale: 2.58, sizeScale: 1.04, speedScale: 0.88 }
        ),
        'cinderfrost-omega': buildProfiles(
            { immuneAttrs: ['fire', 'ice'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 1.6, sizeScale: 1, speedScale: 0.92 },
            {},
            { immuneAttrs: ['fire', 'ice'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 2.88, sizeScale: 1.06, speedScale: 0.8 }
        ),
        'cinderstorm-alpha': buildProfiles(
            { immuneAttrs: ['fire', 'thunder'], movePattern: 'arc', groupPattern: 'ringLoose', hpScale: 1.52, sizeScale: 1, speedScale: 0.96 },
            {},
            { immuneAttrs: ['fire', 'thunder'], movePattern: 'arc', groupPattern: 'ringLoose', hpScale: 2.54, sizeScale: 1.04, speedScale: 0.88 }
        ),
        'cinderstorm-omega': buildProfiles(
            { immuneAttrs: ['fire', 'thunder'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 1.58, sizeScale: 1, speedScale: 0.92 },
            {},
            { immuneAttrs: ['fire', 'thunder'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 2.8, sizeScale: 1.06, speedScale: 0.8 }
        )
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
