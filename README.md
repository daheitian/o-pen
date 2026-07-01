# Pi-Mind 卡片笔记应用

**Pi-Mind** 是一款高颜值的卡片笔记（Card Note）应用程序，深受 flomo 启发。系统采用 **WebUI 前端 + Node.js (better-sqlite3) 后端 + Pi Agent (Minimax/Gemini) 智能体** 架构搭建，不仅支持经典的双向链标签、贡献热力图、贴图附件，更集成了能够流式理解你笔记上下文的右侧 AI 助手面板。

---

## 🎨 视觉效果与架构设计

### 1. 三栏式 UI 布局
- **左栏（侧边栏）**：个人头像、统计数据（卡片总数、标签数、活跃天）、最近 12 周的 GitHub 风格**笔记贡献热力图**、全局标签过滤器以及设置。
- **中栏（卡片流）**：顶部的笔记编辑器（支持通过工具栏或快捷键插入 `#标签`、`**加粗**`、`- 列表` 和 `🖼️ 贴图`），下方为按时间倒序排列的卡片流，支持单条卡片的二次编辑与删除。
- **右栏（AI 助手交互区）**：与本地 Pi Agent 的多轮对话界面，包含实时的“智能体分析中”状态指示器、预设的快捷提问药丸（例如“总结我最近的笔记”），以及打字机式的流式响应。

### 2. 技术栈
- **前端 WebUI**：Vite 8 + React 19 + Vanilla CSS（完全无 Tailwind，遵循玻璃拟态与现代微交互设计规范）
- **后端 API**：Express + `better-sqlite3`（超轻量、高性能本地 SQL 数据库） + `multer`（处理贴图上传）
- **AI 智能体**：直连本地 Pi CLI（`/Users/zion/.pi/agent/bin/pi-minimax`），支持多轮对话轨迹持久化。
- **贴图存储**：本地物理路径 `~/.pi-mind/assets/`。

---

## 📁 项目目录结构

```
pi-mind/
├── package.json              # 根目录 package.json（定义并发启动脚本）
├── notes.db                  # 本地 SQLite 数据库文件（自动创建）
├── .env.example              # 环境变量模板
├── server/                   # Node.js Express 后端
│   ├── package.json
│   ├── db.js                 # 数据库初始化与连接管理
│   ├── index.js              # 卡片 CRUD、数据统计、贴图上传 API
│   └── agent_bridge.js       # 智能体管道桥接器（读取卡片作为 prompt 并使用 SSE 流式回传）
└── client/                   # Vite React 前端
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx           # 全局状态管理与 SSE 连接处理
        ├── App.css           # 包含玻璃微质感及三栏布局的样式表
        ├── index.css         # 全局基础 reset
        └── components/
            ├── Sidebar.jsx   # 侧边栏（统计、热力图、标签树）
            ├── NoteFeed.jsx  # 编辑器、工具栏与卡片信息流
            └── AgentPanel.jsx# AI 聊天交互面板
```

---

## ⚙️ 环境配置与安装

### 1. 配置 API 密钥
本项目的 AI 助手通过 `pi-minimax` 驱动，会自动加载 `~/.pi/agent/.env` 下配置的 API 密钥。请确保该文件已配置相应的 `MINIMAX_API_KEY` 或 `GEMINI_API_KEY`。

同时，你在根目录下也可以通过 `.env.example` 创建本地 `.env` 配置文件：
```bash
cp .env.example .env
```

### 2. 安装依赖
在项目根目录下，运行以下脚本一键安装根目录、前端及后端的全部依赖：
```bash
npm run install:all
```

---

## 🚀 启动与运行

在项目根目录下，你可以使用以下命令：

### 1. 同时启动前端与后端（推荐并发模式）
```bash
npm run dev
```
- 前端运行在：[http://localhost:5173/](http://localhost:5173/)
- 后端服务运行在：[http://localhost:5005](http://localhost:5005)

### 2. 单独启动后端服务
```bash
npm run dev:server
```

### 3. 单独启动前端服务
```bash
npm run dev:client
```

---

## 💡 核心功能实现细节

1. **双向标签自动解析**：写入卡片时，后端会通过正则正则提取正文中的所有带有 `#` 前缀的词条（如 `#vite`），并以 JSON 数组形式写入 SQLite 的 `tags` 字段。
2. **多格式渲染**：
   - 使用 `-` 或 `*` 起头的行会被自动解析为 HTML `<li>` 无序列表。
   - 使用 `**文字**` 包裹的内容被渲染为 `<strong>` 加粗强调。
   - 插入的图片格式 `![image](url)` 被解析为响应式的 `<img>` 标签展示。
3. **贡献热力图算法**：
   - 侧边栏组件会自动追溯并生成过去 12 周（共 84 天）的日期坐标。
   - 后端使用 SQLite substring 将 `created_at` 归档到天并统计总数，前端根据卡片密度渲染成 5 个不同深浅的薄荷绿方格级别。
4. **AI 智能体上下文融合 (Grounding)**：
   - 在用户向 AI 提问时，桥接器会自动读取最新的 30 条卡片数据。
   - 格式化后作为 System Prompt 注入到 `pi` CLI 命令的上下文中，使得智能体在回答时能够精确识别卡片内容并指明 `[卡片 ID]` 引用源，确保回答真实不幻觉。
