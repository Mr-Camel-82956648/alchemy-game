# Alchemy Intro Book

一个可独立运行的 H5 开场引导项目，用于承载世界观说明、基础玩法教学，以及进入正式游戏前的书页式过渡。

当前仓库已经能本地直接运行，核心工作基本完成。接手时请把它理解为“可配置的 intro 壳子”，而不是完整主游戏模块。

## 当前状态

- 打开项目后会先显示封面页 `assets/images/game/cover.jpg`
- 封面页底部会显示“「点击任意位置进入游戏」”，点击后进入 intro 第 1 页
- 进入 intro 的这次点击会同时解锁并播放 `assets/audio/intro-bgm.mp3`
- 当前实际共有 `11` 个 intro 页面，顺序以 `src/config/pages.js` 数组顺序为准。
- 页面媒体当前全部使用视频，文件位于 `assets/videos/pages/p01.mp4` 到 `p11.mp4`。
- 最后一页和“跳过新手引导”都会走同一条进入流程。
- 进入正式游戏前，会先播放一次“从书页画框推进”的镜头过渡。
- 当前默认不会真的跳到正式游戏，而是进入一个占位目标页。
- 项目支持 `?debug=1` 调整布局和最终推进过渡的对位参数。

## 交接时先读这些文件

建议按下面顺序阅读，能最快建立完整认知。

1. `README.md`
   先建立项目边界、运行方式、交接重点和与正式游戏的接口现状。
2. `index.html`
   看页面骨架、封面场景、intro 场景、目标场景和过渡层的 DOM 结构。
3. `src/main.js`
   看实际启动链路，以及 `?debug=1` 时会额外挂哪些调试面板。
4. `src/config/pages.js`
   看实际页顺序、文案、媒体路径和最后一页标记。
5. `src/config/appConfig.js`
   看封面图、全局资源路径、音频、进入正式游戏方式、占位页文案和过渡参数。
6. `src/modules/introApp.js`
   这是最关键的交接文件，负责切页、渲染媒体、按钮事件、音频接入、最终过渡和进入正式游戏。
7. `src/config/layout.js`
   看正式布局参数源，以及调试面板到底在改什么。
8. `src/modules/debugPanel.js`
   看布局调试逻辑和导出方式。
9. `src/modules/transitionDebugPanel.js`
   看最终“推进进入游戏”过渡的对位调试逻辑。
10. `styles/main.css`
    看整体视觉、按钮位置、响应式表现、过渡层样式和调试面板样式。

## 交接关键点

- 真正的“进入正式游戏”接点只有一个：`src/modules/introApp.js` 里的 `enterGame()`
- 真正的“进入 intro”接点只有一个：`src/modules/introApp.js` 里的 `startIntroFromCover()`
- 最后一页“进入游戏”按钮和全程可见的“跳过新手引导”按钮，都会走同一个 `enterGame()` 流程
- 当前正式游戏接口是配置驱动的，不是事件驱动的
- 当前没有向正式游戏传任何参数，也没有 `postMessage`、回调或状态共享协议
- `pages.js` 中的 `transition.nextVideoSrc` 只是预留字段，当前运行时不会真正播放页间转场视频
- `pages.js` 中的 `transition.mode` 目前也没有作为实际分支条件使用
- 真正影响“书页推进到目标页”效果的是 `src/config/appConfig.js -> transition`
- 当前 `bookFrameOverlayFallback` 为空；如果主前景图丢失，不会回退到另一张正式图，只会隐藏覆盖层并显示缺失提示

## 项目结构

```text
alchemy_intro_book/
├─ index.html
├─ package.json
├─ serve-local.ps1
├─ styles/
│  └─ main.css
├─ src/
│  ├─ main.js
│  ├─ config/
│  │  ├─ appConfig.js
│  │  ├─ layout.js
│  │  └─ pages.js
│  └─ modules/
│     ├─ audioManager.js
│     ├─ debugPanel.js
│     ├─ introApp.js
│     ├─ layoutManager.js
│     └─ transitionDebugPanel.js
└─ assets/
   ├─ audio/
   ├─ icons/
   ├─ images/
   │  ├─ book/
   │  ├─ game/
   │  └─ pages/
   └─ videos/
      └─ pages/
```

## 本地运行

### 方式 A：PowerShell

```powershell
.\serve-local.ps1
```

### 方式 B：Python

```powershell
python -m http.server 8080
```

### 方式 C：npm

```powershell
npm run dev
```

浏览器地址：

```text
http://127.0.0.1:8080/
```

布局调试地址：

```text
http://127.0.0.1:8080/?debug=1
```

## 实际运行链路

启动链路如下：

`index.html -> src/main.js -> new IntroApp(...) -> introApp.init()`

`src/main.js` 会做两件事：

- 读取 `src/config/pages.js`、`src/config/appConfig.js`、`src/config/layout.js`
- 当 URL 带 `?debug=1` 时，额外挂载布局调试面板和过渡调试面板

`IntroApp.init()` 当前会依次做这些事：

- 挂载封面图
- 挂载全局图片资源
- 写入占位目标页文案
- 应用布局参数
- 绑定按钮事件
- 安装音频解锁逻辑
- 预渲染 intro 第 1 页

完整可见启动链路是：

`cover.jpg 封面 -> 点击任意位置 -> intro 第 1 页 -> ... -> 第 11 页 -> 进入游戏`

## 页面与素材现状

### 页面顺序

页面实际顺序以数组顺序为准，不要按 `id` 名字猜顺序。当前是：

| 播放顺序 | 页面 id | 媒体文件 |
| --- | --- | --- |
| 1 | `p1` | `assets/videos/pages/p01.mp4` |
| 2 | `p4` | `assets/videos/pages/p02.mp4` |
| 3 | `p5` | `assets/videos/pages/p03.mp4` |
| 4 | `p2` | `assets/videos/pages/p04.mp4` |
| 5 | `p3` | `assets/videos/pages/p05.mp4` |
| 6 | `p6` | `assets/videos/pages/p06.mp4` |
| 7 | `p7` | `assets/videos/pages/p07.mp4` |
| 8 | `p8` | `assets/videos/pages/p08.mp4` |
| 9 | `p9` | `assets/videos/pages/p09.mp4` |
| 10 | `p10` | `assets/videos/pages/p10.mp4` |
| 11 | `p11` | `assets/videos/pages/p11.mp4` |

### 资产目录与当前文件

你不需要先理解素材内容本身，先记住文件名和位置即可。

| 目录 | 当前文件 | 作用 | 对应配置 |
| --- | --- | --- | --- |
| `assets/images/game/` | `cover.jpg` | 项目初始封面入口 | `appConfig.assets.coverImage` |
| `assets/images/book/` | `book-frame-overlay.png` | 书本前景覆盖层，画框中间需要透明 | `appConfig.assets.bookFrameOverlay` |
| `assets/images/pages/` | `video-fallback.svg` | 视频或图片加载失败时的占位图 | `appConfig.assets.fallbackMediaImage` |
| `assets/images/game/` | `placeholder-home.jpg` | 占位目标页背景图 | `appConfig.assets.placeholderLandingImage` |
| `assets/videos/pages/` | `p01.mp4` - `p11.mp4` | 每页视频资源 | `pages.js -> mediaSrc` |
| `assets/audio/` | `intro-bgm.mp3` | 引导阶段 BGM | `appConfig.audio.bgmSrc` |
| `assets/audio/` | `ui-click.mp3` | 按钮点击音效 | `appConfig.audio.clickSrc` |
| `assets/icons/` | 当前为空 | 可选跳过按钮图标目录 | `appConfig.assets.skipIcon` |

## 配置面说明

### 1. 页面内容

文件：`src/config/pages.js`

这里控制：

- 页面顺序
- 每页文案
- 每页媒体类型
- 每页媒体路径
- 哪一页是最终页

每页对象当前结构如下：

```js
{
  id: "p3",
  mediaType: "video",
  mediaSrc: "./assets/videos/pages/p03.mp4",
  posterSrc: "./assets/images/pages/video-fallback.svg",
  fallbackImageSrc: "./assets/images/pages/video-fallback.svg",
  title: "",
  body: ["你将见证——", "自高空坠落的剑雨。"],
  isFinalPage: false,
  transition: {
    nextVideoSrc: "",
    mode: "direct",
  },
}
```

注意：

- `body` 是实际文案数组
- `isFinalPage` 决定最后一页显示“进入游戏”按钮
- `transition.nextVideoSrc` 现在只是预留字段
- `transition.mode` 现在不会影响运行时逻辑

### 2. 全局资源与进入方式

文件：`src/config/appConfig.js`

这里控制：

- 封面图路径
- 全局 UI 文案
- 全局素材路径
- 音频路径与音量
- 进入正式游戏的方式
- 最终过渡动画参数

当前最重要的是 `enterGame`：

```js
enterGame: {
  mode: "placeholder",
  externalUrl: "http://localhost:8000/",
  openExternalInSameTab: true,
  allowRestartFromPlaceholder: true,
  placeholder: {
    kicker: "Placeholder Destination",
    title: "主游戏入口占位页",
    description: "......",
  },
}
```

当前封面入口图也在这里配置：

```js
assets: {
  coverImage: "./assets/images/game/cover.jpg",
}
```

### 3. 正式布局参数

文件：`src/config/layout.js`

这里是正式布局的单一参数源，控制：

- 视频窗口位置和尺寸
- 文案区域位置和字号
- 页码位置
- 跳过按钮、静音按钮、上一页、下一页、进入游戏按钮位置和尺寸

`?debug=1` 导出的布局 JSON，需要最终回填到这个文件。

### 4. 运行逻辑

文件：`src/modules/introApp.js`

这个文件是交接重点，当前负责：

- 封面页进入 intro
- 翻页
- 媒体渲染与加载失败回退
- 静音与音频解锁
- “跳过新手引导”
- 最后一页的“进入游戏”
- 书页推进到目标场景的过渡
- 占位页显示与重开 intro

## 与正式游戏的接口

这一节是交接时最重要的。

### 当前真实接口在哪里

当前与正式游戏的唯一真实接口在：

- `src/modules/introApp.js -> enterGame()`

这个方法由两种操作触发：

- 点击最后一页“进入游戏”
- 点击任意页面左下角“跳过新手引导”

也就是说，正式游戏接入时必须考虑这两个入口共用同一条流程。

### 当前真实分支行为

`enterGame()` 当前固定先执行：

1. 停止 BGM
2. 播放书页画框推进过渡
3. 过渡完成后根据 `appConfig.enterGame.mode` 分支

分支一：`mode: "placeholder"`

- 不离开当前页面
- 显示项目内置的占位目标场景
- 可通过“重新查看引导”回到第一页

分支二：`mode: "url"`

- 按 `externalUrl` 跳转正式游戏
- `openExternalInSameTab: true` 时使用 `window.location.assign()`
- `openExternalInSameTab: false` 时使用 `window.open()`

### 目前没有的接口能力

当前版本尚未提供这些内容：

- 没有传递玩家状态、角色信息、章节信息等业务参数
- 没有把“用户是完整看完还是点击跳过”传给正式游戏
- 没有 `postMessage`
- 没有 URL 参数拼接协议
- 没有嵌入主游戏容器时的回调钩子
- 没有独立导出的 JS API 供外部直接调用

如果后续主游戏需要消费 intro 结果，建议优先在 `enterGame()` 附近新增协议，而不是把逻辑分散到按钮事件里。

### 接入正式游戏的两种推荐方式

方式 A：正式游戏是另一个独立页面

- 把 `src/config/appConfig.js -> enterGame.mode` 改成 `"url"`
- 把 `externalUrl` 改成正式入口地址
- 保持最终过渡继续由 intro 工程自己完成

这是当前成本最低、风险最小的接法。

方式 B：正式游戏与 intro 在同一个前端工程中

- 继续保留 `playFrameZoomTransition()` 这段过渡
- 在 `enterGame()` 里替换 `showDestinationScene()` 的占位逻辑
- 让过渡完成后改为挂载真实首页模块或切到主游戏场景

如果走这条路，优先改 `enterGame()` 和目标场景 DOM，不要先动 `pages.js`

### 与 `alchemy-game(A)` 集成时的建议

根据 [d:\projects\alchemy-game\README.md](D:/projects/alchemy-game/README.md) 当前说明，A 现在的本地前端启动方式是：

```bash
cd frontend
python -m http.server 8000
```

对应入口是：

- `http://localhost:8000/`
- 实际首页文件是 `d:\projects\alchemy-game\frontend\index.html`

这意味着如果你只是把 B 整体复制到 A 根目录、但仍然继续在 `frontend/` 目录里起静态服务，那么 B 的根目录 `index.html` 不会被访问到，启动时仍然只会进入 A 的旧首页。

如果要实现“打开 A 时先进入 B，再在第 11 页进入 A 首页”，推荐按下面的方式接：

1. 把 B 的文件复制到 A 根目录，让 B 的 `index.html` 成为 A 根目录入口页。
2. 本地调试时改为从 A 根目录起静态服务，而不是继续 `cd frontend` 后再起服务。
3. 在 B 的 `src/config/appConfig.js` 里把 `enterGame.mode` 改成 `"url"`。
4. 把 `externalUrl` 改成 `./frontend/` 或 `./frontend/index.html`。

推荐配置示例：

```js
enterGame: {
  mode: "url",
  externalUrl: "./frontend/",
  openExternalInSameTab: true,
}
```

这样在 A 根目录打开时，访问链路会变成：

`A 根目录 / B 封面 -> B 第 1 到 11 页 -> 点击进入游戏 -> A 的 frontend/index.html`

如果你想保留现在的视觉占位页，也可以在 `enterGame()` 里先显示 `placeholder-home.jpg` 再跳 `./frontend/`，但从结果上看，直接跳 A 首页更简单、维护成本更低。

## 调试与回填

`?debug=1` 下当前有两块调试能力。

### 布局调试

对应文件：

- `src/modules/debugPanel.js`
- `src/config/layout.js`

可调内容：

- 视频窗口位置、尺寸、圆角
- 文字块位置、尺寸、字号、行高、对齐
- 页码位置与字号
- 跳过按钮、静音按钮、上一页、下一页 / 进入游戏按钮的位置和尺寸

导出结果会暂存在浏览器 `localStorage`，使用的 key 是：

- `alchemy-intro-book:layout-debug`

### 最终过渡调试

对应文件：

- `src/modules/transitionDebugPanel.js`
- `src/config/appConfig.js -> transition`

当前可调参数：

- `mediaEndScaleMultiplier`
- `mediaEndOffsetXPx`
- `mediaEndOffsetYPx`
- `mediaOpacity` 仅调试用
- `pauseAtEndFrame` 仅调试用

导出结果同样暂存在 `localStorage`，使用的 key 是：

- `alchemy-intro-book:transition-debug`

注意：

- 这里真正应该回填的是 `transition` 里的缩放和位移参数
- `mediaOpacity` 和 `pauseAtEndFrame` 是调试辅助项，不属于正式运行参数

## 接手后最常修改的文件

- 改页顺序、增删页面、改文案：`src/config/pages.js`
- 改音频、全局素材、正式游戏入口：`src/config/appConfig.js`
- 改书页内元素位置：`src/config/layout.js`
- 改视觉样式与响应式表现：`styles/main.css`
- 改最终接入主游戏方式：`src/modules/introApp.js`

## 已知现状与注意事项

- 当前实际页数是 `11`，不是更早文档里写的 `13`
- 当前第一个可见页面已经不是 intro 第 1 页，而是封面页 `cover.jpg`
- `assets/videos/pages/` 当前实际只有 `p01.mp4` 到 `p11.mp4`
- `assets/icons/` 目录存在，但当前没有实际 icon 文件
- `bookFrameOverlayFallback` 当前未配置
- 页间视频转场功能仍是预留状态
- 如果未来要把 B 接进 A，当前 A 的默认 README 启动方式需要调整，否则不会先进入 B
- 项目没有测试框架，当前以浏览器本地预览和 `?debug=1` 调参为主

## 交接建议

如果你是第一次接这个项目，建议按下面顺序接手：

1. 先跑起来，确认 `http://127.0.0.1:8080/` 正常
2. 先点击封面，确认 `cover.jpg -> intro 第 1 页 -> BGM 播放` 这条链路正常
3. 打开 `?debug=1`，理解布局调试和最终过渡调试各自改的是哪一层
4. 阅读 `src/config/pages.js`，确认当前 11 页的叙事顺序和素材命名
5. 阅读 `src/config/appConfig.js`，确认后续正式游戏到底准备走 `"placeholder"` 还是 `"url"`
6. 如果目标是接入 `alchemy-game(A)`，先确认 A 的静态服务方式是否已经从根目录起服务
7. 最后再进入 `src/modules/introApp.js`，处理真正的接入和 bug 修复

这样接手最快，也最不容易误改到错误层级。
