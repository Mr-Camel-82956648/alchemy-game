import { AudioManager } from "./audioManager.js";
import { applyLayoutVariables, cloneLayoutConfig } from "./layoutManager.js";

export class IntroApp {
  constructor({ root, pages, config, layoutConfig, debugEnabled = false }) {
    this.root = root;
    this.pages = pages;
    this.config = config;
    this.layoutConfig = cloneLayoutConfig(layoutConfig);
    this.transitionConfig = { ...config.transition };
    this.transitionDebugOptions = {
      pauseAtEndFrame: true,
      mediaOpacity: 1,
    };
    this.debugEnabled = debugEnabled;
    this.currentIndex = 0;
    this.isAnimating = false;
    this.mediaRenderSequence = 0;
    this.muteHandledOnPointerDown = false;
    this.transitionRestoreState = null;
    this.activeTransitionMetrics = null;
    this.pendingTransitionComplete = null;
    this.audioManager = new AudioManager(config.audio);

    this.refs = {
      coverScene: root.querySelector('[data-scene="cover"]'),
      coverEntry: root.querySelector('[data-action="start-intro"]'),
      coverImage: root.querySelector("[data-cover-image]"),
      introScene: root.querySelector('[data-scene="intro"]'),
      destinationScene: root.querySelector('[data-scene="destination"]'),
      bookSurface: root.querySelector("[data-book-surface]"),
      frameWindow: root.querySelector("[data-frame-window]"),
      frameMedia: root.querySelector("[data-frame-media]"),
      bookOverlay: root.querySelector("[data-book-overlay]"),
      muteButton: root.querySelector('[data-action="mute"]'),
      muteLabel: root.querySelector("[data-mute-label]"),
      skipIcon: root.querySelector("[data-skip-icon]"),
      pageCounter: root.querySelector("[data-page-counter]"),
      pageTitle: root.querySelector("[data-page-title]"),
      pageBody: root.querySelector("[data-page-body]"),
      prevButton: root.querySelector('[data-action="prev"]'),
      nextButton: root.querySelector('[data-action="next"]'),
      enterButton: root.querySelector('[data-action="enter"]'),
      skipButton: root.querySelector('[data-action="skip"]'),
      audioHint: root.querySelector("[data-audio-hint]"),
      destinationImage: root.querySelector("[data-destination-image]"),
      destinationTitle: root.querySelector(".destination-card__copy h2"),
      destinationKicker: root.querySelector(".destination-card__kicker"),
      destinationDescription: root.querySelector("[data-destination-description]"),
      destinationLink: root.querySelector("[data-destination-link]"),
      restartButton: root.querySelector('[data-action="restart"]'),
      frameZoomLayer: root.querySelector("[data-frame-zoom-layer]"),
      frameZoomShell: root.querySelector("[data-frame-zoom-shell]"),
      frameZoomDestination: root.querySelector("[data-frame-zoom-destination]"),
      frameZoomOverlay: root.querySelector("[data-frame-zoom-overlay]"),
    };
  }

  init() {
    if (!Array.isArray(this.pages) || this.pages.length === 0) {
      throw new Error("At least one intro page is required.");
    }

    this.applyGlobalAssets();
    this.applyDestinationCopy();
    this.applyLayoutConfig();
    this.bindEvents();
    this.installAudio();
    this.renderCurrentPage({ initial: true });
    this.publishTransitionDebugState({ phase: "idle" });
  }

  applyGlobalAssets() {
    if (this.refs.coverImage) {
      this.refs.coverImage.src = this.config.assets.coverImage;
      this.refs.coverImage.alt = this.config.ui.appTitle;
    }

    const overlaySrc = this.config.assets.bookFrameOverlay;
    const fallbackOverlaySrc = this.config.assets.bookFrameOverlayFallback;
    const overlayElement = this.refs.bookOverlay;

    if (overlaySrc) {
      overlayElement.hidden = false;
      overlayElement.dataset.fallbackTried = "false";
      overlayElement.src = overlaySrc;
    } else {
      overlayElement.hidden = true;
      this.refs.bookSurface.classList.add("is-overlay-missing");
    }

    overlayElement.addEventListener("load", () => {
      this.refs.bookSurface.classList.remove("is-overlay-missing");
      overlayElement.hidden = false;
    });

    overlayElement.addEventListener("error", () => {
      if (
        fallbackOverlaySrc &&
        overlayElement.dataset.fallbackTried !== "true" &&
        overlayElement.src !== new URL(fallbackOverlaySrc, window.location.href).href
      ) {
        overlayElement.dataset.fallbackTried = "true";
        overlayElement.src = fallbackOverlaySrc;
        return;
      }

      overlayElement.hidden = true;
      this.refs.bookSurface.classList.add("is-overlay-missing");
    });

    if (this.config.assets.skipIcon) {
      this.refs.skipIcon.hidden = false;
      this.refs.skipIcon.src = this.config.assets.skipIcon;
    } else {
      this.refs.skipIcon.hidden = true;
      this.refs.skipIcon.removeAttribute("src");
    }

    this.refs.destinationImage.src = this.config.assets.placeholderLandingImage;
    this.refs.frameZoomDestination.src = this.config.assets.placeholderLandingImage;
  }

  applyDestinationCopy() {
    const { placeholder, externalUrl, mode } = this.config.enterGame;

    this.refs.destinationKicker.textContent = placeholder.kicker;
    this.refs.destinationTitle.textContent = placeholder.title;
    this.refs.destinationDescription.textContent = placeholder.description;
    this.refs.destinationLink.href = externalUrl;
    this.refs.destinationLink.hidden = mode !== "placeholder";
    this.refs.restartButton.hidden = !this.config.enterGame.allowRestartFromPlaceholder;
  }

  installAudio() {
    this.audioManager.onUnlock = () => {
      this.refs.audioHint.classList.add("is-dismissed");
    };

    this.audioManager.installAutoUnlock();
    this.updateMuteButton();
  }

  bindEvents() {
    this.refs.coverEntry?.addEventListener("click", () => {
      this.startIntroFromCover();
    });

    this.refs.muteButton.addEventListener("pointerdown", () => {
      if (!this.audioManager.unlocked) {
        this.audioManager.setMuted(!this.audioManager.isMuted());
        this.muteHandledOnPointerDown = true;
        this.updateMuteButton();
      }
    });

    this.refs.muteButton.addEventListener("click", () => {
      if (this.muteHandledOnPointerDown) {
        this.muteHandledOnPointerDown = false;
        return;
      }

      if (this.audioManager.unlocked) {
        this.audioManager.toggleMuted();
        this.updateMuteButton();
      }
    });

    this.refs.prevButton.addEventListener("click", () => {
      this.audioManager.playClick();
      this.goToPage(this.currentIndex - 1);
    });

    this.refs.nextButton.addEventListener("click", () => {
      this.audioManager.playClick();
      this.goToPage(this.currentIndex + 1);
    });

    this.refs.enterButton.addEventListener("click", () => {
      this.audioManager.playClick();
      this.enterGame();
    });

    this.refs.skipButton.addEventListener("click", () => {
      this.audioManager.playClick();
      this.enterGame();
    });

    this.refs.restartButton.addEventListener("click", () => {
      this.audioManager.playClick();
      this.restartIntro();
    });
  }

  applyLayoutConfig() {
    applyLayoutVariables(this.root, this.layoutConfig);
  }

  updateLayoutConfig(nextLayoutConfig) {
    this.layoutConfig = cloneLayoutConfig(nextLayoutConfig);
    this.applyLayoutConfig();
  }

  getLayoutConfig() {
    return cloneLayoutConfig(this.layoutConfig);
  }

  updateTransitionConfig(nextTransitionConfig) {
    this.transitionConfig = { ...this.transitionConfig, ...nextTransitionConfig };

    if (this.activeTransitionMetrics) {
      this.applyTransitionStyles(this.activeTransitionMetrics);
    }
  }

  getTransitionConfig() {
    return { ...this.transitionConfig };
  }

  updateTransitionDebugOptions(nextDebugOptions) {
    this.transitionDebugOptions = { ...this.transitionDebugOptions, ...nextDebugOptions };

    if (this.activeTransitionMetrics) {
      this.applyTransitionStyles(this.activeTransitionMetrics);
    }
  }

  getTransitionDebugOptions() {
    return { ...this.transitionDebugOptions };
  }

  publishTransitionDebugState({ phase }) {
    window.dispatchEvent(
      new CustomEvent("alchemy-intro-book:transition-debug-state", {
        detail: {
          phase,
          canResume: phase === "frozen",
          pauseAtEndFrame: this.transitionDebugOptions.pauseAtEndFrame,
        },
      }),
    );
  }

  goToPage(nextIndex) {
    if (this.isAnimating) {
      return;
    }

    if (nextIndex < 0 || nextIndex >= this.pages.length || nextIndex === this.currentIndex) {
      return;
    }

    const currentPage = this.pages[this.currentIndex];
    const nextPage = this.pages[nextIndex];

    this.playPageTransitionIfConfigured(currentPage, nextPage);
    this.currentIndex = nextIndex;
    this.renderCurrentPage();
  }

  playPageTransitionIfConfigured(currentPage, nextPage) {
    const nextVideoSrc = currentPage?.transition?.nextVideoSrc;

    if (nextVideoSrc) {
      console.info("Reserved page transition video:", nextVideoSrc, currentPage?.id, nextPage?.id);
    }
  }

  renderCurrentPage({ initial = false } = {}) {
    const page = this.pages[this.currentIndex];
    const total = this.pages.length;

    this.refs.pageCounter.textContent = `${this.currentIndex + 1} / ${total}`;
    this.refs.pageTitle.textContent = page.title || "";
    this.refs.pageTitle.classList.toggle("is-empty", !page.title);
    this.refs.pageBody.innerHTML = "";

    page.body.forEach((line) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      this.refs.pageBody.appendChild(paragraph);
    });

    this.renderMedia(page);
    this.updateNavigation(page);

    if (!initial) {
      this.refs.bookSurface.classList.remove("is-page-refresh");
      window.requestAnimationFrame(() => {
        this.refs.bookSurface.classList.add("is-page-refresh");
      });
    }
  }

  renderMedia(page) {
    const renderToken = ++this.mediaRenderSequence;
    const currentShell = this.refs.frameMedia.querySelector(".media-shell");

    const mediaShell = document.createElement("div");
    mediaShell.className = "media-shell";

    const fallback = this.createFallback(page);
    let mediaElement = null;
    let committed = false;

    const commitShell = () => {
      if (renderToken !== this.mediaRenderSequence) {
        return false;
      }

      if (currentShell && !committed) {
        committed = true;
        currentShell.querySelector("video")?.pause();
        this.refs.frameMedia.replaceChildren(mediaShell);
      }

      return true;
    };

    const markReady = () => {
      mediaShell.classList.add("is-ready");

      if (!commitShell()) {
        return;
      }

      if (mediaElement?.tagName === "VIDEO") {
        mediaElement.play().catch(() => {});
      }
    };

    const markFallback = () => {
      mediaShell.classList.add("is-fallback");
      commitShell();
    };

    if (page.mediaType === "image") {
      mediaElement = document.createElement("img");
      mediaElement.className = "media-node media-node--image";
      mediaElement.alt = page.title || page.id;
      mediaElement.addEventListener("load", markReady, { once: true });
      mediaElement.addEventListener("error", markFallback, { once: true });
      mediaElement.src = page.mediaSrc;
    } else {
      mediaElement = document.createElement("video");
      mediaElement.className = "media-node media-node--video";
      mediaElement.poster = page.posterSrc || this.config.assets.fallbackMediaImage;
      mediaElement.autoplay = true;
      mediaElement.loop = true;
      mediaElement.muted = true;
      mediaElement.playsInline = true;
      mediaElement.preload = "auto";
      mediaElement.setAttribute("aria-label", `${page.id} 视频`);
      mediaElement.addEventListener("loadeddata", markReady, { once: true });
      mediaElement.addEventListener("error", markFallback, { once: true });
      mediaElement.src = page.mediaSrc;
      mediaElement.load();
    }

    mediaShell.append(mediaElement, fallback);

    if (!currentShell) {
      this.refs.frameMedia.replaceChildren(mediaShell);
    }
  }

  createFallback(page) {
    const fallback = document.createElement("div");
    fallback.className = "media-fallback";

    const previewImage = document.createElement("img");
    previewImage.className = "media-fallback__image";
    previewImage.src = page.fallbackImageSrc || this.config.assets.fallbackMediaImage;
    previewImage.alt = "";

    const caption = document.createElement("div");
    caption.className = "media-fallback__caption";
    caption.innerHTML = `
      <strong>${page.mediaType === "video" ? "视频占位" : "图片占位"}</strong>
      <span>${page.mediaSrc}</span>
    `;

    fallback.append(previewImage, caption);
    return fallback;
  }

  updateNavigation(page) {
    const isFirstPage = this.currentIndex === 0;
    const isFinalPage = Boolean(page.isFinalPage);

    this.refs.prevButton.textContent = this.config.ui.prevLabel;
    this.refs.nextButton.textContent = this.config.ui.nextLabel;
    this.refs.enterButton.textContent = this.config.ui.enterLabel;

    this.refs.prevButton.hidden = isFirstPage;
    this.refs.nextButton.hidden = isFinalPage;
    this.refs.enterButton.hidden = !isFinalPage;
  }

  updateMuteButton() {
    const isMuted = this.audioManager.isMuted();
    this.refs.muteButton.setAttribute("aria-pressed", `${isMuted}`);
    this.refs.muteButton.setAttribute("aria-label", isMuted ? "取消静音" : "静音");
    this.refs.muteButton.classList.toggle("is-muted", isMuted);
    this.refs.muteLabel.textContent = isMuted ? "取消静音" : "静音";
  }

  startIntroFromCover() {
    if (!this.refs.coverScene?.classList.contains("is-active")) {
      return;
    }

    this.refs.coverScene.classList.remove("is-active");
    this.refs.coverScene.setAttribute("aria-hidden", "true");
    this.refs.introScene.classList.add("is-active");
    this.refs.introScene.setAttribute("aria-hidden", "false");
  }

  enterGame() {
    if (this.isAnimating) {
      return;
    }

    this.isAnimating = true;
    this.audioManager.stopBgm();

    this.playFrameZoomTransition(() => {
      const { mode, externalUrl, openExternalInSameTab } = this.config.enterGame;

      if (mode === "url") {
        if (openExternalInSameTab) {
          window.location.assign(externalUrl);
        } else {
          window.open(externalUrl, "_blank", "noopener,noreferrer");
          this.finishTransitionCleanup({ restoreIntroMedia: true });
        }

        return;
      }

      this.showDestinationScene();
      this.finishTransitionCleanup();
    });
  }

  applyTransitionStyles({ sourceRect, bookSurfaceRect, activeOverlaySrc }) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const baseScale = Math.max(viewportWidth / sourceRect.width, viewportHeight / sourceRect.height);
    const scaleMultiplier = this.transitionConfig.mediaEndScaleMultiplier || 1;
    const offsetX = this.transitionConfig.mediaEndOffsetXPx || 0;
    const offsetY = this.transitionConfig.mediaEndOffsetYPx || 0;
    const scale = baseScale * scaleMultiplier;
    const mediaEndWidth = sourceRect.width * scale;
    const mediaEndHeight = sourceRect.height * scale;
    const mediaEndLeft = (viewportWidth - mediaEndWidth) / 2 + offsetX;
    const mediaEndTop = (viewportHeight - mediaEndHeight) / 2 + offsetY;
    const frameOffsetLeft = sourceRect.left - bookSurfaceRect.left;
    const frameOffsetTop = sourceRect.top - bookSurfaceRect.top;
    const overlayEndLeft = mediaEndLeft - frameOffsetLeft * scale;
    const overlayEndTop = mediaEndTop - frameOffsetTop * scale;
    const overlayEndWidth = bookSurfaceRect.width * scale;
    const overlayEndHeight = bookSurfaceRect.height * scale;
    const duration = this.transitionConfig.introToGameDurationMs;
    const easing = this.transitionConfig.introToGameEasing;
    const overlayFadeDelay = Math.round(duration * 0.42);
    const overlayFadeDuration = Math.max(220, Math.round(duration * 0.58));
    const destinationFadeDelay = Math.round(duration * 0.5);
    const destinationFadeDuration = Math.max(240, Math.round(duration * 0.45));
    const mediaOpacity = this.transitionDebugOptions.mediaOpacity ?? 1;

    this.refs.frameZoomLayer.style.setProperty("--zoom-duration", `${duration}ms`);
    this.refs.frameZoomLayer.style.setProperty("--zoom-easing", easing);
    this.refs.frameZoomLayer.style.setProperty("--zoom-overlay-fade-delay", `${overlayFadeDelay}ms`);
    this.refs.frameZoomLayer.style.setProperty("--zoom-overlay-fade-duration", `${overlayFadeDuration}ms`);
    this.refs.frameZoomLayer.style.setProperty("--zoom-destination-fade-delay", `${destinationFadeDelay}ms`);
    this.refs.frameZoomLayer.style.setProperty("--zoom-destination-fade-duration", `${destinationFadeDuration}ms`);
    this.refs.frameZoomLayer.style.setProperty("--zoom-media-opacity", `${mediaOpacity}`);

    this.refs.frameZoomShell.style.setProperty("--zoom-media-start-top", `${sourceRect.top}px`);
    this.refs.frameZoomShell.style.setProperty("--zoom-media-start-left", `${sourceRect.left}px`);
    this.refs.frameZoomShell.style.setProperty("--zoom-media-start-width", `${sourceRect.width}px`);
    this.refs.frameZoomShell.style.setProperty("--zoom-media-start-height", `${sourceRect.height}px`);
    this.refs.frameZoomShell.style.setProperty("--zoom-media-end-top", `${mediaEndTop}px`);
    this.refs.frameZoomShell.style.setProperty("--zoom-media-end-left", `${mediaEndLeft}px`);
    this.refs.frameZoomShell.style.setProperty("--zoom-media-end-width", `${mediaEndWidth}px`);
    this.refs.frameZoomShell.style.setProperty("--zoom-media-end-height", `${mediaEndHeight}px`);

    if (activeOverlaySrc) {
      this.refs.frameZoomOverlay.style.setProperty("--zoom-overlay-start-top", `${bookSurfaceRect.top}px`);
      this.refs.frameZoomOverlay.style.setProperty("--zoom-overlay-start-left", `${bookSurfaceRect.left}px`);
      this.refs.frameZoomOverlay.style.setProperty("--zoom-overlay-start-width", `${bookSurfaceRect.width}px`);
      this.refs.frameZoomOverlay.style.setProperty("--zoom-overlay-start-height", `${bookSurfaceRect.height}px`);
      this.refs.frameZoomOverlay.style.setProperty("--zoom-overlay-end-top", `${overlayEndTop}px`);
      this.refs.frameZoomOverlay.style.setProperty("--zoom-overlay-end-left", `${overlayEndLeft}px`);
      this.refs.frameZoomOverlay.style.setProperty("--zoom-overlay-end-width", `${overlayEndWidth}px`);
      this.refs.frameZoomOverlay.style.setProperty("--zoom-overlay-end-height", `${overlayEndHeight}px`);
    }
  }

  resumeFrozenTransition() {
    if (!this.pendingTransitionComplete) {
      return false;
    }

    const onComplete = this.pendingTransitionComplete;
    this.pendingTransitionComplete = null;
    this.refs.frameZoomLayer.classList.remove("is-debug-frozen");
    this.publishTransitionDebugState({ phase: "resuming" });
    onComplete();
    return true;
  }

  playFrameZoomTransition(onComplete) {
    const sourceShell = this.refs.frameMedia.querySelector(".media-shell");
    const sourceNode = sourceShell?.querySelector(".media-node, .media-fallback__image");

    if (!sourceShell || !sourceNode) {
      onComplete();
      return;
    }

    const sourceRect = this.refs.frameWindow.getBoundingClientRect();
    const bookSurfaceRect = this.refs.bookSurface.getBoundingClientRect();
    const duration = this.transitionConfig.introToGameDurationMs;
    const activeOverlaySrc =
      !this.refs.bookOverlay.hidden && (this.refs.bookOverlay.currentSrc || this.refs.bookOverlay.src);

    if (sourceNode.tagName === "VIDEO") {
      sourceNode.play().catch(() => {});
    }

    this.transitionRestoreState = {
      parent: this.refs.frameMedia,
      nextSibling: sourceShell.nextSibling,
      node: sourceShell,
    };
    this.activeTransitionMetrics = { sourceRect, bookSurfaceRect, activeOverlaySrc };
    this.pendingTransitionComplete = null;

    this.refs.frameZoomShell.innerHTML = "";
    this.refs.frameZoomShell.appendChild(sourceShell);
    this.refs.frameZoomDestination.src = this.refs.destinationImage.currentSrc || this.refs.destinationImage.src;
    this.refs.frameZoomLayer.hidden = false;
    this.refs.frameZoomLayer.classList.remove("is-debug-frozen");
    this.applyTransitionStyles(this.activeTransitionMetrics);

    if (activeOverlaySrc) {
      this.refs.frameZoomOverlay.src = activeOverlaySrc;
      this.refs.frameZoomOverlay.hidden = false;
    } else {
      this.refs.frameZoomOverlay.hidden = true;
      this.refs.frameZoomOverlay.removeAttribute("src");
    }

    this.refs.frameZoomLayer.classList.remove("is-active");
    this.publishTransitionDebugState({ phase: "running" });

    window.requestAnimationFrame(() => {
      this.refs.bookSurface.classList.add("is-transitioning-out");
      this.refs.frameZoomLayer.classList.add("is-active");
    });

    window.setTimeout(() => {
      if (this.debugEnabled && this.transitionDebugOptions.pauseAtEndFrame) {
        this.pendingTransitionComplete = onComplete;
        this.refs.frameZoomLayer.classList.add("is-debug-frozen");
        this.publishTransitionDebugState({ phase: "frozen" });
        return;
      }

      onComplete();
    }, duration);
  }

  showDestinationScene() {
    this.refs.coverScene?.classList.remove("is-active");
    this.refs.coverScene?.setAttribute("aria-hidden", "true");
    this.refs.bookSurface.classList.remove("is-transitioning-out");
    this.refs.introScene.classList.remove("is-active");
    this.refs.introScene.setAttribute("aria-hidden", "true");
    this.refs.destinationScene.classList.add("is-active");
    this.refs.destinationScene.setAttribute("aria-hidden", "false");
  }

  restartIntro() {
    this.currentIndex = 0;
    this.refs.bookSurface.classList.remove("is-transitioning-out");
    this.refs.coverScene?.classList.remove("is-active");
    this.refs.coverScene?.setAttribute("aria-hidden", "true");
    this.refs.destinationScene.classList.remove("is-active");
    this.refs.destinationScene.setAttribute("aria-hidden", "true");
    this.refs.introScene.classList.add("is-active");
    this.refs.introScene.setAttribute("aria-hidden", "false");
    this.renderCurrentPage({ initial: true });

    if (this.audioManager.unlocked) {
      this.audioManager.playBgm();
    }
  }

  finishTransitionCleanup({ restoreIntroMedia = false } = {}) {
    window.setTimeout(() => {
      this.refs.bookSurface.classList.remove("is-transitioning-out");

      if (restoreIntroMedia && this.transitionRestoreState?.node) {
        this.transitionRestoreState.parent.insertBefore(
          this.transitionRestoreState.node,
          this.transitionRestoreState.nextSibling,
        );
      }

      this.refs.frameZoomLayer.hidden = true;
      this.refs.frameZoomLayer.classList.remove("is-active");
      this.refs.frameZoomLayer.classList.remove("is-debug-frozen");
      this.refs.frameZoomShell.innerHTML = "";
      this.refs.frameZoomOverlay.hidden = true;
      this.activeTransitionMetrics = null;
      this.pendingTransitionComplete = null;
      this.transitionRestoreState = null;
      this.isAnimating = false;
      this.publishTransitionDebugState({ phase: "idle" });
    }, 180);
  }
}
