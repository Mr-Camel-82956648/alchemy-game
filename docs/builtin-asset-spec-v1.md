# 内置资产制作规范 v1

本文是当前项目里 `built_in / curated` 静态卡牌资产的唯一正式制作规范。今后无论是 `starter`、`default_pool`，还是从 `player_generated` 迁移入库的 `curated` 资产，都以本文为准。

## 1. 术语说明

### `built_in`：内置资产

- 含义：项目随仓库长期维护的静态资产。
- 典型来源：手工制作、团队直接制作、明确作为默认内容设计的资产。
- 常见用途：`starter`、`default_pool`。

### `curated`：精选入库资产

- 含义：从玩家生成结果中挑选后，人工固化入库的静态资产。
- 重点：`curated` 不是“系统原生做出来的内置资产”，而是“从 `player_generated` 里挑中后，复制资源、补元数据、正式入库”的结果。
- 常见用途：把质量高、适合长期保留的玩家生成素材放入 `default_pool` 或其他正式池。

### `player_generated`：玩家生成资产

- 含义：玩家在运行时通过 forge / PixVerse 主链生成的资产记录。
- 典型特征：依赖 `cardId`、`videoTaskId`、`resultUrl` 等运行态信息。
- 注意：它可以被保留作来源记录，但它本身不等于默认池或 starter 的静态资产目录。

### `starter`：新手初始资产池

- 含义：新玩家一开始就能稳定获得或使用的静态池。
- 口径：通常使用 `built_in`，少量经过人工筛选的 `curated` 资产也可进入，但仍需按静态协议正式入库。

### `default_pool`：默认法阵 / 大招池

- 含义：系统默认可抽取、可配置、可长期维护的静态资产池。
- 口径：既可以放 `built_in`，也可以放经过固化后的 `curated`。

## 2. 正式目录协议

每个静态资产必须是一个自包含目录，至少包含以下三个文件：

```text
backend/assets/cards/<assetId>/
  metadata.json
  video.mp4
  thumbnail.webp
```

约束：

- `assetId` 是资产唯一标识，也是目录名。
- `metadata.json` 必须与媒体文件放在同一目录。
- `video.mp4` 和 `thumbnail.webp` 是推荐固定文件名；如确有必要使用子目录或不同文件名，也必须通过相对路径写在 metadata 中。
- metadata 内正式字段是 `videoPath` 与 `thumbnailPath`，路径相对于当前资产目录。
- 新资产制作时，不再使用 `videoUrl` / `thumbnailUrl` 作为正式写法。

过渡兼容：

- 当前扫描器仍兼容读取旧 metadata 里的 `videoUrl` / `thumbnailUrl`，避免存量样例瞬间失效。
- 这只是迁移过渡方案，不是长期并列协议。
- 新建或改造静态资产时，必须落为自包含目录协议。

## 3. metadata 正式字段

推荐基准结构如下：

```json
{
  "id": "fire-basic-01",
  "name": "炎龙法阵",
  "sourceType": "built_in",
  "category": "default_pool",
  "attrSet": ["fire"],
  "generation": 1,
  "inputPhrase": "火龙+哈根达斯",
  "videoPrompt": "一段高质量、华丽危险、兼具冷焰奢美感的3D游戏技能特效视频……",
  "description": "默认火系大招池中的基础高表现法阵。",
  "videoPath": "video.mp4",
  "thumbnailPath": "thumbnail.webp",
  "origin": "handcrafted",
  "originCardId": null,
  "curationNote": null
}
```

字段说明：

| 字段 | 中文解释 | 规则 |
|------|------|------|
| `id` | 资产唯一标识 | 必填；应与目录名一致。 |
| `name` | 展示名称 | 必填；给前端和人工整理使用。 |
| `sourceType` | 来源类型 | 静态资产只应使用 `built_in` 或 `curated`；`player_generated` 是运行态来源类型。 |
| `category` | 所属池类别 | 常用值：`starter`、`default_pool`；也可扩展其他静态池名。 |
| `attrSet` | 属性集合 | 必填；当前项目主语义字段，推荐使用 `fire / ice / thunder / blight`。 |
| `generation` | 世代 | 静态 starter / default_pool 通常填 `1`。仅当该静态池明确表示更高阶资产时才填写更大值。 |
| `inputPhrase` | 原始输入短语 | 可选；记录最初用于合成、命名或路由的短句。 |
| `videoPrompt` | 最终视频提示词 | 可选但强烈建议填写；便于后续维护、复刻和质量对比。 |
| `description` | 资产描述 | 可选；说明定位、用途、风格或维护备注。 |
| `videoPath` | 本地视频相对路径 | 正式字段；相对当前资产目录，例如 `video.mp4`。 |
| `thumbnailPath` | 本地缩略图相对路径 | 正式字段；相对当前资产目录，例如 `thumbnail.webp`。 |
| `origin` | 原始来源 | 常用值：`handcrafted`、`player_generated`。 |
| `originCardId` | 原始玩家卡片 ID | 若来自 `player_generated`，应填写原始 `cardId`；否则填 `null`。 |
| `curationNote` | 精选入库备注 | `curated` 建议填写；说明为什么入库、做了哪些整理。 |

补充说明：

- `/api/assets/cards` 对外仍会返回前端可直接使用的 `videoUrl` / `thumbnailUrl`。
- 这些 URL 由后端基于 `videoPath` / `thumbnailPath` 解析生成。
- 也就是说：metadata 内部写相对路径，对外 API 暴露可访问地址。

## 4. starter 资产示例

`built_in + starter` 的典型 metadata：

```json
{
  "id": "flame-ring-builtin",
  "name": "熔环起式",
  "sourceType": "built_in",
  "category": "starter",
  "attrSet": ["fire"],
  "generation": 1,
  "inputPhrase": "火焰圆环",
  "videoPrompt": "25D 游戏视角下，一枚火系起始法阵在地面稳定展开，熔火环纹由内向外逐层点亮。",
  "description": "新手初始资产池中的火系内置法阵样例。",
  "videoPath": "video.mp4",
  "thumbnailPath": "thumbnail.webp",
  "origin": "handcrafted",
  "originCardId": null,
  "curationNote": null
}
```

## 5. default_pool 资产示例

`built_in + default_pool` 的典型 metadata：

```json
{
  "id": "fire-basic-01",
  "name": "炎龙法阵",
  "sourceType": "built_in",
  "category": "default_pool",
  "attrSet": ["fire"],
  "generation": 1,
  "inputPhrase": "火龙法阵",
  "videoPrompt": "25D 游戏视角下，火龙脉冲沿圆环符文向外喷发，整体表现稳定且适合默认池循环使用。",
  "description": "默认火系法阵池中的基础高表现资产。",
  "videoPath": "video.mp4",
  "thumbnailPath": "thumbnail.webp",
  "origin": "handcrafted",
  "originCardId": null,
  "curationNote": null
}
```

## 6. curated 资产示例

`curated + default_pool` 的典型 metadata：

```json
{
  "id": "frost-veil-curated",
  "name": "霜幕护潮",
  "sourceType": "curated",
  "category": "default_pool",
  "attrSet": ["ice", "blight"],
  "generation": 1,
  "inputPhrase": "冰雾护幕",
  "videoPrompt": "25D 游戏视角下，一枚冰雾与蚀气交织的防御型法阵在地面铺开，寒霜边缘持续扩散。",
  "description": "从玩家生成结果中挑选后，人工固化入默认池的精选样例。",
  "videoPath": "video.mp4",
  "thumbnailPath": "thumbnail.webp",
  "origin": "player_generated",
  "originCardId": "player_generated_demo_frost_veil",
  "curationNote": "演示样例：说明玩家生成素材迁移入默认池后的正式落库形态。"
}
```

## 7. 从 `player_generated` 迁移进默认池的标准操作流程

这是本轮统一后的正式流程，不能简化成“改一条状态”或“继续引用 PixVerse 外链”：

1. 选中一条玩家生成结果，记录其原始 `cardId`、生成时间、效果定位。
2. 在 `backend/assets/cards/` 下创建新的静态资产目录，例如 `backend/assets/cards/frost-veil-curated/`。
3. 将视频下载或拷贝为本地 `video.mp4`。
4. 为该资产生成或挑选本地 `thumbnail.webp`。
5. 新建 `metadata.json`，填写正式字段。
6. 将 `sourceType` 写为 `curated`，并根据目标池填写 `category`，例如 `default_pool`。
7. 将 `origin` 写为 `player_generated`，并把原始 `cardId` 写入 `originCardId`。
8. 确认 metadata 里只写 `videoPath / thumbnailPath`，不要继续保留外部 PixVerse URL 作为静态资产本体。
9. 启动后端后用 `/api/assets/cards` 检查该资产是否能被列出，并确认返回了可访问的 `videoUrl / thumbnailUrl`。

重要说明：

- 原始 `player_generated` 记录可以保留，用于追溯来源。
- 但默认池资产的本体必须是新的静态目录，不是对原记录改状态，也不是继续指向外部结果链接。

## 8. 命名规范建议

- `assetId` 使用小写 kebab-case，例如 `flame-ring-builtin`、`frost-veil-curated`。
- 一份资产一个目录，不要多个资产共用同一份 metadata。
- 媒体文件优先固定命名为 `video.mp4` 与 `thumbnail.webp`，降低维护成本。
- 若同主题存在多个版本，应体现在 `assetId`，例如 `fire-basic-01`、`fire-basic-02`。
- `name` 可以使用中文展示名，但 `id` 建议保持英文和短横线，方便代码、路径和脚本处理。

## 9. generation 填写规则

- `starter` 资产：默认填 `1`。
- `default_pool` 资产：默认填 `1`。
- `curated` 资产：如果是为了进入 starter / default_pool 这类长期静态池，通常也填 `1`，保持池内语义稳定。
- 只有当某个静态池本身明确表达“高世代默认内容”时，才把 `generation` 写成更大的值。
- 若原始 `player_generated` 的 generation 对整理有参考价值，可写进 `curationNote`，但不应机械照搬到 starter / default_pool。

## 10. 当前代码口径

- 后端静态扫描器优先读取 `videoPath / thumbnailPath`。
- `/api/assets/cards` 会把相对路径解析成前端可直接访问的 URL。
- 旧 `videoUrl / thumbnailUrl` 目前仍可读取，但仅用于迁移过渡。
- 当前已迁移的样例目录：
  - `backend/assets/cards/flame-ring-builtin/`
  - `backend/assets/cards/frost-veil-curated/`
