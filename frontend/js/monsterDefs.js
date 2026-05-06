/**
 * monsterDefs.js - 怪物战斗参数定义
 *
 * 当前阶段说明：
 * - 正式出场 wave 只安排单属性怪
 * - 双属性怪资源与数据仍保留在这里，但暂时不进入常规战斗排程
 * - 战斗命中统一读取 profile.attrSet
 */
const MonsterDefs = (() => {
    const DEFAULT_PROFILE = {
        attrSet: [],
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
            { attrSet: ['blight'], movePattern: 'direct', groupPattern: 'cluster', hpScale: 1.02, sizeScale: 1.02, speedScale: 0.94 },
            { attrSet: ['blight', 'ice'], movePattern: 'arc', groupPattern: 'wedge', hpScale: 1.48, sizeScale: 1.08, speedScale: 0.96 },
            { attrSet: ['blight', 'ice'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 2.2, sizeScale: 1.12, speedScale: 0.88 }
        ),
        'plague-scavenger': buildProfiles(
            { attrSet: ['blight'], movePattern: 'sway', groupPattern: 'line', hpScale: 0.92, sizeScale: 0.98, speedScale: 1.14 },
            { attrSet: ['blight', 'thunder'], movePattern: 'arc', groupPattern: 'wedge', hpScale: 1.28, sizeScale: 1.04, speedScale: 1.16 },
            { attrSet: ['blight', 'thunder'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 1.92, sizeScale: 1.08, speedScale: 1.04 }
        ),
        'slag-ooze': buildProfiles(
            { attrSet: ['blight'], movePattern: 'direct', groupPattern: 'cluster', hpScale: 1.22, sizeScale: 1.02, speedScale: 0.82 },
            { attrSet: ['blight', 'fire'], movePattern: 'direct', groupPattern: 'wedge', hpScale: 1.72, sizeScale: 1.08, speedScale: 0.8 },
            { attrSet: ['blight', 'fire'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 2.38, sizeScale: 1.12, speedScale: 0.72 }
        ),
        'eclipse-wraith': buildProfiles(
            { attrSet: ['blight'], movePattern: 'arc', groupPattern: 'cluster', hpScale: 0.98, sizeScale: 1.02, speedScale: 1.08 },
            { attrSet: ['blight', 'ice'], movePattern: 'sway', groupPattern: 'wedge', hpScale: 1.34, sizeScale: 1.08, speedScale: 1.1 },
            { attrSet: ['blight', 'ice'], movePattern: 'arc', groupPattern: 'ringLoose', hpScale: 2.04, sizeScale: 1.12, speedScale: 0.98 }
        ),
        'ember-sprinter': buildProfiles(
            { attrSet: ['fire'], movePattern: 'sway', groupPattern: 'line', hpScale: 0.84, sizeScale: 0.96, speedScale: 1.2 },
            { attrSet: ['fire', 'ice'], movePattern: 'arc', groupPattern: 'line', hpScale: 1.16, sizeScale: 1.02, speedScale: 1.18 },
            { attrSet: ['fire', 'ice'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 1.8, sizeScale: 1.08, speedScale: 1.04 }
        ),
        'furnace-thrall': buildProfiles(
            { attrSet: ['fire'], movePattern: 'direct', groupPattern: 'line', hpScale: 1.26, sizeScale: 1.02, speedScale: 0.88 },
            { attrSet: ['fire', 'thunder'], movePattern: 'direct', groupPattern: 'wedge', hpScale: 1.84, sizeScale: 1.08, speedScale: 0.84 },
            { attrSet: ['fire', 'thunder'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 2.62, sizeScale: 1.12, speedScale: 0.76 }
        ),
        'cinder-guard': buildProfiles(
            { attrSet: ['fire'], movePattern: 'burst', groupPattern: 'cluster', hpScale: 1.06, sizeScale: 1, speedScale: 1.02 },
            { attrSet: ['fire', 'blight'], movePattern: 'arc', groupPattern: 'wedge', hpScale: 1.42, sizeScale: 1.06, speedScale: 1.04 },
            { attrSet: ['fire', 'blight'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 2.08, sizeScale: 1.1, speedScale: 0.92 }
        ),
        'bone-cage-brute': buildProfiles(
            { attrSet: ['ice'], movePattern: 'direct', groupPattern: 'cluster', hpScale: 1.4, sizeScale: 1.02, speedScale: 0.76 },
            { attrSet: ['ice', 'blight'], movePattern: 'direct', groupPattern: 'line', hpScale: 1.98, sizeScale: 1.08, speedScale: 0.72 },
            { attrSet: ['ice', 'blight'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 2.74, sizeScale: 1.14, speedScale: 0.66 }
        ),
        'frost-warden': buildProfiles(
            { attrSet: ['ice'], movePattern: 'direct', groupPattern: 'cluster', hpScale: 0.96, sizeScale: 1, speedScale: 1.04 },
            { attrSet: ['ice', 'thunder'], movePattern: 'arc', groupPattern: 'wedge', hpScale: 1.3, sizeScale: 1.06, speedScale: 1.06 },
            { attrSet: ['ice', 'thunder'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 1.98, sizeScale: 1.1, speedScale: 0.94 }
        ),
        'frost-wisp': buildProfiles(
            { attrSet: ['ice'], movePattern: 'arc', groupPattern: 'line', hpScale: 0.9, sizeScale: 0.98, speedScale: 1.16 },
            { attrSet: ['ice', 'fire'], movePattern: 'sway', groupPattern: 'wedge', hpScale: 1.2, sizeScale: 1.04, speedScale: 1.14 },
            { attrSet: ['ice', 'fire'], movePattern: 'arc', groupPattern: 'ringLoose', hpScale: 1.88, sizeScale: 1.08, speedScale: 1.02 }
        ),
        'alchemy-beholder': buildProfiles(
            { attrSet: ['thunder'], movePattern: 'sway', groupPattern: 'cluster', hpScale: 0.9, sizeScale: 1.02, speedScale: 1.1 },
            { attrSet: ['thunder', 'fire'], movePattern: 'arc', groupPattern: 'wedge', hpScale: 1.22, sizeScale: 1.08, speedScale: 1.08 },
            { attrSet: ['thunder', 'fire'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 1.92, sizeScale: 1.12, speedScale: 0.98 }
        ),
        'storm-idol': buildProfiles(
            { attrSet: ['thunder'], movePattern: 'arc', groupPattern: 'line', hpScale: 1.04, sizeScale: 1, speedScale: 1.08 },
            { attrSet: ['thunder', 'blight'], movePattern: 'sway', groupPattern: 'wedge', hpScale: 1.38, sizeScale: 1.06, speedScale: 1.06 },
            { attrSet: ['thunder', 'blight'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 2.06, sizeScale: 1.1, speedScale: 0.94 }
        ),
        'frostshade-alpha': buildProfiles(
            { attrSet: ['ice', 'blight'], movePattern: 'arc', groupPattern: 'ringLoose', hpScale: 1.5, sizeScale: 1, speedScale: 0.96 },
            {},
            { attrSet: ['ice', 'blight'], movePattern: 'arc', groupPattern: 'ringLoose', hpScale: 2.5, sizeScale: 1.04, speedScale: 0.88 }
        ),
        'frostshade-omega': buildProfiles(
            { attrSet: ['ice', 'blight'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 1.56, sizeScale: 1, speedScale: 0.94 },
            {},
            { attrSet: ['ice', 'blight'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 2.72, sizeScale: 1.06, speedScale: 0.82 }
        ),
        'stormshade-alpha': buildProfiles(
            { attrSet: ['thunder', 'blight'], movePattern: 'arc', groupPattern: 'ringLoose', hpScale: 1.5, sizeScale: 1, speedScale: 0.98 },
            {},
            { attrSet: ['thunder', 'blight'], movePattern: 'arc', groupPattern: 'ringLoose', hpScale: 2.46, sizeScale: 1.04, speedScale: 0.9 }
        ),
        'stormshade-omega': buildProfiles(
            { attrSet: ['thunder', 'blight'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 1.58, sizeScale: 1, speedScale: 0.94 },
            {},
            { attrSet: ['thunder', 'blight'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 2.8, sizeScale: 1.06, speedScale: 0.82 }
        ),
        'cinderfrost-alpha': buildProfiles(
            { attrSet: ['fire', 'ice'], movePattern: 'arc', groupPattern: 'ringLoose', hpScale: 1.54, sizeScale: 1, speedScale: 0.96 },
            {},
            { attrSet: ['fire', 'ice'], movePattern: 'arc', groupPattern: 'ringLoose', hpScale: 2.58, sizeScale: 1.04, speedScale: 0.88 }
        ),
        'cinderfrost-omega': buildProfiles(
            { attrSet: ['fire', 'ice'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 1.6, sizeScale: 1, speedScale: 0.92 },
            {},
            { attrSet: ['fire', 'ice'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 2.88, sizeScale: 1.06, speedScale: 0.8 }
        ),
        'cinderstorm-alpha': buildProfiles(
            { attrSet: ['fire', 'thunder'], movePattern: 'arc', groupPattern: 'ringLoose', hpScale: 1.52, sizeScale: 1, speedScale: 0.96 },
            {},
            { attrSet: ['fire', 'thunder'], movePattern: 'arc', groupPattern: 'ringLoose', hpScale: 2.54, sizeScale: 1.04, speedScale: 0.88 }
        ),
        'cinderstorm-omega': buildProfiles(
            { attrSet: ['fire', 'thunder'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 1.58, sizeScale: 1, speedScale: 0.92 },
            {},
            { attrSet: ['fire', 'thunder'], movePattern: 'burst', groupPattern: 'ringLoose', hpScale: 2.8, sizeScale: 1.06, speedScale: 0.8 }
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

    function getAttrSet(species, tier) {
        return [...getCombatProfile(species, tier).attrSet];
    }

    return { DEFS, getCombatProfile, getAttrSet };
})();
