import {
  cloneLayoutConfig,
  getValueAtPath,
  serializeLayoutConfig,
  setValueAtPath,
} from "./layoutManager.js";

export class LayoutDebugPanel {
  constructor({ root, initialLayout, controlSchema, onLayoutChange, storageKey }) {
    this.root = root;
    this.layout = cloneLayoutConfig(initialLayout);
    this.controlSchema = controlSchema;
    this.onLayoutChange = onLayoutChange;
    this.storageKey = storageKey;
    this.exportTextarea = null;
    this.statusNode = null;
  }

  init() {
    this.restorePersistedLayout();
    this.render();
    this.emitLayoutChange();
  }

  restorePersistedLayout() {
    const rawValue = window.localStorage.getItem(this.storageKey);

    if (!rawValue) {
      return;
    }

    try {
      const parsed = JSON.parse(rawValue);
      this.layout = parsed;
    } catch {
      window.localStorage.removeItem(this.storageKey);
    }
  }

  render() {
    const panel = document.createElement("aside");
    panel.className = "debug-panel";
    panel.innerHTML = `
      <div class="debug-panel__header">
        <div>
          <p class="debug-panel__eyebrow">Layout Debug</p>
          <h2>版式调试</h2>
        </div>
        <div class="debug-panel__actions">
          <button class="debug-action-button" type="button" data-debug-action="copy">复制当前参数</button>
          <button class="debug-action-button debug-action-button--ghost" type="button" data-debug-action="reset">
            重置默认值
          </button>
        </div>
      </div>
      <p class="debug-panel__tip">
        当前调的是正式布局配置；页面会实时更新，复制出的 JSON 可直接回填到
        <code>src/config/layout.js</code>。
      </p>
      <div class="debug-panel__sections"></div>
      <label class="debug-export">
        <span>当前参数</span>
        <textarea class="debug-export__textarea" readonly data-debug-export></textarea>
      </label>
      <p class="debug-panel__status" data-debug-status>拖动滑块或改数字后，页面会实时更新。</p>
    `;

    const sectionsHost = panel.querySelector(".debug-panel__sections");
    this.exportTextarea = panel.querySelector("[data-debug-export]");
    this.statusNode = panel.querySelector("[data-debug-status]");

    this.controlSchema.forEach((sectionConfig) => {
      sectionsHost.appendChild(this.createSection(sectionConfig));
    });

    panel.querySelector('[data-debug-action="copy"]').addEventListener("click", () => {
      this.copyToClipboard();
    });

    panel.querySelector('[data-debug-action="reset"]').addEventListener("click", () => {
      window.localStorage.removeItem(this.storageKey);
      window.location.reload();
    });

    this.root.appendChild(panel);
    this.refreshExportText();
  }

  createSection(sectionConfig) {
    const section = document.createElement("section");
    section.className = "debug-section";

    const heading = document.createElement("h3");
    heading.className = "debug-section__title";
    heading.textContent = sectionConfig.section;
    section.appendChild(heading);

    sectionConfig.controls.forEach((controlConfig) => {
      section.appendChild(this.createControl(controlConfig));
    });

    return section;
  }

  createControl(controlConfig) {
    const wrapper = document.createElement("label");
    wrapper.className = "debug-control";

    const title = document.createElement("span");
    title.className = "debug-control__label";
    title.textContent = controlConfig.label;
    wrapper.appendChild(title);

    if (controlConfig.type === "select") {
      const select = document.createElement("select");
      select.className = "debug-control__select";

      controlConfig.options.forEach((optionConfig) => {
        const option = document.createElement("option");
        option.value = optionConfig.value;
        option.textContent = optionConfig.label;
        select.appendChild(option);
      });

      select.value = getValueAtPath(this.layout, controlConfig.path);
      select.addEventListener("change", () => {
        setValueAtPath(this.layout, controlConfig.path, select.value);
        this.handleControlChange();
      });

      wrapper.appendChild(select);
      return wrapper;
    }

    const inputs = document.createElement("div");
    inputs.className = "debug-control__inputs";

    const range = document.createElement("input");
    range.className = "debug-control__range";
    range.type = "range";
    range.min = `${controlConfig.min}`;
    range.max = `${controlConfig.max}`;
    range.step = `${controlConfig.step}`;

    const number = document.createElement("input");
    number.className = "debug-control__number";
    number.type = "number";
    number.min = `${controlConfig.min}`;
    number.max = `${controlConfig.max}`;
    number.step = `${controlConfig.step}`;

    const unit = document.createElement("span");
    unit.className = "debug-control__unit";
    unit.textContent = controlConfig.unit || "";

    const currentValue = getValueAtPath(this.layout, controlConfig.path);
    range.value = `${currentValue}`;
    number.value = `${currentValue}`;

    const syncValue = (rawValue) => {
      const numericValue = Number(rawValue);

      if (Number.isNaN(numericValue)) {
        return;
      }

      range.value = `${numericValue}`;
      number.value = `${numericValue}`;
      setValueAtPath(this.layout, controlConfig.path, numericValue);
      this.handleControlChange();
    };

    range.addEventListener("input", () => syncValue(range.value));
    number.addEventListener("input", () => syncValue(number.value));

    inputs.append(range, number, unit);
    wrapper.appendChild(inputs);
    return wrapper;
  }

  handleControlChange() {
    window.localStorage.setItem(this.storageKey, serializeLayoutConfig(this.layout));
    this.refreshExportText();
    this.emitLayoutChange();
  }

  emitLayoutChange() {
    this.onLayoutChange(cloneLayoutConfig(this.layout));
  }

  refreshExportText() {
    if (!this.exportTextarea) {
      return;
    }

    this.exportTextarea.value = serializeLayoutConfig(this.layout);
  }

  async copyToClipboard() {
    const text = serializeLayoutConfig(this.layout);

    try {
      await navigator.clipboard.writeText(text);
      this.statusNode.textContent = "当前参数已复制到剪贴板。";
    } catch {
      this.exportTextarea.focus();
      this.exportTextarea.select();
      this.statusNode.textContent = "浏览器未允许自动复制，已帮你选中参数，可直接 Ctrl+C。";
    }
  }
}
