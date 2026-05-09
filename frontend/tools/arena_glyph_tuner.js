// Local-only arena glyph visual tuner. This file belongs to frontend/tools and should be read only when doing visual debugging or parameter calibration, not during normal feature work.
(function () {
    const STORAGE_KEY = 'arena-glyph-tuner.v1';
    const CARD_URL_PREFIX = 'card:';
    const BATTLE_SIZE_PRESETS = [796, 597, 696, 895];
    const VIDEO_LAYER_IDS = [
        'glyph-base',
        'glyph-highlights',
        'glyph-shadows',
        'glyph-whites',
        'glyph-blacks',
        'glyph-glow'
    ];
    const DEFAULTS = {
        sourceKey: '',
        sourceLabel: '',
        sourceUrl: '',
        blendMode: 'lighten',
        size: BATTLE_SIZE_PRESETS[0],
        offsetX: 0,
        offsetY: 26,
        opacity: 0.96,
        glyphSaturation: 1,
        glyphContrast: 1,
        glyphBrightness: 1,
        glyphHighlights: 0.18,
        glyphShadows: 0.08,
        glyphWhites: 0.12,
        glyphBlacks: 0.1,
        glyphGlow: 0.2,
        vignette: 0.28,
        arenaBrightness: 0.59,
        arenaSaturation: 0.62,
        arenaContrast: 1
    };

    const els = {};
    const sourceCatalog = new Map();
    let state = loadState();
    let activeObjectUrl = null;
    let syncTimer = null;

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
                next.sourceUrl = '';
                next.sourceLabel = '';
                next.sourceKey = '';
            }
            return next;
        } catch {
            return { ...DEFAULTS };
        }
    }

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        if (els.persistStatus) {
            els.persistStatus.textContent = `已自动保存 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`;
        }
    }

    function buildExportPayload() {
        return {
            version: 1,
            savedAt: new Date().toISOString(),
            source: {
                key: state.sourceKey || null,
                label: state.sourceLabel || null,
                url: state.sourceUrl || null
            },
            arena: {
                brightness: round(state.arenaBrightness),
                saturation: round(state.arenaSaturation),
                contrast: round(state.arenaContrast)
            },
            glyph: {
                blendMode: state.blendMode,
                size: Math.round(state.size),
                offsetX: Math.round(state.offsetX),
                offsetY: Math.round(state.offsetY),
                opacity: round(state.opacity),
                saturation: round(state.glyphSaturation),
                contrast: round(state.glyphContrast),
                brightness: round(state.glyphBrightness),
                highlights: round(state.glyphHighlights),
                shadows: round(state.glyphShadows),
                whites: round(state.glyphWhites),
                blacks: round(state.glyphBlacks),
                glow: round(state.glyphGlow),
                vignette: round(state.vignette)
            },
            notes: {
                implementation: 'frontend approximate layers and CSS filters, not CapCut-equivalent',
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
        if (['offsetX', 'offsetY', 'size'].includes(key)) return `${Math.round(value)}px`;
        if (key === 'blendMode') return String(value);
        return round(value).toFixed(2);
    }

    function updateSliderText() {
        const mapping = {
            size: els.sizeValue,
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

    function applyStageVariables() {
        const stage = els.arenaStage;
        if (!stage) return;
        stage.style.setProperty('--arena-brightness', state.arenaBrightness);
        stage.style.setProperty('--arena-saturation', state.arenaSaturation);
        stage.style.setProperty('--arena-contrast', state.arenaContrast);
        stage.style.setProperty('--vignette', state.vignette);

        const glyphStack = els.glyphStack;
        glyphStack.style.setProperty('--glyph-size', `${state.size}px`);
        glyphStack.style.setProperty('--glyph-x', `${state.offsetX}px`);
        glyphStack.style.setProperty('--glyph-y', `${state.offsetY}px`);
        glyphStack.style.setProperty('--glyph-opacity', state.opacity);
        glyphStack.style.setProperty('--glyph-blend', state.blendMode);
        glyphStack.style.setProperty('--glyph-saturation', state.glyphSaturation);
        glyphStack.style.setProperty('--glyph-contrast', state.glyphContrast);
        glyphStack.style.setProperty('--glyph-brightness', state.glyphBrightness);
        glyphStack.style.setProperty('--glyph-highlights', state.glyphHighlights);
        glyphStack.style.setProperty('--glyph-shadows', state.glyphShadows);
        glyphStack.style.setProperty('--glyph-whites', state.glyphWhites);
        glyphStack.style.setProperty('--glyph-blacks', state.glyphBlacks);
        glyphStack.style.setProperty('--glyph-glow', state.glyphGlow);
    }

    function updateSourceStatus() {
        if (!els.sourceStatus) return;
        const lines = [
            `<div><strong>source</strong>: ${escapeHtml(state.sourceLabel || '未选择')}</div>`,
            `<div><strong>url</strong>: ${escapeHtml(state.sourceUrl || '无')}</div>`,
            `<div><strong>storage</strong>: ${escapeHtml(STORAGE_KEY)}</div>`
        ];
        els.sourceStatus.innerHTML = lines.join('');
        if (els.currentSourceName) {
            els.currentSourceName.textContent = state.sourceLabel || '未选择';
        }
        if (els.currentBlendMode) {
            els.currentBlendMode.textContent = state.blendMode;
        }
    }

    function escapeHtml(value) {
        return String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
    }

    function stopVideoSync() {
        if (syncTimer) {
            clearInterval(syncTimer);
            syncTimer = null;
        }
    }

    function syncVideoLayers() {
        const baseVideo = els.glyphBase;
        if (!baseVideo || baseVideo.readyState < 2) return;
        els.videos.forEach(video => {
            if (!video || video === baseVideo || video.readyState < 2) return;
            if (Math.abs(video.currentTime - baseVideo.currentTime) > 0.06) {
                try {
                    video.currentTime = baseVideo.currentTime;
                } catch {}
            }
            if (baseVideo.paused && !video.paused) {
                video.pause();
            } else if (!baseVideo.paused && video.paused) {
                video.play().catch(() => {});
            }
        });
    }

    function startVideoSync() {
        stopVideoSync();
        syncTimer = window.setInterval(syncVideoLayers, 250);
    }

    function applyVideoSource(url, label, sourceKey) {
        state.sourceUrl = url || '';
        state.sourceLabel = label || '';
        state.sourceKey = sourceKey || '';

        if (!state.sourceUrl) {
            els.placeholder.hidden = false;
            els.glyphStack.style.display = 'none';
            els.videos.forEach(video => {
                video.pause();
                video.removeAttribute('src');
                video.load();
            });
            stopVideoSync();
            updateSourceStatus();
            updateExport();
            saveState();
            return;
        }

        els.glyphStack.style.display = 'block';
        els.placeholder.hidden = true;
        els.videos.forEach(video => {
            video.src = state.sourceUrl;
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.preload = 'auto';
            video.currentTime = 0;
            video.play().catch(() => {});
        });
        startVideoSync();
        updateSourceStatus();
        updateExport();
        saveState();
    }

    function revokeActiveObjectUrl() {
        if (activeObjectUrl) {
            URL.revokeObjectURL(activeObjectUrl);
            activeObjectUrl = null;
        }
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
            sourceCatalog.set(key, { key, url, label, suggestedSize: BATTLE_SIZE_PRESETS[index] });
        });

        cards
            .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-CN'))
            .forEach(card => {
                const key = `${CARD_URL_PREFIX}${card.id}`;
                if (sourceCatalog.has(key)) return;
                const url = GameStorage.getCardResultUrl(card) || GameStorage.getCardVideoUrl(card);
                sourceCatalog.set(key, { key, url, label: getSourceOptionLabel(card, ''), suggestedSize: null });
            });

        [...sourceCatalog.values()].forEach(item => {
            const option = document.createElement('option');
            option.value = item.key;
            option.textContent = item.suggestedSize
                ? `${item.label} (battle size ${item.suggestedSize})`
                : item.label;
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

    function setRangeValue(el, value) {
        if (el) el.value = String(value);
    }

    function syncControlsFromState() {
        setRangeValue(els.sizeRange, state.size);
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
        if (els.blendModeSelect) els.blendModeSelect.value = state.blendMode;
        if (els.videoUrlInput && !state.sourceKey) els.videoUrlInput.value = state.sourceUrl || '';
        updateSliderText();
    }

    function commitVisualState() {
        applyStageVariables();
        updateSliderText();
        updateSourceStatus();
        updateExport();
        saveState();
    }

    function bindRange(key, el, parser = Number) {
        el.addEventListener('input', () => {
            state[key] = parser(el.value);
            commitVisualState();
        });
    }

    function resetToDefaults() {
        revokeActiveObjectUrl();
        state = { ...DEFAULTS, sourceKey: state.sourceKey, sourceLabel: state.sourceLabel, sourceUrl: state.sourceUrl };
        syncControlsFromState();
        commitVisualState();
        if (state.sourceUrl) {
            applyVideoSource(state.sourceUrl, state.sourceLabel, state.sourceKey);
        }
    }

    function copyJson() {
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
            els.persistStatus.textContent = '当前环境不支持自动复制，请手动复制';
            return;
        }
        navigator.clipboard.writeText(els.exportJson.value).then(() => {
            els.persistStatus.textContent = 'JSON 已复制到剪贴板';
        }).catch(() => {
            els.persistStatus.textContent = '复制失败，请手动复制';
        });
    }

    function initDom() {
        els.arenaStage = $('arena-stage');
        els.glyphStack = $('glyph-stack');
        els.placeholder = $('placeholder');
        els.exportJson = $('export-json');
        els.videoSourceSelect = $('video-source-select');
        els.videoUrlInput = $('video-url-input');
        els.videoFileInput = $('video-file-input');
        els.applyVideoUrl = $('apply-video-url');
        els.clearVideoUrl = $('clear-video-url');
        els.sourceStatus = $('source-status');
        els.currentSourceName = $('current-source-name');
        els.currentBlendMode = $('current-blend-mode');
        els.persistStatus = $('persist-status');
        els.copyJsonBtn = $('copy-json');
        els.resetDefaultsBtn = $('reset-defaults');
        els.blendModeSelect = $('blend-mode-select');

        els.sizeRange = $('size-range');
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

        els.sizeValue = $('size-value');
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
        els.glyphBase = $('glyph-base');
        els.videos = VIDEO_LAYER_IDS.map(id => $(id));
    }

    function bindEvents() {
        bindRange('size', els.sizeRange, value => clamp(Number(value), 240, 1400));
        bindRange('offsetX', els.offsetXRange, value => clamp(Number(value), -520, 520));
        bindRange('offsetY', els.offsetYRange, value => clamp(Number(value), -300, 300));
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

        document.querySelectorAll('.size-preset').forEach(button => {
            button.addEventListener('click', () => {
                state.size = Number(button.dataset.size);
                syncControlsFromState();
                commitVisualState();
            });
        });

        els.copyJsonBtn.addEventListener('click', copyJson);
        els.resetDefaultsBtn.addEventListener('click', resetToDefaults);

        window.addEventListener('beforeunload', () => {
            stopVideoSync();
            revokeActiveObjectUrl();
        });
    }

    async function init() {
        initDom();
        bindEvents();
        syncControlsFromState();
        applyStageVariables();
        updateSourceStatus();
        updateExport();
        await rebuildSourceCatalog();
        if (state.sourceKey && sourceCatalog.has(state.sourceKey)) {
            const source = sourceCatalog.get(state.sourceKey);
            applyVideoSource(source.url, source.label, source.key);
        } else if (state.sourceUrl) {
            applyVideoSource(state.sourceUrl, state.sourceLabel || 'restored source', state.sourceKey || '');
        } else {
            applyVideoSource('', '', '');
        }
    }

    init().catch(err => {
        console.error('[arena_glyph_tuner] init failed', err);
        if (els.persistStatus) {
            els.persistStatus.textContent = `初始化失败: ${err?.message || err}`;
        }
    });
})();
