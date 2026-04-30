# VFX Magic Circle — 炼金法阵

一款 2.5D 割草+炼金的 Web 游戏。  
核心玩法：在**炼金室**合成法阵卡牌 → **割草战斗**中收集能量 → 合成新法阵。

## 快速启动

```bash
python -m http.server 8080 --bind 0.0.0.0
# 访问 http://127.0.0.1:8080
```

## 目录结构

```
├── index.html                   主入口
├── css/style.css                全局样式
├── js/
│   ├── main.js                  页面路由 & 初始化
│   ├── storage.js               localStorage 数据层
│   ├── alchemy.js               炼金室逻辑
│   ├── collection.js            收藏夹逻辑
│   ├── loadout.js               装备法阵（武器选择）逻辑
│   └── battle.js                割草战斗（Canvas 2.5D）
│
├── assets/                      所有游戏资产
│   ├── bg/                      背景 & 场景图
│   │   ├── alchemy-room.webp        炼金室背景
│   │   ├── collection-bg.webp       收藏夹/装备页背景
│   │   ├── forge-popup-bg.webp      合成弹窗背景
│   │   ├── background_behind.webp   战斗地图底层
│   │   └── background_front.webp    战斗地图前景（2.5D 遮挡）
│   ├── ui/                      UI 元素
│   │   ├── card-frame.webp          卡牌框母版
│   │   └── player.webp              玩家角色
│   ├── icon/                    按钮图标
│   │   ├── hecheng.png, queren.png, fanhui.png ...
│   │   └── wodefazhen.png, wuqiku.png, fangqi.png, jiarusoucang.png
│   ├── monsters/                怪物精灵图（游戏运行用）
│   │   └── mob-goblin.png, mob-skeleton.png, mob-demon.png ...
│   ├── monster_sheets/          怪物原始序列帧（源素材）
│   │   ├── Demon Evolution Sheet/
│   │   ├── Dungeon Guardian Sheet/
│   │   ├── goblin tribe/
│   │   ├── Orc Evolution Sheet/
│   │   ├── Ultimate Demon Evolution Sheet/
│   │   └── undead skeleton army/
│   ├── spells/                  法阵圆环图片素材
│   │   └── *.jpg (PixVerse 生成)
│   ├── thumbnails/              法阵缩略图（自动生成）
│   │   └── thumb_00.webp ~ thumb_13.webp
│   ├── videos/                  预处理后的法阵视频
│   │   └── *.mp4
│   ├── aena/                    战斗场景背景素材（无限世界）
│   │   ├── seamless_texture_01.jpg  地面底图（无缝平铺）
│   │   ├── skull_01.png, skull_02.png  白骨装饰（透明底）
│   │   └── linear_dodge_add_01/02.png  光斑层（线性减淡混合）
│   └── data/                    JSON 数据文件
│       ├── seed_cards.json          初始卡牌数据
│       └── video_list.json          视频列表
│
├── tools/                       开发辅助工具
│   ├── slot_tuner.html              卡槽位置可视化调参
│   ├── preview_img_spell.html       图片法阵效果预览 & 调参
│   └── preview.html                 旧版 2.5D 渲染测试页
│
├── scripts/                     Python 工具脚本
│   ├── preprocess.py                视频预处理（锐化、羽化、统一时长）
│   ├── generate_list.py             生成 video_list.json
│   └── extract_thumbnails.py        从视频提取缩略图
│
├── docs/
│   ├── design.md                    原始设计文档（页面结构、素材清单、交接模板）
│   ├── roadmap.md                   架构决策记录（AI 后端方案、数据模型等）
│   ├── background.md                多层滚动背景系统技术文档
│   └── 0428.md                      总体设计文档（角色、战斗、动画方案）
│
└── requirements.txt             Python 依赖
```

## 操作说明

- **炼金室**：点击卡槽选牌 → 两槽放满点 START → 进入战斗
- **装备法阵**：上方 4 个大槽 = 战斗携带的法阵，下方选牌填充
- **战斗**：WASD 移动 | 1234 切换法阵 | 鼠标点击释放 | Space 闪避 | R 大招

## 技术架构

### 前端架构
- **纯 HTML/CSS/JS**，无框架依赖，无构建步骤
- 每个 JS 模块是一个 IIFE，通过全局变量暴露接口（`Battle`、`Alchemy`、`Collection`、`Loadout`、`GameStorage`）
- 页面切换由 `main.js` 的 `showPage()` 控制，通过 CSS class `active` 实现淡入淡出

### 数据层 (`js/storage.js`)
- 所有持久数据存 `localStorage`（key: `alchemy-forge-data`）
- 包含：cards 列表、currentSlotA/B、loadout[4]、pendingGeneration、tutorialDone
- `seedIfNeeded()` 从 `assets/data/seed_cards.json` 初始化 14 张法阵卡牌

### 战斗渲染 (`js/battle.js`)
- Canvas 固定分辨率 2560×1440，CSS 缩放适配屏幕
- **无限世界**：camera 跟随玩家，玩家可自由移动无边界
- 多层滚动背景（素材位于 `assets/aena/`）：
  - Layer 1: 地面底图 `seamless_texture_01.jpg` 无缝平铺，1:1 camera 滚动
  - Layer 2: 白骨装饰 `skull_01/02.png`，chunk-based 种子随机放置，翻转+透明度变化
  - Layer 3: 光斑层 `linear_dodge_add_01/02.png`，视差滚动(0.6x/0.45x) + 呼吸明灭 + lighter 混合
  - Layer 4: 游戏实体（特效 + 精灵 Y-sort）
  - Layer 5: 暗角（径向渐变，固定屏幕，缓存到离屏 canvas）
- 法阵特效用 `<video>` + `globalCompositeOperation = 'lighten'` 混合
- 大招 (R) 在中心释放主法阵 + 6 个散射子法阵，X 轴 1.6 倍扩散适配等距视角
- 怪物以流式节奏生成（2-5 只一簇，簇间随机间隔，偶尔长呼吸），在玩家周围屏幕外刷新

### 响应式方案
- `#app` 容器通过 `min(100vw, 100vh*16/9)` 强制 16:9 比例
- `body` flexbox 居中，超出部分为黑色 letterbox
- 炼金室卡槽用百分比 `left`/`top` 定位，可用 `tools/slot_tuner.html` 可视化微调

### 卡牌框透明区域
- 大框 `card-frame.webp` (800×972)：透明窗口 inset = `top:13%, left:20%, right:20%, bottom:38%`
- 小框 `card-frame-small.webp` (360×437)：同比例

详细的待开发规划和架构决策见 [docs/roadmap.md](docs/roadmap.md)。

## Python 工具

```bash
pip install -r requirements.txt

python scripts/preprocess.py          # 预处理视频
python scripts/generate_list.py       # 更新视频列表
python scripts/extract_thumbnails.py  # 提取缩略图
```
