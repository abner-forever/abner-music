# Abner Music

**音乐，自在发生。** 一个基于 Electron Forge、Vue 3 和 TypeScript 的 macOS / Windows 音乐播放器。本地音乐、网络音频与属于自己的声音收藏，放在一起。

## 功能

- **音乐库**：批量导入文件、递归导入文件夹，读取标题、艺术家、专辑、时长和内嵌封面，去除重复文件。
- **本地与网络播放**：支持常见 MP3、FLAC、WAV、M4A、AAC、OGG、Opus 等格式，以及 HTTP / HTTPS 音频直链和直播流。实际解码能力取决于 Electron / Chromium；不支持付费平台解密、平台分享页和 DRM 资源。
- **在线音乐源**：「网络音乐 → 在线搜索」通过 GD 音乐台搜索网易云音乐，另提供 JOOX、Bilibili 实验平台。支持在线播放、加入音乐库、收藏、歌单及按需歌词；保存平台和歌曲 ID，播放时解析地址，失败后最多刷新一次。桌面请求通过限定 IPC，浏览器预览使用公开 API。
- **播放控制**：播放 / 暂停、切歌、拖动进度、音量 / 静音、顺序 / 列表循环 / 单曲循环、随机播放、倍速、播放队列。
- **收藏与歌单**：喜欢的歌曲、创建 / 删除歌单、修改歌单封面、添加 / 移除歌曲、最近播放、音乐搜索、排序与来源筛选。打开自建歌单，点击封面底部的「修改封面」选择 PNG、JPG、WebP 或 GIF 图片（不超过 10 MB）；图片居中裁切为正方形并保存在本机，重启后保留。
- **歌词**：自动读取音频旁的同名 `.lrc` 文件；支持手动粘贴纯文本、LRC 多时间戳与 offset，跟随当前时间高亮并点击跳转。
- **聆听体验**：六段均衡器与音效预设（本地 / 原创试听）、睡眠定时、浅色 / 深色 / 跟随系统主题、置顶迷你播放器、系统媒体控制与快捷键。
- **后台播放**：桌面关闭窗口后保留后台播放与睡眠定时；通过系统托盘图标、macOS Dock 或再次启动应用重新打开原窗口。托盘菜单可播放 / 暂停、切歌；选择托盘「退出 Abner Music」或设置里的「退出应用」彻底退出。设置中也可点击「转入后台」。
- **数据保留**：桌面本地文件目录存储在应用数据目录，收藏、歌单与偏好在本机保存；浏览器预览通过 IndexedDB 保存导入文件。退出后保留队列与音量，下次打开不会自动播放。
- **开发试听**：仅本地开发调试（`npm run dev` / `npm start`）提供 6 首由代码合成的原创氛围音乐、本地 SVG 封面与「显示原创试听」设置，无需联网。生产构建和安装包不展示内置试听歌曲、精选试听歌单及该设置，使用导入的本地音乐与网络音乐。
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

### GD 音乐台

在侧栏打开「网络音乐」，切换到「在线搜索」，选择音乐平台并提交关键词。搜索结果可以直接播放、加入音乐库、收藏或添加到歌单；已添加的歌曲在「已添加音乐」中管理，重启后保留。顶部搜索输入时仅匹配已有音乐库，按回车后搜索在线音乐，无论音乐库是否已有匹配；中文输入法选词时不会提交。在线结果栏提供来源切换，不重复展示搜索框和搜索按钮，音乐源说明收在结果底部。更改关键词或清空搜索会取消旧请求并恢复音乐库匹配；选择的来源会保留，在线结果支持播放、收藏、加入歌单与翻页。封面与歌词仅在播放时加载，失败不影响音频播放；手动编辑的歌词优先显示。在线音乐沿用网络播放通道，暂不支持均衡器。

回车提交后，搜索页上方保留「音乐库」匹配歌曲，下方展示「在线歌曲」与来源切换；在线加载、无结果或请求失败都不会隐藏已有歌曲，可继续播放、收藏或加入歌单。

在线歌曲操作使用不同图标区分「加入音乐库」与「加入歌单」；点击下载后，桌面端先解析当前歌曲的可用音频地址，再通过系统保存对话框写入本地文件，失败不会留下未完成文件。浏览器预览使用相同解析结果下载，实际可用性取决于上游平台返回的音频格式与网络状态。

音乐源出处：GD音乐台(music.gdstudio.xyz)，公开 API 说明位于 <https://music-api.gdstudio.xyz/api.php>。该服务声明仅供非商业学习、要求注明出处并限制下载和传播；用户应仅保存自己有权使用的内容。下载功能保存平台当前返回的播放流，不绕过平台授权、DRM 或访问控制。默认请求 320 kbps，实际音质取决于平台返回。接口与曲目可用性由第三方决定，JOOX 和 Bilibili 作为实验平台可能返回空结果或无法播放。

按 2026-10-27 核实的接口说明，每 5 分钟最多 50 次请求。客户端统一限制最多两个并发请求，缓存重复查询，按需解析当前歌曲，并为播放请求保留容量。超限或服务异常时请稍后重试，或继续播放本地音乐。接入细节见 [音乐源接入方案](docs/gd-music-source-integration.md)。

## 打包

在目标操作系统上构建：

```bash
npm run make
```

- macOS：`npm run make` 通过 Forge 的 `@electron-forge/maker-zip` 和 `@electron-forge/maker-dmg` 同时生成 ZIP 与 DMG，分别位于 `out/make/zip/` 和 `out/make/dmg/<架构>/`。DMG 安装窗口为 660 × 440，包含中文拖拽引导和 Retina 背景图；图标、背景及布局统一配置在 `forge.config.ts`。打包完成后先校验应用框架的相对符号链接，再生成安装包，避免安装后引用构建机器路径而无法启动。
- Windows：在 `out/make/` 生成 `Abner-Music-<版本>-windows-x64.exe`，安装器使用 NSIS 原生自定义界面：800 × 520 的无边框圆角窗口，左侧唱片插画，右侧安装首页、真实安装进度和完成状态。首页直接选择安装位置，展开“安装选项”可切换当前用户或所有用户；所有用户安装会请求管理员授权。安装前可关闭取消，完成后从桌面或开始菜单主动打开应用。支持中文、英文和按系统 DPI 缩放；卸载器保留原有品牌向导。
- macOS 可用 `npm run make -- --arch=x64` 构建 Intel 版本，或 `--arch=arm64` 构建 Apple Silicon 版本。

网络受限时可设置 `ELECTRON_ZIP_DIR` 指向已校验的官方 Electron ZIP 所在目录（文件名需保持官方格式），让 Forge 离线复用运行时。

桌面图标保留四周各 4% 的透明留白，校准 Dock 和启动台中的图标大小。修改 `public/favicon.svg` 或 `build/dmg-background.svg` 后，在 macOS 执行 `npm run assets` 重新生成 PNG、ICO、ICNS 和安装背景，需要已安装 Playwright Chromium。重新打包后，已安装的旧版本需替换为新应用。

Windows 使用包含 16–256 像素多个尺寸的 `build/icon.ico`，显式配置应用 EXE、安装 EXE、卸载程序以及“设置 → 应用 → 安装的应用”的图标。安装窗口在 `build/installer-ui.nsh` 中实现，通过 `build/installer.nsh` 扩展默认安装脚本，继续使用打包工具的文件解压、注册表、快捷方式、升级和卸载器生成逻辑。修改 `build/installer-background.svg` 或 `scripts/generate-installer-assets.mjs` 后执行 `npm run assets:installer`，生成双倍分辨率背景及中英文按钮 BMP；仅安装 Chrome 时可使用 `PLAYWRIGHT_CHANNEL=chrome npm run assets:installer`。修改卸载侧栏 `build/installer-sidebar.svg` 后执行 `npm run assets`。生成的 BMP 一并提交，发布无需临时生成素材。旧版 Squirrel 安装包需要先在系统设置中卸载旧版，再运行新版向导；原始音乐文件和应用数据会保留。

在没有安装 Abner Music 的 Windows 测试账户上，打包后执行 `npm run test:installer`，自动操作真实安装窗口，验证无默认标题栏和返回按钮、窗口尺寸、安装选项、取消安装、无效及非空目录拦截、中文和空格路径、完成后不自动启动、EXE 和卸载图标、系统应用列表的注册表图标、桌面与开始菜单快捷方式，并运行安装后的应用回归。截图输出到 `test-results/windows-installer/`。测试结束卸载临时安装；发布工作流会在 Windows runner 执行此检查并保留截图。所有用户安装和 UAC 取消分支需在 Windows 上人工补充验证。

当前 Beta 不配置平台签名。macOS 如阻止打开，可在系统设置的「隐私与安全性」中确认来源后允许；Windows 可能显示 SmartScreen 提示。检查更新和 GitHub 下载不依赖签名证书。

## GitHub 托管与发布

仓库地址：<https://github.com/abner-forever/abner-music>。客户端只读取公开的 GitHub Releases API，无需内嵌 GitHub Token。

统一使用 `.github/workflows/ci.yml`：PR 执行类型检查、单元测试、前端构建和浏览器测试；合并到 `beta` 自动发布 Beta，合并到 `main` 自动发布正式版。无需手动修改版本、维护更新日志或推送标签。

发布顺序：检查测试 → 根据 Git 提交计算候选版本与日志 → 使用同一候选版本构建 macOS arm64 / x64 与 Windows x64 → 原生应用、DMG 和 Windows 安装器验证 → 汇总五个安装包与 SHA256 → 上传 Release 草稿附件 → 原子推送版本提交和标签 → 公开 Release。前一步失败不会执行后续步骤。

- `beta`：当前 Beta 目标递增，例如 `0.1.0-beta.15` → `0.1.0-beta.16`。正式版发布后，后续 Beta 根据提交类型进入下一个版本目标。
- `main`：将 Beta 目标转正，例如 `0.1.0-beta.16` → `0.1.0`；后续正式版按 SemVer 递增。正式版本、安装包和 Git 标签均不带 `stable` 后缀。
- 提交遵循 Conventional Commits：`feat:` 升 minor，`fix:` / `perf:` / `revert:` 升 patch，`feat!:` 或正文 `BREAKING CHANGE:` 升 major。Beta 期间保持目标版本、仅递增 Beta 序号，转正后应用上述递增规则。仅 docs / chore / test / ci 等维护提交不触发自动发布，但会包含在下次发布日志中。
- 更新日志由自上个对应通道标签以来的提交自动生成，写入 `CHANGELOG.md` 和 GitHub Release，描述质量取决于提交信息。历史手写说明保留在 `.github/release-beta.md` 供参考，流程不再读取。
- Actions 手动运行默认 `preflight`，仅构建和验证，不提交、不打标签、不发布；选择 `release` 才按当前分支发布。只允许 `beta` 和 `main` 发布。
- 同分支发布串行执行；构建过程中分支前进时终止旧提交的发布，后续运行处理最新提交。不要强推或人工复用发布标签。
- 安装验证或附件上传失败时，远端版本文件和标签不会更新；Git 提交与标签通过 `git push --atomic` 同时推送。Git 与 GitHub Release 无法跨服务原子提交：最后公开 Release 失败时会保留已提交版本与草稿，可在原 Actions 运行中选择 **Re-run all jobs** 恢复发布。
- 仓库 Actions 必须允许 `GITHUB_TOKEN` 写入 contents；分支保护 / ruleset 需要允许发布机器人更新版本文件及标签，否则会在推送时失败，草稿仍不可见。机器人提交含 `[skip ci]`，且 token 推送不会重复触发发布。合并 Beta 到 main 后，需将 main 的正式版提交同步回 beta，再继续开发。

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

渲染进程关闭 Node 集成，开启上下文隔离与 sandbox；IPC 验证窗口及主 frame；本地音频通过仅映射已导入文件的 `abner-media://` 协议读取，支持 Range 请求；禁止任意导航和新窗口。音乐记录在本机保存，网络音频直接请求用户填写或音乐源解析的资源地址。GD 音乐源请求只接受固定平台、关键词、资源 ID 等参数，不能通过 IPC 代理任意 URL。
