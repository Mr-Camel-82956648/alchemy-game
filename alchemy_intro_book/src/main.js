import { appConfig } from "./config/appConfig.js";
import { defaultLayoutConfig, layoutControlSchema } from "./config/layout.js";
import { introPages } from "./config/pages.js";
import { LayoutDebugPanel } from "./modules/debugPanel.js";
import { IntroApp } from "./modules/introApp.js";
import { TransitionDebugPanel } from "./modules/transitionDebugPanel.js";

const rootElement = document.querySelector(".app-shell");
const searchParams = new URLSearchParams(window.location.search);
const debugEnabled = searchParams.get("debug") === "1";

if (!rootElement) {
  throw new Error("Intro app root not found.");
}

const introApp = new IntroApp({
  root: rootElement,
  pages: introPages,
  config: appConfig,
  layoutConfig: defaultLayoutConfig,
  debugEnabled,
});

introApp.init();

if (debugEnabled) {
  document.body.classList.add("is-debug-mode");

  const debugPanel = new LayoutDebugPanel({
    root: document.body,
    initialLayout: introApp.getLayoutConfig(),
    controlSchema: layoutControlSchema,
    storageKey: "alchemy-intro-book:layout-debug",
    onLayoutChange: (nextLayout) => {
      introApp.updateLayoutConfig(nextLayout);
    },
  });

  debugPanel.init();

  const transitionDebugPanel = new TransitionDebugPanel({
    root: document.body,
    initialTransition: introApp.getTransitionConfig(),
    initialDebugOptions: introApp.getTransitionDebugOptions(),
    storageKey: "alchemy-intro-book:transition-debug",
    onTransitionChange: (nextTransition) => {
      introApp.updateTransitionConfig(nextTransition);
    },
    onDebugOptionsChange: (nextDebugOptions) => {
      introApp.updateTransitionDebugOptions(nextDebugOptions);
    },
    onResumeRequest: () => introApp.resumeFrozenTransition(),
  });

  transitionDebugPanel.init();
}
