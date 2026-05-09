export function cloneLayoutConfig(layoutConfig) {
  return JSON.parse(JSON.stringify(layoutConfig));
}

export function applyLayoutVariables(target, layoutConfig) {
  const variableMap = {
    "--layout-media-left": `${layoutConfig.mediaFrame.leftPct}%`,
    "--layout-media-top": `${layoutConfig.mediaFrame.topPct}%`,
    "--layout-media-width": `${layoutConfig.mediaFrame.widthPct}%`,
    "--layout-media-height": `${layoutConfig.mediaFrame.heightPct}%`,
    "--layout-media-radius": `${layoutConfig.mediaFrame.borderRadiusRem}rem`,
    "--layout-text-left": `${layoutConfig.textBlock.leftPct}%`,
    "--layout-text-top": `${layoutConfig.textBlock.topPct}%`,
    "--layout-text-width": `${layoutConfig.textBlock.widthPct}%`,
    "--layout-text-height": `${layoutConfig.textBlock.heightPct}%`,
    "--layout-text-font-size": `${layoutConfig.textBlock.fontSizeRem}rem`,
    "--layout-text-line-height": `${layoutConfig.textBlock.lineHeight}`,
    "--layout-text-align": layoutConfig.textBlock.textAlign,
    "--layout-page-counter-left": `${layoutConfig.pageCounter.leftPct}%`,
    "--layout-page-counter-top": `${layoutConfig.pageCounter.topPct}%`,
    "--layout-page-counter-width": `${layoutConfig.pageCounter.widthPct}%`,
    "--layout-page-counter-font-size": `${layoutConfig.pageCounter.fontSizeRem}rem`,
    "--layout-page-counter-align": layoutConfig.pageCounter.textAlign,
    "--layout-skip-left": `${layoutConfig.skipButton.leftPct}%`,
    "--layout-skip-bottom": `${layoutConfig.skipButton.bottomPct}%`,
    "--layout-skip-height": `${layoutConfig.skipButton.minHeightRem}rem`,
    "--layout-skip-padding-inline": `${layoutConfig.skipButton.paddingInlineRem}rem`,
    "--layout-skip-font-size": `${layoutConfig.skipButton.fontSizeRem}rem`,
    "--layout-skip-icon-size": `${layoutConfig.skipButton.iconSizeRem}rem`,
    "--layout-mute-left": `${layoutConfig.muteButton.leftPct}%`,
    "--layout-mute-top": `${layoutConfig.muteButton.topPct}%`,
    "--layout-mute-height": `${layoutConfig.muteButton.minHeightRem}rem`,
    "--layout-mute-padding-inline": `${layoutConfig.muteButton.paddingInlineRem}rem`,
    "--layout-mute-font-size": `${layoutConfig.muteButton.fontSizeRem}rem`,
    "--layout-prev-left": `${layoutConfig.prevButton.leftPct}%`,
    "--layout-prev-bottom": `${layoutConfig.prevButton.bottomPct}%`,
    "--layout-prev-width": `${layoutConfig.prevButton.minWidthRem}rem`,
    "--layout-prev-height": `${layoutConfig.prevButton.minHeightRem}rem`,
    "--layout-prev-font-size": `${layoutConfig.prevButton.fontSizeRem}rem`,
    "--layout-forward-left": `${layoutConfig.forwardButton.leftPct}%`,
    "--layout-forward-bottom": `${layoutConfig.forwardButton.bottomPct}%`,
    "--layout-forward-width": `${layoutConfig.forwardButton.minWidthRem}rem`,
    "--layout-forward-height": `${layoutConfig.forwardButton.minHeightRem}rem`,
    "--layout-forward-font-size": `${layoutConfig.forwardButton.fontSizeRem}rem`,
  };

  Object.entries(variableMap).forEach(([key, value]) => {
    target.style.setProperty(key, value);
  });
}

export function getValueAtPath(source, path) {
  return path.split(".").reduce((result, key) => result[key], source);
}

export function setValueAtPath(source, path, value) {
  const pathParts = path.split(".");
  const targetKey = pathParts.pop();
  const target = pathParts.reduce((result, key) => result[key], source);
  target[targetKey] = value;
}

export function serializeLayoutConfig(layoutConfig) {
  return JSON.stringify(layoutConfig, null, 2);
}
