const AIConfig = (() => {
    const LOCAL_KEY = 'alchemy-ai-config';
    const SESSION_KEY = 'alchemy-ai-session-config';
    const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
    const DEFAULT_MODEL = 'gpt-5.4';

    const els = {};
    let currentMode = 'personal';

    function init() {
        els.openBtn = document.getElementById('btn-ai-config');
        els.overlay = document.getElementById('ai-config-overlay');
        els.closeBtn = document.getElementById('btn-ai-config-close');
        els.modeBtns = Array.from(document.querySelectorAll('.ai-config-mode-btn'));
        els.personalPanel = document.getElementById('ai-config-personal');
        els.internalPanel = document.getElementById('ai-config-internal');
        els.apiKey = document.getElementById('ai-config-api-key');
        els.baseUrl = document.getElementById('ai-config-base-url');
        els.model = document.getElementById('ai-config-model');
        els.remember = document.getElementById('ai-config-remember');
        els.password = document.getElementById('ai-config-password');
        els.testBtn = document.getElementById('btn-ai-config-test');
        els.saveBtn = document.getElementById('btn-ai-config-save');
        els.message = document.getElementById('ai-config-message');
        els.status = document.getElementById('ai-config-status');

        if (els.overlay && els.overlay.parentElement !== document.body) {
            document.body.appendChild(els.overlay);
        }

        els.openBtn?.addEventListener('click', () => show({ force: true }));
        els.closeBtn?.addEventListener('click', hide);
        els.modeBtns.forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode || 'personal')));
        els.testBtn?.addEventListener('click', () => testCurrentConfig({ persist: false }));
        els.saveBtn?.addEventListener('click', () => testCurrentConfig({ persist: true }));

        hydrateForm(loadConfig());
        updateStatus();
    }

    function showStartupIfNeeded() {
        if (!isConfigured()) show({ force: true });
    }

    function show({ force = false } = {}) {
        if (!els.overlay) return;
        hydrateForm(loadConfig());
        els.overlay.hidden = false;
        els.overlay.classList.add('open');
        if (els.closeBtn) els.closeBtn.disabled = force && !isConfigured();
        setMessage(isConfigured() ? 'AI 引擎已连接。' : '进入炼金前先连接 AI 引擎。', 'info');
    }

    function hide() {
        if (!isConfigured()) {
            setMessage('请先完成 AI 引擎连接。', 'error');
            return;
        }
        els.overlay.hidden = true;
        els.overlay.classList.remove('open');
    }

    function ensureReadyForAction() {
        if (isConfigured()) return true;
        show({ force: true });
        return false;
    }

    function setMode(mode) {
        currentMode = mode === 'internal' ? 'internal' : 'personal';
        els.modeBtns?.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === currentMode));
        if (els.personalPanel) els.personalPanel.hidden = currentMode !== 'personal';
        if (els.internalPanel) els.internalPanel.hidden = currentMode !== 'internal';
        setMessage('', 'info');
    }

    function hydrateForm(config) {
        currentMode = config?.mode === 'internal' ? 'internal' : 'personal';
        if (els.apiKey) els.apiKey.value = config?.apiKey || '';
        if (els.baseUrl) els.baseUrl.value = config?.baseUrl || '';
        if (els.model) els.model.value = DEFAULT_MODEL;
        if (els.password) els.password.value = '';
        if (els.remember) els.remember.checked = Boolean(config?.remember);
        setMode(currentMode);
    }

    function readForm() {
        if (currentMode === 'internal') {
            return {
                mode: 'internal',
                internalPassword: String(els.password?.value || '').trim()
            };
        }
        return {
            mode: 'personal',
            apiKey: String(els.apiKey?.value || '').trim(),
            baseUrl: String(els.baseUrl?.value || '').trim() || DEFAULT_BASE_URL,
            model: DEFAULT_MODEL,
            remember: Boolean(els.remember?.checked)
        };
    }

    function validateClient(config) {
        if (config.mode === 'internal') {
            if (!config.internalPassword) return '请输入内部通道密码。';
            return null;
        }
        if (!config.apiKey) return '请输入 API Key。';
        if (!/^https?:\/\//i.test(config.baseUrl || '')) return 'Base URL 需要以 http:// 或 https:// 开头。';
        if (!String(config.model || '').toLowerCase().startsWith('gpt-')) return '模型只能使用 gpt-*。';
        return null;
    }

    async function testCurrentConfig({ persist }) {
        const config = readForm();
        const clientError = validateClient(config);
        if (clientError) {
            setMessage(clientError, 'error');
            return false;
        }

        setBusy(true);
        setMessage('正在连接 AI 引擎...', 'info');
        try {
            const res = await fetch(AlchemyRuntime.buildApiUrl('/api/ai-config/test'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ aiConfig: toRequestPayload(config) })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.ok) {
                const detail = data?.detail?.message || data?.detail || `HTTP ${res.status}`;
                throw new Error(detail);
            }
            if (persist) {
                saveConfig(config);
                updateStatus();
                if (els.password) els.password.value = '';
                setMessage('AI 引擎已连接。', 'success');
                setTimeout(hide, 350);
            } else {
                setMessage('测试通过。', 'success');
            }
            return true;
        } catch (error) {
            setMessage(error?.message || '连接失败。', 'error');
            return false;
        } finally {
            setBusy(false);
        }
    }

    function toRequestPayload(config) {
        if (!config) return null;
        if (config.mode === 'internal') {
            return {
                mode: 'internal',
                internalPassword: config.internalPassword || ''
            };
        }
        return {
            mode: 'personal',
            apiKey: config.apiKey || '',
            baseUrl: config.baseUrl || DEFAULT_BASE_URL,
            model: config.model || DEFAULT_MODEL
        };
    }

    function getRequestPayload() {
        return toRequestPayload(loadConfig());
    }

    function isConfigured() {
        const config = loadConfig();
        return !validateClient(config || {});
    }

    function saveConfig(config) {
        const storageConfig = { ...config };
        if (storageConfig.mode === 'internal') {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(storageConfig));
            localStorage.removeItem(LOCAL_KEY);
            return;
        }
        if (storageConfig.remember) {
            localStorage.setItem(LOCAL_KEY, JSON.stringify(storageConfig));
            sessionStorage.removeItem(SESSION_KEY);
        } else {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(storageConfig));
            localStorage.removeItem(LOCAL_KEY);
        }
    }

    function loadConfig() {
        const config = readStored(sessionStorage.getItem(SESSION_KEY)) || readStored(localStorage.getItem(LOCAL_KEY));
        if (!config) return null;
        if (config.mode === 'personal') {
            return {
                ...config,
                model: DEFAULT_MODEL
            };
        }
        return config;
    }

    function readStored(raw) {
        if (!raw) return null;
        try {
            const data = JSON.parse(raw);
            if (!data || typeof data !== 'object') return null;
            return data;
        } catch {
            return null;
        }
    }

    function updateStatus() {
        const config = loadConfig();
        const ok = !validateClient(config || {});
        if (!els.status) return;
        els.status.textContent = ok
            ? (config.mode === 'internal' ? 'AI 内部通道' : 'AI 个人 API')
            : 'AI 未连接';
        els.status.classList.toggle('ready', ok);
    }

    function setBusy(busy) {
        if (els.testBtn) els.testBtn.disabled = busy;
        if (els.saveBtn) els.saveBtn.disabled = busy;
    }

    function setMessage(text, tone) {
        if (!els.message) return;
        els.message.textContent = text || '';
        els.message.dataset.tone = tone || 'info';
    }

    return {
        init,
        showStartupIfNeeded,
        ensureReadyForAction,
        getRequestPayload,
        isConfigured,
        show
    };
})();
