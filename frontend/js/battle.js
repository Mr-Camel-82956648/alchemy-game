/**
 * battle.js — 页面C：割草战斗
 *
 * WASD 移动 | 1234 切换法阵 | 点击释放 | Space 闪避 | R 大招
 * Infinite world with multi-layer scrolling background:
 *   Layer 1: Ground tile (seamless) → Layer 2: Skull decorations (chunk-seeded)
 *   → Layer 3: Light orbs (parallax + breathing) → Layer 4: Entities (Y-sort)
 *   → Layer 5: Vignette
 */
const Battle = (() => {
    const CANVAS_W = 2560;
    const CANVAS_H = 1440;

    // ---- Monster species definitions (animated sprites) ----
    const MOB_SPECIES = {
        'stitch-ghoul':      { folder: 'assets/monsters/stitch-ghoul',      frames: 5, scale: 1.0, flipDefault: false },
        'plague-scavenger':  { folder: 'assets/monsters/plague-scavenger',  frames: 5, scale: 1.0, flipDefault: true }
    };

    const TIERS = {
        minion:  { hp: 2,  speedRange: [1.0, 1.8],  scale: 1.0,  barColor: '#4caf50', score: 10,
                   species: ['stitch-ghoul', 'plague-scavenger'] },
        elite:   { hp: 6,  speedRange: [1.4, 2.2],  scale: 1.0,  barColor: '#ffc107', score: 30,
                   species: ['stitch-ghoul', 'plague-scavenger'] },
        boss:    { hp: 20, speedRange: [0.6, 1.0],  scale: 1.0,  barColor: '#f44336', score: 100,
                   species: ['stitch-ghoul'] }
    };

    const ANIM_FPS_MOB = 6;
    const ANIM_FRAME_MS_MOB = 1000 / ANIM_FPS_MOB;

    const CONFIG = {
        playerSpeed: 8,
        playerHP: 5,
        dashSpeed: 55,
        dashDuration: 160,
        dashCooldown: 1500,
        ultimateCost: 10,
        ultimateSize: 1591,
        ultimateDamage: 10,
        killsToFull: 50,
        energyPerKill: 1,
        wavePause: 1500,
        spellMaxCharges: 3,
        spellChargeTime: 4000,
        battleDuration: 60,
        soulGoal: 500,
        spellSizes: [796, 597, 696, 895],
        spellDamages: [3, 2, 4, 2],
        spellColors: ['#ff6600', '#00ccff', '#cc88ff', '#44ff66'],
        spellGlows: ['rgba(255,100,0,0.6)', 'rgba(0,200,255,0.6)', 'rgba(200,150,255,0.6)', 'rgba(0,255,80,0.6)'],
        spellNames: ['火焰风暴', '冰霜之刃', '雷电裁决', '毒雾缠绕'],
        groundBrightness: 0.59,
        groundSaturation: 0.62
    };

    let canvas, ctx;
    let running = false;
    let animFrameId = null;

    // Player
    const player = { x: 0, y: 0, hp: 0, w: 432, h: 432 };
    let isDashing = false, dashDir = { x: 0, y: 0 }, dashStart = 0, lastDashTime = 0;

    // ---- Player sprite animation ----
    const ANIM_FPS = 10;
    const ANIM_FRAME_MS = 1000 / ANIM_FPS;
    const playerAnim = {
        state: 'idle',       // idle | run | castUp
        dir: 'front',
        frame: 0,
        lastFrameTime: 0,
        castCallback: null,
        castTriggered: false
    };

    const MIRROR_MAP = { right: 'left', front_left: 'front_right', back_left: 'back_right' };
    const spriteFrames = { run: {}, idle: [], castUp: [] };

    function preloadPlayerSprites() {
        const base = 'assets/player1/';
        const runDirs = {
            front: { folder: 'player1_front_run_normalized', prefix: 'player1_front_run_', count: 5 },
            front_right: { folder: 'player1_front_right_run_normalized', prefix: 'player1_front_right_run_', count: 5 },
            left: { folder: 'player1_left_run_normalized', prefix: 'player1_left_run_', count: 6 },
            back: { folder: 'player1_back_run_normalized', prefix: 'player1_back_run_', count: 8 },
            back_right: { folder: 'player1_back_right_run_normalized', prefix: 'player1_back_right_run_', count: 6 }
        };
        for (const [dir, info] of Object.entries(runDirs)) {
            spriteFrames.run[dir] = [];
            for (let i = 1; i <= info.count; i++) {
                const img = new Image();
                img.src = `${base}${info.folder}/${info.prefix}${String(i).padStart(2, '0')}.png`;
                spriteFrames.run[dir].push(img);
            }
        }
        for (let i = 1; i <= 8; i++) {
            const img = new Image();
            img.src = `${base}player1_stand_run_normalized/player1_stand_run_${String(i).padStart(2, '0')}.png`;
            spriteFrames.idle.push(img);
        }
        for (let i = 1; i <= 6; i++) {
            const img = new Image();
            img.src = `${base}player1_ultimate_skill_run_normalized/player1_ultimate_skill_run_${String(i).padStart(2, '0')}.png`;
            spriteFrames.castUp.push(img);
        }
    }

    function getDirectionFromInput() {
        let dx = 0, dy = 0;
        if (keys['KeyW'] || keys['ArrowUp']) dy = -1;
        if (keys['KeyS'] || keys['ArrowDown']) dy = 1;
        if (keys['KeyA'] || keys['ArrowLeft']) dx = -1;
        if (keys['KeyD'] || keys['ArrowRight']) dx = 1;
        if (dx === 0 && dy === 0) return null;
        if (dx === 0 && dy === -1) return 'back';
        if (dx === 0 && dy === 1) return 'front';
        if (dx === -1 && dy === 0) return 'left';
        if (dx === 1 && dy === 0) return 'right';
        if (dx === 1 && dy === 1) return 'front_right';
        if (dx === -1 && dy === 1) return 'front_left';
        if (dx === 1 && dy === -1) return 'back_right';
        if (dx === -1 && dy === -1) return 'back_left';
        return 'front';
    }

    function getFramesForState() {
        if (playerAnim.state === 'run') {
            const sourceDir = MIRROR_MAP[playerAnim.dir] || playerAnim.dir;
            return spriteFrames.run[sourceDir] || spriteFrames.run.front;
        }
        if (playerAnim.state === 'castUp') return spriteFrames.castUp;
        return spriteFrames.idle;
    }

    function updatePlayerAnim(now) {
        if (playerAnim.state === 'castUp') {
            if (now - playerAnim.lastFrameTime >= ANIM_FRAME_MS) {
                playerAnim.lastFrameTime = now;
                playerAnim.frame++;
                const frames = getFramesForState();
                if (playerAnim.frame === 3 && !playerAnim.castTriggered) {
                    playerAnim.castTriggered = true;
                    if (playerAnim.castCallback) playerAnim.castCallback();
                }
                if (playerAnim.frame >= frames.length) {
                    playerAnim.state = 'idle';
                    playerAnim.frame = 0;
                }
            }
            return;
        }

        const moveDir = getDirectionFromInput();
        if (moveDir && !isDashing) {
            playerAnim.state = 'run';
            playerAnim.dir = moveDir;
        } else if (!isDashing) {
            if (playerAnim.state === 'run') {
                playerAnim.state = 'idle';
                playerAnim.frame = 0;
            }
        }

        if (now - playerAnim.lastFrameTime >= ANIM_FRAME_MS) {
            playerAnim.lastFrameTime = now;
            const frames = getFramesForState();
            playerAnim.frame = (playerAnim.frame + 1) % frames.length;
        }
    }

    function playCastAnim(callback) {
        playerAnim.state = 'castUp';
        playerAnim.frame = 0;
        playerAnim.lastFrameTime = Date.now();
        playerAnim.castCallback = callback;
        playerAnim.castTriggered = false;
        const mx = mouseWorld.x - player.x;
        playerAnim.dir = mx >= 0 ? 'front_right' : 'front_left';
    }

    // State
    let monsters = [];
    let energy = 0, killCount = 0, score = 0;
    let activeEffects = [];
    let floatingTexts = [];
    let activeSpellIndex = 0;

    // Game feel systems
    let hitstopEnd = 0;
    let shake = { intensity: 0, duration: 0, startTime: 0 };
    let particles = [];
    let afterimages = [];
    let lastAfterimageTime = 0;
    let spellCharges = [3, 3, 3, 3];
    let spellLastChargeTime = [0, 0, 0, 0];

    // Lightning projectiles
    let lightningBolts = [];

    // Damage flash screen effect
    let damageFlash = { alpha: 0, time: 0 };
    // Pause state
    let isPaused = false;

    // Amulet aura (persistent effect under player)
    const AMULET_SRC = 'assets/spells/amulet_array.mp4';
    const AMULET_SIZE = 480;
    const AMULET_DAMAGE = 0.3;
    const AMULET_TICK_MS = 500;
    let amuletVideo = null;
    let amuletProcCanvas, amuletProcCtx;
    let lastAmuletDamageTick = 0;

    // Wave system
    let waveNumber = 0;
    let waveState = 'idle'; // 'idle' | 'fighting' | 'pause'
    let wavePauseStart = 0;
    let spawnQueue = [];
    let battleStartTime = 0;

    // Input
    const keys = {};
    let mouseWorld = { x: 0, y: 0 };

    // Camera (world coords of viewport top-left)
    const camera = { x: 0, y: 0 };

    // Background assets
    const bgAssets = {};
    const BG_TILE_W = 1920, BG_TILE_H = 1080;

    // Monster sprite frames: { 'stitch-ghoul': [Image, Image, ...], ... }
    const mobFrames = {};

    // VFX
    let spellVideoSrcs = [];
    let spellThumbImgs = [null, null, null, null];
    let spellCardData = [null, null, null, null];
    const EFFECT_SIZE = 480;
    let procCanvas, procCtx, maskCanvas, maskCtx;

    let forgeCheckTimer = null;

    function init() {
        canvas = document.getElementById('battle-canvas');
        ctx = canvas.getContext('2d');

        procCanvas = document.createElement('canvas');
        procCanvas.width = EFFECT_SIZE;
        procCanvas.height = EFFECT_SIZE;
        procCtx = procCanvas.getContext('2d', { willReadFrequently: true });

        maskCanvas = document.createElement('canvas');
        maskCanvas.width = EFFECT_SIZE;
        maskCanvas.height = EFFECT_SIZE;
        maskCtx = maskCanvas.getContext('2d');

        // Preload animated monster sprites
        Object.entries(MOB_SPECIES).forEach(([species, def]) => {
            mobFrames[species] = [];
            for (let i = 1; i <= def.frames; i++) {
                const img = new Image();
                img.src = `${def.folder}/frame_${String(i).padStart(2, '0')}.png`;
                mobFrames[species].push(img);
            }
        });

        preloadPlayerSprites();

        // Background textures
        const bgFiles = {
            ground: 'assets/aena/seamless_texture_01.jpg',
            skull1: 'assets/aena/skull_01.png',
            skull2: 'assets/aena/skull_02.png',
            light1: 'assets/aena/linear_dodge_add_01.png',
            light2: 'assets/aena/linear_dodge_add_02.png',
            bloodScreen: 'assets/ui/blood_screen.webp'
        };
        Object.entries(bgFiles).forEach(([key, src]) => {
            const img = new Image();
            img.src = src;
            bgAssets[key] = img;
        });

        // Load VFX videos from loadout
        loadSpellVideos();

        // Amulet aura video + dedicated offscreen canvas
        amuletVideo = document.createElement('video');
        amuletVideo.src = AMULET_SRC;
        amuletVideo.loop = true;
        amuletVideo.muted = true;
        amuletVideo.playsInline = true;
        amuletVideo.preload = 'auto';

        amuletProcCanvas = document.createElement('canvas');
        amuletProcCanvas.width = AMULET_SIZE;
        amuletProcCanvas.height = AMULET_SIZE;
        amuletProcCtx = amuletProcCanvas.getContext('2d', { willReadFrequently: true });

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', e => { keys[e.code] = false; });
        canvas.addEventListener('mousedown', onCanvasClick);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('contextmenu', e => e.preventDefault());

        document.getElementById('btn-victory-return').addEventListener('click', onVictoryReturn);
        document.getElementById('btn-retry').addEventListener('click', onRetry);
        document.getElementById('btn-defeat-return').addEventListener('click', onDefeatReturn);
    }

    function loadSpellVideos() {
        spellVideoSrcs = [];
        spellThumbImgs = [null, null, null, null];
        spellCardData = [null, null, null, null];
        const loadout = GameStorage.getLoadout();
        loadout.forEach((card, i) => {
            spellVideoSrcs[i] = card?.videoUrl || null;
            spellCardData[i] = card ? SpellDefs.normalizeCard(card) : null;
            const thumbUrl = card ? GameStorage.getCardThumb(card) : null;
            if (thumbUrl) {
                const img = new Image();
                img.src = thumbUrl;
                spellThumbImgs[i] = img;
            }
        });

        // Fallback: if no loadout, use first 4 from video_list
        if (spellVideoSrcs.every(v => !v)) {
            fetch('assets/data/video_list.json')
                .then(r => r.json())
                .then(videos => {
                    for (let i = 0; i < 4 && i < videos.length; i++) {
                        if (!spellVideoSrcs[i]) spellVideoSrcs[i] = `assets/videos/${videos[i]}`;
                    }
                })
                .catch(() => {});
        }
    }

    // ---- Input ----
    function onKeyDown(e) {
        keys[e.code] = true;
        if (!running) return;
        if (e.code === 'Escape') {
            isPaused = !isPaused;
            if (amuletVideo) { isPaused ? amuletVideo.pause() : amuletVideo.play().catch(() => {}); }
            return;
        }
        if (isPaused) return;
        if (e.code === 'Digit1') activeSpellIndex = 0;
        if (e.code === 'Digit2') activeSpellIndex = 1;
        if (e.code === 'Digit3') activeSpellIndex = 2;
        if (e.code === 'Digit4') activeSpellIndex = 3;
        if (e.code === 'Space' && !isDashing) { e.preventDefault(); tryDash(); }
        if (e.code === 'KeyR') tryUltimate();
    }

    function onMouseMove(e) {
        const rect = canvas.getBoundingClientRect();
        mouseWorld.x = (e.clientX - rect.left) / rect.width * CANVAS_W + camera.x;
        mouseWorld.y = (e.clientY - rect.top) / rect.height * CANVAS_H + camera.y;
    }

    function onCanvasClick(e) {
        e.preventDefault();
        if (!running || isPaused) return;
        if (spellCharges[activeSpellIndex] <= 0) return;
        onMouseMove(e);
        const wx = mouseWorld.x, wy = mouseWorld.y;
        if (playerAnim.state !== 'castUp') {
            playCastAnim(() => {
                castSpell(activeSpellIndex, wx, wy);
            });
        } else {
            castSpell(activeSpellIndex, wx, wy);
        }
    }

    // ---- Spells ----
    function rechargeSpells(now) {
        for (let i = 0; i < 4; i++) {
            if (spellCharges[i] < CONFIG.spellMaxCharges) {
                if (now - spellLastChargeTime[i] >= CONFIG.spellChargeTime) {
                    spellCharges[i]++;
                    spellLastChargeTime[i] = now;
                }
            }
        }
    }

    function buildEffectSpellData(index) {
        const cardData = spellCardData[index];
        if (cardData) {
            return {
                generation: cardData.generation,
                baseAtk: cardData.baseAtk,
                mainAttr: cardData.mainAttr || null,
                subAttr: cardData.subAttr || null
            };
        }

        return {
            generation: 1,
            baseAtk: null,
            mainAttr: null,
            subAttr: null
        };
    }

    function castSpell(index, wx, wy) {
        if (spellCharges[index] <= 0) return;
        spellCharges[index]--;
        const now = Date.now();
        if (spellCharges[index] < CONFIG.spellMaxCharges - 1 || spellLastChargeTime[index] === 0) {
            spellLastChargeTime[index] = now;
        }

        const travelTime = 150;
        const lightningColor = '#b366ff';

        // Crystal ball at (406, 98) in 960x960 sprite; anchor = bottom-center (480, 960)
        const spriteScale = player.w / 960;
        const facingRight = wx >= player.x;
        const staffOffX = (facingRight ? (406 - 480) : (480 - 406)) * spriteScale;
        const staffOffY = (98 - 960) * spriteScale;

        lightningBolts.push({
            fromX: player.x + staffOffX, fromY: player.y + staffOffY,
            toX: wx, toY: wy,
            startTime: now, travelTime,
            color: lightningColor
        });

        // Delayed spell effect arrival
        const sizeJitter = 0.9 + Math.random() * 0.2;
        setTimeout(() => {
            if (!running) return;
            let video = null;
            if (spellVideoSrcs[index]) {
                video = document.createElement('video');
                video.src = spellVideoSrcs[index];
                video.muted = true;
                video.play().catch(() => {});
            }

            const spellData = buildEffectSpellData(index);
            const mainAttr = spellData.mainAttr;
            activeEffects.push({
                x: wx, y: wy,
                size: CONFIG.spellSizes[index] * sizeJitter,
                color: mainAttr ? SpellDefs.getElementColor(mainAttr) : CONFIG.spellColors[index],
                glowColor: mainAttr ? SpellDefs.getElementGlow(mainAttr) : CONFIG.spellGlows[index],
                damage: CONFIG.spellDamages[index],
                mainAttr: mainAttr,
                spellData: spellData,
                video, startTime: Date.now(),
                damageApplied: false
            });

            triggerShake(6, 150);
            triggerHitstop(15);
        }, travelTime);
    }

    function tryDash() {
        const now = Date.now();
        if (now - lastDashTime < CONFIG.dashCooldown) return;
        let dx = 0, dy = 0;
        if (keys['KeyW'] || keys['ArrowUp']) dy = -1;
        if (keys['KeyS'] || keys['ArrowDown']) dy = 1;
        if (keys['KeyA'] || keys['ArrowLeft']) dx = -1;
        if (keys['KeyD'] || keys['ArrowRight']) dx = 1;
        if (dx === 0 && dy === 0) { dx = mouseWorld.x - player.x; dy = mouseWorld.y - player.y; }
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return;
        isDashing = true;
        dashDir = { x: dx / len, y: dy / len };
        dashStart = now;
        lastDashTime = now;
    }

    function tryUltimate() {
        if (energy < CONFIG.ultimateCost) return;
        if (playerAnim.state === 'castUp') return;
        energy -= CONFIG.ultimateCost;
        updateBars();

        let video = null;
        const vidIdx = Math.floor(Math.random() * spellVideoSrcs.length);
        if (spellVideoSrcs[vidIdx]) {
            video = document.createElement('video');
            video.src = spellVideoSrcs[vidIdx];
            video.muted = true;
            video.play().catch(() => {});
        }

        const spellData = buildEffectSpellData(activeSpellIndex);
        const mainAttr = spellData.mainAttr;
        const effectColor = mainAttr ? SpellDefs.getElementColor(mainAttr) : '#ffcc00';
        const effectGlow = mainAttr ? SpellDefs.getElementGlow(mainAttr) : 'rgba(255,200,0,0.4)';
        const px = player.x, py = player.y;
        const maxSubSize = Math.max(...CONFIG.spellSizes);
        const lightningColor = '#b366ff';
        const spriteScale = player.w / 960;

        // Chain barrage: concentric rings within viewport
        const subCount = 8 + Math.floor(Math.random() * 5); // 8-12
        let delay = 0;
        let interval = 80;
        const baseAngle = Math.random() * Math.PI * 2;

        // Ring layout: center(1) + inner ring
        const innerCount = Math.min(subCount - 1, 4 + Math.floor(Math.random() * 3));
        const rings = [
            { dist: 0, count: 1 },
            { dist: maxSubSize * 0.55, count: innerCount },
            // { dist: maxSubSize * 1.05, count: subCount - 1 - innerCount }
        ];
        const maxDist = CANVAS_W * 0.35;

        let subIndex = 0;
        for (let r = 0; r < rings.length; r++) {
            const ring = rings[r];
            const ringDist = Math.min(ring.dist, maxDist);
            for (let j = 0; j < ring.count; j++) {
                const i = subIndex++;
                const size = maxSubSize * (0.55 + Math.random() * 0.4);
                let ox, oy;
                if (ringDist === 0) {
                    ox = px;
                    oy = py;
                } else {
                    const angleStep = (Math.PI * 2) / ring.count;
                    const angle = baseAngle + angleStep * j + (Math.random() - 0.5) * angleStep * 0.35;
                    ox = px + Math.cos(angle) * ringDist * 1.3;
                    oy = py + Math.sin(angle) * ringDist * 0.65;
                }

                const d = delay;
                const s = size;
                const ex = ox, ey = oy;

                setTimeout(() => {
                    if (!running) return;
                    activeEffects.push({
                        x: ex, y: ey, size: s,
                        color: effectColor, glowColor: effectGlow,
                        damage: CONFIG.ultimateDamage * (i === 0 ? 1 : 0.5),
                        mainAttr: mainAttr,
                        spellData: spellData,
                        video, startTime: Date.now(),
                        damageApplied: false, isUltimate: true
                    });
                    lightningBolts.push({
                        fromX: px + (406 - 480) * spriteScale,
                        fromY: py + (98 - 960) * spriteScale,
                        toX: ex, toY: ey,
                        startTime: Date.now(), travelTime: 80,
                        color: lightningColor
                    });
                    triggerShake(i === 0 ? 8 : 4 + Math.random() * 3, 150);
                }, d);

                delay += interval;
                interval = Math.max(20, interval * 0.85);
            }
        }

        triggerHitstop(15);
    }

    // ---- VS-like Wave & Horde System ----
    const MAX_MONSTERS = 200;
    let gameTime = 0;       // seconds since battle start
    let lastGroupSpawn = 0; // ms timestamp of last group spawn
    let lastTrickle = 0;    // ms timestamp of last trickle spawn
    let lastBossWave = 0;   // tracks which boss wave was last spawned
    const RESIST_ABSORB_VISUAL_SCALE_STEPS = [0, 0.3, 0.62, 0.98];
    const ULTIMATE_DAMAGE_FALLOFF_STEPS = [
        { maxRatio: 0.35, multiplier: 1.0 },
        { maxRatio: 0.7, multiplier: 0.72 },
        { maxRatio: 1.0, multiplier: 0.45 }
    ];
    const MONSTER_HIT_PAUSE_MS = 70;
    const MONSTER_ULTIMATE_HIT_PAUSE_MS = 90;
    const MONSTER_HIT_FLASH_MS = 110;
    const MONSTER_ABSORB_PAUSE_MS = 110;
    const MONSTER_ABSORB_FEEDBACK_MS = 280;
    const MONSTER_DEATH_FADE_MS = 560;

    function getSpawnPressure() {
        const t = gameTime;
        // Ramps over time: more monsters as game progresses
        return {
            trickleInterval: Math.max(200, 800 - t * 8),   // ms between trickle spawns
            groupInterval:   Math.max(3000, 10000 - t * 80),// ms between group bursts
            groupSize:       Math.min(30, 5 + Math.floor(t / 8)),
            eliteChance:     Math.min(0.3, t * 0.003),
            bossInterval:    60,                            // seconds between boss spawns
            maxOnScreen:     Math.min(MAX_MONSTERS, 40 + Math.floor(t * 0.8))
        };
    }

    function getMonsterAbsorbVisualScaleBonus(monster) {
        const stacks = Math.max(
            0,
            Math.min(
                Combat.RESIST_ABSORB_MAX_STACKS,
                Math.floor(Number(monster.resistAbsorbStacks) || 0)
            )
        );
        return RESIST_ABSORB_VISUAL_SCALE_STEPS[stacks] || 0;
    }

    function refreshMonsterScale(monster) {
        const absorbScaleBonus = getMonsterAbsorbVisualScaleBonus(monster);
        monster.scale = (Number(monster.baseScale) || 1) + absorbScaleBonus;
        monster.w = 202 * monster.scale;
    }

    function applyMonsterProfile(monster) {
        const tierDef = TIERS[monster.tier];
        const specDef = MOB_SPECIES[monster.species];
        const profile = MonsterDefs.getCombatProfile(monster.species, monster.tier);
        const hpScale = Number(profile.hpScale) > 0 ? Number(profile.hpScale) : 1;
        const sizeScale = Number(profile.sizeScale) > 0 ? Number(profile.sizeScale) : 1;
        const speedScale = Number(profile.speedScale) > 0 ? Number(profile.speedScale) : 1;

        monster.immuneAttrs = [...(profile.immuneAttrs || [])];
        monster.movePattern = profile.movePattern || 'direct';
        monster.groupPattern = profile.groupPattern || 'cluster';
        monster.speed = (Number(monster.baseSpeed) || tierDef.speedRange[0]) * speedScale;
        monster.baseMaxHp = Math.max(1, Math.round(tierDef.hp * hpScale));
        monster.maxHp = monster.baseMaxHp;
        monster.hp = monster.baseMaxHp;
        monster.baseScale = tierDef.scale * specDef.scale * sizeScale;
        refreshMonsterScale(monster);
    }

    function getGroupSpawnOffset(groupPattern, index, count) {
        const centered = count > 1 ? (index / (count - 1)) - 0.5 : 0;
        switch (groupPattern) {
            case 'line':
                return {
                    angleOffset: centered * 0.8,
                    distOffset: (Math.random() - 0.5) * 80
                };
            case 'wedge':
                return {
                    angleOffset: centered * 0.55,
                    distOffset: Math.abs(centered) * 220 - 20
                };
            case 'ringLoose':
                return {
                    angleOffset: centered * 1.2,
                    distOffset: 120 + (Math.random() - 0.5) * 140
                };
            case 'cluster':
            default:
                return {
                    angleOffset: centered * 0.3 + (Math.random() - 0.5) * 0.18,
                    distOffset: (Math.random() - 0.5) * 160
                };
        }
    }

    function getMonsterVelocity(monster, dx, dy, distance, now) {
        if (distance <= 0) return { vx: 0, vy: 0 };

        const nx = dx / distance;
        const ny = dy / distance;
        const baseSpeed = monster.speed;
        const perpX = -ny;
        const perpY = nx;

        switch (monster.movePattern) {
            case 'sway': {
                const sway = Math.sin((now - monster.spawnTime) * 0.006 + monster.bobOffset) * 0.55;
                return {
                    vx: nx * baseSpeed + perpX * baseSpeed * sway,
                    vy: ny * baseSpeed + perpY * baseSpeed * sway
                };
            }
            case 'arc': {
                const arcDir = monster.arcDirection || 1;
                const orbitWeight = distance > 180 ? 0.85 : 0.35;
                return {
                    vx: nx * baseSpeed * 0.8 + perpX * arcDir * baseSpeed * orbitWeight,
                    vy: ny * baseSpeed * 0.8 + perpY * arcDir * baseSpeed * orbitWeight
                };
            }
            case 'burst': {
                const cycle = 900;
                const cycleTime = (now - monster.spawnTime + Math.floor(monster.bobOffset * 120)) % cycle;
                const burstActive = cycleTime >= 430 && cycleTime <= 620;
                const burstScale = burstActive ? 1.9 : 0.3;
                return {
                    vx: nx * baseSpeed * burstScale,
                    vy: ny * baseSpeed * burstScale
                };
            }
            case 'direct':
            default:
                return {
                    vx: nx * baseSpeed,
                    vy: ny * baseSpeed
                };
        }
    }

    function clamp01(value) {
        return Math.max(0, Math.min(1, value));
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function easeOutCubic(t) {
        const clamped = clamp01(t);
        return 1 - Math.pow(1 - clamped, 3);
    }

    function applyMonsterHitFeedback(monster, now, isUltimate) {
        const pauseMs = isUltimate ? MONSTER_ULTIMATE_HIT_PAUSE_MS : MONSTER_HIT_PAUSE_MS;
        monster.hitPauseUntil = Math.max(Number(monster.hitPauseUntil) || 0, now + pauseMs);
        monster.flashEnd = Math.max(Number(monster.flashEnd) || 0, now + MONSTER_HIT_FLASH_MS);
    }

    function getMonsterAbsorbFeedback(monster, now) {
        const start = Number(monster.absorbFeedbackStart) || 0;
        if (!start) return null;

        const elapsed = now - start;
        if (elapsed < 0 || elapsed > MONSTER_ABSORB_FEEDBACK_MS) return null;

        const t = elapsed / MONSTER_ABSORB_FEEDBACK_MS;
        const fromWidth = Math.max(1, Number(monster.absorbFromWidth) || Number(monster.w) || 1);
        const targetWidth = Math.max(1, Number(monster.w) || fromWidth);

        let width = targetWidth;
        if (t < 0.32) {
            width = lerp(fromWidth, fromWidth * 0.92, easeOutCubic(t / 0.32));
        } else if (t < 0.72) {
            width = lerp(fromWidth * 0.92, targetWidth * 1.04, easeOutCubic((t - 0.32) / 0.4));
        } else {
            width = lerp(targetWidth * 1.04, targetWidth, easeOutCubic((t - 0.72) / 0.28));
        }

        const ringT = clamp01(t / 0.58);
        return {
            width,
            glow: 1 - clamp01((t - 0.12) / 0.88),
            ringRadius: lerp(targetWidth * 0.68, targetWidth * 0.22, easeOutCubic(ringT)),
            ringAlpha: 0.28 * (1 - ringT),
            color: monster.absorbFeedbackColor || '#999999'
        };
    }

    function applyResistanceAbsorb(monster, hitResult, now, color) {
        const previousWidth = getMonsterAbsorbFeedback(monster, now)?.width || monster.w;
        const currentStacks = Number(monster.resistAbsorbStacks) || 0;
        const maxStacks = Number(hitResult.maxAbsorbStacks) || 0;
        if (currentStacks < maxStacks) {
            const absorbHp = (Number(monster.baseMaxHp) || 0) * (Number(hitResult.absorbHpRatio) || 0);
            monster.resistAbsorbStacks = currentStacks + 1;
            monster.maxHp += absorbHp;
            monster.hp = Math.min(monster.maxHp, monster.hp + absorbHp);
            refreshMonsterScale(monster);
        }

        monster.absorbFeedbackStart = now;
        monster.absorbFeedbackColor = color || '#999999';
        monster.absorbFromWidth = previousWidth;
        monster.hitPauseUntil = Math.max(Number(monster.hitPauseUntil) || 0, now + MONSTER_ABSORB_PAUSE_MS);
        monster.flashEnd = Math.max(Number(monster.flashEnd) || 0, now + 160);
        floatingTexts.push({
            x: monster.x,
            y: monster.y - 60,
            text: '吸收',
            color: color || '#999999',
            startTime: now
        });
    }

    function getMonsterContactRadius(monster) {
        return Math.max(50, monster.w * 0.24);
    }

    function getEffectDamageAtTarget(effect, target) {
        const baseDamage = Number(effect.damage) || 0;
        if (!effect.isUltimate) return baseDamage;

        const half = Math.max(1, effect.size / 2);
        const dx = target.x - effect.x;
        const dy = target.y - effect.y;
        const distanceRatio = Math.min(1, Math.sqrt(dx * dx + dy * dy) / half);

        for (const step of ULTIMATE_DAMAGE_FALLOFF_STEPS) {
            if (distanceRatio <= step.maxRatio) {
                return baseDamage * step.multiplier;
            }
        }

        return baseDamage * ULTIMATE_DAMAGE_FALLOFF_STEPS[ULTIMATE_DAMAGE_FALLOFF_STEPS.length - 1].multiplier;
    }

    function spawnHordeGroup(species, count, tier) {
        // Spawn a same-species group with lightweight formation variance.
        const baseAngle = Math.random() * Math.PI * 2;
        const baseDist = Math.max(CANVAS_W, CANVAS_H) * 0.6 + 100;
        const profile = MonsterDefs.getCombatProfile(species, tier || 'minion');

        for (let i = 0; i < count; i++) {
            const offset = getGroupSpawnOffset(profile.groupPattern, i, count);
            const angle = baseAngle + offset.angleOffset;
            const dist = baseDist + offset.distOffset;
            spawnMonster(tier || 'minion', angle, dist, species, {
                groupPattern: profile.groupPattern,
                groupAnchorAngle: baseAngle,
                groupIndex: i,
                groupCount: count
            });
        }
    }

    function startNextWave() {
        waveNumber++;
        waveState = 'fighting';
        spawnQueue = [];
        lastGroupSpawn = Date.now();
        lastTrickle = Date.now();

        // Initial burst: two groups from different directions
        const speciesList = Object.keys(MOB_SPECIES);
        const s1 = speciesList[Math.floor(Math.random() * speciesList.length)];
        const s2 = speciesList[Math.floor(Math.random() * speciesList.length)];
        const burstSize = Math.min(12, 4 + waveNumber * 2);
        spawnHordeGroup(s1, burstSize, 'minion');
        spawnHordeGroup(s2, Math.ceil(burstSize * 0.6), 'minion');

        announceWave(waveNumber);
        updateWaveDisplay();
    }

    function vsSpawnTick(now) {
        const pressure = getSpawnPressure();
        if (monsters.length >= pressure.maxOnScreen) return;

        // Trickle spawns: individual monsters from random directions
        if (now - lastTrickle >= pressure.trickleInterval) {
            lastTrickle = now;
            const tier = Math.random() < pressure.eliteChance ? 'elite' : 'minion';
            spawnMonster(tier);
        }

        // Group bursts: dense same-species packs from one direction
        if (now - lastGroupSpawn >= pressure.groupInterval) {
            lastGroupSpawn = now;
            const speciesList = Object.keys(MOB_SPECIES);
            const species = speciesList[Math.floor(Math.random() * speciesList.length)];
            const count = Math.min(pressure.groupSize, pressure.maxOnScreen - monsters.length);
            if (count > 0) {
                // 20% chance the group is all elites
                const tier = Math.random() < 0.2 && pressure.eliteChance > 0.05 ? 'elite' : 'minion';
                spawnHordeGroup(species, count, tier);
            }
        }

        // Boss spawn every N seconds
        const bossWave = Math.floor(gameTime / pressure.bossInterval);
        if (bossWave > lastBossWave && !monsters.some(m => m.tier === 'boss')) {
            lastBossWave = bossWave;
            spawnMonster('boss');
        }
    }

    function announceWave(n) {
        const el = document.getElementById('wave-announce');
        const text = document.getElementById('wave-announce-text');
        text.textContent = n >= 8 ? `WAVE ${n} — BOSS` : `WAVE ${n}`;
        el.style.display = 'block';
        text.style.animation = 'none';
        void text.offsetWidth;
        text.style.animation = '';
        setTimeout(() => { el.style.display = 'none'; }, 2500);
    }

    function spawnMonster(tier, angleOverride, distOverride, speciesOverride, groupMeta) {
        const def = TIERS[tier];
        const angle = angleOverride != null ? angleOverride : Math.random() * Math.PI * 2;
        const spawnDist = distOverride || (Math.max(CANVAS_W, CANVAS_H) * 0.6 + 100);
        const x = player.x + Math.cos(angle) * spawnDist;
        const y = player.y + Math.sin(angle) * spawnDist * 0.6;

        const species = speciesOverride || def.species[Math.floor(Math.random() * def.species.length)];
        const specDef = MOB_SPECIES[species];
        const monster = {
            x, y, tier, species,
            baseSpeed: def.speedRange[0] + Math.random() * (def.speedRange[1] - def.speedRange[0]),
            speed: 0,
            hp: def.hp,
            maxHp: def.hp,
            baseMaxHp: def.hp,
            immuneAttrs: [],
            scale: 1,
            baseScale: 1,
            resistAbsorbStacks: 0,
            barColor: def.barColor,
            score: def.score,
            w: 202,
            bobOffset: Math.random() * Math.PI * 2,
            animFrame: Math.floor(Math.random() * specDef.frames),
            lastFrameTime: Date.now(),
            facingLeft: false,
            deathTime: 0,
            knockbackVX: 0,
            knockbackVY: 0,
            flashEnd: 0,
            hitPauseUntil: 0,
            absorbFeedbackStart: 0,
            absorbFeedbackColor: null,
            absorbFromWidth: 0,
            spawnTime: Date.now(),
            spawnAngle: angle,
            arcDirection: Math.random() < 0.5 ? -1 : 1,
            groupPattern: groupMeta?.groupPattern || 'cluster',
            groupAnchorAngle: groupMeta?.groupAnchorAngle ?? angle,
            groupIndex: groupMeta?.groupIndex ?? 0,
            groupCount: groupMeta?.groupCount ?? 1,
            movePattern: 'direct'
        };

        applyMonsterProfile(monster);
        monsters.push(monster);
    }

    // ---- Game loop ----
    function start() {
        canvas.width = CANVAS_W;
        canvas.height = CANVAS_H;

        loadSpellVideos();

        player.x = 0;
        player.y = 0;
        player.hp = CONFIG.playerHP;
        monsters = [];
        energy = 0; killCount = 0; score = 0;
        activeEffects = []; floatingTexts = [];
        particles = []; afterimages = []; lightningBolts = [];
        hitstopEnd = 0;
        shake = { intensity: 0, duration: 0, startTime: 0 };
        damageFlash = { alpha: 0, time: 0 };
        isPaused = false;
        isDashing = false;
        activeSpellIndex = 0;
        spellCharges = [CONFIG.spellMaxCharges, CONFIG.spellMaxCharges, CONFIG.spellMaxCharges, CONFIG.spellMaxCharges];
        spellLastChargeTime = [0, 0, 0, 0];
        waveNumber = 0;
        waveState = 'pause';
        wavePauseStart = Date.now();
        battleStartTime = Date.now();
        gameTime = 0;
        lastGroupSpawn = 0;
        lastTrickle = 0;
        lastBossWave = 0;
        spawnQueue = [];
        lastAmuletDamageTick = 0;
        running = true;

        // Start amulet aura video
        if (amuletVideo) {
            amuletVideo.currentTime = 0;
            amuletVideo.play().catch(() => {});
        }

        updateBars();
        updateScoreDisplay();
        document.getElementById('victory-overlay').style.display = 'none';
        document.getElementById('defeat-overlay').style.display = 'none';

        forgeCheckTimer = setInterval(checkForgeStatus, 5000);
        gameLoop();
    }

    function stop() {
        running = false;
        if (animFrameId) cancelAnimationFrame(animFrameId);
        if (forgeCheckTimer) clearInterval(forgeCheckTimer);
        if (amuletVideo) amuletVideo.pause();
    }

    function gameLoop() {
        if (!running) return;
        if (isPaused) {
            draw();
            animFrameId = requestAnimationFrame(gameLoop);
            return;
        }
        if (Date.now() < hitstopEnd) {
            draw();
        } else {
            update();
            draw();
        }
        animFrameId = requestAnimationFrame(gameLoop);
    }

    function update() {
        const now = Date.now();

        rechargeSpells(now);

        // VS-style continuous spawning
        gameTime = (now - battleStartTime) / 1000;

        if (checkWinCondition()) return;

        // Countdown timer → defeat if time runs out
        const remaining = CONFIG.battleDuration - gameTime;
        if (remaining <= 0) { onDefeat('time_out'); return; }

        if (waveState === 'pause' && now - wavePauseStart > CONFIG.wavePause) {
            startNextWave();
        }

        if (waveState === 'fighting') {
            vsSpawnTick(now);

            // Wave transitions: announce new wave every ~30s of game time
            const expectedWave = 1 + Math.floor(gameTime / 30);
            if (expectedWave > waveNumber) {
                waveNumber = expectedWave;
                announceWave(waveNumber);
                updateWaveDisplay();

                // Bonus burst on wave transition
                const speciesList = Object.keys(MOB_SPECIES);
                const s = speciesList[Math.floor(Math.random() * speciesList.length)];
                spawnHordeGroup(s, Math.min(20, 8 + waveNumber * 2), 'minion');
            }
        }

        // Dash (ease-out: fast start, decelerate)
        if (isDashing) {
            const dashAge = now - dashStart;
            if (dashAge < CONFIG.dashDuration) {
                const t = dashAge / CONFIG.dashDuration;
                const easedSpeed = CONFIG.dashSpeed * (1 - t * t);
                player.x += dashDir.x * easedSpeed;
                player.y += dashDir.y * easedSpeed;
                if (now - lastAfterimageTime > 18) {
                    afterimages.push({
                        x: player.x, y: player.y,
                        alpha: 0.9 * (1 - t),
                        scale: 1.0 + t * 0.15,
                        time: now
                    });
                    lastAfterimageTime = now;
                }
            } else {
                isDashing = false;
            }
        } else {
            if (keys['KeyW'] || keys['ArrowUp']) player.y -= CONFIG.playerSpeed;
            if (keys['KeyS'] || keys['ArrowDown']) player.y += CONFIG.playerSpeed;
            if (keys['KeyA'] || keys['ArrowLeft']) player.x -= CONFIG.playerSpeed;
            if (keys['KeyD'] || keys['ArrowRight']) player.x += CONFIG.playerSpeed;
        }
        // Update camera to center on player
        camera.x = player.x - CANVAS_W / 2;
        camera.y = player.y - CANVAS_H / 2;

        updatePlayerAnim(now);

        // Effect damage with feedback (delayed to let animation play)
        activeEffects.forEach(eff => {
            const age = now - eff.startTime;
            if (!eff.damageApplied && age > 400 && age < 1200) {
                eff.damageApplied = true;
                const half = eff.size / 2;
                let hitCount = 0;
                monsters.forEach(m => {
                    if (m.isDying) return;
                    if (Math.abs(m.x - eff.x) < half && Math.abs(m.y - eff.y) < half) {
                        const effectDamage = getEffectDamageAtTarget(eff, m);
                        const hitResult = Combat.calcHitResult(
                            eff.spellData || { mainAttr: eff.mainAttr, baseAtk: null },
                            { immuneAttrs: m.immuneAttrs || [] },
                            effectDamage
                        );
                        if (hitResult.absorbed) {
                            applyResistanceAbsorb(
                                m,
                                hitResult,
                                now,
                                eff.mainAttr ? SpellDefs.getElementColor(eff.mainAttr) : '#999999'
                            );
                            return;
                        }
                        if (hitResult.damage <= 0) return;

                        m.hp -= hitResult.damage;
                        hitCount++;

                        const dx = m.x - eff.x;
                        const dy = m.y - eff.y;
                        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                        const kbForce = eff.isUltimate ? 24 : 14;
                        m.knockbackVX = (dx / dist) * kbForce;
                        m.knockbackVY = (dy / dist) * kbForce;

                        applyMonsterHitFeedback(m, now, eff.isUltimate);
                    }
                });
                if (hitCount > 0) {
                    triggerHitstop(eff.isUltimate ? 18 : 15);
                    triggerShake(eff.isUltimate ? 12 : 10, eff.isUltimate ? 200 : 180);
                }
            }
        });

        // Monster movement & collision
        for (let i = monsters.length - 1; i >= 0; i--) {
            const m = monsters[i];

            if (m.hp <= 0 && !m.isDying) {
                m.isDying = true;
                m.deathStart = now;
                m.hitPauseUntil = 0;
                m.absorbFeedbackStart = 0;
            }

            if (m.isDying) {
                if (now - m.deathStart > MONSTER_DEATH_FADE_MS) {
                    floatingTexts.push({
                        x: m.x, y: m.y - 40,
                        text: `+${m.score}`,
                        color: '#ffd54f',
                        startTime: now
                    });
                    score += m.score;
                    killCount++;
                    energy = Math.min(100, killCount * CONFIG.energyPerKill);
                    updateBars();
                    updateScoreDisplay();
                    checkWinCondition();
                    monsters.splice(i, 1);
                }
                continue;
            }

            const absorbAnimating = !!m.absorbFeedbackStart && now - m.absorbFeedbackStart < MONSTER_ABSORB_FEEDBACK_MS;
            const isHitPaused = now < (Number(m.hitPauseUntil) || 0);

            // Apply knockback
            if (!isHitPaused && (Math.abs(m.knockbackVX) > 0.1 || Math.abs(m.knockbackVY) > 0.1)) {
                m.x += m.knockbackVX;
                m.y += m.knockbackVY;
                m.knockbackVX *= 0.85;
                m.knockbackVY *= 0.85;
            }

            const dx = player.x - m.x;
            const dy = player.y - m.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (!isHitPaused && d > 0) {
                const velocity = getMonsterVelocity(m, dx, dy, d, now);
                m.x += velocity.vx;
                m.y += velocity.vy;
                m.facingLeft = dx < 0;
            }

            // Animate sprite frames
            if (!isHitPaused && !absorbAnimating && now - m.lastFrameTime >= ANIM_FRAME_MS_MOB) {
                const spec = MOB_SPECIES[m.species];
                m.animFrame = (m.animFrame + 1) % spec.frames;
                m.lastFrameTime = now;
            }

            if (d < getMonsterContactRadius(m) && !isDashing) {
                player.hp -= 0.015;
                damageFlash.alpha = Math.min(1, damageFlash.alpha + 0.15);
                damageFlash.time = now;
                if (Math.random() < 0.05) triggerShake(3, 80);
            }
        }

        // Monster-to-monster soft separation (prevents total overlap)
        const sepRadius = 28;
        const sepForce = 0.6;
        const aliveMonsters = monsters.filter(m => !m.isDying);
        const sepLen = aliveMonsters.length;
        for (let i = 0; i < sepLen; i++) {
            const a = aliveMonsters[i];
            for (let j = i + 1; j < sepLen; j++) {
                const b = aliveMonsters[j];
                const sdx = a.x - b.x;
                const sdy = a.y - b.y;
                if (Math.abs(sdx) > sepRadius || Math.abs(sdy) > sepRadius) continue;
                const sd2 = sdx * sdx + sdy * sdy;
                if (sd2 < sepRadius * sepRadius && sd2 > 0) {
                    const sd = Math.sqrt(sd2);
                    const push = (sepRadius - sd) * sepForce / sd;
                    a.x += sdx * push;
                    a.y += sdy * push;
                    b.x -= sdx * push;
                    b.y -= sdy * push;
                }
            }
        }

        // Amulet aura periodic damage
        if (now - lastAmuletDamageTick >= AMULET_TICK_MS) {
            lastAmuletDamageTick = now;
            const auraRadius = AMULET_SIZE * 1.5 * 0.45;
            monsters.forEach(m => {
                if (m.isDying) return;
                const dx = m.x - player.x;
                const dy = m.y - player.y;
                if (dx * dx + dy * dy < auraRadius * auraRadius) {
                    m.hp -= AMULET_DAMAGE;
                    m.flashEnd = now + 120;
                }
            });
        }

        // Cleanup effects
        activeEffects = activeEffects.filter(e => {
            const age = now - e.startTime;
            const dur = e.video ? (e.video.duration * 1000 || 3000) : 1500;
            return age < dur + 200;
        });

        // Cleanup lightning bolts
        lightningBolts = lightningBolts.filter(b => now - b.startTime < b.travelTime + 150);

        // Cleanup floating texts
        floatingTexts = floatingTexts.filter(t => now - t.startTime < 1000);

        // Update particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.94;
            p.vy *= 0.94;
            p.vy += 0.1;
            p.life--;
            p.size *= 0.97;
            if (p.life <= 0) particles.splice(i, 1);
        }

        // Update afterimages (fast initial fade then slow tail)
        for (let i = afterimages.length - 1; i >= 0; i--) {
            afterimages[i].alpha *= 0.88;
            if (afterimages[i].alpha < 0.02) afterimages.splice(i, 1);
        }

        // Decay damage flash
        if (damageFlash.alpha > 0) damageFlash.alpha *= 0.92;
        if (damageFlash.alpha < 0.01) damageFlash.alpha = 0;

        if (player.hp <= 0) { player.hp = 0; updateBars(); onDefeat('hp_out'); return; }
    }

    // ---- Background helpers ----
    function mod(a, n) { return ((a % n) + n) % n; }

    function seededRandom(seed) {
        let s = Math.abs(seed) || 1;
        return function() {
            s = (s * 16807) % 2147483647;
            return s / 2147483647;
        };
    }

    function drawTiledLayer(img, offsetX, offsetY) {
        if (!img || !img.complete || !img.naturalWidth) return;
        const tw = img.naturalWidth, th = img.naturalHeight;
        const startX = -mod(offsetX, tw);
        const startY = -mod(offsetY, th);
        for (let x = startX; x < CANVAS_W; x += tw) {
            for (let y = startY; y < CANVAS_H; y += th) {
                ctx.drawImage(img, x, y);
            }
        }
    }

    function drawSkullChunks() {
        const skull1 = bgAssets.skull1, skull2 = bgAssets.skull2;
        if (!skull1 || !skull1.complete || !skull2 || !skull2.complete) return;
        const skulls = [skull1, skull2];

        const chunkStartX = Math.floor(camera.x / BG_TILE_W) - 1;
        const chunkStartY = Math.floor(camera.y / BG_TILE_H) - 1;
        const chunkEndX = chunkStartX + Math.ceil(CANVAS_W / BG_TILE_W) + 2;
        const chunkEndY = chunkStartY + Math.ceil(CANVAS_H / BG_TILE_H) + 2;

        for (let cx = chunkStartX; cx <= chunkEndX; cx++) {
            for (let cy = chunkStartY; cy <= chunkEndY; cy++) {
                const seed = (cx * 73856093) ^ (cy * 19349663);
                const rng = seededRandom(seed);
                const count = Math.floor(rng() * 3);
                for (let i = 0; i < count; i++) {
                    const skullImg = skulls[Math.floor(rng() * 2)];
                    const lx = rng() * BG_TILE_W;
                    const ly = rng() * BG_TILE_H;
                    const flipX = rng() > 0.5;
                    rng(); // consume to keep seed alignment
                    const alpha = 0.6 + rng() * 0.4;

                    const worldX = cx * BG_TILE_W + lx;
                    const worldY = cy * BG_TILE_H + ly;
                    const skullScale = 0.6;
                    const drawW = skullImg.naturalWidth * skullScale;
                    const drawH = skullImg.naturalHeight * skullScale;
                    const sx = worldX - camera.x - drawW / 2;
                    const sy = worldY - camera.y - drawH / 2;

                    if (sx > CANVAS_W + 200 || sy > CANVAS_H + 200 ||
                        sx < -drawW - 200 || sy < -drawH - 200) continue;

                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.translate(sx + drawW / 2, sy + drawH / 2);
                    ctx.scale(flipX ? -1 : 1, 1);
                    ctx.drawImage(skullImg, -drawW / 2, -drawH / 2, drawW, drawH);
                    ctx.restore();
                }
            }
        }
    }

    function drawLightOrbs(now) {
        const light1 = bgAssets.light1, light2 = bgAssets.light2;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        if (light1 && light1.complete && light1.naturalWidth) {
            const alpha1 = 0.41 + 0.15 * Math.sin(now * 0.0008);
            ctx.globalAlpha = alpha1;
            drawTiledLayer(light1, camera.x * 0.6, camera.y * 0.6);
        }
        if (light2 && light2.complete && light2.naturalWidth) {
            const alpha2 = 0.31 + 0.15 * Math.sin(now * 0.0006 + 1.5);
            ctx.globalAlpha = alpha2;
            drawTiledLayer(light2, camera.x * 0.45, camera.y * 0.45);
        }

        ctx.restore();
    }

    let vignetteCache = null;
    function drawVignette() {
        if (!vignetteCache) {
            vignetteCache = document.createElement('canvas');
            vignetteCache.width = CANVAS_W;
            vignetteCache.height = CANVAS_H;
            const vctx = vignetteCache.getContext('2d');
            const cx = CANVAS_W / 2, cy = CANVAS_H / 2;
            const maxR = Math.max(CANVAS_W, CANVAS_H);
            const grad = vctx.createRadialGradient(cx, cy, maxR * 0.3, cx, cy, maxR);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, 'rgba(0,0,0,0.55)');
            vctx.fillStyle = grad;
            vctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        }
        ctx.drawImage(vignetteCache, 0, 0);
    }

    function drawDamageFlash(now) {
        const a = damageFlash.alpha;
        const age = now - damageFlash.time;

        // Full-screen red flash (instant, fast decay)
        if (age < 150) {
            ctx.save();
            ctx.globalAlpha = a * 0.075 * (1 - age / 150);
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
            ctx.restore();
        }

        // Red edge vignette
        ctx.save();
        ctx.globalAlpha = a * 0.8;
        const cx = CANVAS_W / 2, cy = CANVAS_H / 2;
        const maxR = Math.max(CANVAS_W, CANVAS_H) * 0.7;
        const grad = ctx.createRadialGradient(cx, cy, maxR * 0.4, cx, cy, maxR);
        grad.addColorStop(0, 'rgba(180,0,0,0)');
        grad.addColorStop(0.6, 'rgba(120,0,0,0.3)');
        grad.addColorStop(1, 'rgba(80,0,0,0.9)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.restore();

        // Blood screen overlay (black-bg PNG, lighten blend)
        if (bgAssets.bloodScreen && bgAssets.bloodScreen.complete && bgAssets.bloodScreen.naturalWidth) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighten';
            ctx.globalAlpha = a * 0.8;
            ctx.drawImage(bgAssets.bloodScreen, 0, 0, CANVAS_W, CANVAS_H);
            ctx.restore();
        }
    }

    // World-to-screen coordinate conversion
    function w2sx(wx) { return wx - camera.x; }
    function w2sy(wy) { return wy - camera.y; }

    // ---- Drawing ----
    function draw() {
        const now = Date.now();
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

        // Screen shake offset
        let shakeX = 0, shakeY = 0;
        if (shake.intensity > 0) {
            const elapsed = now - shake.startTime;
            if (elapsed < shake.duration) {
                const remaining = 1 - elapsed / shake.duration;
                shakeX = (Math.random() - 0.5) * shake.intensity * remaining * 2;
                shakeY = (Math.random() - 0.5) * shake.intensity * remaining * 2;
            } else {
                shake.intensity = 0;
            }
        }
        ctx.save();
        ctx.translate(shakeX, shakeY);

        // Layer 1: Ground tile (seamless, 1:1 camera scroll) with brightness/saturation
        if (bgAssets.ground && bgAssets.ground.complete && bgAssets.ground.naturalWidth) {
            if (CONFIG.groundSaturation !== 1) {
                ctx.save();
                ctx.filter = `saturate(${CONFIG.groundSaturation})`;
                drawTiledLayer(bgAssets.ground, camera.x, camera.y);
                ctx.restore();
            } else {
                drawTiledLayer(bgAssets.ground, camera.x, camera.y);
            }
            if (CONFIG.groundBrightness < 1) {
                ctx.save();
                ctx.globalAlpha = 1 - CONFIG.groundBrightness;
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
                ctx.restore();
            }
        } else {
            ctx.fillStyle = '#1a1510';
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        }

        // Layer 2: Skull decorations (chunk-based, seeded)
        drawSkullChunks();

        // Layer 3: Light orbs (parallax + breathing)
        drawLightOrbs(now);

        // Layer 4a: Effect bottom layer (processFrame + lighten)
        let lastProcessedVideo = null;
        activeEffects.forEach(eff => {
            if (eff.video && eff.video.readyState >= 2 && !eff.video.ended) {
                const alpha = effectAlpha(eff, now);
                if (alpha <= 0) return;
                if (eff.video !== lastProcessedVideo) {
                    processFrame(eff.video);
                    lastProcessedVideo = eff.video;
                }
                const ex = w2sx(eff.x), ey = w2sy(eff.y);
                const half = eff.size / 2;

                ctx.save();
                ctx.globalCompositeOperation = 'lighten';
                ctx.globalAlpha = alpha;
                ctx.drawImage(procCanvas, ex - half, ey - half, eff.size, eff.size);
                ctx.restore();
            } else if (!eff.video) {
                drawFallbackEffect(eff, now);
            }
        });

        // Layer 4a2: Amulet aura (always under player feet)
        drawAmuletAura();

        // Layer 4b: Sprites (Y-sorted): monsters + player
        const sprites = [];
        monsters.forEach(m => sprites.push({ type: 'monster', sortY: m.y, m }));
        sprites.push({ type: 'player', sortY: player.y });
        sprites.sort((a, b) => a.sortY - b.sortY);

        const playerImg = document.getElementById('img-player');
        sprites.forEach(obj => {
            if (obj.type === 'monster') drawMonster(obj.m, now);
            else drawPlayer(playerImg, now);
        });

        // Layer 4c: Effect top layer (gradient mask + lighten for 2.5D occlusion)
        let lastProcessedVideo2 = null;
        activeEffects.forEach(eff => {
            if (eff.video && eff.video.readyState >= 2 && !eff.video.ended) {
                const alpha = effectAlpha(eff, now);
                if (alpha <= 0) return;
                if (eff.video !== lastProcessedVideo2) {
                    processFrame(eff.video);
                    lastProcessedVideo2 = eff.video;
                }

                // Gradient mask: top 30% opaque → sharp transition → bottom 60% transparent
                maskCtx.clearRect(0, 0, EFFECT_SIZE, EFFECT_SIZE);
                maskCtx.save();
                maskCtx.drawImage(procCanvas, 0, 0, EFFECT_SIZE, EFFECT_SIZE);
                maskCtx.globalCompositeOperation = 'destination-in';
                const grad = maskCtx.createLinearGradient(0, 0, 0, EFFECT_SIZE);
                grad.addColorStop(0, 'rgba(0,0,0,1)');
                grad.addColorStop(0.3, 'rgba(0,0,0,0.7)');
                grad.addColorStop(0.45, 'rgba(0,0,0,0.15)');
                grad.addColorStop(0.55, 'rgba(0,0,0,0)');
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                maskCtx.fillStyle = grad;
                maskCtx.fillRect(0, 0, EFFECT_SIZE, EFFECT_SIZE);
                maskCtx.restore();

                const ex = w2sx(eff.x), ey = w2sy(eff.y);
                const half = eff.size / 2;

                ctx.save();
                ctx.globalCompositeOperation = 'lighten';
                ctx.globalAlpha = alpha;
                ctx.drawImage(maskCanvas, ex - half, ey - half, eff.size, eff.size);
                ctx.restore();
            }
        });

        // Particles (world coords)
        particles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 6;
            ctx.fillRect(w2sx(p.x) - p.size / 2, w2sy(p.y) - p.size / 2, p.size, p.size);
            ctx.restore();
        });

        // Lightning bolts
        lightningBolts.forEach(bolt => drawLightningBolt(bolt, now));

        // Floating score texts (world coords)
        floatingTexts.forEach(t => {
            const age = (now - t.startTime) / 1000;
            const alpha = Math.max(0, 1 - age);
            const yOff = age * 60;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = 'bold 56px "Consolas", "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = t.color;
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 4;
            ctx.fillText(t.text, w2sx(t.x), w2sy(t.y) - yOff);
            ctx.restore();
        });

        ctx.restore(); // End screen shake transform

        // Layer 5: Vignette (fixed on screen, after shake restore)
        drawVignette();

        // Layer 6: Damage flash screen
        if (damageFlash.alpha > 0) drawDamageFlash(now);

        // HUD (screen space, not affected by shake or camera)
        if (isPaused) {
            drawPauseOverlay();
        }
        drawCanvasHUD(now);
    }

    function drawAmuletAura() {
        if (!amuletVideo || amuletVideo.readyState < 2 || amuletVideo.paused) return;

        amuletProcCtx.clearRect(0, 0, AMULET_SIZE, AMULET_SIZE);
        amuletProcCtx.drawImage(amuletVideo, 0, 0, AMULET_SIZE, AMULET_SIZE);
        const frame = amuletProcCtx.getImageData(0, 0, AMULET_SIZE, AMULET_SIZE);
        const d = frame.data;
        for (let i = 0; i < d.length; i += 4) {
            const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
            if (avg < 40) d[i + 3] = avg < 10 ? 0 : d[i + 3] * ((avg - 10) / 30);
        }
        amuletProcCtx.putImageData(frame, 0, 0);

        const psx = w2sx(player.x), psy = w2sy(player.y);
        const vNatH = amuletVideo.videoHeight || amuletVideo.height || AMULET_SIZE;
        const alignRatio = 390 / vNatH;
        const drawSize = AMULET_SIZE * 1.5;
        const moveOffset = (playerAnim.state === 'run' || isDashing) ? 40 : 0;
        const baseY = psy - alignRatio * AMULET_SIZE - 70 - moveOffset;
        const drawY = baseY - (drawSize - AMULET_SIZE) * (alignRatio);
        const drawX = psx - drawSize / 2;

        ctx.save();
        ctx.globalCompositeOperation = 'lighten';
        ctx.globalAlpha = 0.95;
        ctx.drawImage(amuletProcCanvas, drawX, drawY, drawSize, drawSize);
        ctx.restore();
    }

    function processFrame(v) {
        procCtx.clearRect(0, 0, EFFECT_SIZE, EFFECT_SIZE);
        procCtx.drawImage(v, 0, 0, EFFECT_SIZE, EFFECT_SIZE);
        const frame = procCtx.getImageData(0, 0, EFFECT_SIZE, EFFECT_SIZE);
        const d = frame.data;
        for (let i = 0; i < d.length; i += 4) {
            const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
            if (avg < 40) d[i + 3] = avg < 10 ? 0 : d[i + 3] * ((avg - 10) / 30);
        }
        procCtx.putImageData(frame, 0, 0);
    }

    function effectAlpha(eff, now) {
        const age = now - eff.startTime;
        const dur = eff.video ? (eff.video.duration * 1000 || 3000) : 1500;
        const fadeOut = dur - 800;
        return Math.min(Math.min(1, age / 200), Math.max(0, 1 - (age - fadeOut) / 800));
    }

    function drawFallbackEffect(eff, now) {
        const age = now - eff.startTime;
        const alpha = effectAlpha(eff, now);
        const radius = eff.size / 2 * (0.6 + 0.4 * Math.min(1, age / 200));
        const sx = w2sx(eff.x), sy = w2sy(eff.y);
        ctx.save();
        ctx.globalAlpha = alpha * 0.7;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
        grad.addColorStop(0, eff.color);
        grad.addColorStop(0.4, eff.glowColor);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // ---- Lightning bolt system ----
    function generateLightning(x1, y1, x2, y2, displace, minSeg) {
        const dx = x2 - x1, dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minSeg || displace < 4) return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
        const perpX = -dy / dist, perpY = dx / dist;
        const offset = (Math.random() - 0.5) * displace;
        const midX = (x1 + x2) / 2 + perpX * offset;
        const midY = (y1 + y2) / 2 + perpY * offset;
        const left = generateLightning(x1, y1, midX, midY, displace * 0.55, minSeg);
        const right = generateLightning(midX, midY, x2, y2, displace * 0.55, minSeg);
        return [...left.slice(0, -1), ...right];
    }

    function drawLightningPath(points, lineWidth, color, alpha) {
        if (points.length < 2) return;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = color;
        ctx.shadowBlur = lineWidth * 3;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();
        ctx.restore();
    }

    function drawLightningBolt(bolt, now) {
        const age = now - bolt.startTime;
        const progress = Math.min(1, age / bolt.travelTime);
        const fadeAlpha = age > bolt.travelTime ? Math.max(0, 1 - (age - bolt.travelTime) / 100) : 1;
        if (fadeAlpha <= 0) return;

        const sx = w2sx(bolt.fromX), sy = w2sy(bolt.fromY);
        const tx = w2sx(bolt.toX), ty = w2sy(bolt.toY);
        const ex = sx + (tx - sx) * progress;
        const ey = sy + (ty - sy) * progress;

        const dist = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2);
        const displace = dist * 0.3;

        // Draw 2 overlapping main bolts for a thicker, more chaotic look
        for (let m = 0; m < 2; m++) {
            const mainPath = generateLightning(sx, sy, ex, ey, displace, 10);

            // Ambient glow (wide, soft)
            drawLightningPath(mainPath, 20, bolt.color, fadeAlpha * 0.08);
            // Outer glow
            drawLightningPath(mainPath, 10, bolt.color, fadeAlpha * 0.2);
            // Core color
            drawLightningPath(mainPath, 4, bolt.color, fadeAlpha * 0.6);
            // Bright center
            drawLightningPath(mainPath, 2, '#e0ccff', fadeAlpha * 0.9);

            // Branches from this main bolt
            const branchCount = Math.floor(mainPath.length / 3);
            for (let b = 0; b < branchCount; b++) {
                const idx = Math.floor(Math.random() * (mainPath.length - 2)) + 1;
                const pt = mainPath[idx];
                const bLen = 30 + Math.random() * 60;
                const bAngle = Math.atan2(ey - sy, ex - sx) + (Math.random() - 0.5) * 2.5;
                const bEndX = pt.x + Math.cos(bAngle) * bLen;
                const bEndY = pt.y + Math.sin(bAngle) * bLen;
                const branchPath = generateLightning(pt.x, pt.y, bEndX, bEndY, bLen * 0.5, 6);
                drawLightningPath(branchPath, 3, bolt.color, fadeAlpha * 0.15);
                drawLightningPath(branchPath, 1, '#e0ccff', fadeAlpha * 0.35);
            }
        }

        // Origin flash at crystal ball
        ctx.save();
        ctx.globalAlpha = fadeAlpha * 0.6;
        const origGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 25);
        origGrad.addColorStop(0, '#fff');
        origGrad.addColorStop(0.3, bolt.color);
        origGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = origGrad;
        ctx.beginPath();
        ctx.arc(sx, sy, 25, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Impact flash at leading edge
        if (progress > 0.1) {
            ctx.save();
            ctx.globalAlpha = fadeAlpha * 0.6;
            const impactR = 45;
            const grad = ctx.createRadialGradient(ex, ey, 0, ex, ey, impactR);
            grad.addColorStop(0, '#fff');
            grad.addColorStop(0.3, bolt.color);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(ex, ey, impactR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // ---- Silhouette shadow system ----
    const shadowCanvas = document.createElement('canvas');
    const shadowCtx = shadowCanvas.getContext('2d', { willReadFrequently: true });
    const SHADOW_SQUASH = 0.3;
    const SHADOW_ALPHA = 0.9;

    // Cache: lowest opaque pixel row per image src to avoid scanning every frame
    const bottomEdgeCache = new Map();

    function findBottomOpaqueRow(canvasEl, w, h) {
        const data = shadowCtx.getImageData(0, 0, w, h).data;
        for (let row = h - 1; row >= 0; row--) {
            for (let col = 0; col < w; col++) {
                if (data[(row * w + col) * 4 + 3] > 10) return row;
            }
        }
        return h - 1;
    }

    function drawSilhouetteShadow(img, sx, sy, w, bob, facingLeft, yOffsetRatio) {
        if (!img || !img.complete || !img.naturalWidth) return;
        const ratio = img.naturalHeight / img.naturalWidth;
        const drawW = w;
        const drawH = w * ratio;

        const sw = Math.ceil(drawW);
        const sh = Math.ceil(drawH);
        if (sw < 1 || sh < 1) return;
        shadowCanvas.width = sw;
        shadowCanvas.height = sh;

        // Draw sprite (unflipped for consistent bottom-edge detection)
        shadowCtx.clearRect(0, 0, sw, sh);
        shadowCtx.drawImage(img, 0, 0, sw, sh);

        // Find actual bottom edge of opaque pixels (cached per image src)
        const cacheKey = img.src + '|' + sw + '|' + sh;
        let bottomRow = bottomEdgeCache.get(cacheKey);
        if (bottomRow === undefined) {
            bottomRow = findBottomOpaqueRow(shadowCanvas, sw, sh);
            bottomEdgeCache.set(cacheKey, bottomRow);
        }

        // Redraw with flip if needed, then make silhouette
        if (facingLeft) {
            shadowCtx.clearRect(0, 0, sw, sh);
            shadowCtx.save();
            shadowCtx.translate(sw, 0);
            shadowCtx.scale(-1, 1);
            shadowCtx.drawImage(img, 0, 0, sw, sh);
            shadowCtx.restore();
        }

        // Fill black using source-atop
        shadowCtx.save();
        shadowCtx.globalCompositeOperation = 'source-atop';
        shadowCtx.fillStyle = '#000';
        shadowCtx.fillRect(0, 0, sw, sh);
        shadowCtx.restore();

        // Position: align shadow top with sprite's actual feet + offset
        const feetY = sy + bob - drawH * (1 - bottomRow / sh);
        const shadowH = sh * SHADOW_SQUASH;
        const yOffset = shadowH * (yOffsetRatio || 0);

        // Draw vertically flipped (reflection style)
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = SHADOW_ALPHA;
        ctx.translate(sx - sw / 2, feetY + yOffset);
        ctx.scale(1, -1);
        ctx.drawImage(shadowCanvas, 0, 0, sw, shadowH);
        ctx.restore();
    }

    function getMonsterFrame(m, frameIdx) {
        const frames = mobFrames[m.species];
        if (!frames || frames.length === 0) return null;
        const idx = Math.min(frameIdx != null ? frameIdx : m.animFrame, frames.length - 1);
        const img = frames[idx];
        return (img && img.complete && img.naturalWidth > 0) ? img : null;
    }

    function drawMonsterSprite(img, sx, sy, w, bob, facingLeft, filter) {
        const ratio = img.naturalHeight / img.naturalWidth;
        const drawW = w;
        const drawH = w * ratio;
        ctx.save();
        if (filter) ctx.filter = filter;
        if (facingLeft) {
            ctx.translate(sx, sy - drawH + bob);
            ctx.scale(-1, 1);
            ctx.drawImage(img, -drawW / 2, 0, drawW, drawH);
        } else {
            ctx.drawImage(img, sx - drawW / 2, sy - drawH + bob, drawW, drawH);
        }
        ctx.restore();
    }

    function drawMonsterSpriteTopSegment(img, sx, sy, w, bob, facingLeft, filter, visibleRatio, yLift) {
        const clippedRatio = clamp01(visibleRatio);
        if (clippedRatio <= 0) return;

        const ratio = img.naturalHeight / img.naturalWidth;
        const drawW = w;
        const drawH = w * ratio;
        const clippedH = drawH * clippedRatio;
        if (clippedH <= 0.5) return;

        const srcH = img.naturalHeight * clippedRatio;
        const topY = sy - drawH + bob - (yLift || 0);

        ctx.save();
        if (filter) ctx.filter = filter;
        if (facingLeft) {
            ctx.translate(sx, topY);
            ctx.scale(-1, 1);
            ctx.drawImage(img, 0, 0, img.naturalWidth, srcH, -drawW / 2, 0, drawW, clippedH);
        } else {
            ctx.drawImage(img, 0, 0, img.naturalWidth, srcH, sx - drawW / 2, topY, drawW, clippedH);
        }
        ctx.restore();
    }

    function drawImpactRing(x, y, radius, color, alpha, lineWidth) {
        if (alpha <= 0 || radius <= 0) return;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function drawMonster(m, now) {
        const baseBob = Math.sin(now * 0.004 + m.bobOffset) * 3;
        const isFlashing = now < m.flashEnd;
        const isDying = m.isDying;
        const sx = w2sx(m.x), sy = w2sy(m.y);

        const specDef = MOB_SPECIES[m.species];
        const facing = specDef && specDef.flipDefault ? !m.facingLeft : m.facingLeft;

        // Use middle frame for flash/death effects so they look stable
        const flashFrame = Math.floor((specDef?.frames || 1) / 2);
        const absorbFeedback = getMonsterAbsorbFeedback(m, now);
        const isTemporarilyStill = isDying || !!absorbFeedback || now < (Number(m.hitPauseUntil) || 0);
        const bob = isTemporarilyStill ? 0 : baseBob;
        const renderWidth = absorbFeedback ? absorbFeedback.width : m.w;

        if (isDying) {
            const deathProgress = Math.min(1, (now - m.deathStart) / MONSTER_DEATH_FADE_MS);
            const img = getMonsterFrame(m, flashFrame);
            if (!img) return;
            const yLift = deathProgress * 18;
            const fadeFilter = 'saturate(0.72) brightness(1.04)';

            ctx.save();
            ctx.globalAlpha = 0.18 * (1 - deathProgress);
            drawMonsterSprite(img, sx, sy, m.w, -yLift * 0.35, facing, fadeFilter);
            ctx.restore();

            ctx.save();
            ctx.globalAlpha = Math.max(0, 1 - deathProgress * 0.72);
            drawMonsterSpriteTopSegment(img, sx, sy, m.w, 0, facing, fadeFilter, 1 - deathProgress, yLift);
            ctx.restore();
            return;
        }

        // Silhouette shadow
        const useStableFrame = isFlashing || !!absorbFeedback || now < (Number(m.hitPauseUntil) || 0);
        const shadowImg = useStableFrame ? getMonsterFrame(m, flashFrame) : getMonsterFrame(m);
        if (shadowImg) drawSilhouetteShadow(shadowImg, sx, sy, renderWidth, bob, facing, 0.25);

        const img = useStableFrame ? getMonsterFrame(m, flashFrame) : getMonsterFrame(m);
        if (img) {
            if (absorbFeedback && absorbFeedback.ringAlpha > 0) {
                const ratio = img.naturalHeight / img.naturalWidth;
                const centerY = sy - renderWidth * ratio * 0.56;
                drawImpactRing(
                    sx,
                    centerY,
                    absorbFeedback.ringRadius,
                    absorbFeedback.color,
                    absorbFeedback.ringAlpha,
                    Math.max(2, renderWidth * 0.028)
                );
            }

            if (absorbFeedback) {
                const glowFilter = `brightness(${(1.04 + absorbFeedback.glow * 0.12).toFixed(3)}) saturate(${(1.04 + absorbFeedback.glow * 0.18).toFixed(3)})`;
                drawMonsterSprite(img, sx, sy, renderWidth, bob, facing, glowFilter);
            } else {
                drawMonsterSprite(img, sx, sy, renderWidth, bob, facing, null);
            }

            if (isFlashing) {
                const flashAlpha = Math.max(0, Math.min(0.24, ((m.flashEnd - now) / MONSTER_HIT_FLASH_MS) * 0.24));
                if (flashAlpha > 0) {
                    ctx.save();
                    ctx.globalAlpha = flashAlpha;
                    drawMonsterSprite(img, sx, sy, renderWidth, bob, facing, 'brightness(1.8) saturate(0.8)');
                    ctx.restore();
                }
            }
        } else {
            ctx.fillStyle = isFlashing ? '#f33' : '#a33';
            ctx.fillRect(sx - 20, sy - 40 + bob, 40, 40);
        }

        if (m.hp < m.maxHp && !isDying) {
            const barW = renderWidth * 0.8;
            const barH = 5;
            const barX = sx - barW / 2;
            const barY = sy - renderWidth * 0.8 - 10 + bob;

            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
            ctx.fillStyle = m.barColor;
            ctx.fillRect(barX, barY, barW * (m.hp / m.maxHp), barH);
        }
    }

    function drawPlayer(imgEl, now) {
        const frames = getFramesForState();
        const frameIdx = Math.min(playerAnim.frame, frames.length - 1);
        const currentFrame = frames[frameIdx];
        const needsFlip = !!MIRROR_MAP[playerAnim.dir];

        afterimages.forEach(ai => {
            if (!currentFrame || !currentFrame.complete || !currentFrame.naturalWidth) return;
            const asx = w2sx(ai.x), asy = w2sy(ai.y);
            const ratio = currentFrame.naturalHeight / currentFrame.naturalWidth;
            const aiScale = ai.scale || 1.0;
            const dw = player.w * aiScale;
            const dh = dw * ratio;

            // Layer 1: Purple silhouette (source-atop trick via shadow canvas)
            const sw = Math.ceil(dw), sh = Math.ceil(dh);
            if (sw > 0 && sh > 0) {
                shadowCanvas.width = sw;
                shadowCanvas.height = sh;
                shadowCtx.clearRect(0, 0, sw, sh);
                if (needsFlip) {
                    shadowCtx.save();
                    shadowCtx.translate(sw, 0);
                    shadowCtx.scale(-1, 1);
                    shadowCtx.drawImage(currentFrame, 0, 0, sw, sh);
                    shadowCtx.restore();
                } else {
                    shadowCtx.drawImage(currentFrame, 0, 0, sw, sh);
                }
                shadowCtx.save();
                shadowCtx.globalCompositeOperation = 'source-atop';
                shadowCtx.fillStyle = '#9944ff';
                shadowCtx.fillRect(0, 0, sw, sh);
                shadowCtx.restore();

                // Draw purple silhouette with additive glow
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = ai.alpha * 0.7;
                ctx.drawImage(shadowCanvas, asx - dw / 2, asy - dh, dw, dh);
                ctx.restore();
            }

            // Layer 2: Faded original sprite on top for depth
            ctx.save();
            ctx.globalAlpha = ai.alpha * 0.3;
            if (needsFlip) {
                ctx.translate(asx, asy - dh);
                ctx.scale(-1, 1);
                ctx.drawImage(currentFrame, -dw / 2, 0, dw, dh);
            } else {
                ctx.drawImage(currentFrame, asx - dw / 2, asy - dh, dw, dh);
            }
            ctx.restore();
        });

        const psx = w2sx(player.x), psy = w2sy(player.y);
        if (currentFrame && currentFrame.complete && currentFrame.naturalWidth) {
            drawSilhouetteShadow(currentFrame, psx, psy, player.w, 0, needsFlip, 0.50);
        }

        if (currentFrame && currentFrame.complete && currentFrame.naturalWidth) {
            const ratio = currentFrame.naturalHeight / currentFrame.naturalWidth;
            const dw = player.w;
            const dh = dw * ratio;

            // During dash: draw player with purple energy tint, alternating intensity
            if (isDashing) {
                const dashT = (now - dashStart) / CONFIG.dashDuration;
                const pulse = Math.sin(now * 0.04) * 0.5 + 0.5;

                // Purple aura glow behind player
                const sw2 = Math.ceil(dw * 1.1), sh2 = Math.ceil(dh * 1.1);
                shadowCanvas.width = sw2;
                shadowCanvas.height = sh2;
                shadowCtx.clearRect(0, 0, sw2, sh2);
                if (needsFlip) {
                    shadowCtx.save();
                    shadowCtx.translate(sw2, 0);
                    shadowCtx.scale(-1, 1);
                    shadowCtx.drawImage(currentFrame, 0, 0, sw2, sh2);
                    shadowCtx.restore();
                } else {
                    shadowCtx.drawImage(currentFrame, 0, 0, sw2, sh2);
                }
                shadowCtx.save();
                shadowCtx.globalCompositeOperation = 'source-atop';
                shadowCtx.fillStyle = '#7722dd';
                shadowCtx.fillRect(0, 0, sw2, sh2);
                shadowCtx.restore();

                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = (0.4 + pulse * 0.3) * (1 - dashT * 0.5);
                const auraW = dw * 1.1, auraH = dh * 1.1;
                ctx.drawImage(shadowCanvas, psx - auraW / 2, psy - auraH, auraW, auraH);
                ctx.restore();
            }

            // Normal player sprite
            if (needsFlip) {
                ctx.save();
                ctx.translate(psx, psy - dh);
                ctx.scale(-1, 1);
                ctx.drawImage(currentFrame, -dw / 2, 0, dw, dh);
                ctx.restore();
            } else {
                ctx.drawImage(currentFrame, psx - dw / 2, psy - dh, dw, dh);
            }

            // During dash: occasional purple flash frame
            if (isDashing && Math.sin(now * 0.035) > 0.3) {
                const dashT2 = (now - dashStart) / CONFIG.dashDuration;
                ctx.save();
                ctx.globalAlpha = 0.25 * (1 - dashT2);
                ctx.filter = 'brightness(1.8) saturate(2) hue-rotate(260deg)';
                if (needsFlip) {
                    ctx.translate(psx, psy - dh);
                    ctx.scale(-1, 1);
                    ctx.drawImage(currentFrame, -dw / 2, 0, dw, dh);
                } else {
                    ctx.drawImage(currentFrame, psx - dw / 2, psy - dh, dw, dh);
                }
                ctx.restore();
            }
        } else if (imgEl && imgEl.complete) {
            ctx.drawImage(imgEl, psx - player.w / 2, psy - player.h, player.w, player.h);
        } else {
            ctx.fillStyle = '#4a4';
            ctx.beginPath();
            ctx.arc(psx, psy - 30, 20, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ---- Canvas HUD ----
    function drawCanvasHUD(now) {
        ctx.save();
        const S = 2.4;
        const barW = Math.round(260 * S), barH = Math.round(18 * S), barR = Math.round(6 * S);
        const hudY = 30;

        // === Top-left: HP bar (no number text) ===
        const hpX = 40;
        const hpRatio = Math.max(0, player.hp / CONFIG.playerHP);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        roundRect(ctx, hpX, hudY, barW, barH, barR); ctx.fill();
        ctx.fillStyle = hpRatio > 0.3 ? '#cc2222' : '#ff4444';
        roundRect(ctx, hpX, hudY, barW * hpRatio, barH, barR); ctx.fill();
        if (damageFlash.alpha > 0.3) {
            ctx.save();
            ctx.globalAlpha = (damageFlash.alpha - 0.3) * 0.5;
            ctx.fillStyle = '#fff';
            roundRect(ctx, hpX, hudY, barW * hpRatio, barH, barR); ctx.fill();
            ctx.restore();
        }
        ctx.strokeStyle = 'rgba(180,140,100,0.35)';
        ctx.lineWidth = Math.round(1.5 * S);
        roundRect(ctx, hpX, hudY, barW, barH, barR); ctx.stroke();
        // HP label inside bar
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `bold ${Math.round(10 * S)}px "Consolas", monospace`;
        ctx.textAlign = 'left';
        ctx.fillText('HP', hpX + Math.round(8 * S), hudY + Math.round(13 * S));

        // === Top-center: Countdown timer ===
        const centerX = CANVAS_W / 2;
        const remaining = Math.max(0, CONFIG.battleDuration - gameTime);
        const tMin = Math.floor(remaining / 60);
        const tSec = Math.floor(remaining % 60);
        const timeStr = `${String(tMin).padStart(2, '0')}:${String(tSec).padStart(2, '0')}`;
        const urgent = remaining < 10;

        ctx.textAlign = 'center';
        ctx.font = `bold ${Math.round(36 * S)}px "Consolas", monospace`;
        ctx.fillStyle = urgent ? `rgba(255,${80 + Math.floor(Math.sin(now * 0.01) * 60)},60,0.95)` : 'rgba(220,210,190,0.85)';
        ctx.shadowColor = urgent ? 'rgba(255,0,0,0.5)' : 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = Math.round(6 * S);
        ctx.fillText(timeStr, centerX, Math.round(42 * S));
        ctx.shadowBlur = 0;

        ctx.font = `${Math.round(14 * S)}px "Consolas", monospace`;
        ctx.fillStyle = 'rgba(180,170,150,0.65)';
        ctx.fillText(`WAVE ${waveNumber}`, centerX, Math.round(42 * S) + Math.round(28 * S));

        // === Top-right: Soul bar (purple, symmetrical to HP) ===
        const soulX = CANVAS_W - 40 - barW;
        const soulRatio = Math.min(1, score / CONFIG.soulGoal);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        roundRect(ctx, soulX, hudY, barW, barH, barR); ctx.fill();
        const soulGrad = ctx.createLinearGradient(soulX, 0, soulX + barW, 0);
        soulGrad.addColorStop(0, '#6622aa');
        soulGrad.addColorStop(1, '#aa44ff');
        ctx.fillStyle = soulGrad;
        roundRect(ctx, soulX, hudY, barW * soulRatio, barH, barR); ctx.fill();
        if (soulRatio >= 1) {
            ctx.save();
            ctx.globalAlpha = 0.2 + Math.sin(now * 0.006) * 0.15;
            ctx.fillStyle = '#dd88ff';
            roundRect(ctx, soulX, hudY, barW, barH, barR); ctx.fill();
            ctx.restore();
        }
        ctx.strokeStyle = 'rgba(140,100,180,0.35)';
        ctx.lineWidth = Math.round(1.5 * S);
        roundRect(ctx, soulX, hudY, barW, barH, barR); ctx.stroke();
        // Soul label + count inside bar
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `bold ${Math.round(10 * S)}px "Consolas", monospace`;
        ctx.textAlign = 'right';
        ctx.fillText('SOUL', soulX + barW - Math.round(8 * S), hudY + Math.round(13 * S));
        ctx.textAlign = 'center';
        ctx.font = `bold ${Math.round(10 * S)}px "Consolas", monospace`;
        ctx.fillStyle = 'rgba(220,200,240,0.6)';
        ctx.fillText(`${score} / ${CONFIG.soulGoal}`, soulX + barW / 2, hudY + Math.round(13.5 * S));

        // === Bottom-center: Circular spell cooldown slots ===
        const slotR = Math.round(38 * S);
        const slotGap = Math.round(18 * S);
        const ringW = Math.round(5 * S);
        const ultSlotR = Math.round(34 * S);
        const totalW = 4 * slotR * 2 + 3 * slotGap + Math.round(30 * S) + ultSlotR * 2;
        const startX = (CANVAS_W - totalW) / 2 + slotR;
        const slotCY = CANVAS_H - slotR - Math.round(25 * S);

        for (let i = 0; i < 4; i++) {
            const cx = startX + i * (slotR * 2 + slotGap);
            const cy = slotCY;
            const isActive = i === activeSpellIndex;
            const charges = spellCharges[i];
            const empty = charges <= 0;

            ctx.beginPath();
            ctx.arc(cx, cy, slotR, 0, Math.PI * 2);
            ctx.fillStyle = isActive ? 'rgba(40,30,10,0.75)' : 'rgba(15,12,8,0.8)';
            ctx.fill();

            const thumbImg = spellThumbImgs[i];
            if (thumbImg && thumbImg.complete && thumbImg.naturalWidth) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(cx, cy, slotR - ringW, 0, Math.PI * 2);
                ctx.clip();
                const thumbSize = (slotR - ringW) * 2;
                ctx.globalAlpha = empty ? 0.3 : 0.85;
                ctx.drawImage(thumbImg, cx - thumbSize / 2, cy - thumbSize / 2, thumbSize, thumbSize);
                ctx.restore();
            } else {
                ctx.beginPath();
                ctx.arc(cx, cy, slotR * 0.5, 0, Math.PI * 2);
                ctx.fillStyle = empty ? 'rgba(60,60,60,0.5)' : CONFIG.spellColors[i];
                ctx.globalAlpha = empty ? 0.4 : 0.6;
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            ctx.lineWidth = ringW;
            if (charges < CONFIG.spellMaxCharges && spellLastChargeTime[i] > 0) {
                const elapsed = now - spellLastChargeTime[i];
                const ratio = Math.min(1, elapsed / CONFIG.spellChargeTime);
                ctx.beginPath();
                ctx.arc(cx, cy, slotR - ringW / 2, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(50,40,30,0.6)';
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(cx, cy, slotR - ringW / 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
                ctx.strokeStyle = CONFIG.spellColors[i];
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.arc(cx, cy, slotR - ringW / 2, 0, Math.PI * 2);
                ctx.strokeStyle = isActive ? CONFIG.spellColors[i] : 'rgba(100,90,70,0.4)';
                ctx.stroke();
            }

            if (isActive) {
                ctx.save();
                ctx.shadowColor = CONFIG.spellColors[i];
                ctx.shadowBlur = Math.round(10 * S);
                ctx.beginPath();
                ctx.arc(cx, cy, slotR - ringW / 2, 0, Math.PI * 2);
                ctx.strokeStyle = CONFIG.spellColors[i];
                ctx.lineWidth = Math.round(2 * S);
                ctx.stroke();
                ctx.restore();
            }

            // Charges dots only (no key label below)
            const dotY2 = cy + slotR + Math.round(10 * S);
            const dotSpacing = Math.round(10 * S);
            const dotsX = cx - (CONFIG.spellMaxCharges - 1) * dotSpacing / 2;
            for (let c = 0; c < CONFIG.spellMaxCharges; c++) {
                ctx.fillStyle = c < charges ? CONFIG.spellColors[i] : 'rgba(60,60,60,0.5)';
                ctx.beginPath();
                ctx.arc(dotsX + c * dotSpacing, dotY2, Math.round(3.5 * S), 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Ultimate slot [R]
        const engRatio = Math.min(1, energy / 100);
        const ultCx = startX + 3 * (slotR * 2 + slotGap) + slotR + Math.round(30 * S) + ultSlotR;
        const ultCy = slotCY;
        const ultReady = energy >= CONFIG.ultimateCost;

        ctx.beginPath();
        ctx.arc(ultCx, ultCy, ultSlotR, 0, Math.PI * 2);
        ctx.fillStyle = ultReady ? 'rgba(60,45,0,0.7)' : 'rgba(15,12,8,0.8)';
        ctx.fill();

        ctx.lineWidth = ringW;
        ctx.beginPath();
        ctx.arc(ultCx, ultCy, ultSlotR - ringW / 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(50,40,20,0.5)';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ultCx, ultCy, ultSlotR - ringW / 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * engRatio);
        ctx.strokeStyle = ultReady ? '#ffcc00' : '#886600';
        ctx.stroke();

        if (ultReady) {
            ctx.save();
            ctx.shadowColor = '#ffcc00';
            ctx.shadowBlur = Math.round(12 * S);
            ctx.beginPath();
            ctx.arc(ultCx, ultCy, ultSlotR - ringW / 2, 0, Math.PI * 2);
            ctx.strokeStyle = '#ffcc00';
            ctx.lineWidth = Math.round(2 * S);
            ctx.stroke();
            ctx.restore();
        }

        ctx.fillStyle = ultReady ? '#ffcc00' : '#666';
        ctx.font = `bold ${Math.round(18 * S)}px "Consolas", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('R', ultCx, ultCy + Math.round(7 * S));

        // === Control hints (small white text, left & right bottom) ===
        const hintFont = `${Math.round(11 * S)}px "Consolas", monospace`;
        const hintAlpha = 'rgba(200,200,200,0.45)';
        const hintLine = Math.round(20 * S);

        // Left side
        ctx.font = hintFont;
        ctx.textAlign = 'left';
        const lx = 40;
        let ly = CANVAS_H - Math.round(30 * S);
        ctx.fillStyle = hintAlpha;
        ctx.fillText('[WASD] 移动', lx, ly); ly -= hintLine;
        ctx.fillText('[1234] 切换法阵', lx, ly); ly -= hintLine;
        ctx.fillText('[左键] 释放法阵', lx, ly);

        // Right side
        ctx.textAlign = 'right';
        const rx = CANVAS_W - 40;
        let ry = CANVAS_H - Math.round(30 * S);
        ctx.fillStyle = hintAlpha;
        ctx.fillText('[ESC] 暂停', rx, ry); ry -= hintLine;
        const dashReady = now - lastDashTime >= CONFIG.dashCooldown;
        ctx.fillStyle = dashReady ? 'rgba(200,200,200,0.45)' : 'rgba(100,100,100,0.25)';
        ctx.fillText(`[Space] 闪避${dashReady ? '' : ' CD'}`, rx, ry); ry -= hintLine;
        ctx.fillStyle = ultReady ? 'rgba(255,220,80,0.6)' : hintAlpha;
        ctx.fillText(`[R] 大招${ultReady ? ' ✦' : ''}`, rx, ry);

        ctx.restore();
    }

    function drawPauseOverlay() {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(220,210,190,0.9)';
        ctx.font = 'bold 64px "Consolas", monospace';
        ctx.fillText('已暂停', CANVAS_W / 2, CANVAS_H / 2 - 20);
        ctx.font = '20px "Consolas", monospace';
        ctx.fillStyle = 'rgba(180,170,150,0.7)';
        ctx.fillText('按 ESC 继续', CANVAS_W / 2, CANVAS_H / 2 + 30);
        ctx.restore();
    }

    // ---- UI updates (kept as no-ops for backward compat) ----
    function updateBars() {}
    function updateScoreDisplay() {}
    function updateWaveDisplay() {}

    // ---- Win/Lose ----
    function hasBattleVictoryCondition() {
        const pending = GameStorage.getPending();
        return !!(
            player.hp > 0 &&
            score >= CONFIG.soulGoal &&
            pending &&
            pending.status === 'done'
        );
    }

    function checkForgeStatus() {
        if (hasBattleVictoryCondition()) onVictory();
    }

    function checkWinCondition() {
        if (hasBattleVictoryCondition()) {
            onVictory();
            return true;
        }
        return false;
    }

    function showBattleResultOverlay(overlay) {
        const victoryOverlay = document.getElementById('victory-overlay');
        const defeatOverlay = document.getElementById('defeat-overlay');
        if (victoryOverlay) victoryOverlay.style.display = 'none';
        if (defeatOverlay) defeatOverlay.style.display = 'none';
        if (!overlay) return;
        overlay.style.pointerEvents = 'auto';
        overlay.style.display = 'flex';
    }

    function onVictory() {
        stop();
        const overlay = document.getElementById('victory-overlay');
        const title = overlay.querySelector('h2');
        const text = overlay.querySelector('p');
        if (title) title.textContent = '炼成完成';
        if (text) text.textContent = '千魂融炉，炉火长明。';
        showBattleResultOverlay(overlay);
    }

    function onDefeat(reason) {
        stop();
        const overlay = document.getElementById('defeat-overlay');
        const title = overlay.querySelector('h2');
        const text = overlay.querySelector('p');
        overlay.classList.remove('defeat-hp-out', 'defeat-time-out');

        if (reason === 'hp_out') {
            overlay.classList.add('defeat-hp-out');
            if (title) title.textContent = '血肉崩解';
            if (text) text.textContent = '你倒在亡灵围攻之下，本次炼金中断。';
        } else {
            overlay.classList.add('defeat-time-out');
            if (title) title.textContent = '时限已至';
            if (text) text.textContent = '魂数未满，炉火熄灭，本次炼金失败。';
        }

        showBattleResultOverlay(overlay);
    }

    function onVictoryReturn() {
        showBattleResultOverlay(null);
        App.switchPage('alchemy');
        Alchemy.onReturnFromBattle();
    }
    function onRetry() {
        showBattleResultOverlay(null);
        start();
    }
    function onDefeatReturn() {
        showBattleResultOverlay(null);
        GameStorage.clearPending();
        App.switchPage('alchemy');
        Alchemy.refreshSlots();
    }

    // ---- Game feel helpers ----
    function triggerHitstop(ms) {
        hitstopEnd = Math.max(hitstopEnd, Date.now() + ms);
    }

    function triggerShake(intensity, duration) {
        shake.intensity = Math.max(shake.intensity, intensity);
        shake.duration = duration;
        shake.startTime = Date.now();
    }

    function spawnParticles(x, y, color, count, speed) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = speed * (0.5 + Math.random());
            particles.push({
                x, y,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd - 1,
                life: 20 + Math.floor(Math.random() * 15),
                maxLife: 35,
                color,
                size: 2 + Math.random() * 4
            });
        }
    }

    // ---- Util ----
    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    return { init, start, stop };
})();
