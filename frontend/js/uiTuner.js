const UITuner = (() => {
    const VALUES_KEY = 'alchemy-ui-tuner-values-v1';
    const OPEN_KEY = 'alchemy-ui-tuner-open-v1';
    const HOTKEY_CODE = 'KeyU';

    const SCHEMA = [
        {
            title: 'Alchemy',
            fields: [
                { cssVar: '--alchemy-slot-width', label: 'slot width', min: 10, max: 24, step: 0.1, unit: '%', defaultValue: 15.8 },
                { cssVar: '--alchemy-slot-top', label: 'slot top', min: 10, max: 36, step: 0.1, unit: '%', defaultValue: 24.4 },
                { cssVar: '--alchemy-slot-a-left', label: 'slot A left', min: 18, max: 46, step: 0.1, unit: '%', defaultValue: 34.3 },
                { cssVar: '--alchemy-slot-b-left', label: 'slot B left', min: 42, max: 70, step: 0.1, unit: '%', defaultValue: 52.9 },
                { cssVar: '--alchemy-slot-scale', label: 'slot scale', min: 0.7, max: 1.3, step: 0.01, unit: '', defaultValue: 1 },
                { cssVar: '--alchemy-slot-opacity', label: 'slot opacity', min: 0.2, max: 1, step: 0.01, unit: '', defaultValue: 1 },
                { cssVar: '--alchemy-slot-brightness', label: 'brightness', min: 0.5, max: 1.8, step: 0.01, unit: '', defaultValue: 1 },
                { cssVar: '--alchemy-slot-saturation', label: 'saturation', min: 0.3, max: 1.8, step: 0.01, unit: '', defaultValue: 1 },
            ]
        },
        {
            title: 'Collection',
            fields: [
                { cssVar: '--collection-preview-width', label: 'preview width', min: 280, max: 520, step: 1, unit: 'px', defaultValue: 385 },
                { cssVar: '--collection-layout-gap', label: 'layout gap', min: 8, max: 60, step: 1, unit: 'px', defaultValue: 30 },
                { cssVar: '--collection-grid-gap', label: 'grid gap', min: 6, max: 36, step: 1, unit: 'px', defaultValue: 19 },
                { cssVar: '--collection-grid-columns', label: 'grid cols', min: 4, max: 8, step: 1, unit: '', defaultValue: 6 },
            ]
        },
        {
            title: 'Loadout',
            fields: [
                { cssVar: '--loadout-slot-width', label: 'slot width', min: 180, max: 360, step: 1, unit: 'px', defaultValue: 278 },
                { cssVar: '--loadout-slot-gap', label: 'slot gap', min: 0, max: 48, step: 1, unit: 'px', defaultValue: 20 },
                { cssVar: '--loadout-slot-margin-bottom', label: 'bottom gap', min: 12, max: 96, step: 1, unit: 'px', defaultValue: 48 },
                { cssVar: '--loadout-slot-scale', label: 'slot scale', min: 0.7, max: 1.3, step: 0.01, unit: '', defaultValue: 1 },
                { cssVar: '--loadout-slot-opacity', label: 'slot opacity', min: 0.2, max: 1, step: 0.01, unit: '', defaultValue: 1 },
                { cssVar: '--loadout-slot-brightness', label: 'brightness', min: 0.5, max: 1.8, step: 0.01, unit: '', defaultValue: 1 },
                { cssVar: '--loadout-slot-saturation', label: 'saturation', min: 0.3, max: 1.8, step: 0.01, unit: '', defaultValue: 1 },
                { cssVar: '--loadout-grid-gap', label: 'grid gap', min: 6, max: 24, step: 1, unit: 'px', defaultValue: 11 },
                { cssVar: '--loadout-grid-columns', label: 'grid cols', min: 4, max: 8, step: 1, unit: '', defaultValue: 6 },
            ]
        }
    ];

    const fieldMap = new Map();
    let panel = null;
    let output = null;

    function init() {
        applyValues(loadValues());
        createPanel();
        bindHotkey();

        const params = new URLSearchParams(window.location.search);
        if (params.get('uiTuner') === '1' || localStorage.getItem(OPEN_KEY) === '1') {
            open();
        }
    }

    function bindHotkey() {
        document.addEventListener('keydown', (event) => {
            if (event.repeat) return;
            if (!event.ctrlKey || !event.shiftKey || event.code !== HOTKEY_CODE) return;
            event.preventDefault();
            toggle();
        });
    }

    function loadValues() {
        try {
            return JSON.parse(localStorage.getItem(VALUES_KEY) || '{}');
        } catch {
            return {};
        }
    }

    function saveValues(values) {
        localStorage.setItem(VALUES_KEY, JSON.stringify(values));
    }

    function getCurrentValues() {
        const values = {};
        SCHEMA.forEach((group) => {
            group.fields.forEach((field) => {
                values[field.cssVar] = readFieldValue(field);
            });
        });
        return values;
    }

    function readFieldValue(field) {
        const stored = loadValues()[field.cssVar];
        if (typeof stored === 'number') return stored;
        return field.defaultValue;
    }

    function applyValues(values) {
        const root = document.documentElement;
        SCHEMA.forEach((group) => {
            group.fields.forEach((field) => {
                const rawValue = values[field.cssVar];
                const numericValue = typeof rawValue === 'number' ? rawValue : field.defaultValue;
                root.style.setProperty(field.cssVar, `${numericValue}${field.unit}`);
            });
        });
    }

    function createPanel() {
        panel = document.createElement('aside');
        panel.className = 'ui-tuner-panel';
        panel.innerHTML = `
            <div class="ui-tuner-header">
                <div>
                    <div class="ui-tuner-title">UI Tuner</div>
                    <div class="ui-tuner-subtitle">Ctrl+Shift+U to toggle</div>
                </div>
                <div class="ui-tuner-actions">
                    <button type="button" class="ui-tuner-btn" data-action="copy">Copy JSON</button>
                    <button type="button" class="ui-tuner-btn" data-action="reset">Reset</button>
                    <button type="button" class="ui-tuner-btn" data-action="close">Close</button>
                </div>
            </div>
        `;

        SCHEMA.forEach((group) => {
            const groupEl = document.createElement('section');
            groupEl.className = 'ui-tuner-group';

            const titleEl = document.createElement('div');
            titleEl.className = 'ui-tuner-group-title';
            titleEl.textContent = group.title;
            groupEl.appendChild(titleEl);

            group.fields.forEach((field) => {
                const row = document.createElement('label');
                row.className = 'ui-tuner-row';

                const label = document.createElement('span');
                label.className = 'ui-tuner-label';
                label.textContent = field.label;

                const range = document.createElement('input');
                range.className = 'ui-tuner-range';
                range.type = 'range';
                range.min = String(field.min);
                range.max = String(field.max);
                range.step = String(field.step);
                range.value = String(readFieldValue(field));

                const value = document.createElement('span');
                value.className = 'ui-tuner-value';

                range.addEventListener('input', () => {
                    const parsedValue = Number(range.value);
                    const nextValues = getCurrentValues();
                    nextValues[field.cssVar] = parsedValue;
                    applyValues(nextValues);
                    saveValues(nextValues);
                    renderFieldValue(field, value, parsedValue);
                    renderOutput(nextValues);
                });

                renderFieldValue(field, value, Number(range.value));

                row.appendChild(label);
                row.appendChild(range);
                row.appendChild(value);
                groupEl.appendChild(row);

                fieldMap.set(field.cssVar, { field, range, value });
            });

            panel.appendChild(groupEl);
        });

        output = document.createElement('textarea');
        output.className = 'ui-tuner-output';
        output.readOnly = true;
        panel.appendChild(output);

        panel.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-action]');
            if (!button) return;
            const action = button.getAttribute('data-action');
            if (action === 'close') {
                close();
                return;
            }
            if (action === 'reset') {
                reset();
                return;
            }
            if (action === 'copy') {
                await copyOutput();
            }
        });

        document.body.appendChild(panel);
        renderOutput(getCurrentValues());
    }

    function renderFieldValue(field, target, value) {
        const displayValue = field.step < 1 ? value.toFixed(2) : String(Math.round(value));
        target.textContent = `${displayValue}${field.unit}`;
    }

    function renderOutput(values) {
        if (!output) return;
        output.value = JSON.stringify(values, null, 2);
    }

    async function copyOutput() {
        const text = output ? output.value : JSON.stringify(getCurrentValues(), null, 2);
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(text);
                return;
            } catch {
                // fall through to manual select
            }
        }
        if (output) {
            output.focus();
            output.select();
        }
    }

    function syncControls(values) {
        fieldMap.forEach(({ field, range, value }, cssVar) => {
            const nextValue = typeof values[cssVar] === 'number' ? values[cssVar] : field.defaultValue;
            range.value = String(nextValue);
            renderFieldValue(field, value, nextValue);
        });
        renderOutput(values);
    }

    function reset() {
        const defaults = {};
        SCHEMA.forEach((group) => {
            group.fields.forEach((field) => {
                defaults[field.cssVar] = field.defaultValue;
            });
        });
        applyValues(defaults);
        saveValues(defaults);
        syncControls(defaults);
    }

    function open() {
        if (!panel) return;
        panel.classList.add('open');
        localStorage.setItem(OPEN_KEY, '1');
        syncControls(getCurrentValues());
    }

    function close() {
        if (!panel) return;
        panel.classList.remove('open');
        localStorage.setItem(OPEN_KEY, '0');
    }

    function toggle() {
        if (!panel) return;
        if (panel.classList.contains('open')) close();
        else open();
    }

    return {
        init,
        open,
        close,
        toggle,
        getValues: getCurrentValues
    };
})();

document.addEventListener('DOMContentLoaded', () => UITuner.init());
