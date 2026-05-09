(function () {
    const BGM_BY_CONTEXT = {
        battle: 'assets/audio/bgm/Black_Stone_Ritual.mp3',
        default: 'assets/audio/bgm/Catacomb_Veil.mp3'
    };

    const SFX_LIBRARY = {
        uiClick: { src: 'assets/audio/sfx/freesound_community-click-36683.mp3', volume: 0.42, cooldownMs: 0 },
        attackHit: { src: 'assets/audio/sfx/daviddumaisaudio-sword-slash-and-swing-185432.mp3', volume: 0.5, cooldownMs: 120 },
        monsterDeath: { src: 'assets/audio/sfx/freesound_community-magic-death-85573.mp3', volume: 0.55, cooldownMs: 120 },
        playerHurt: { src: 'assets/audio/sfx/freesound_community-male_hurt7-48124.mp3', volume: 0.5, cooldownMs: 420 },
        revealRise: { src: 'assets/audio/sfx/universfield-magical-twinkle-242245.mp3', volume: 0.62, cooldownMs: 800 },
        spellLaunch: { src: 'assets/audio/sfx/koiroylers-fireball-impact-351961.mp3', volume: 0.52, cooldownMs: 90 }
    };
    const FOOTSTEP_CONFIG = {
        src: 'assets/audio/sfx/thumblegray-running-on-the-floor-359909.mp3',
        volume: 0.3
    };

    const UI_CLICK_SELECTOR = [
        'button',
        '.card-item',
        '.loadout-slot',
        '.card-slot',
        '.blank-slate'
    ].join(', ');

    let unlocked = false;
    let muted = false;
    let bgmAudio = null;
    let currentBgmContext = 'default';
    let uiClickInstalled = false;
    let footstepAudio = null;
    const activeSfx = new Set();
    const sfxLastPlayedAt = Object.create(null);

    function clampVolume(value, fallback) {
        const num = Number(value);
        if (!Number.isFinite(num)) return fallback;
        return Math.max(0, Math.min(1, num));
    }

    function cleanupAudio(audio) {
        if (!audio) return;
        activeSfx.delete(audio);
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
    }

    function resolveBgmContext(context) {
        return context === 'battle' ? 'battle' : 'default';
    }

    function ensureBgmAudio() {
        if (!bgmAudio) {
            bgmAudio = new Audio();
            bgmAudio.loop = true;
            bgmAudio.preload = 'auto';
        }
        bgmAudio.muted = muted;
        bgmAudio.volume = 0.34;
        return bgmAudio;
    }

    function updateBgmPlayback() {
        const context = resolveBgmContext(currentBgmContext);
        const src = BGM_BY_CONTEXT[context];
        const audio = ensureBgmAudio();
        const nextUrl = new URL(src, window.location.href).href;
        const currentUrl = audio.currentSrc || audio.src || '';

        if (currentUrl !== nextUrl) {
            audio.pause();
            audio.src = src;
            audio.load();
        }

        if (!unlocked || muted) {
            audio.pause();
            return;
        }

        audio.play().catch(() => {});
    }

    function unlockAudio() {
        if (unlocked) return;
        unlocked = true;
        updateBgmPlayback();
    }

    function installUnlockHandlers() {
        const unlockOnce = () => unlockAudio();
        document.addEventListener('pointerdown', unlockOnce, { once: true });
        document.addEventListener('keydown', unlockOnce, { once: true });
    }

    function isDisabledTarget(target) {
        return typeof target?.matches === 'function' && target.matches(':disabled, [aria-disabled="true"]');
    }

    function shouldPlayUiClick(event) {
        if (!event || event.defaultPrevented || !event.isTrusted) return false;
        const target = event.target?.closest?.(UI_CLICK_SELECTOR);
        if (!target) return false;
        if (isDisabledTarget(target)) return false;
        return true;
    }

    function installUiClickDelegation() {
        if (uiClickInstalled) return;
        uiClickInstalled = true;
        document.addEventListener('click', (event) => {
            if (!shouldPlayUiClick(event)) return;
            playSfx('uiClick');
        });
    }

    function playSfx(name, overrides = {}) {
        const entry = SFX_LIBRARY[name];
        if (!entry || !unlocked) return null;

        const now = Date.now();
        const cooldownMs = Math.max(0, Number(overrides.cooldownMs ?? entry.cooldownMs) || 0);
        if (cooldownMs > 0 && now - (sfxLastPlayedAt[name] || 0) < cooldownMs) {
            return null;
        }
        sfxLastPlayedAt[name] = now;

        const audio = new Audio(entry.src);
        audio.preload = 'auto';
        audio.muted = muted;
        audio.volume = clampVolume(overrides.volume, entry.volume);
        activeSfx.add(audio);
        audio.addEventListener('ended', () => cleanupAudio(audio), { once: true });
        audio.addEventListener('error', () => cleanupAudio(audio), { once: true });
        audio.play().catch(() => cleanupAudio(audio));
        return audio;
    }

    function ensureFootstepAudio() {
        if (!footstepAudio) {
            footstepAudio = new Audio(FOOTSTEP_CONFIG.src);
            footstepAudio.loop = true;
            footstepAudio.preload = 'auto';
        }
        footstepAudio.muted = muted;
        footstepAudio.volume = FOOTSTEP_CONFIG.volume;
        return footstepAudio;
    }

    function stopAllSfx() {
        [...activeSfx].forEach(cleanupAudio);
        if (footstepAudio) {
            footstepAudio.pause();
            footstepAudio.currentTime = 0;
        }
    }

    window.GameAudio = {
        init() {
            installUnlockHandlers();
            installUiClickDelegation();
            updateBgmPlayback();
        },
        setPageContext(context) {
            currentBgmContext = resolveBgmContext(context);
            if (currentBgmContext !== 'battle' && footstepAudio) {
                footstepAudio.pause();
                footstepAudio.currentTime = 0;
            }
            updateBgmPlayback();
        },
        stopBgm() {
            if (!bgmAudio) return;
            bgmAudio.pause();
            bgmAudio.currentTime = 0;
        },
        stopAllSfx,
        setMuted(nextMuted) {
            muted = Boolean(nextMuted);
            if (bgmAudio) bgmAudio.muted = muted;
            if (footstepAudio) footstepAudio.muted = muted;
            activeSfx.forEach(audio => {
                audio.muted = muted;
            });
            updateBgmPlayback();
        },
        isUnlocked() {
            return unlocked;
        },
        playSfx,
        playAttackHit() {
            return playSfx('attackHit');
        },
        playMonsterDeath() {
            return playSfx('monsterDeath');
        },
        playPlayerHurt() {
            return playSfx('playerHurt');
        },
        playRevealRise() {
            return playSfx('revealRise');
        },
        playSpellLaunch() {
            return playSfx('spellLaunch');
        },
        startFootsteps() {
            if (!unlocked) return null;
            const audio = ensureFootstepAudio();
            if (audio.paused) {
                audio.currentTime = 0;
                audio.play().catch(() => {});
            }
            return audio;
        },
        stopFootsteps() {
            if (!footstepAudio) return;
            footstepAudio.pause();
            footstepAudio.currentTime = 0;
        }
    };
})();
