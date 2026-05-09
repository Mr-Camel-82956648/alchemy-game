// Local-only arena glyph visual tuner. This file belongs to frontend/tools and should be read only when doing visual debugging or parameter calibration, not during normal feature work.
(function () {
    const STORAGE_KEY = 'arena-glyph-tuner.v2';
    const CARD_URL_PREFIX = 'card:';
    const SHARED_DEFAULTS = ArenaGlyphRenderer.createSharedArenaGlyphDefaults();
    const DEFAULTS = {
        sourceKey: '',
        sourceLabel: '',
        sourceUrl: '',
        previewMode: SHARED_DEFAULTS.previewMode,
        blendMode: SHARED_DEFAULTS.placement.blendMode,
        glyphBaseSize: SHARED_DEFAULTS.battleSize.glyphBaseSize,
        arenaViewSizeTweak: SHARED_DEFAULTS.battleSize.arenaViewSizeTweak,
        offsetX: SHARED_DEFAULTS.placement.offsetX,
        offsetY: SHARED_DEFAULTS.placement.offsetY,
        opacity: SHARED_DEFAULTS.placement.opacity,
        glyphSaturation: SHARED_DEFAULTS.glyphPostFx.saturation,
        glyphContrast: SHARED_DEFAULTS.glyphPostFx.contrast,
        glyphBrightness: SHARED_DEFAULTS.glyphPostFx.brightness,
        glyphHighlights: SHARED_DEFAULTS.glyphPostFx.highlights,
        glyphShadows: SHARED_DEFAULTS.glyphPostFx.shadows,
        glyphWhites: SHARED_DEFAULTS.glyphPostFx.whites,
        glyphBlacks: SHARED_DEFAULTS.glyphPostFx.blacks,
        glyphGlow: SHARED_DEFAULTS.glyphPostFx.glow,
        vignette: SHARED_DEFAULTS.arena.vignette,
        arenaBrightness: SHARED_DEFAULTS.arena.brightness,
        arenaSaturation: SHARED_DEFAULTS.arena.saturation,
        arenaContrast: SHARED_DEFAULTS.arena.contrast
    };

    const els = {};
    const sourceCatalog = new Map();
    const zeroCamera = { x: 0, y: 0 };
    const renderer = ArenaGlyphRenderer.createSceneRenderer({
        width: ArenaGlyphRenderer.DEFAULT_CANVAS_WIDTH,
        height: ArenaGlyphRenderer.DEFAULT_CANVAS_HEIGHT,
        assetPathPrefix: '../'
    });
    const previewVideo = document.createElement('video');
    previewVideo.loop = true;
    previewVideo.muted = true;
    previewVideo.playsInline = true;
    previewVideo.preload = 'auto';

    let state = loadState();
    let activeObjectUrl = null;
    let rafId = 0;

    function $(id) {
        return document.getElementById(id);
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function round(value, digits = 2) {
        const factor = 10 ** digits;
        return Math.round(Number(value) * factor) / factor;
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return { ...DEFAULTS };
            const next = { ...DEFAULTS, ...JSON.parse(raw) };
            if (String(next.sourceUrl || '').startsWith('blob:')) {
                next.sourceKey = '';
                next.sourceLabel = '';
                next.sourceUrl = '';
            }
            return next;
        } catch {
            return { ...DEFAULTS };
        }
    }

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        if (els.renderStatus) {
            els.renderStatus.innerHTML = [
                '<div><strong>renderer</strong>: shared battle canvas renderer</div>',
                `<div><strong>saved</strong>: ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}</div>`
            ].join('');
        }
    }

    function getCurrentSizeTuning() {
        return ArenaGlyphRenderer.createGlyphSizeTuning({
            baseSize: state.glyphBaseSize,
            arenaViewSizeTweak: state.arenaViewSizeTweak
        });
    }

    function getEffectiveRenderSize() {
        return Math.round(ArenaGlyphRenderer.getSpellRenderSize({
            tuning: getCurrentSizeTuning(),
            variant: 'spell'
        }));
    }

    function getCurrentPostFx() {
        return ArenaGlyphRenderer.createGlyphPostFx({
            blendMode: state.blendMode,
            opacity: state.opacity,
            saturation: state.glyphSaturation,
            contrast: state.glyphContrast,
            brightness: state.glyphBrightness,
            highlights: state.glyphHighlights,
            shadows: state.glyphShadows,
            whites: state.glyphWhites,
            blacks: state.glyphBlacks,
            glow: state.glyphGlow
        });
    }

    function getFocusPoint() {
        return {
            x: renderer.width / 2,
            y: renderer.height / 2
        };
    }

    function escapeHtml(value) {
        return String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
    }

    function buildPreviewEffects() {
        if (!state.sourceUrl) return [];
        const focus = getFocusPoint();
        const postFx = getCurrentPostFx();

        if (state.previewMode === 'ultimate') {
            const random = ArenaGlyphRenderer.seededRandom(20260509);
            return ArenaGlyphRenderer.buildUltimateBurstLayout({
                x: focus.x,
                y: focus.y,
                tuning: getCurrentSizeTuning(),
                random
            }).map(item => ({
                x: item.x,
                y: item.y,
                size: item.size,
                video: previewVideo,
                alpha: 1,
                postFx,
                renderOffsetX: state.offsetX,
                renderOffsetY: state.offsetY,
                renderTop: true,
                renderBottom: true
            }));
        }

        return [{
            x: focus.x,
            y: focus.y,
            size: ArenaGlyphRenderer.getSpellRenderSize({
                tuning: getCurrentSizeTuning(),
                variant: 'spell'
            }),
            video: previewVideo,
            alpha: 1,
            postFx,
            renderOffsetX: state.offsetX,
            renderOffsetY: state.offsetY,
            renderTop: true,
            renderBottom: true
        }];
    }

    function drawReferenceOccluder(ctx) {
        const focus = getFocusPoint();
        const centerX = focus.x;
        const centerY = focus.y + 72;

        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.beginPath();
        ctx.ellipse(centerX, centerY + 44, 210, 68, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = 'rgba(255, 235, 205, 0.22)';
        ctx.strokeStyle = 'rgba(255, 239, 212, 0.24)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(centerX - 68, centerY + 84);
        ctx.bezierCurveTo(centerX - 118, centerY + 18, centerX - 84, centerY - 132, centerX, centerY - 176);
        ctx.bezierCurveTo(centerX + 84, centerY - 132, centerX + 118, centerY + 18, centerX + 68, centerY + 84);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = 'rgba(255, 244, 206, 0.22)';
        ctx.lineWidth = 2;
        ctx.setLineDash([16, 14]);
        ctx.beginPath();
        ctx.ellipse(centerX, centerY + 44, 228, 74, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function updateStagePlaceholder() {
        if (!els.stagePlaceholder) return;
        els.stagePlaceholder.hidden = Boolean(state.sourceUrl);
    }

    function updateMeta() {
        if (els.currentSourceName) {
            els.currentSourceName.textContent = state.sourceLabel || '未选择';
        }
        if (els.currentPreviewMode) {
            els.currentPreviewMode.textContent = state.previewMode === 'ultimate' ? '大招齐射' : '普通施法';
        }
        if (els.currentBlendMode) {
            els.currentBlendMode.textContent = state.blendMode;
        }
        if (els.effectiveRenderSize) {
            els.effectiveRenderSize.textContent = `${getEffectiveRenderSize()}px`;
        }
    }

    function updateSourceStatus() {
        if (!els.sourceStatus) return;
        const lines = [
            `<div><strong>source</strong>: ${escapeHtml(state.sourceLabel || '未选择')}</div>`,
            `<div><strong>url</strong>: ${escapeHtml(state.sourceUrl || '无')}</div>`,
            `<div><strong>storage</strong>: ${escapeHtml(STORAGE_KEY)}</div>`
        ];
        els.sourceStatus.innerHTML = lines.join('');
    }

    function buildExportPayload() {
        return {
            version: 2,
            savedAt: new Date().toISOString(),
            source: {
                key: state.sourceKey || null,
                label: state.sourceLabel || null,
                url: state.sourceUrl || null
            },
            previewMode: state.previewMode,
            battleSize: {
                glyphBaseSize: Math.round(state.glyphBaseSize),
                arenaViewSizeTweak: round(state.arenaViewSizeTweak),
                effectiveRenderSize: getEffectiveRenderSize()
            },
            placement: {
                offsetX: Math.round(state.offsetX),
                offsetY: Math.round(state.offsetY),
                opacity: round(state.opacity),
                blendMode: state.blendMode
            },
            arena: {
                brightness: round(state.arenaBrightness),
                saturation: round(state.arenaSaturation),
                contrast: round(state.arenaContrast),
                vignette: round(state.vignette)
            },
            glyphPostFx: {
                saturation: round(state.glyphSaturation),
                contrast: round(state.glyphContrast),
                brightness: round(state.glyphBrightness),
                highlights: round(state.glyphHighlights),
                shadows: round(state.glyphShadows),
                whites: round(state.glyphWhites),
                blacks: round(state.glyphBlacks),
                glow: round(state.glyphGlow)
            },
            notes: {
                implementation: 'shared battle canvas renderer with optional debug post-fx overlays',
                notImplemented: ['sharpen', 'clarity']
            }
        };
    }

    function updateExport() {
        if (els.exportJson) {
            els.exportJson.value = JSON.stringify(buildExportPayload(), null, 2);
        }
    }

    function formatSliderValue(key, value) {
        if (['glyphBaseSize', 'offsetX', 'offsetY'].includes(key)) return `${Math.round(value)}px`;
        if (key === 'arenaViewSizeTweak') return `${round(value).toFixed(2)}x`;
        if (key === 'blendMode') return String(value);
        return round(value).toFixed(2);
    }

    function updateSliderText() {
        const mapping = {
            glyphBaseSize: els.glyphBaseSizeValue,
            arenaViewSizeTweak: els.arenaViewSizeTweakValue,
            offsetX: els.offsetXValue,
            offsetY: els.offsetYValue,
            opacity: els.opacityValue,
            glyphSaturation: els.glyphSaturationValue,
            glyphContrast: els.glyphContrastValue,
            glyphBrightness: els.glyphBrightnessValue,
            glyphHighlights: els.glyphHighlightsValue,
            glyphShadows: els.glyphShadowsValue,
            glyphWhites: els.glyphWhitesValue,
            glyphBlacks: els.glyphBlacksValue,
            glyphGlow: els.glyphGlowValue,
            vignette: els.vignetteValue,
            arenaBrightness: els.arenaBrightnessValue,
            arenaSaturation: els.arenaSaturationValue,
            arenaContrast: els.arenaContrastValue
        };

        Object.entries(mapping).forEach(([key, node]) => {
            if (node) node.textContent = formatSliderValue(key, state[key]);
        });
    }

    function setRangeValue(el, value) {
        if (el) el.value = String(value);
    }

    function syncControlsFromState() {
        setRangeValue(els.glyphBaseSizeRange, state.glyphBaseSize);
        setRangeValue(els.arenaViewSizeTweakRange, state.arenaViewSizeTweak);
        setRangeValue(els.offsetXRange, state.offsetX);
        setRangeValue(els.offsetYRange, state.offsetY);
        setRangeValue(els.opacityRange, state.opacity);
        setRangeValue(els.glyphSaturationRange, state.glyphSaturation);
        setRangeValue(els.glyphContrastRange, state.glyphContrast);
        setRangeValue(els.glyphBrightnessRange, state.glyphBrightness);
        setRangeValue(els.glyphHighlightsRange, state.glyphHighlights);
        setRangeValue(els.glyphShadowsRange, state.glyphShadows);
        setRangeValue(els.glyphWhitesRange, state.glyphWhites);
        setRangeValue(els.glyphBlacksRange, state.glyphBlacks);
        setRangeValue(els.glyphGlowRange, state.glyphGlow);
        setRangeValue(els.vignetteRange, state.vignette);
        setRangeValue(els.arenaBrightnessRange, state.arenaBrightness);
        setRangeValue(els.arenaSaturationRange, state.arenaSaturation);
        setRangeValue(els.arenaContrastRange, state.arenaContrast);
        if (els.previewModeSelect) els.previewModeSelect.value = state.previewMode;
        if (els.blendModeSelect) els.blendModeSelect.value = state.blendMode;
        if (els.videoUrlInput && !state.sourceKey) els.videoUrlInput.value = state.sourceUrl || '';
        updateSliderText();
    }

    function commitVisualState() {
        updateSliderText();
        updateSourceStatus();
        updateMeta();
        updateExport();
        updateStagePlaceholder();
        saveState();
    }

    function applyVideoSource(url, label, sourceKey) {
        state.sourceUrl = url || '';
        state.sourceLabel = label || '';
        state.sourceKey = sourceKey || '';

        if (!state.sourceUrl) {
            previewVideo.pause();
            previewVideo.removeAttribute('src');
            previewVideo.load();
            commitVisualState();
            return;
        }

        previewVideo.src = state.sourceUrl;
        previewVideo.currentTime = 0;
        previewVideo.play().catch(() => {});
        commitVisualState();
    }

    function revokeActiveObjectUrl() {
        if (!activeObjectUrl) return;
        URL.revokeObjectURL(activeObjectUrl);
        activeObjectUrl = null;
    }

    function getSourceOptionLabel(card, prefix) {
        const attrSet = typeof SpellDefs !== 'undefined' && SpellDefs.getCardAttrSet
            ? SpellDefs.getCardAttrSet(card)
            : [card?.mainAttr, card?.subAttr].filter(Boolean);
        const attrText = Array.isArray(attrSet) && attrSet.length > 0
            ? attrSet.join('/')
            : 'na';
        return `${prefix}${card.name} · ${attrText}`;
    }

    async function rebuildSourceCatalog() {
        sourceCatalog.clear();
        els.videoSourceSelect.innerHTML = '';

        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = '请选择一个已有卡牌视频';
        els.videoSourceSelect.appendChild(placeholderOption);

        if (typeof GameStorage !== 'undefined' && GameStorage.seedIfNeeded) {
            await GameStorage.seedIfNeeded();
        }
        if (typeof GameStorage === 'undefined' || !GameStorage.getCards) {
            return;
        }

        const loadoutCards = GameStorage.getLoadout ? GameStorage.getLoadout() : [];
        const cards = GameStorage.getCards()
            .filter(card => Boolean(GameStorage.getCardResultUrl(card) || GameStorage.getCardVideoUrl(card)));

        loadoutCards.forEach((card, index) => {
            if (!card) return;
            const url = GameStorage.getCardResultUrl(card) || GameStorage.getCardVideoUrl(card);
            if (!url) return;
            const key = `${CARD_URL_PREFIX}${card.id}`;
            const label = getSourceOptionLabel(card, `loadout ${index + 1} · `);
            sourceCatalog.set(key, { key, url, label });
        });

        cards
            .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-CN'))
            .forEach(card => {
                const key = `${CARD_URL_PREFIX}${card.id}`;
                if (sourceCatalog.has(key)) return;
                const url = GameStorage.getCardResultUrl(card) || GameStorage.getCardVideoUrl(card);
                sourceCatalog.set(key, { key, url, label: getSourceOptionLabel(card, '') });
            });

        [...sourceCatalog.values()].forEach(item => {
            const option = document.createElement('option');
            option.value = item.key;
            option.textContent = item.label;
            els.videoSourceSelect.appendChild(option);
        });

        if (state.sourceKey && sourceCatalog.has(state.sourceKey)) {
            els.videoSourceSelect.value = state.sourceKey;
        } else if (!state.sourceUrl && sourceCatalog.size > 0) {
            const first = [...sourceCatalog.values()][0];
            els.videoSourceSelect.value = first.key;
            applyVideoSource(first.url, first.label, first.key);
        }
    }

    function copyJson() {
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
            if (els.renderStatus) {
                els.renderStatus.innerHTML = [
                    '<div><strong>renderer</strong>: shared battle canvas renderer</div>',
                    '<div><strong>copy</strong>: 当前环境不支持自动复制，请手动复制</div>'
                ].join('');
            }
            return;
        }

        navigator.clipboard.writeText(els.exportJson.value).then(() => {
            if (els.renderStatus) {
                els.renderStatus.innerHTML = [
                    '<div><strong>renderer</strong>: shared battle canvas renderer</div>',
                    '<div><strong>copy</strong>: JSON 已复制到剪贴板</div>'
                ].join('');
            }
        }).catch(() => {
            if (els.renderStatus) {
                els.renderStatus.innerHTML = [
                    '<div><strong>renderer</strong>: shared battle canvas renderer</div>',
                    '<div><strong>copy</strong>: 复制失败，请手动复制</div>'
                ].join('');
            }
        });
    }

    function resetToDefaults() {
        revokeActiveObjectUrl();
        state = {
            ...DEFAULTS,
            sourceKey: state.sourceKey,
            sourceLabel: state.sourceLabel,
            sourceUrl: state.sourceUrl
        };
        syncControlsFromState();
        if (state.sourceUrl) {
            applyVideoSource(state.sourceUrl, state.sourceLabel, state.sourceKey);
        } else {
            commitVisualState();
        }
    }

    function bindRange(key, el, parser = Number) {
        el.addEventListener('input', () => {
            state[key] = parser(el.value);
            commitVisualState();
        });
    }

    function renderFrame(now) {
        const ctx = els.previewCanvas.getContext('2d');
        ctx.clearRect(0, 0, renderer.width, renderer.height);
        renderer.drawBackground(ctx, {
            camera: zeroCamera,
            background: {
                brightness: state.arenaBrightness,
                saturation: state.arenaSaturation,
                contrast: state.arenaContrast
            },
            now
        });

        const effects = buildPreviewEffects();
        if (effects.length > 0) {
            renderer.drawEffectsBottom(ctx, { effects, camera: zeroCamera, now });
        }

        drawReferenceOccluder(ctx);

        if (effects.length > 0) {
            renderer.drawEffectsTop(ctx, { effects, camera: zeroCamera, now });
        }

        renderer.drawVignette(ctx, { strength: state.vignette });
        rafId = requestAnimationFrame(renderFrame);
    }

    function startRenderLoop() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(renderFrame);
    }

    function initDom() {
        els.previewCanvas = $('arena-preview-canvas');
        els.stagePlaceholder = $('stage-placeholder');
        els.exportJson = $('export-json');
        els.videoSourceSelect = $('video-source-select');
        els.videoUrlInput = $('video-url-input');
        els.videoFileInput = $('video-file-input');
        els.applyVideoUrl = $('apply-video-url');
        els.clearVideoUrl = $('clear-video-url');
        els.sourceStatus = $('source-status');
        els.currentSourceName = $('current-source-name');
        els.currentPreviewMode = $('current-preview-mode');
        els.currentBlendMode = $('current-blend-mode');
        els.effectiveRenderSize = $('effective-render-size');
        els.renderStatus = $('render-status');
        els.copyJsonBtn = $('copy-json');
        els.resetDefaultsBtn = $('reset-defaults');
        els.previewModeSelect = $('preview-mode-select');
        els.blendModeSelect = $('blend-mode-select');

        els.glyphBaseSizeRange = $('glyph-base-size-range');
        els.arenaViewSizeTweakRange = $('arena-view-size-tweak-range');
        els.offsetXRange = $('offset-x-range');
        els.offsetYRange = $('offset-y-range');
        els.opacityRange = $('opacity-range');
        els.glyphSaturationRange = $('glyph-saturation-range');
        els.glyphContrastRange = $('glyph-contrast-range');
        els.glyphBrightnessRange = $('glyph-brightness-range');
        els.glyphHighlightsRange = $('glyph-highlights-range');
        els.glyphShadowsRange = $('glyph-shadows-range');
        els.glyphWhitesRange = $('glyph-whites-range');
        els.glyphBlacksRange = $('glyph-blacks-range');
        els.glyphGlowRange = $('glyph-glow-range');
        els.vignetteRange = $('vignette-range');
        els.arenaBrightnessRange = $('arena-brightness-range');
        els.arenaSaturationRange = $('arena-saturation-range');
        els.arenaContrastRange = $('arena-contrast-range');

        els.glyphBaseSizeValue = $('glyph-base-size-value');
        els.arenaViewSizeTweakValue = $('arena-view-size-tweak-value');
        els.offsetXValue = $('offset-x-value');
        els.offsetYValue = $('offset-y-value');
        els.opacityValue = $('opacity-value');
        els.glyphSaturationValue = $('glyph-saturation-value');
        els.glyphContrastValue = $('glyph-contrast-value');
        els.glyphBrightnessValue = $('glyph-brightness-value');
        els.glyphHighlightsValue = $('glyph-highlights-value');
        els.glyphShadowsValue = $('glyph-shadows-value');
        els.glyphWhitesValue = $('glyph-whites-value');
        els.glyphBlacksValue = $('glyph-blacks-value');
        els.glyphGlowValue = $('glyph-glow-value');
        els.vignetteValue = $('vignette-value');
        els.arenaBrightnessValue = $('arena-brightness-value');
        els.arenaSaturationValue = $('arena-saturation-value');
        els.arenaContrastValue = $('arena-contrast-value');
    }

    function bindEvents() {
        bindRange('glyphBaseSize', els.glyphBaseSizeRange, value => clamp(Number(value), 320, 1200));
        bindRange('arenaViewSizeTweak', els.arenaViewSizeTweakRange, value => clamp(Number(value), 0.6, 1.4));
        bindRange('offsetX', els.offsetXRange, value => clamp(Number(value), -520, 520));
        bindRange('offsetY', els.offsetYRange, value => clamp(Number(value), -320, 320));
        bindRange('opacity', els.opacityRange, value => clamp(Number(value), 0, 1));
        bindRange('glyphSaturation', els.glyphSaturationRange, value => clamp(Number(value), 0, 2.4));
        bindRange('glyphContrast', els.glyphContrastRange, value => clamp(Number(value), 0.2, 2.6));
        bindRange('glyphBrightness', els.glyphBrightnessRange, value => clamp(Number(value), 0.2, 2.2));
        bindRange('glyphHighlights', els.glyphHighlightsRange, value => clamp(Number(value), 0, 1));
        bindRange('glyphShadows', els.glyphShadowsRange, value => clamp(Number(value), 0, 1));
        bindRange('glyphWhites', els.glyphWhitesRange, value => clamp(Number(value), 0, 1));
        bindRange('glyphBlacks', els.glyphBlacksRange, value => clamp(Number(value), 0, 1));
        bindRange('glyphGlow', els.glyphGlowRange, value => clamp(Number(value), 0, 1));
        bindRange('vignette', els.vignetteRange, value => clamp(Number(value), 0, 0.95));
        bindRange('arenaBrightness', els.arenaBrightnessRange, value => clamp(Number(value), 0.2, 1.8));
        bindRange('arenaSaturation', els.arenaSaturationRange, value => clamp(Number(value), 0, 2.4));
        bindRange('arenaContrast', els.arenaContrastRange, value => clamp(Number(value), 0.4, 2.2));

        els.previewModeSelect.addEventListener('change', () => {
            state.previewMode = els.previewModeSelect.value;
            commitVisualState();
        });

        els.blendModeSelect.addEventListener('change', () => {
            state.blendMode = els.blendModeSelect.value;
            commitVisualState();
        });

        els.videoSourceSelect.addEventListener('change', () => {
            const next = sourceCatalog.get(els.videoSourceSelect.value);
            if (!next) return;
            revokeActiveObjectUrl();
            els.videoUrlInput.value = '';
            applyVideoSource(next.url, next.label, next.key);
        });

        els.applyVideoUrl.addEventListener('click', () => {
            const raw = String(els.videoUrlInput.value || '').trim();
            if (!raw) return;
            revokeActiveObjectUrl();
            const resolved = typeof AlchemyRuntime !== 'undefined' && AlchemyRuntime.resolveMediaUrl
                ? AlchemyRuntime.resolveMediaUrl(raw)
                : raw;
            els.videoSourceSelect.value = '';
            applyVideoSource(resolved, `manual url · ${raw}`, '');
        });

        els.clearVideoUrl.addEventListener('click', () => {
            els.videoUrlInput.value = '';
            revokeActiveObjectUrl();
            els.videoSourceSelect.value = '';
            applyVideoSource('', '', '');
        });

        els.videoFileInput.addEventListener('change', () => {
            const file = els.videoFileInput.files?.[0];
            if (!file) return;
            revokeActiveObjectUrl();
            activeObjectUrl = URL.createObjectURL(file);
            els.videoSourceSelect.value = '';
            els.videoUrlInput.value = '';
            applyVideoSource(activeObjectUrl, `local file · ${file.name}`, '');
        });

        els.copyJsonBtn.addEventListener('click', copyJson);
        els.resetDefaultsBtn.addEventListener('click', resetToDefaults);

        window.addEventListener('beforeunload', () => {
            if (rafId) cancelAnimationFrame(rafId);
            previewVideo.pause();
            revokeActiveObjectUrl();
        });
    }

    async function init() {
        initDom();
        bindEvents();
        syncControlsFromState();
        updateSourceStatus();
        updateMeta();
        updateExport();
        updateStagePlaceholder();
        await rebuildSourceCatalog();

        if (state.sourceKey && sourceCatalog.has(state.sourceKey)) {
            const source = sourceCatalog.get(state.sourceKey);
            applyVideoSource(source.url, source.label, source.key);
        } else if (state.sourceUrl) {
            applyVideoSource(state.sourceUrl, state.sourceLabel || 'restored source', state.sourceKey || '');
        } else {
            commitVisualState();
        }

        startRenderLoop();
    }

    init().catch(err => {
        console.error('[arena_glyph_tuner] init failed', err);
        if (els.renderStatus) {
            els.renderStatus.innerHTML = [
                '<div><strong>renderer</strong>: shared battle canvas renderer</div>',
                `<div><strong>error</strong>: ${escapeHtml(err?.message || err)}</div>`
            ].join('');
        }
    });
})();
