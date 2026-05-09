window.ArenaGlyphRenderer = (() => {
    const DEFAULT_CANVAS_WIDTH = 2560;
    const DEFAULT_CANVAS_HEIGHT = 1440;
    const DEFAULT_EFFECT_SURFACE_SIZE = 480;
    const DEFAULT_BG_TILE_WIDTH = 1920;
    const DEFAULT_BG_TILE_HEIGHT = 1080;

    const ASSET_FILES = Object.freeze({
        ground: 'assets/aena/seamless_texture_01.jpg',
        skull1: 'assets/aena/skull_01.png',
        skull2: 'assets/aena/skull_02.png',
        light1: 'assets/aena/linear_dodge_add_01.png',
        light2: 'assets/aena/linear_dodge_add_02.png',
        bloodScreen: 'assets/ui/blood_screen.webp',
        crucibleUi: 'assets/icon/crucible_UI.png'
    });

    // Confirmed production-default arena glyph preset shared by battle and tuner.
    const SHARED_ARENA_GLYPH_DEFAULTS = Object.freeze({
        previewMode: 'spell',
        battleSize: Object.freeze({
            glyphBaseSize: 824,
            arenaViewSizeTweak: 1
        }),
        placement: Object.freeze({
            offsetX: 0,
            offsetY: 26,
            opacity: 1,
            blendMode: 'lighten'
        }),
        arena: Object.freeze({
            brightness: 0.54,
            saturation: 0.38,
            contrast: 0.96,
            vignette: 0.95
        }),
        glyphPostFx: Object.freeze({
            saturation: 1.29,
            contrast: 1.47,
            brightness: 1.23,
            highlights: 0.26,
            shadows: 0,
            whites: 0.04,
            blacks: 0,
            glow: 0.28
        })
    });

    const DEFAULT_GLYPH_SIZE_TUNING = Object.freeze({
        baseSize: SHARED_ARENA_GLYPH_DEFAULTS.battleSize.glyphBaseSize,
        arenaViewSizeTweak: SHARED_ARENA_GLYPH_DEFAULTS.battleSize.arenaViewSizeTweak,
        spellSizeJitter: 0,
        ultimateCenterScale: 1,
        ultimateSatelliteScale: 0.75,
        ultimateSatelliteCount: 5,
        ultimateRingDistanceScale: 0.55,
        ultimateEllipseXScale: 1.3,
        ultimateEllipseYScale: 0.65,
        ultimateAngleJitter: 0.35
    });

    const DEFAULT_BACKGROUND_TUNING = Object.freeze({
        brightness: SHARED_ARENA_GLYPH_DEFAULTS.arena.brightness,
        saturation: SHARED_ARENA_GLYPH_DEFAULTS.arena.saturation,
        contrast: SHARED_ARENA_GLYPH_DEFAULTS.arena.contrast,
        vignetteStrength: SHARED_ARENA_GLYPH_DEFAULTS.arena.vignette
    });

    const DEFAULT_POST_FX = Object.freeze({
        blendMode: SHARED_ARENA_GLYPH_DEFAULTS.placement.blendMode,
        opacity: SHARED_ARENA_GLYPH_DEFAULTS.placement.opacity,
        saturation: SHARED_ARENA_GLYPH_DEFAULTS.glyphPostFx.saturation,
        contrast: SHARED_ARENA_GLYPH_DEFAULTS.glyphPostFx.contrast,
        brightness: SHARED_ARENA_GLYPH_DEFAULTS.glyphPostFx.brightness,
        softEdgeStart: 0.72,
        softEdgeMid: 0.88,
        highlights: SHARED_ARENA_GLYPH_DEFAULTS.glyphPostFx.highlights,
        shadows: SHARED_ARENA_GLYPH_DEFAULTS.glyphPostFx.shadows,
        whites: SHARED_ARENA_GLYPH_DEFAULTS.glyphPostFx.whites,
        blacks: SHARED_ARENA_GLYPH_DEFAULTS.glyphPostFx.blacks,
        glow: SHARED_ARENA_GLYPH_DEFAULTS.glyphPostFx.glow
    });

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function mod(a, n) {
        return ((a % n) + n) % n;
    }

    function seededRandom(seed) {
        let s = Math.abs(Number(seed) || 1) || 1;
        return function next() {
            s = (s * 16807) % 2147483647;
            return s / 2147483647;
        };
    }

    function createSharedArenaGlyphDefaults() {
        return {
            previewMode: SHARED_ARENA_GLYPH_DEFAULTS.previewMode,
            battleSize: { ...SHARED_ARENA_GLYPH_DEFAULTS.battleSize },
            placement: { ...SHARED_ARENA_GLYPH_DEFAULTS.placement },
            arena: { ...SHARED_ARENA_GLYPH_DEFAULTS.arena },
            glyphPostFx: { ...SHARED_ARENA_GLYPH_DEFAULTS.glyphPostFx }
        };
    }

    function createArenaBackgroundTuning(overrides = {}) {
        return {
            brightness: DEFAULT_BACKGROUND_TUNING.brightness,
            saturation: DEFAULT_BACKGROUND_TUNING.saturation,
            contrast: DEFAULT_BACKGROUND_TUNING.contrast,
            vignetteStrength: DEFAULT_BACKGROUND_TUNING.vignetteStrength,
            ...(overrides || {})
        };
    }

    function createGlyphPostFx(overrides = {}) {
        return { ...DEFAULT_POST_FX, ...(overrides || {}) };
    }

    function createEffectPlacement(overrides = {}) {
        return { ...SHARED_ARENA_GLYPH_DEFAULTS.placement, ...(overrides || {}) };
    }

    function createGlyphSizeTuning(overrides = {}) {
        return { ...DEFAULT_GLYPH_SIZE_TUNING, ...(overrides || {}) };
    }

    function getUnifiedGlyphBaseSize(options = {}) {
        const tuning = createGlyphSizeTuning(options.tuning || options);
        return tuning.baseSize * tuning.arenaViewSizeTweak;
    }

    function getSpellRenderSize(options = {}) {
        const tuning = createGlyphSizeTuning(options.tuning || options);
        const variant = options.variant || 'spell';
        const random = typeof options.random === 'function' ? options.random : Math.random;
        let size = getUnifiedGlyphBaseSize(tuning);

        if (variant === 'ultimate-satellite') {
            size *= tuning.ultimateSatelliteScale;
        } else if (variant === 'ultimate-center') {
            size *= tuning.ultimateCenterScale;
        }

        if (variant === 'spell' && tuning.spellSizeJitter > 0) {
            const jitterRatio = 1 + (random() * 2 - 1) * tuning.spellSizeJitter;
            size *= jitterRatio;
        }

        return size;
    }

    function buildUltimateBurstLayout(options = {}) {
        const tuning = createGlyphSizeTuning(options.tuning || options);
        const random = typeof options.random === 'function' ? options.random : Math.random;
        const centerX = Number(options.x) || 0;
        const centerY = Number(options.y) || 0;
        const baseAngle = Number.isFinite(options.baseAngle) ? options.baseAngle : random() * Math.PI * 2;
        const centerSize = getSpellRenderSize({ tuning, variant: 'ultimate-center', random });
        const satelliteSize = getSpellRenderSize({ tuning, variant: 'ultimate-satellite', random });
        const count = Math.max(0, Math.round(options.satelliteCount ?? tuning.ultimateSatelliteCount));
        const ringDistance = centerSize * tuning.ultimateRingDistanceScale;
        const effects = [{
            x: centerX,
            y: centerY,
            size: centerSize,
            isCenter: true,
            sequenceIndex: 0
        }];

        if (count <= 0) return effects;

        const angleStep = (Math.PI * 2) / count;
        for (let index = 0; index < count; index++) {
            const angle = baseAngle
                + angleStep * index
                + (random() - 0.5) * angleStep * tuning.ultimateAngleJitter;
            effects.push({
                x: centerX + Math.cos(angle) * ringDistance * tuning.ultimateEllipseXScale,
                y: centerY + Math.sin(angle) * ringDistance * tuning.ultimateEllipseYScale,
                size: satelliteSize,
                isCenter: false,
                sequenceIndex: index + 1
            });
        }

        return effects;
    }

    function createSceneRenderer(options = {}) {
        const width = Number(options.width) || DEFAULT_CANVAS_WIDTH;
        const height = Number(options.height) || DEFAULT_CANVAS_HEIGHT;
        const effectSurfaceSize = Number(options.effectSurfaceSize) || DEFAULT_EFFECT_SURFACE_SIZE;
        const bgTileWidth = Number(options.bgTileWidth) || DEFAULT_BG_TILE_WIDTH;
        const bgTileHeight = Number(options.bgTileHeight) || DEFAULT_BG_TILE_HEIGHT;
        const assetPathPrefix = String(options.assetPathPrefix || '');
        const assetFiles = options.assetFiles || ASSET_FILES;
        const assets = options.assets || {};

        Object.entries(assetFiles).forEach(([key, relativePath]) => {
            if (assets[key]) return;
            const img = new Image();
            img.src = `${assetPathPrefix}${relativePath}`;
            assets[key] = img;
        });

        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = effectSurfaceSize;
        maskCanvas.height = effectSurfaceSize;
        const maskCtx = maskCanvas.getContext('2d');
        const softEdgeCanvas = document.createElement('canvas');
        softEdgeCanvas.width = effectSurfaceSize;
        softEdgeCanvas.height = effectSurfaceSize;
        const softEdgeCtx = softEdgeCanvas.getContext('2d');

        let vignetteCache = null;
        let vignetteStrength = null;

        function drawTiledLayer(ctx, img, offsetX, offsetY) {
            if (!img || !img.complete || !img.naturalWidth) return;
            const tileW = img.naturalWidth;
            const tileH = img.naturalHeight;
            const startX = -mod(offsetX, tileW);
            const startY = -mod(offsetY, tileH);

            for (let x = startX; x < width; x += tileW) {
                for (let y = startY; y < height; y += tileH) {
                    ctx.drawImage(img, x, y);
                }
            }
        }

        function drawSkullChunks(ctx, camera) {
            const skull1 = assets.skull1;
            const skull2 = assets.skull2;
            if (!skull1 || !skull1.complete || !skull2 || !skull2.complete) return;

            const skulls = [skull1, skull2];
            const chunkStartX = Math.floor(camera.x / bgTileWidth) - 1;
            const chunkStartY = Math.floor(camera.y / bgTileHeight) - 1;
            const chunkEndX = chunkStartX + Math.ceil(width / bgTileWidth) + 2;
            const chunkEndY = chunkStartY + Math.ceil(height / bgTileHeight) + 2;

            for (let cx = chunkStartX; cx <= chunkEndX; cx++) {
                for (let cy = chunkStartY; cy <= chunkEndY; cy++) {
                    const rng = seededRandom((cx * 73856093) ^ (cy * 19349663));
                    const count = Math.floor(rng() * 3);
                    for (let index = 0; index < count; index++) {
                        const skullImg = skulls[Math.floor(rng() * skulls.length)];
                        const localX = rng() * bgTileWidth;
                        const localY = rng() * bgTileHeight;
                        const flipX = rng() > 0.5;
                        rng();
                        const alpha = 0.6 + rng() * 0.4;
                        const worldX = cx * bgTileWidth + localX;
                        const worldY = cy * bgTileHeight + localY;
                        const drawW = skullImg.naturalWidth * 0.6;
                        const drawH = skullImg.naturalHeight * 0.6;
                        const screenX = worldX - camera.x - drawW / 2;
                        const screenY = worldY - camera.y - drawH / 2;

                        if (screenX > width + 200 || screenY > height + 200) continue;
                        if (screenX < -drawW - 200 || screenY < -drawH - 200) continue;

                        ctx.save();
                        ctx.globalAlpha = alpha;
                        ctx.translate(screenX + drawW / 2, screenY + drawH / 2);
                        ctx.scale(flipX ? -1 : 1, 1);
                        ctx.drawImage(skullImg, -drawW / 2, -drawH / 2, drawW, drawH);
                        ctx.restore();
                    }
                }
            }
        }

        function drawLightOrbs(ctx, camera, now) {
            const light1 = assets.light1;
            const light2 = assets.light2;

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';

            if (light1 && light1.complete && light1.naturalWidth) {
                ctx.globalAlpha = 0.41 + 0.15 * Math.sin(now * 0.0008);
                drawTiledLayer(ctx, light1, camera.x * 0.6, camera.y * 0.6);
            }

            if (light2 && light2.complete && light2.naturalWidth) {
                ctx.globalAlpha = 0.31 + 0.15 * Math.sin(now * 0.0006 + 1.5);
                drawTiledLayer(ctx, light2, camera.x * 0.45, camera.y * 0.45);
            }

            ctx.restore();
        }

        function ensureVignetteCache(strength) {
            if (vignetteCache && vignetteStrength === strength) return vignetteCache;

            vignetteStrength = strength;
            vignetteCache = document.createElement('canvas');
            vignetteCache.width = width;
            vignetteCache.height = height;

            const vctx = vignetteCache.getContext('2d');
            const centerX = width / 2;
            const centerY = height / 2;
            const maxRadius = Math.max(width, height);
            const gradient = vctx.createRadialGradient(centerX, centerY, maxRadius * 0.3, centerX, centerY, maxRadius);
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(1, `rgba(0,0,0,${clamp(strength, 0, 1)})`);
            vctx.fillStyle = gradient;
            vctx.fillRect(0, 0, width, height);

            return vignetteCache;
        }

        function drawBackground(ctx, options = {}) {
            const camera = options.camera || { x: 0, y: 0 };
            const background = { ...DEFAULT_BACKGROUND_TUNING, ...(options.background || {}) };
            const now = Number(options.now) || Date.now();
            const ground = assets.ground;

            if (ground && ground.complete && ground.naturalWidth) {
                const filterParts = [];
                if (background.saturation !== 1) filterParts.push(`saturate(${background.saturation})`);
                if (background.contrast !== 1) filterParts.push(`contrast(${background.contrast})`);
                if (background.brightness > 1) filterParts.push(`brightness(${background.brightness})`);

                if (filterParts.length > 0) {
                    ctx.save();
                    ctx.filter = filterParts.join(' ');
                    drawTiledLayer(ctx, ground, camera.x, camera.y);
                    ctx.restore();
                } else {
                    drawTiledLayer(ctx, ground, camera.x, camera.y);
                }

                if (background.brightness < 1) {
                    ctx.save();
                    ctx.globalAlpha = 1 - background.brightness;
                    ctx.fillStyle = '#000';
                    ctx.fillRect(0, 0, width, height);
                    ctx.restore();
                }
            } else {
                ctx.fillStyle = '#1a1510';
                ctx.fillRect(0, 0, width, height);
            }

            drawSkullChunks(ctx, camera);
            drawLightOrbs(ctx, camera, now);
        }

        function drawVignette(ctx, options = {}) {
            const strength = Number.isFinite(options.strength)
                ? options.strength
                : DEFAULT_BACKGROUND_TUNING.vignetteStrength;
            ctx.drawImage(ensureVignetteCache(strength), 0, 0);
        }

        function cacheFrozenEffectFrame(effect, source) {
            if (!effect.frozenFrameCanvas) {
                effect.frozenFrameCanvas = document.createElement('canvas');
                effect.frozenFrameCanvas.width = effectSurfaceSize;
                effect.frozenFrameCanvas.height = effectSurfaceSize;
                effect.frozenFrameCtx = effect.frozenFrameCanvas.getContext('2d');
            }
            effect.frozenFrameCtx.clearRect(0, 0, effectSurfaceSize, effectSurfaceSize);
            effect.frozenFrameCtx.drawImage(source, 0, 0, effectSurfaceSize, effectSurfaceSize);
        }

        function getEffectDurationMs(effect) {
            const baseDuration = effect.durationMs
                || (effect.video ? (effect.video.duration * 1000 || 3000) : 1500);
            return baseDuration + (Number(effect.persistMs) || 0);
        }

        function getEffectFrameSurface(effect) {
            if (!effect?.video) return null;
            if (effect.video.readyState >= 2 && !effect.video.ended) {
                if ((Number(effect.persistMs) || 0) > 0) cacheFrozenEffectFrame(effect, effect.video);
                return effect.video;
            }
            return effect.frozenFrameCanvas || null;
        }

        function getEffectAlpha(effect, now) {
            if (Number.isFinite(effect?.alpha)) {
                return clamp(Number(effect.alpha), 0, 1);
            }
            const age = now - effect.startTime;
            const duration = getEffectDurationMs(effect);
            const fadeOut = duration - 800;
            return Math.min(Math.min(1, age / 200), Math.max(0, 1 - (age - fadeOut) / 800));
        }

        function drawFallbackEffect(ctx, effect, options = {}) {
            const now = Number(options.now) || Date.now();
            const camera = options.camera || { x: 0, y: 0 };
            const age = now - effect.startTime;
            const alpha = getEffectAlpha(effect, now);
            const radius = effect.size / 2 * (0.6 + 0.4 * Math.min(1, age / 200));
            const screenX = effect.x - camera.x;
            const screenY = effect.y - camera.y;

            ctx.save();
            ctx.globalAlpha = alpha * 0.7;
            const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, radius);
            gradient.addColorStop(0, effect.color || '#ffffff');
            gradient.addColorStop(0.4, effect.glowColor || 'rgba(255,255,255,0.7)');
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        function buildMaskedEffectSurface(frameSurface) {
            maskCtx.clearRect(0, 0, effectSurfaceSize, effectSurfaceSize);
            maskCtx.save();
            maskCtx.drawImage(frameSurface, 0, 0, effectSurfaceSize, effectSurfaceSize);
            maskCtx.globalCompositeOperation = 'destination-in';
            const gradient = maskCtx.createLinearGradient(0, 0, 0, effectSurfaceSize);
            gradient.addColorStop(0, 'rgba(0,0,0,1)');
            gradient.addColorStop(0.3, 'rgba(0,0,0,0.7)');
            gradient.addColorStop(0.45, 'rgba(0,0,0,0.15)');
            gradient.addColorStop(0.55, 'rgba(0,0,0,0)');
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
            maskCtx.fillStyle = gradient;
            maskCtx.fillRect(0, 0, effectSurfaceSize, effectSurfaceSize);
            maskCtx.restore();
            return maskCanvas;
        }

        function buildSoftEdgeSurface(source, postFx = DEFAULT_POST_FX) {
            if (postFx.softEdge === false) return source;
            softEdgeCtx.clearRect(0, 0, effectSurfaceSize, effectSurfaceSize);
            softEdgeCtx.save();
            softEdgeCtx.drawImage(source, 0, 0, effectSurfaceSize, effectSurfaceSize);
            softEdgeCtx.globalCompositeOperation = 'destination-in';

            const center = effectSurfaceSize / 2;
            const outerRadius = effectSurfaceSize / 2;
            const innerRadius = outerRadius * clamp(postFx.softEdgeStart, 0, 0.99);
            const midRadius = outerRadius * clamp(postFx.softEdgeMid, postFx.softEdgeStart, 0.999);
            const gradient = softEdgeCtx.createRadialGradient(center, center, innerRadius, center, center, outerRadius);
            gradient.addColorStop(0, 'rgba(0,0,0,1)');
            gradient.addColorStop(clamp((midRadius - innerRadius) / Math.max(1, outerRadius - innerRadius), 0, 1), 'rgba(0,0,0,0.82)');
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
            softEdgeCtx.fillStyle = gradient;
            softEdgeCtx.fillRect(0, 0, effectSurfaceSize, effectSurfaceSize);
            softEdgeCtx.restore();

            return softEdgeCanvas;
        }

        function drawGlyphPasses(ctx, source, effect, screenX, screenY, alpha) {
            const postFx = { ...DEFAULT_POST_FX, ...(effect.postFx || {}) };
            const size = Number(effect.size) || getUnifiedGlyphBaseSize();
            const drawX = screenX - size / 2;
            const drawY = screenY - size / 2;
            const featheredSource = buildSoftEdgeSurface(source, postFx);

            const drawPass = ({ blendMode = postFx.blendMode, localAlpha = 1, filter = 'none' }) => {
                if (localAlpha <= 0) return;
                ctx.save();
                ctx.globalCompositeOperation = blendMode;
                ctx.globalAlpha = alpha * postFx.opacity * localAlpha;
                if (filter && filter !== 'none') ctx.filter = filter;
                ctx.drawImage(featheredSource, drawX, drawY, size, size);
                ctx.restore();
            };

            drawPass({
                filter: `saturate(${postFx.saturation}) contrast(${postFx.contrast}) brightness(${postFx.brightness})`
            });

            if (postFx.highlights > 0) {
                drawPass({
                    blendMode: 'screen',
                    localAlpha: postFx.highlights * 0.72,
                    filter: `brightness(${1 + postFx.highlights * 0.9}) contrast(${1 + postFx.highlights * 0.3})`
                });
            }

            if (postFx.shadows > 0) {
                drawPass({
                    blendMode: 'multiply',
                    localAlpha: postFx.shadows * 0.7,
                    filter: `brightness(${1 - postFx.shadows * 0.65}) contrast(${1 + postFx.shadows * 0.25})`
                });
            }

            if (postFx.whites > 0) {
                drawPass({
                    blendMode: 'screen',
                    localAlpha: postFx.whites * 0.72,
                    filter: `grayscale(1) brightness(${1 + postFx.whites * 1.4}) contrast(${1 + postFx.whites * 0.6})`
                });
            }

            if (postFx.blacks > 0) {
                drawPass({
                    blendMode: 'multiply',
                    localAlpha: postFx.blacks * 0.82,
                    filter: `grayscale(1) brightness(${1 - postFx.blacks * 0.82}) contrast(${1 + postFx.blacks * 0.35})`
                });
            }

            if (postFx.glow > 0) {
                drawPass({
                    blendMode: 'screen',
                    localAlpha: postFx.glow * 0.72,
                    filter: `blur(${postFx.glow * 24}px) brightness(${1 + postFx.glow * 1.2}) saturate(${1 + postFx.glow * 0.7})`
                });
            }
        }

        function drawEffectsLayer(ctx, effects, options = {}) {
            const camera = options.camera || { x: 0, y: 0 };
            const now = Number(options.now) || Date.now();
            const layer = options.layer || 'bottom';

            (effects || []).forEach(effect => {
                if (!effect) return;
                if (layer === 'top' && effect.renderTop === false) return;
                if (layer === 'bottom' && effect.renderBottom === false) return;

                const alpha = getEffectAlpha(effect, now);
                if (alpha <= 0) return;

                const frameSurface = getEffectFrameSurface(effect);
                if (!frameSurface) {
                    if (layer === 'bottom' && !effect.video) {
                        drawFallbackEffect(ctx, effect, { camera, now });
                    }
                    return;
                }

                const placement = createEffectPlacement({
                    offsetX: effect.renderOffsetX,
                    offsetY: effect.renderOffsetY
                });
                const screenX = effect.x - camera.x + placement.offsetX;
                const screenY = effect.y - camera.y + placement.offsetY;
                const source = layer === 'top' ? buildMaskedEffectSurface(frameSurface) : frameSurface;
                drawGlyphPasses(ctx, source, effect, screenX, screenY, alpha);
            });
        }

        return {
            width,
            height,
            effectSurfaceSize,
            assets,
            drawBackground,
            drawVignette,
            drawEffectsBottom(ctx, options = {}) {
                drawEffectsLayer(ctx, options.effects, { ...options, layer: 'bottom' });
            },
            drawEffectsTop(ctx, options = {}) {
                drawEffectsLayer(ctx, options.effects, { ...options, layer: 'top' });
            },
            drawFallbackEffect,
            getEffectAlpha,
            getEffectFrameSurface,
            drawTiledLayer,
            drawSkullChunks(ctx, camera) {
                drawSkullChunks(ctx, camera);
            },
            drawLightOrbs(ctx, camera, now) {
                drawLightOrbs(ctx, camera, now);
            }
        };
    }

    return {
        ASSET_FILES,
        SHARED_ARENA_GLYPH_DEFAULTS,
        DEFAULT_CANVAS_WIDTH,
        DEFAULT_CANVAS_HEIGHT,
        DEFAULT_EFFECT_SURFACE_SIZE,
        DEFAULT_GLYPH_SIZE_TUNING,
        DEFAULT_BACKGROUND_TUNING,
        DEFAULT_POST_FX,
        clamp,
        seededRandom,
        createSharedArenaGlyphDefaults,
        createArenaBackgroundTuning,
        createGlyphPostFx,
        createEffectPlacement,
        createGlyphSizeTuning,
        getUnifiedGlyphBaseSize,
        getSpellRenderSize,
        buildUltimateBurstLayout,
        createSceneRenderer
    };
})();
