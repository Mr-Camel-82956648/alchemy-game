export const appConfig = {
  ui: {
    appTitle: "Alchemy Intro Book",
    skipLabel: "跳过新手引导",
    prevLabel: "< 上一页",
    nextLabel: "下一页 >",
    enterLabel: "进入游戏 >",
  },
  assets: {
    coverImage: "./assets/images/game/cover.jpg",
    bookFrameOverlay: "./assets/images/book/book-frame-overlay.png",
    bookFrameOverlayFallback: "",
    skipIcon: "",
    fallbackMediaImage: "./assets/images/pages/video-fallback.svg",
    placeholderLandingImage: "./assets/images/game/placeholder-home.jpg",
  },
  audio: {
    bgmSrc: "./assets/audio/intro-bgm.mp3",
    clickSrc: "./assets/audio/ui-click.mp3",
    bgmVolume: 0.38,
    clickVolume: 0.75,
    startBgmOnFirstGesture: true,
  },
  enterGame: {
    mode: "url",
    externalUrl: "../frontend/",
    openExternalInSameTab: true,
    allowRestartFromPlaceholder: true,
    placeholder: {
      kicker: "Placeholder Destination",
      title: "主游戏入口占位页",
      description:
        "这里先模拟未来正式主首页。后续如果你要接入独立主游戏，只需要把进入方式改成 url，或者把这里替换成真实首页模块。",
    },
  },
  transition: {
    introToGameDurationMs: 1150,
    introToGameEasing: "cubic-bezier(0.2, 0.72, 0.16, 1)",
    mediaEndScaleMultiplier: 0.925,
    mediaEndOffsetXPx: 0,
    mediaEndOffsetYPx: 0,
  },
};
