function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function serializeTransitionConfig(config) {
  return JSON.stringify(
    {
      mediaEndScaleMultiplier: config.mediaEndScaleMultiplier,
      mediaEndOffsetXPx: config.mediaEndOffsetXPx,
      mediaEndOffsetYPx: config.mediaEndOffsetYPx,
    },
    null,
    2,
  );
}

export class TransitionDebugPanel {
  constructor({
    root,
    initialTransition,
    initialDebugOptions,
    onTransitionChange,
    onDebugOptionsChange,
    onResumeRequest,
    storageKey,
  }) {
    this.root = root;
    this.transition = cloneValue(initialTransition);
    this.debugOptions = cloneValue(initialDebugOptions);
    this.onTransitionChange = onTransitionChange;
    this.onDebugOptionsChange = onDebugOptionsChange;
    this.onResumeRequest = onResumeRequest;
    this.storageKey = storageKey;
    this.exportTextarea = null;
    this.statusNode = null;
    this.resumeButton = null;
    this.appPhase = "idle";
  }

  init() {
    this.restorePersistedState();
    this.render();
    this.bindAppStateListener();
    this.emitAllChanges();
  }

  restorePersistedState() {
    const rawValue = window.localStorage.getItem(this.storageKey);

    if (!rawValue) {
      return;
    }

    try {
      const parsed = JSON.parse(rawValue);

      if (typeof parsed.mediaEndScaleMultiplier === "number" && !Number.isNaN(parsed.mediaEndScaleMultiplier)) {
        this.transition.mediaEndScaleMultiplier = parsed.mediaEndScaleMultiplier;
      }

      if (typeof parsed.mediaEndOffsetXPx === "number" && !Number.isNaN(parsed.mediaEndOffsetXPx)) {
        this.transition.mediaEndOffsetXPx = parsed.mediaEndOffsetXPx;
      }

      if (typeof parsed.mediaEndOffsetYPx === "number" && !Number.isNaN(parsed.mediaEndOffsetYPx)) {
        this.transition.mediaEndOffsetYPx = parsed.mediaEndOffsetYPx;
      }

      if (typeof parsed.mediaOpacity === "number" && !Number.isNaN(parsed.mediaOpacity)) {
        this.debugOptions.mediaOpacity = parsed.mediaOpacity;
      }

      if (typeof parsed.pauseAtEndFrame === "boolean") {
        this.debugOptions.pauseAtEndFrame = parsed.pauseAtEndFrame;
      }
    } catch {
      window.localStorage.removeItem(this.storageKey);
    }
  }

  render() {
    const layoutPanel = this.root.querySelector(".debug-panel");
    const sectionsHost = layoutPanel?.querySelector(".debug-panel__sections");

    if (!layoutPanel || !sectionsHost) {
      return;
    }

    const section = document.createElement("section");
    section.className = "debug-section transition-debug-panel";
    section.innerHTML = `
      <h3 class="debug-section__title">Transition Debug / Zoom Tune</h3>
      <p class="debug-panel__tip transition-debug-panel__tip">
        Pause on the last frame, then tune scale, X/Y offset, and overlay opacity until the room image aligns.
      </p>
      <div class="transition-debug-panel__controls"></div>
      <div class="debug-panel__actions transition-debug-panel__actions">
        <button class="debug-action-button" type="button" data-transition-action="resume">Resume Transition</button>
        <button class="debug-action-button" type="button" data-transition-action="copy">Copy JSON</button>
        <button class="debug-action-button debug-action-button--ghost" type="button" data-transition-action="reset">
          Reset
        </button>
      </div>
      <label class="debug-export">
        <span>Current transition config</span>
        <textarea class="debug-export__textarea transition-debug-panel__textarea" readonly data-transition-export></textarea>
      </label>
      <p class="debug-panel__status" data-transition-status>
        Keep "Pause on end frame" enabled, click page 11 "Enter Game", then align the frozen final frame.
      </p>
    `;

    const controlsHost = section.querySelector(".transition-debug-panel__controls");
    this.exportTextarea = section.querySelector("[data-transition-export]");
    this.statusNode = section.querySelector("[data-transition-status]");
    this.resumeButton = section.querySelector('[data-transition-action="resume"]');

    controlsHost.appendChild(
      this.createNumericControl({
        label: "mediaEndScaleMultiplier",
        min: 0.2,
        max: 2,
        step: 0.005,
        unit: "x",
        value: this.transition.mediaEndScaleMultiplier,
        onChange: (nextValue) => {
          this.transition.mediaEndScaleMultiplier = nextValue;
          this.handleStateChange();
        },
      }),
    );

    controlsHost.appendChild(
      this.createNumericControl({
        label: "mediaEndOffsetXPx",
        min: -800,
        max: 800,
        step: 1,
        unit: "px",
        value: this.transition.mediaEndOffsetXPx,
        onChange: (nextValue) => {
          this.transition.mediaEndOffsetXPx = nextValue;
          this.handleStateChange();
        },
      }),
    );

    controlsHost.appendChild(
      this.createNumericControl({
        label: "mediaEndOffsetYPx",
        min: -800,
        max: 800,
        step: 1,
        unit: "px",
        value: this.transition.mediaEndOffsetYPx,
        onChange: (nextValue) => {
          this.transition.mediaEndOffsetYPx = nextValue;
          this.handleStateChange();
        },
      }),
    );

    controlsHost.appendChild(
      this.createNumericControl({
        label: "mediaOpacity (debug)",
        min: 0,
        max: 1,
        step: 0.01,
        unit: "",
        value: this.debugOptions.mediaOpacity,
        onChange: (nextValue) => {
          this.debugOptions.mediaOpacity = nextValue;
          this.handleStateChange();
        },
      }),
    );

    controlsHost.appendChild(
      this.createToggleControl({
        label: "Pause on end frame",
        checked: this.debugOptions.pauseAtEndFrame,
        onChange: (checked) => {
          this.debugOptions.pauseAtEndFrame = checked;
          this.handleStateChange();
        },
      }),
    );

    section.querySelector('[data-transition-action="resume"]').addEventListener("click", () => {
      const resumed = this.onResumeRequest();
      this.statusNode.textContent = resumed
        ? "Resuming transition..."
        : 'No frozen end frame yet. Click page 11 "Enter Game" first.';
    });

    section.querySelector('[data-transition-action="copy"]').addEventListener("click", () => {
      this.copyToClipboard();
    });

    section.querySelector('[data-transition-action="reset"]').addEventListener("click", () => {
      window.localStorage.removeItem(this.storageKey);
      window.location.reload();
    });

    sectionsHost.appendChild(section);
    this.applyAppState({ phase: "idle" });
    this.refreshExportText();
  }

  bindAppStateListener() {
    window.addEventListener("alchemy-intro-book:transition-debug-state", (event) => {
      this.applyAppState(event.detail || { phase: "idle" });
    });
  }

  applyAppState({ phase }) {
    this.appPhase = phase;

    if (this.resumeButton) {
      this.resumeButton.disabled = phase !== "frozen";
    }

    if (!this.statusNode) {
      return;
    }

    if (phase === "running") {
      this.statusNode.textContent = this.debugOptions.pauseAtEndFrame
        ? "Transition running. It will freeze on the final frame for alignment."
        : "Transition running. Enable Pause on end frame if you want to freeze the last frame.";
      return;
    }

    if (phase === "frozen") {
      this.statusNode.textContent =
        "Frozen on the final frame. Tune scale, X/Y, and opacity until it aligns, then click Resume Transition.";
      return;
    }

    if (phase === "resuming") {
      this.statusNode.textContent = "Resuming transition...";
      return;
    }

    this.statusNode.textContent =
      'Keep "Pause on end frame" enabled, click page 11 "Enter Game", then align the frozen final frame.';
  }

  createNumericControl({ label, min, max, step, unit, value, onChange }) {
    const wrapper = document.createElement("label");
    wrapper.className = "debug-control";

    const title = document.createElement("span");
    title.className = "debug-control__label";
    title.textContent = label;
    wrapper.appendChild(title);

    const inputs = document.createElement("div");
    inputs.className = "debug-control__inputs";

    const range = document.createElement("input");
    range.className = "debug-control__range";
    range.type = "range";
    range.min = `${min}`;
    range.max = `${max}`;
    range.step = `${step}`;
    range.value = `${value}`;

    const number = document.createElement("input");
    number.className = "debug-control__number";
    number.type = "number";
    number.min = `${min}`;
    number.max = `${max}`;
    number.step = `${step}`;
    number.value = `${value}`;

    const unitNode = document.createElement("span");
    unitNode.className = "debug-control__unit";
    unitNode.textContent = unit;

    const syncValue = (rawValue) => {
      const numericValue = Number(rawValue);

      if (Number.isNaN(numericValue)) {
        return;
      }

      range.value = `${numericValue}`;
      number.value = `${numericValue}`;
      onChange(numericValue);
    };

    range.addEventListener("input", () => syncValue(range.value));
    number.addEventListener("input", () => syncValue(number.value));

    inputs.append(range, number, unitNode);
    wrapper.appendChild(inputs);
    return wrapper;
  }

  createToggleControl({ label, checked, onChange }) {
    const wrapper = document.createElement("label");
    wrapper.className = "transition-debug-panel__toggle";

    const title = document.createElement("span");
    title.className = "debug-control__label";
    title.textContent = label;

    const checkbox = document.createElement("input");
    checkbox.className = "transition-debug-panel__checkbox";
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.addEventListener("change", () => {
      onChange(checkbox.checked);
    });

    wrapper.append(title, checkbox);
    return wrapper;
  }

  handleStateChange() {
    window.localStorage.setItem(
      this.storageKey,
      JSON.stringify({
        ...this.transition,
        ...this.debugOptions,
      }),
    );

    this.refreshExportText();
    this.emitAllChanges();
    this.applyAppState({ phase: this.appPhase });
  }

  emitAllChanges() {
    this.onTransitionChange(cloneValue(this.transition));
    this.onDebugOptionsChange(cloneValue(this.debugOptions));
  }

  refreshExportText() {
    if (!this.exportTextarea) {
      return;
    }

    this.exportTextarea.value = serializeTransitionConfig(this.transition);
  }

  async copyToClipboard() {
    const text = serializeTransitionConfig(this.transition);

    try {
      await navigator.clipboard.writeText(text);
      this.statusNode.textContent = "Transition JSON copied.";
    } catch {
      this.exportTextarea.focus();
      this.exportTextarea.select();
      this.statusNode.textContent = "Auto-copy blocked, but the JSON is selected for Ctrl+C.";
    }
  }
}
