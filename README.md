# AI法阵·炼金术士

玩家扮演炼金术士，通过合成已有法阵生成新的法阵大招，并在战斗中使用它们对抗不同属性的敌人。

## 项目结构

```
alchemy-game/
  frontend/     # 前端：游戏主循环、战斗、法阵展示、炼金合成
  backend/      # 后端：AI 生成服务（当前为占位，尚未实现）
  docs/         # 项目文档
```

## 本地运行前端

### 1. 克隆仓库

```bash
git clone https://github.com/Mr-Camel-82956648/alchemy-game.git
cd alchemy-game
```

### 2. 启动本地服务器

在 `frontend/` 目录下启动 HTTP 服务器：

```bash
cd frontend
python -m http.server 8000
```

如果 8000 端口被占用，可以改用其他端口：

```bash
python -m http.server 8080
```

### 3. 打开浏览器

访问 `http://localhost:8000`（或你指定的端口）。

> **不建议直接双击 `frontend/index.html` 打开。** 浏览器以 `file://` 协议加载时，视频资源和 fetch 请求（如加载 seed_cards.json）会因跨域限制而失败，导致法阵无法正常显示。

### 后端说明

当前后端目录 `backend/` 为预留占位，尚未实现。前端合成流程默认使用本地 mock 模式（见 `frontend/js/forgeAPI.js` 中的 `USE_MOCK` 开关），不依赖后端服务即可完整运行。

## 当前阶段目标

1. 保留现有前端玩法
2. 建立统一法阵/怪物数据结构
3. 引入极简属性与伤害规则
4. 新增最小后端 forge 接口（Phase 2+）
5. 实现前后端通信（Phase 2+）

## 设计原则

- 视觉优先，数值是视觉的翻译层
- 主属性参与战斗，副属性只记录
- 老法阵兼容迁移，新法阵优先结构化
- 资源一律通过稳定 id 管理，不通过数组位置管理

## 文档

- `docs/handover_to_cursor.md` — 项目交接说明
- `docs/roadmap.md` — 开发路线图
