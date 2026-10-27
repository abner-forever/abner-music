# Electron Forge 桌面客户端技术选型

> 适用范围：以 Abner Music 为基线，沉淀可复用的 Electron 桌面客户端技术栈，用于后续开发其他桌面应用。
>
> 基线版本：`0.1.0-beta.11`，文档日期 2026-10-27。
>
> 本文不是框架介绍，而是一份**决策记录 + 复用指南**：说明当前为什么这样选、备选方案是什么、哪些部分可直接搬到新客户端、哪些必须按应用重做。
>
> 签名、安装/更新、代码组织和现有前端接入的详细操作见配套文档：[Electron Forge 落地指南](./electron-forge-implementation-guide.md)。

---

## 1. 结论摘要

新桌面客户端建议直接沿用以下基线：

| 层             | 选型                                                             | 结论                                                                   |
| -------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 运行时         | Electron 45                                                      | 固定大版本，按季度升级；需要一致的 Web 渲染与音视频解码时优先 Electron |
| 构建编排       | Electron Forge 8                                                 | 保留官方生命周期（package / make / publish）                           |
| 打包           | Forge Vite Plugin + Vite 7                                       | 主进程、preload、渲染进程三份配置分离                                  |
| 语言           | TypeScript 5.9（strict）                                         | 主进程与渲染进程共享类型契约                                           |
| UI             | Vue 3.5 + 单文件组件                                             | 适合中小型单窗口工具；团队偏好 React 时可在渲染层替换，不影响壳层      |
| 状态           | Vue `reactive` 模块化 store                                      | 两三个 store 足够；超过 5 个或需要调试时间旅行再引 Pinia               |
| 进程通信       | `contextBridge` + 手写类型化门面                                 | 通道少时最直观；通道膨胀后再考虑 schema 校验或 tRPC 风格封装           |
| 安全           | `contextIsolation` + `sandbox` + CSP + 自定义协议                | **不可妥协**，作为模板固定项                                           |
| 本地数据       | 主进程原子写 JSON + 渲染层 `localStorage`                        | 万级记录以内够用；更大规模或高频写入换 SQLite                          |
| macOS 安装包   | `maker-dmg` + `maker-zip`                                        | DMG 负责安装体验，ZIP 便于分发与校验                                   |
| Windows 安装包 | `electron-forge-maker-nsis`（app-builder-lib）                   | 需要自定义安装界面时选它，不用 Squirrel                                |
| 发布           | GitHub Releases + 手动下载                                       | 未签名阶段最省事；正式签名后再评估 `electron-updater`                  |
| 测试           | `node:test` + Playwright（浏览器 E2E + 打包后 `_electron` 冒烟） | 逻辑与真实安装包分层验证                                               |
| CI/CD          | GitHub Actions 三平台矩阵                                        | macOS arm64 / x64、Windows x64 分别构建与验证                          |
| 复用方式       | **模板仓库优先，共享包次之，Monorepo 最后**                      | 第二个客户端前不要过早抽象                                             |

一句话：**Electron + Forge + Vite + TypeScript 是壳；Vue 与业务代码是每个客户端可替换的部分。复用时应复制“壳与交付流水线”，不要复制“音乐业务”。**

---

## 2. 当前项目基线

### 2.1 版本清单

| 依赖                                      | 版本           | 作用                                        |
| ----------------------------------------- | -------------- | ------------------------------------------- |
| Electron                                  | 45.0.0         | 桌面运行时                                  |
| Electron Forge                            | 8.0.1          | 打包、制作安装包、发布                      |
| `@electron-forge/plugin-vite`             | 8.0.1          | 主进程 / preload / 渲染进程构建             |
| Vite                                      | 7.3.7          | 开发服务器与产物构建                        |
| TypeScript                                | 5.9.3          | 类型检查（`noEmit`）                        |
| Vue                                       | 3.5.44         | 渲染层                                      |
| `vue-tsc`                                 | 3.3.13         | Vue 模板类型检查                            |
| Node.js                                   | 24（`.nvmrc`） | 开发、CI 与脚本运行时                       |
| `electron-forge-maker-nsis`               | 26.18.0        | Windows NSIS 安装器（封装 app-builder-lib） |
| `@electron-forge/maker-dmg` / `maker-zip` | 8.0.1          | macOS 安装包                                |
| `@electron-forge/publisher-github`        | 8.0.1          | GitHub Releases 发布                        |
| Playwright                                | 1.64.1         | 浏览器 E2E 与打包后桌面冒烟                 |
| `music-metadata`                          | 12.3.2         | 音频标签解析（业务依赖）                    |
| `semver`                                  | 7.8.5          | 更新通道与版本比较                          |

### 2.2 进程与目录

```text
┌──────────────────────────────────────────────────────┐
│ Main（Node.js）                                       │
│  src/main.ts        窗口、托盘、菜单、导入、IPC、协议   │
│  src/desktop/*      媒体流、更新检查                   │
│  src/shared/*       跨进程类型与纯逻辑                  │
└───────────────▲──────────────────────┬───────────────┘
                │ invoke / send        │ webContents.send
┌───────────────┴──────────────┐       │
│ Preload（sandbox）            │       │
│  contextBridge → window.desktop│      │
└───────────────▲──────────────┘       │
                │ 类型化门面            │
┌───────────────┴──────────────────────▼───────────────┐
│ Renderer（Vue 3，无 Node）                             │
│  src/renderer/App.vue、components、stores、lib          │
└───────────────────────────────────────────────────────┘
```

关键边界：

- `src/shared/types.ts` 是主进程、preload、渲染进程共同遵守的契约。
- preload 只做通道白名单和类型收窄，不包含业务逻辑。
- 渲染进程通过 `window.desktop` 调用桌面能力；浏览器预览时该对象不存在，业务代码需要降级。
- 主进程负责所有文件系统、协议、更新和窗口生命周期。

### 2.3 构建与发布链路

```text
npm start
  └─ Forge preStart：同步开发态应用名/图标
  └─ Vite Plugin：启动 5174 开发服务器，构建 main/preload

npm run make
  └─ Forge package（asar）
  └─ postPackage：校验 macOS .app 相对符号链接
  └─ maker-dmg / maker-zip / maker-nsis
  └─ out/make/**

push v* tag
  └─ GitHub Actions 矩阵构建
  └─ 打包后冒烟、DMG 挂载验证、Windows 安装向导验证
  └─ 汇总 SHA256SUMS
  └─ 创建 GitHub Release（Beta 自动发布，正式版保留草稿）
```

---

## 3. 分项选型与决策

### 3.1 运行时：Electron 45

**选择理由**

- 音视频播放需要稳定一致的 Chromium 解码能力；WebView 方案在不同系统上的编解码支持不一致。
- 主进程可直接使用 Node.js 生态（文件扫描、标签解析、流式 Range 响应）。
- 同一套前端代码覆盖 macOS / Windows；后续可扩展到 Linux。

**代价**

- 每个客户端至少多出约 100 MB 的 Chromium 体积。
- Electron 每 8 周一个大版本，官方只维护最近三个大版本，需要持续升级。
- 原生模块（如 SQLite、FFmpeg 绑定）会引入 ABI 与重编译成本。

**何时不选 Electron**

- 应用不需要复杂音视频、只需要轻量工具界面，且能接受系统 WebView 差异：可评估 Tauri。
- 需要极低内存占用或强原生体验：评估原生方案。

**升级策略**

- 固定 Electron 大版本，使用 lockfile；每季度评估一次升级，至少保证不落后于官方支持窗口。
- 升级时重点回归：自定义协议、preload、打包后冒烟、安装包、公证。
- 不要在多个客户端之间使用不同的 Electron 大版本，否则壳层复用会分裂。

---

### 3.2 构建编排：Electron Forge 8

**选择理由**

- 官方维护，`package` → `make` → `publish` 生命周期完整。
- Maker/Publisher 插件模型适合“一套壳、多种安装包/发布渠道”。
- 与 `publisher-github` 集成，适合以 GitHub Releases 为分发源的小团队。
- 配置集中在 `forge.config.ts`，可抽成工厂函数供多个客户端复用。

**与 electron-builder 的取舍**

| 维度     | Electron Forge                                         | electron-builder                |
| -------- | ------------------------------------------------------ | ------------------------------- |
| 官方归属 | Electron 官方                                          | 社区                            |
| 配置方式 | `forge.config.ts` + 插件                               | `package.json#build` / 独立配置 |
| NSIS     | 需 `electron-forge-maker-nsis`（封装 app-builder-lib） | 原生支持，能力最完整            |
| 自动更新 | 需自行接 `electron-updater`                            | 与 NSIS 更新链路整合更成熟      |
| 发布     | Publisher 插件（GitHub 等）                            | 内建多种 provider               |
| 适合场景 | 追求官方生命周期、跨客户端统一                         | Windows 安装器/自动更新要求高   |

**当前项目的特殊情况**

Windows 安装器使用的是 `electron-forge-maker-nsis`，它由 electron-builder 作者维护，内部调用 `app-builder-lib`。因此项目里同时存在两套配置：

- `forge.config.ts`：Forge 打包与 maker 参数。
- `package.json#build`：electron-builder 约定，`appId`、`productName`、`win.icon` 等会被 app-builder-lib 读取。

**这不是冗余配置，不能随意删除 `package.json#build`。** 复用时要明确“哪个字段由谁消费”，避免两边漂移。建议在文档或注释中标记：

```text
forge.config.ts       → Forge packager / maker / publisher
package.json#build    → app-builder-lib（仅供 Windows NSIS maker）
```

---

### 3.3 打包：Forge Vite Plugin + Vite 7

**选择理由**

- 开发态 HMR 快，三端构建配置独立，职责清晰。
- 主进程与 preload 以 CJS 产物输出（`main.cjs` / `preload.cjs`），规避 `"type": "module"` 与 Electron 加载差异。
- 渲染进程使用 ESM，`base: './'` 适配 `file://` 加载。

**注意事项**

- Forge 的 Vite 插件长期处于快速演进状态，主进程/preload 产物命名、注入的环境变量（`MAIN_WINDOW_VITE_DEV_SERVER_URL`、`MAIN_WINDOW_VITE_NAME`）可能随大版本变化。
- 升级 Forge 或 Vite 后，必须重新验证 `npm start`、`npm run package` 和打包后冒烟，不能只看渲染层构建成功。
- 主进程构建需要把 `electron` 与 Node 内置模块标记为 external；preload 只 external `electron`。
- `package.json` 的 `main` 指向 `.vite/build/main.cjs`，这是插件约定，不要手改成源码路径。

**浏览器预览**

`npm run dev` 使用 5173，Forge 开发服务器使用 5174，两者可同时启动。渲染层必须对 `window.desktop` 缺失做降级，这样同一套 UI 可以在浏览器里做快速迭代和 E2E。

---

### 3.4 渲染层：Vue 3 + TypeScript

**选择理由**

- 单文件组件适合桌面工具的中等复杂度界面。
- 组合式 API + `reactive` 模块化 store，依赖少、启动快。
- 当前没有引入 `vue-router` 和 Pinia，减少了壳层复用的包袱。

**对新客户端的建议**

- UI 框架不影响主进程壳层；如果团队更熟悉 React，可以只替换 `src/renderer`。
- 一旦出现多窗口、深链接、多页面导航，再引入 `vue-router`。
- store 数量增加、需要 devtools 或跨窗口同步时，再引入 Pinia；不要为了“规范”提前引入。
- 设计系统（颜色、间距、字体、暗色主题）建议独立成包或独立目录，便于多个客户端共享视觉语言。

---

### 3.5 进程通信：类型化 preload 门面

**当前模式**

```ts
// preload.ts
const bridge: DesktopBridge = {
  library: { list: () => ipcRenderer.invoke('library:list'), ... },
  window: { minimize: () => ipcRenderer.send('window:minimize'), ... },
};
contextBridge.exposeInMainWorld('desktop', bridge);
```

主进程侧对每个 handler 调用 `trusted(event)`：

- 校验发送者是主窗口。
- 校验 `senderFrame` 是主 frame。
- 对参数做运行时类型检查（例如 `folder === true`）。

**为什么不用更“重”的方案**

- 通道数量少时，手写门面最直观、类型最准确、调试成本最低。
- 引入 electron-trpc / Comlink 会增加构建复杂度，收益要到几十个通道后才明显。

**演进触发条件**

- 通道超过约 20 个，或参数结构复杂：为每个通道定义 schema（Zod / TypeBox），在 preload 或主进程统一校验。
- 多窗口需要共享状态：考虑主进程作为单一数据源，渲染层只订阅变更。
- 需要端到端类型安全：再评估 tRPC 风格封装。

---

### 3.6 安全模型

当前配置（应作为模板固定项）：

| 项                 | 配置                                                                  |
| ------------------ | --------------------------------------------------------------------- |
| `contextIsolation` | `true`                                                                |
| `sandbox`          | `true`                                                                |
| `nodeIntegration`  | `false`                                                               |
| 新窗口             | `setWindowOpenHandler(() => ({ action: 'deny' }))`                    |
| 页面导航           | `will-navigate` 阻止                                                  |
| IPC                | 校验 sender 与 mainFrame                                              |
| CSP                | `default-src 'self'`，禁止 `object-src`，限制 `media-src` / `img-src` |
| 本地文件           | 自定义协议按 ID 映射，不接受渲染层传任意路径                          |

**复用建议**

- 把窗口安全配置封装进壳层工厂，业务代码不可覆盖。
- preload 保持零第三方依赖；`sandbox: true` 下 preload 只能用受限 API。
- 任何“打开外部链接”都必须走主进程白名单，不能让渲染层直接 `window.open`。
- 自定义协议的 handler 只暴露应用数据，不暴露任意文件系统路径。

---

### 3.7 本地数据持久化

**当前实现**

- 主进程：`library.json`，写入走 `tmp` + `rename` 的原子替换，并用串行队列避免并发写。
- 渲染进程：`localStorage` 保存播放器与界面偏好。
- 浏览器预览：IndexedDB 保存导入文件。
- 导入上限 10,000 首，整库一次性 JSON 序列化。

**适配边界**

| 数据规模 / 写入频率    | 建议                                           |
| ---------------------- | ---------------------------------------------- |
| 万级以内、低频写入     | 原子写 JSON 足够                               |
| 数万级以上、频繁增删改 | SQLite（`better-sqlite3`）或 LevelDB           |
| 多窗口同时写           | 主进程单一写入者 + IPC 串行化                  |
| 需要迁移               | 在数据文件里加 `schemaVersion`，启动时执行迁移 |

**注意**

- 原生模块会引入 Electron ABI 重编译与 CI 打包复杂度，采用前先验证三平台。
- 数据目录与 `executableName` / `appId` 绑定；发布后改名会导致用户“丢数据”，必须做迁移或保持稳定。
- 建议为 JSON 数据增加备份（保留上一版本）与损坏恢复策略。
- 渲染层 `localStorage` 只放可丢失的 UI 偏好，不放唯一业务数据。

---

### 3.8 自定义协议与媒体流（业务相关，按需复用）

`abner-media://` 协议解决了三件事：

1. 渲染层不接触真实文件路径。
2. 支持 `Range` 请求，音频可拖动进度。
3. 通过 `protocol.registerSchemesAsPrivileged` 获得 `standard`、`secure`、`stream`、`corsEnabled` 能力。

这套模式可复用于任何“本地文件 + Web 播放器”的应用（视频、音频、PDF 预览等）：

- 只按业务 ID 映射文件。
- 处理 `GET` / `HEAD`、`416`、`Content-Range`。
- 对不存在的记录返回 404，不泄露路径。

纯表单类桌面应用不需要这一层，可整体省略。

---

### 3.9 安装包：DMG / ZIP / NSIS

**macOS**

- `packagerConfig.icon = 'build/icon'`，Forge 自动选择 `.icns`。
- `extraResource: ['build/icon.png']` 供运行时托盘/Dock 使用。
- DMG 使用自定义背景、图标位置和 660 × 440 窗口。
- `postPackage` 校验 `.app` 内相对符号链接，避免跨机器构建后无法启动。
- ZIP 与 DMG 同时产出，便于分发与完整性校验。

**Windows**

- 使用 NSIS，而非 Squirrel。
- `oneClick: false`、`perMachine: false`、允许切换当前用户/所有用户。
- 自定义安装界面通过 `build/installer-ui.nsh` 扩展 `build/installer.nsh`。
- 中英文双语、安装路径可修改、完成后不自动启动。
- 安装器、卸载器、应用 EXE、系统应用列表图标均显式配置。
- `differentialPackage: false`：当前不做自动增量更新，避免无意义产物。

**复用建议**

- 图标与安装背景生成脚本（`scripts/generate-icons.mjs`、`generate-installer-assets.mjs`）可直接复用，只替换 SVG 与品牌色。
- `artifactName` 建议统一为 `<Product>-<version>-<platform>-<arch>.<ext>`，便于发布脚本与下载页解析。
- 跨平台构建必须在对应系统上执行，不要依赖交叉编译。

---

### 3.10 签名与公证

当前 Beta 不签名，因此：

- macOS 首次打开可能被 Gatekeeper 拦截，需要在“隐私与安全性”中允许。
- Windows 可能触发 SmartScreen。
- 检查更新与 GitHub 下载不依赖签名。

**正式分发前必须补齐**

| 平台    | 要求                                                    | CI 变量                                                                           |
| ------- | ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| macOS   | Developer ID Application 证书 + Hardened Runtime + 公证 | `APPLE_SIGN_IDENTITY`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID` |
| Windows | OV/EV 代码签名证书                                      | 证书文件与密码（需放入 Secrets）                                                  |

当前 `forge.config.ts` 已按环境变量条件启用 `osxSign` 与 `osxNotarize`，并在未配置时跳过。这是多客户端复用的正确形态：**签名是可选能力，不应阻塞本地开发**。

`build/entitlements.mac.plist` 目前只开启 JIT 与未签名可执行内存，属于 Electron 常规最小集。新增原生能力（摄像头、麦克风、辅助功能）时，再按需增加 entitlement 与 `NSCameraUsageDescription` 等 plist 字段。

---

### 3.11 更新策略

**当前选择：检查 + 跳转 GitHub 手动下载**

- 主进程通过 `net.fetch` 请求 GitHub Releases API，不受渲染层 CSP 限制。
- 使用 `semver` 过滤草稿、旧版本和通道不匹配的版本。
- Beta 客户端可检测更高 Beta 与正式版；正式版只检测正式版。
- 校验发布页 URL 与预期格式一致后，才允许 `shell.openExternal`。
- 30 秒超时、403/429 友好提示、并发检查去重。
- 不自动下载、不替换自身。

**为什么暂不接自动更新**

- 未签名/未公证时，自动替换在 macOS 上不可靠。
- 手动下载流程简单、可审计，适合 Beta 阶段。
- `electron-updater` 对 macOS 自动更新有签名与 ZIP 元数据要求，接入成本应在签名之后。

**何时切换**

- 平台签名与公证完成。
- 用户量上升，手动更新成为主要支持负担。
- 能接受维护更新服务器或 GitHub Provider 的元数据（`latest.yml` 等）。

**切换时的建议**

- Windows NSIS + `electron-updater` 是成熟组合；macOS 需要签名 ZIP。
- 保留“检查更新”状态机，替换下载/安装实现，不要重写 UI 契约。
- 自动更新必须支持回滚与灰度通道，至少保留 Beta/Stable 两条通道。

---

### 3.12 测试策略

| 层         | 工具                                        | 覆盖内容                                                                       |
| ---------- | ------------------------------------------- | ------------------------------------------------------------------------------ |
| 单元测试   | `node:test`（`--experimental-strip-types`） | Range 解析、更新版本筛选、路径/发布校验、音乐工具函数                          |
| 浏览器 E2E | Playwright + Chromium                       | 播放器、歌单、导入、主题、歌词、网络 URL、下拉菜单                             |
| 打包后冒烟 | Playwright `_electron` 启动 `out/` 产物     | 从 `app.asar` 运行、原生导入、标签/LRC、Range/CORS、迷你窗口、持久化、更新跳转 |
| 安装包验证 | DMG 挂载 + PowerShell 操作 NSIS             | 符号链接、安装背景、Finder 布局、真实安装向导、图标、卸载                      |

**值得复用的做法**

- 测试直接启动**打包后的可执行文件**，而不是开发态 Electron；这能发现 asar、资源路径、图标、环境变量问题。
- 使用独立临时 `userData` 目录，避免污染本机数据。
- 安装包验证放在对应平台的原生 runner 上，不试图在 Linux 上模拟。
- 每次发布前把“能否安装并启动”作为硬门槛，而不是只跑单元测试。

**对新客户端的调整**

- 选择器、窗口尺寸、产品名、可执行文件名需要替换。
- 如果新应用不需要媒体能力，删除 Range/CORS 与音频相关用例。
- 单元测试可保留 `node:test`，减少依赖；如果团队更习惯 Vitest，可替换，但不要同时维护两套。

---

### 3.13 CI/CD

**质量检查（`ci.yml`）**

- Ubuntu + Node 24。
- `npm ci` 时设置 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`，避免 CI 下载运行时。
- 类型检查 → 单元测试 → 渲染层构建 → Playwright 浏览器 E2E。
- 失败时上传 `test-results/`。

**发布（`release.yml`）**

- 矩阵：macOS arm64、macOS x64、Windows x64。
- 标签必须是 `v<package.json version>`，否则失败。
- 每个平台构建后立即执行打包冒烟；macOS 额外验证 DMG；Windows 额外验证安装向导。
- 上传安装包 artifact；release job 汇总、生成 `SHA256SUMS.txt`、创建草稿 Release。
- `v*-beta.*` 在全部验证通过后自动转为 Prerelease；正式版保留草稿，人工确认后发布。

**多客户端复用建议**

- 把工作流抽成可复用的 `workflow_call` 模板，应用仓库只传产品名、构建命令与 artifact 路径。
- 签名 Secrets 按仓库或组织级别注入，不要写进模板。
- 每个客户端使用独立 tag 命名空间（例如 `music-v1.2.3`）或独立仓库，避免发布串台。

---

### 3.14 可观测性（当前缺口）

当前项目没有日志与崩溃上报。作为内部工具可以接受，但多客户端长期维护时建议补齐：

| 能力          | 建议                                             |
| ------------- | ------------------------------------------------ |
| 文件日志      | `electron-log`，按大小轮转，写入 `userData/logs` |
| 崩溃上报      | Sentry（主进程 + 渲染进程），注意隐私与采样      |
| 更新/安装诊断 | 记录版本、通道、检查结果、安装包来源             |
| 性能          | 启动耗时、窗口首次渲染、导入耗时                 |

日志中禁止记录完整文件路径、用户音乐库内容或令牌。

---

## 4. 选型对比矩阵

### 4.1 桌面框架

| 方案                 | 优势                                          | 劣势                                                    | 适用                     |
| -------------------- | --------------------------------------------- | ------------------------------------------------------- | ------------------------ |
| **Electron（当前）** | 渲染一致、Node 生态、音视频能力稳定、调试成熟 | 体积大、内存高、需持续升级                              | 媒体、文件、跨平台工具   |
| Tauri                | 体积小、内存低、Rust 安全模型                 | 系统 WebView 差异、原生能力需写插件、音视频编解码不确定 | 轻量工具、系统集成型应用 |
| Flutter Desktop      | 自绘 UI 一致、性能好                          | 桌面生态与 Web 复用弱、文件/系统集成成本高              | 强交互、自绘界面         |
| Wails                | Go 后端、体积较小                             | 生态与桌面能力弱于 Electron                             | Go 团队的小工具          |

### 4.2 构建工具

| 方案                             | 优势                              | 劣势                          | 建议                       |
| -------------------------------- | --------------------------------- | ----------------------------- | -------------------------- |
| **Forge + Vite Plugin（当前）**  | 官方生命周期、配置集中、HMR 快    | Vite 插件演进快、需回归打包   | 默认选择                   |
| Forge + Webpack Plugin           | 稳定、示例多                      | 构建慢、配置重                | 仅在 Vite 出问题时回退     |
| electron-vite + electron-builder | Electron 专用预设、Windows 打包强 | 脱离 Forge 生命周期、两套体系 | Windows 自动更新优先时评估 |
| electron-builder 单独            | NSIS/更新成熟                     | 发布与 maker 模型不同         | 重度 Windows 分发时评估    |

### 4.3 状态与数据

| 方案                          | 适用                       | 不适用                   |
| ----------------------------- | -------------------------- | ------------------------ |
| **Vue reactive 模块（当前）** | 少量 store、单窗口         | 多窗口共享、复杂异步缓存 |
| Pinia                         | 多 store、devtools、插件化 | 极小应用（增加样板）     |
| Vuex                          | 旧项目维护                 | 新项目                   |
| 原子写 JSON（当前）           | 万级以内、低频写           | 高频写、多写入者         |
| SQLite                        | 结构化查询、大数据量       | 不想处理原生模块打包     |
| electron-store                | 配置项、schema、迁移       | 大量业务记录             |

### 4.4 Windows 安装器

| 方案             | 优势                                  | 劣势                           | 结论                   |
| ---------------- | ------------------------------------- | ------------------------------ | ---------------------- |
| **NSIS（当前）** | 自定义界面、双语、每用户/每机器、成熟 | 依赖 app-builder-lib、配置分散 | 需要品牌化安装体验时选 |
| Squirrel.Windows | Electron 传统方案、自动更新简单       | 自定义能力弱、安装体验旧       | 不推荐新项目           |
| MSIX             | 系统集成、企业分发                    | 签名与打包要求高、调试复杂     | 企业渠道再评估         |
| WiX / MSI        | 企业部署、组策略                      | 学习成本高、Electron 集成少    | 企业客户要求时评估     |

### 4.5 更新

| 方案                              | 优势                         | 劣势                               | 适用           |
| --------------------------------- | ---------------------------- | ---------------------------------- | -------------- |
| **GitHub API + 手动下载（当前）** | 零服务端、可审计、未签名可用 | 用户需手动安装                     | Beta、小规模   |
| `electron-updater`                | 自动下载安装、增量更新       | 需签名、元数据、回滚设计           | 正式版、规模化 |
| `update-electron-app`             | 接入简单                     | 依赖 update.electronjs.org、定制弱 | 开源小工具     |
| 自建更新服务                      | 完全可控、灰度               | 运维成本                           | 商业产品       |

---

## 5. 复用蓝图：从单应用到桌面客户端套件

### 5.1 复用原则

1. **复用“壳与流水线”，不复用“业务领域”。**
   - 可复用：窗口、托盘、菜单、单实例、安全配置、协议框架、IPC 基础设施、存储、更新、打包、CI、安装包测试。
   - 需重写：领域模型、业务 IPC handler、界面、图标与文案、数据目录、更新仓库。
2. **模板优先，共享包次之，Monorepo 最后。**
   - 只有两个客户端时：复制模板仓库，成本最低，避免过早抽象。
   - 出现第三个客户端或壳层频繁同步修改时：抽成版本化包。
   - 需要共享 UI 组件、统一发布、统一依赖升级时：再上 Monorepo。
3. **壳层不依赖渲染层框架。**
   - 主进程、preload、构建配置不应 import Vue/React。
   - 这样新客户端可以选择不同 UI 框架，甚至复用同一壳层做不同产品。
4. **配置只保留一个事实来源。**
   - 产品名、appId、可执行文件名、协议 scheme、更新仓库应由一个 `app.config.ts` 导出，Forge、package.json#build、渲染层标题都从这里取值。

### 5.2 推荐目录（阶段 2：Monorepo）

```text
desktop-kit/
├─ apps/
│  ├─ abner-music/              # 当前应用
│  │  ├─ src/main.ts
│  │  ├─ src/features/          # 音乐业务
│  │  ├─ src/renderer/
│  │  └─ app.config.ts
│  └─ next-client/
├─ packages/
│  ├─ shell/                    # createDesktopApp、窗口/托盘/菜单/单实例
│  ├─ bridge/                   # IPC 契约与 preload 工厂
│  ├─ storage/                  # 原子 JSON、迁移、适配器接口
│  ├─ updates/                  # GitHub 版本选择与状态机
│  ├─ forge-preset/             # createForgeConfig、makers、artifact 命名
│  ├─ test-kit/                 # 打包冒烟、安装包验证工具
│  └─ ui/                       # 可选：设计令牌与基础组件
├─ templates/
│  └─ basic/                    # 新客户端脚手架
└─ .github/workflows/           # 可复用工作流
```

### 5.3 壳层接口草案

**应用配置（每个客户端唯一需要改的地方之一）**

```ts
// apps/<client>/app.config.ts
export default {
  appId: 'com.example.client',
  productName: 'Example Client',
  executableName: 'example-client',
  scheme: 'example-media', // 不需要本地文件协议可省略
  category: 'public.app-category.productivity',
  updateRepository: 'owner/repo',
  dataFile: 'library.json',
  window: { width: 1200, height: 800, minWidth: 1000, minHeight: 720 },
} as const;
```

**主进程启动器**

```ts
// packages/shell/createDesktopApp.ts
export async function createDesktopApp(options: {
  config: AppConfig;
  ipc: (context: IpcContext) => void; // 业务注册，壳层负责 trusted/sender 校验
  onReady?: (context: AppContext) => void; // 业务初始化
}) {
  // 单实例、协议、窗口、托盘、菜单、安全策略、退出流程
}
```

**Forge 配置工厂**

```ts
// packages/forge-preset/createForgeConfig.ts
export function createForgeConfig(options: {
  config: AppConfig;
  signing?: { identityEnv: string; notarizeEnv: Record<string, string> };
  dmg?: DmgBranding;
  nsis?: NsisBranding;
}): ForgeConfig {
  // 统一 makers、publisher、Vite 插件、postPackage 校验
}
```

**IPC 契约**

```ts
// packages/bridge/contract.ts
export interface DesktopBridge {
  window: { minimize(): void; maximize(): void; close(): void };
  app: { version(): Promise<string>; checkUpdate(): Promise<UpdateStatus> };
  // 业务通道由各应用通过泛型扩展
}

export function createPreload<B extends object>(bridge: B): void {
  // contextBridge.exposeInMainWorld('desktop', bridge)
}
```

> 设计要点：壳层只提供“通道注册与安全校验”，不硬编码业务通道名。业务通道可以按 feature 拆分，但都必须经过统一的 sender 校验与参数校验。

### 5.4 阶段路线

| 阶段        | 触发条件                        | 动作                                                                     | 成本 |
| ----------- | ------------------------------- | ------------------------------------------------------------------------ | ---- |
| 0. 模板化   | 准备第二个客户端                | 把当前仓库整理成 GitHub Template，抽出 `app.config.ts`，清理音乐业务命名 | 低   |
| 1. 壳层包   | 第三个客户端 / 壳层开始重复修改 | 抽取 `shell`、`bridge`、`storage`、`updates`、`forge-preset`             | 中   |
| 2. Monorepo | 需要共享 UI、统一发布、统一升级 | 迁移到 npm workspaces，CI 使用可复用 workflow                            | 中高 |

**不建议一开始就 Monorepo 的理由**：需要处理 workspace 依赖、构建顺序、发布版本、CI 缓存与产物路径；两个应用时收益不足以覆盖复杂度。

---

## 6. 新客户端落地清单

### 6.1 必须替换的标识

| 项                      | 当前值                      | 新客户端注意                     |
| ----------------------- | --------------------------- | -------------------------------- |
| `package.json#name`     | `abner-music`               | npm 包名                         |
| `productName`           | `Abner Music`               | 安装包与窗口标题                 |
| `version`               | `0.1.0-beta.11`             | 独立版本线                       |
| `appId` / `appBundleId` | `com.abner.music`           | 全局唯一，发布后不可改           |
| `executableName`        | `abner-music`               | 影响安装路径与进程名             |
| `app.setAppUserModelId` | `com.abner.music`           | Windows 通知/任务栏标识          |
| 协议 scheme             | `abner-media`               | 只允许小写、唯一                 |
| 数据文件                | `library.json`              | 建议带应用前缀                   |
| 更新仓库                | `abner-forever/abner-music` | `shared/updates.ts` 与 publisher |
| localStorage 前缀       | `abner:*`                   | 避免同域冲突（虽然各应用独立）   |
| 图标与背景              | `build/*`                   | 替换 SVG 后重新生成              |
| 安装器文案              | 中文/英文 NSH               | 产品名、快捷方式、卸载显示名     |
| artifact 命名           | `Abner-Music-...`           | 发布脚本依赖，需同步             |

### 6.2 建议保留的目录

```text
forge.config.ts               （改为调用共享工厂）
vite.main.config.ts
vite.preload.config.ts
vite.renderer.config.ts
tsconfig.json
.nvmrc
scripts/install-electron.mjs  （Electron 45+ 需要显式下载）
scripts/generate-icons.mjs
scripts/generate-installer-assets.mjs
scripts/verify-mac-bundle.mjs
scripts/prepare-release.mjs
build/entitlements.mac.plist
.github/workflows/ci.yml
.github/workflows/release.yml
tests/desktop/smoke.mjs
tests/desktop/dmg.mjs
tests/desktop/windows-installer.ps1
```

### 6.3 新客户端启动步骤

1. 从模板创建仓库，修改 `app.config.ts` 与 `package.json` 标识。
2. 替换 `public/favicon.svg`、`build/icon.svg`、DMG 背景、安装器背景，执行 `npm run assets`。
3. 删除音乐业务模块，保留壳层；先让空窗口跑通 `npm start`。
4. 接入第一个业务 feature：定义共享类型 → 主进程 handler → preload 通道 → 渲染层调用。
5. 配置 GitHub 仓库与 Actions，先跑 `ci.yml`。
6. 在 macOS 与 Windows 各执行一次 `npm run make`，运行 `test:desktop`。
7. 配置签名 Secrets（可选），验证 `osxSign`/`osxNotarize` 分支。
8. 打 `v0.1.0` 标签，走一遍草稿 Release 流程。
9. 更新 README 中的产品名、端口、路径与发布说明。

### 6.4 复用检查表

- [ ] 新应用不 import 任何音乐业务模块。
- [ ] 主进程、preload 不含 Vue/React 依赖。
- [ ] `contextIsolation`、`sandbox`、`nodeIntegration: false` 未被覆盖。
- [ ] 所有 IPC handler 都校验 sender 与参数。
- [ ] 自定义协议不接受渲染层传入的任意路径。
- [ ] 打开外部链接经过白名单。
- [ ] 数据目录、`appId`、`executableName` 已替换且发布后保持稳定。
- [ ] Windows 的 `package.json#build` 与 `forge.config.ts` 标识一致。
- [ ] 安装包产物名与发布脚本、下载页一致。
- [ ] 打包后冒烟测试通过，且使用独立 `userData`。
- [ ] CI 标签与 `package.json#version` 校验生效。
- [ ] 日志中不包含用户隐私数据。

---

## 7. 风险与约束

| 风险                                 | 影响                            | 缓解                                            |
| ------------------------------------ | ------------------------------- | ----------------------------------------------- |
| Electron 大版本升级频繁              | 协议、preload、打包行为回归     | 季度升级、锁版本、打包冒烟门槛                  |
| Forge Vite 插件演进                  | 产物路径/环境变量变化           | 锁 Forge/Vite 版本，升级后完整回归              |
| NSIS maker 依赖 app-builder-lib      | 与 Forge 8 契约变化时安装器失败 | 锁定 `26.18.0`，CI 每次验证安装向导             |
| 两套配置（Forge + electron-builder） | 字段漂移                        | 单一 `app.config.ts` 生成，文档标注归属         |
| 未签名分发                           | Gatekeeper / SmartScreen 拦截   | 正式版前完成签名与公证                          |
| JSON 整库写入                        | 大数据量卡顿、损坏风险          | 限制规模、原子写、备份、迁移到 SQLite           |
| 无日志/崩溃上报                      | 用户问题难定位                  | 第二个客户端前接入 `electron-log`               |
| 手动更新                             | 用户停留旧版本                  | 签名后接 `electron-updater`，保留通道           |
| 多客户端共享壳层过早                 | 抽象泄漏、互相阻塞              | 模板优先，第三个应用再抽包                      |
| 多客户端各自打包 Chromium            | 分发体积大                      | 接受成本，或用共享安装器/按需下载运行时（复杂） |

---

## 8. 针对当前项目的建议（按优先级）

1. **补日志**：接入 `electron-log`，主进程与渲染进程统一记录版本、更新检查、导入失败、协议 404。这是多客户端维护的最低可观测性。
2. **统一配置源**：新增 `app.config.ts`，让 `forge.config.ts`、`package.json#build`、更新仓库、协议 scheme 都从它派生，消除双配置漂移。
3. **明确 Squirrel 遗留**：当前 Windows 使用 NSIS，但主进程仍引入 `electron-squirrel-startup`。新客户端不需要它；当前项目可在确认无 Squirrel 安装包用户后移除，减少理解成本。
4. **数据版本化**：给 `library.json` 增加 `schemaVersion` 与备份文件，为后续字段演进留出口。
5. **更新状态机复用**：`shared/updates.ts` 的通道选择与 URL 校验是纯逻辑，适合直接抽到共享包。
6. **抽安装包测试工具**：`tests/desktop/*` 与 `scripts/verify-mac-bundle.mjs` 是复用价值最高的部分，建议在模板中保留并参数化产品名。
7. **签名预演**：即使暂不签名，也应在 CI 中至少跑一次带测试证书的 `osxSign` 分支，避免正式发布时才发现配置问题。
8. **文档化发布步骤**：当前 README 已较完整；抽模板时把“改哪些标识、跑哪些验证”固化为 `docs/new-client-checklist.md`。

---

## 附录 A：关键配置索引

| 文件                                       | 作用                                  |
| ------------------------------------------ | ------------------------------------- |
| `forge.config.ts`                          | Forge 打包、makers、publisher、hooks  |
| `package.json#build`                       | app-builder-lib（Windows NSIS）配置   |
| `package.json#main`                        | `.vite/build/main.cjs`                |
| `vite.main.config.ts`                      | 主进程 external 配置                  |
| `vite.preload.config.ts`                   | preload external 配置                 |
| `vite.renderer.config.ts`                  | Vue 插件、开发端口、相对 base         |
| `index.html`                               | CSP、主题色、入口                     |
| `src/main.ts`                              | 窗口、托盘、菜单、IPC、协议、生命周期 |
| `src/preload.ts`                           | `window.desktop` 门面                 |
| `src/shared/types.ts`                      | 跨进程契约                            |
| `src/desktop/media.ts`                     | Range 流式响应                        |
| `src/desktop/updates.ts`                   | 更新检查状态机                        |
| `build/entitlements.mac.plist`             | macOS Hardened Runtime 权限           |
| `build/installer.nsh` / `installer-ui.nsh` | NSIS 安装界面扩展                     |
| `scripts/verify-mac-bundle.mjs`            | `.app` 可移植性校验                   |
| `scripts/prepare-release.mjs`              | 安装包汇总与 SHA256                   |
| `.github/workflows/ci.yml`                 | 质量检查                              |
| `.github/workflows/release.yml`            | 三平台构建与发布                      |

## 附录 B：参考

- Electron Forge：<https://www.electronforge.io/>
- Electron 安全清单：<https://www.electronjs.org/docs/latest/tutorial/security>
- Electron 发布节奏与支持窗口：<https://www.electronjs.org/docs/latest/tutorial/electron-timelines>
- Electron 自定义协议：<https://www.electronjs.org/docs/latest/api/protocol>
- electron-builder NSIS：<https://www.electron.build/nsis>
- Playwright Electron：<https://playwright.dev/docs/api/class-electron>
- Node.js 测试运行器：<https://nodejs.org/api/test.html>
- GitHub Actions 发布：<https://docs.github.com/actions>

---

**文档维护建议**：每次升级 Electron / Forge / Vite 大版本，或新增一个桌面客户端后，更新第 2 节版本清单与第 7 节风险表；选型结论变化时，在第 3 节对应小节补充日期与原因，保持决策可追溯。
