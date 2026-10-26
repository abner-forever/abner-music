# Abner Music

**音乐，自在发生。** 一个基于 Electron Forge、Vue 3 和 TypeScript 的 macOS / Windows 音乐播放器。本地音乐、网络音频与属于自己的声音收藏，放在一起。

## 功能

- **音乐库**：批量导入文件、递归导入文件夹，读取标题、艺术家、专辑、时长和内嵌封面，去除重复文件。
- **本地与网络播放**：支持常见 MP3、FLAC、WAV、M4A、AAC、OGG、Opus 等格式，以及 HTTP / HTTPS 音频直链和直播流。实际解码能力取决于 Electron / Chromium；不支持付费平台解密、平台分享页和 DRM 资源。
- **播放控制**：播放 / 暂停、切歌、拖动进度、音量 / 静音、顺序 / 列表循环 / 单曲循环、随机播放、倍速、播放队列。
- **收藏与歌单**：喜欢的歌曲、创建 / 删除歌单、修改歌单封面、添加 / 移除歌曲、最近播放、音乐搜索、排序与来源筛选。打开自建歌单，点击封面底部的「修改封面」选择 PNG、JPG、WebP 或 GIF 图片（不超过 10 MB）；图片居中裁切为正方形并保存在本机，重启后保留。
- **歌词**：自动读取音频旁的同名 `.lrc` 文件；支持手动粘贴纯文本、LRC 多时间戳与 offset，跟随当前时间高亮并点击跳转。
- **聆听体验**：六段均衡器与音效预设（本地 / 原创试听）、睡眠定时、浅色 / 深色 / 跟随系统主题、置顶迷你播放器、系统媒体控制与快捷键。
- **后台播放**：桌面关闭窗口后保留后台播放与睡眠定时；通过系统托盘图标、macOS Dock 或再次启动应用重新打开原窗口。托盘菜单可播放 / 暂停、切歌；选择托盘「退出 Abner Music」或设置里的「退出应用」彻底退出。设置中也可点击「转入后台」。
- **数据保留**：桌面本地文件目录存储在应用数据目录，收藏、歌单与偏好在本机保存；浏览器预览通过 IndexedDB 保存导入文件。退出后保留队列与音量，下次打开不会自动播放。
- **开箱试听**：6 首由代码合成的原创氛围音乐与本地 SVG 封面，不需要联网或第三方音乐授权。精选区域为内置试听歌单，不是在线音乐推荐服务。
- **发布与更新**：Electron Forge 构建 macOS arm64 / x64 和 Windows x64，通过 GitHub Releases 发布；检查更新后展示更新日志，点击前往 GitHub 手动下载安装。

## 本地启动

需要 **Node.js 24 LTS** 和 npm，macOS 或 Windows。首次安装会下载 Electron。

```bash
npm install
npm start
```

项目的 postinstall 会下载 Electron 运行时（Electron 45 不再通过依赖自身的 postinstall 下载）。如果 npm 提示 esbuild 构建脚本尚未授权，执行 `npm approve-scripts esbuild --no-allow-scripts-pin` 后，再执行 `npm rebuild esbuild`。仅在支持此命令的 npm 版本上需要这一步。离线 CI 可设置 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`。

仅浏览器预览界面（不包含 Electron 原生窗口、文件夹扫描、原生标签解析和检查更新）：

```bash
npm run dev
```

浏览器预览使用 `127.0.0.1:5173`，Forge 桌面开发服务使用 `127.0.0.1:5174`，两者可同时启动。

`npm start` 会在 macOS 启动前同步本项目 Electron 开发运行时的应用名称和图标，Dock 和系统菜单显示为 Abner Music。重新安装 Electron 后，下次启动会自动恢复；修改这些设置后需完整重启桌面应用。正式安装包由 Forge 的名称和图标配置生成。

浏览器中可使用文件选择器或拖放导入音频。桌面应用使用系统文件选择器导入，文件夹扫描最多读取 10,000 首歌曲，符号链接与隐藏目录会跳过。删除音乐库记录不会删除原始音频。

## 开发检查

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run format:check
```

原生验证需要先运行 `npm run package`，然后执行 `npm run test:desktop`。测试直接启动 `out/` 中打包后的应用，确认从 `app.asar` 运行且版本正确，使用独立临时数据目录，覆盖系统文件导入、标签与 LRC 读取、Range / CORS、本地音效播放、迷你窗口、重启持久化、保留原文件的移除操作，以及更新日志和 GitHub 下载跳转。跨架构打包时传入对应的 `--arch`，例如 `npm run test:desktop -- --arch=x64`。macOS 生成 DMG 后再运行 `npm run test:dmg -- --arch=x64`：挂载最终安装包，检查框架链接、安装背景和 Finder 布局，复制到独立临时目录并弹出磁盘后，再执行完整原生验证。发布工作流在每个构建平台执行对应检查，通过后才上传安装包。

已安装 Chrome 时，也可以使用 `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`。端到端测试覆盖试听播放、拖动进度、切歌、收藏和歌单持久化、本地导入、网络 URL 校验、歌词、队列、音效、定时与响应式布局。

快捷键：空格播放 / 暂停，左右方向键跳转 5 秒，Alt + 左右方向键切歌，⌘ / Ctrl + F 或 K 搜索，Esc 关闭浮层；桌面 ⌘ / Ctrl + O 导入音乐。支持系统媒体键和 Media Session。

「设置 → 界面主题」支持浅色、深色与跟随系统。首次使用默认跟随系统，系统外观变化时实时切换；已有的主题选择保持不变，并在重启后保留。窗口缩小时，侧栏导航与歌单区域可滚动，左下角设置保持可用；通过右上角导入音乐入口添加本地文件、文件夹或网络链接，网络链接收在导入下拉菜单中。

## 打包

在目标操作系统上构建：

```bash
npm run make
```

- macOS：`npm run make` 通过 Forge 的 `@electron-forge/maker-zip` 和 `@electron-forge/maker-dmg` 同时生成 ZIP 与 DMG，分别位于 `out/make/zip/` 和 `out/make/dmg/<架构>/`。DMG 安装窗口为 660 × 440，包含中文拖拽引导和 Retina 背景图；图标、背景及布局统一配置在 `forge.config.ts`。打包完成后先校验应用框架的相对符号链接，再生成安装包，避免安装后引用构建机器路径而无法启动。
- Windows：在 `out/make/` 生成 `Abner-Music-<版本>-windows-x64.exe`，使用 NSIS 分步安装向导：欢迎 → 安装范围 → 安装位置 → 安装进度 → 完成。安装前可取消或修改位置，完成后从桌面或开始菜单主动打开应用。欢迎页、完成页和卸载页使用品牌侧栏，其他页面使用品牌页头；根据系统语言显示中文或英文按钮。
- macOS 可用 `npm run make -- --arch=x64` 构建 Intel 版本，或 `--arch=arm64` 构建 Apple Silicon 版本。

网络受限时可设置 `ELECTRON_ZIP_DIR` 指向已校验的官方 Electron ZIP 所在目录（文件名需保持官方格式），让 Forge 离线复用运行时。

桌面图标保留四周各 4% 的透明留白，校准 Dock 和启动台中的图标大小。修改 `public/favicon.svg` 或 `build/dmg-background.svg` 后，在 macOS 执行 `npm run assets` 重新生成 PNG、ICO、ICNS 和安装背景，需要已安装 Playwright Chromium。重新打包后，已安装的旧版本需替换为新应用。

Windows 使用包含 16–256 像素多个尺寸的 `build/icon.ico`，显式配置应用 EXE、安装 EXE、卸载程序以及“设置 → 应用 → 安装的应用”的图标。修改 `build/installer-sidebar.svg`、`build/installer-header.svg` 后同样运行 `npm run assets`，生成 NSIS 使用的 BMP。旧版 Squirrel 安装包需要先在系统设置中卸载旧版，再运行新版向导；原始音乐文件和应用数据会保留。

在没有安装 Abner Music 的 Windows 测试账户上，打包后执行 `npm run test:installer`，自动操作真实安装向导，验证确认安装前不会写入应用、可选择目录、完成后不自动启动、EXE 和卸载图标、系统应用列表的注册表图标、桌面与开始菜单快捷方式，并运行安装后的应用回归。截图输出到 `test-results/windows-installer/`。测试结束卸载临时安装；发布工作流会在 Windows runner 执行此检查并保留截图。

当前 Beta 不配置平台签名。macOS 如阻止打开，可在系统设置的「隐私与安全性」中确认来源后允许；Windows 可能显示 SmartScreen 提示。检查更新和 GitHub 下载不依赖签名证书。

## GitHub 托管与发布

仓库地址：<https://github.com/abner-forever/abner-music>。客户端只读取公开的 GitHub Releases API，无需内嵌 GitHub Token。

`.github/workflows/ci.yml` 在推送与 PR 时执行检查；`.github/workflows/release.yml` 在推送 `v*` 标签时构建三个平台架构，并汇总安装文件和 SHA256 校验清单。`v*-beta.*` 标签在全部安装包验证通过后自动发布为 **Prerelease**；正式版保留为 Release 草稿。手动触发仅生成 Actions artifacts。

发布步骤：

1. 更新 `package.json` 版本并同步 lockfile，提交代码。
2. 推送与版本完全一致的标签，例如版本 `0.1.0-beta.1` 对应 `v0.1.0-beta.1`。
3. 等待三个构建任务完成，在各目标机器上验证安装包与播放。
4. Beta 自动发布；正式版检查 Release 草稿并填写说明后手动发布。

用户下载 Windows 安装向导 `.exe` 或对应架构的 macOS `.dmg`，也可使用 macOS ZIP。客户端继续通过 GitHub 手动下载新版本，不使用自动更新包。

在桌面「设置 → 检查更新」中查询最新版本；发现新版本时弹出版本号、发布时间与更新日志，点击「前往 GitHub 下载」打开此版本的发布页。Beta 客户端可检测更高版本的 Beta 和正式版；正式版只检测正式发布。草稿与旧版本不会提示更新。网络异常与 API 限流会显示错误，允许重试。应用不会自动下载安装包或替换自身。

## 项目结构

```text
src/main.ts                 Electron 窗口、原生导入、媒体协议、更新和菜单
src/preload.ts              类型明确、限定通道的桌面桥接
src/shared/types.ts         跨进程数据契约
src/renderer/App.vue        导航、页面和交互
src/renderer/components/    封面、歌曲列表与播放栏
src/renderer/stores/        音乐库与播放状态
src/renderer/lib/           LRC、URL 校验、持久化、原创音频合成
tests/unit/                解析和工具逻辑测试
tests/e2e/                 浏览器交互验证
build/                     macOS 签名 entitlements
forge.config.ts             Forge 打包、安装图标和 DMG 布局
.github/workflows/          持续集成与跨平台发布
```

渲染进程关闭 Node 集成，开启上下文隔离与 sandbox；IPC 验证窗口及主 frame；本地音频通过仅映射已导入文件的 `abner-media://` 协议读取，支持 Range 请求；禁止任意导航和新窗口。音乐资源只在本机索引，网络音频直接请求用户填写的资源地址。
