/**
 * runtimeConfig.js - front-end runtime config and backend media URL normalization
 */
const AlchemyRuntime = (() => {
    const DEFAULT_API_BASE = 'http://localhost:18001';
    const GLOBAL_CONFIG_KEY = '__ALCHEMY_RUNTIME_CONFIG__';
    const MEDIA_URL_FIELDS = ['thumbnailUrl', 'videoUrl', 'resultUrl', 'sfxUrl', 'videoResultUrl'];

    function getGlobalConfig() {
        if (!window[GLOBAL_CONFIG_KEY] || typeof window[GLOBAL_CONFIG_KEY] !== 'object') {
            window[GLOBAL_CONFIG_KEY] = {};
        }
        return window[GLOBAL_CONFIG_KEY];
    }

    function normalizeApiBase(value) {
        const text = String(value || '').trim();
        if (!text) return DEFAULT_API_BASE;
        return text.replace(/\/+$/, '');
    }

    function isAbsoluteUrl(value) {
        return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value) || String(value || '').startsWith('//');
    }

    function getApiBase() {
        const config = getGlobalConfig();
        config.apiBase = normalizeApiBase(config.apiBase || DEFAULT_API_BASE);
        return config.apiBase;
    }

    function setApiBase(value) {
        const config = getGlobalConfig();
        config.apiBase = normalizeApiBase(value);
        return config.apiBase;
    }

    function buildApiUrl(path = '') {
        const raw = String(path || '').trim();
        if (!raw) return getApiBase();
        if (isAbsoluteUrl(raw)) return raw;
        if (raw.startsWith('/')) return `${getApiBase()}${raw}`;
        return `${getApiBase()}/${raw.replace(/^\.?\/+/, '')}`;
    }

    function resolveMediaUrl(value) {
        const raw = String(value || '').trim();
        if (!raw) return null;
        if (isAbsoluteUrl(raw)) return raw;
        if (raw.startsWith('/api/')) return buildApiUrl(raw);
        if (raw.startsWith('api/')) return buildApiUrl(`/${raw}`);
        return raw;
    }

    function normalizeMediaPayload(payload) {
        if (payload == null) return payload;
        if (Array.isArray(payload)) {
            return payload.map(item => normalizeMediaPayload(item));
        }
        if (typeof payload !== 'object') return payload;

        const next = { ...payload };
        MEDIA_URL_FIELDS.forEach(field => {
            if (!Object.prototype.hasOwnProperty.call(next, field)) return;
            next[field] = resolveMediaUrl(next[field]);
        });
        return next;
    }

    const apiBase = getApiBase();
    window.__ALCHEMY_API_BASE = apiBase;

    return {
        DEFAULT_API_BASE,
        getApiBase,
        setApiBase,
        buildApiUrl,
        resolveMediaUrl,
        normalizeMediaPayload
    };
})();
