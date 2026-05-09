export class AudioManager {
  constructor(audioConfig) {
    this.audioConfig = audioConfig;
    this.unlocked = false;
    this.muted = false;
    this.bgmAudio = null;
    this.clickAudio = null;
    this.onUnlock = null;
  }

  installAutoUnlock() {
    const unlockOnce = () => {
      this.unlocked = true;

      if (typeof this.onUnlock === "function") {
        this.onUnlock();
      }

      if (this.audioConfig.startBgmOnFirstGesture && !this.muted) {
        this.playBgm();
      }

      document.removeEventListener("keydown", unlockOnce);
    };

    document.addEventListener("pointerdown", unlockOnce, { once: true });
    document.addEventListener("keydown", unlockOnce, { once: true });
  }

  ensureBgmAudio() {
    if (!this.audioConfig.bgmSrc) {
      return null;
    }

    if (!this.bgmAudio) {
      this.bgmAudio = new Audio(this.audioConfig.bgmSrc);
      this.bgmAudio.loop = true;
      this.bgmAudio.preload = "auto";
      this.bgmAudio.volume = this.audioConfig.bgmVolume;
      this.bgmAudio.muted = this.muted;
    }

    return this.bgmAudio;
  }

  ensureClickAudio() {
    if (!this.audioConfig.clickSrc) {
      return null;
    }

    if (!this.clickAudio) {
      this.clickAudio = new Audio(this.audioConfig.clickSrc);
      this.clickAudio.preload = "auto";
      this.clickAudio.volume = this.audioConfig.clickVolume;
      this.clickAudio.muted = this.muted;
    }

    return this.clickAudio;
  }

  playBgm() {
    if (!this.unlocked) {
      return;
    }

    const audio = this.ensureBgmAudio();

    if (!audio) {
      return;
    }

    audio.muted = this.muted;
    audio.play().catch(() => {});
  }

  stopBgm() {
    if (!this.bgmAudio) {
      return;
    }

    this.bgmAudio.pause();
    this.bgmAudio.currentTime = 0;
  }

  playClick() {
    if (!this.unlocked) {
      return;
    }

    const audio = this.ensureClickAudio();

    if (!audio) {
      return;
    }

    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  setMuted(nextMuted) {
    this.muted = nextMuted;

    if (this.bgmAudio) {
      this.bgmAudio.muted = nextMuted;
    }

    if (this.clickAudio) {
      this.clickAudio.muted = nextMuted;
    }

    if (!nextMuted && this.unlocked) {
      this.playBgm();
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }
}
