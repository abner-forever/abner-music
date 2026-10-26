音乐，自在发生。Abner Music Beta 测试版本。

### Beta.3 修复

- 修复安装后启动时提示 `Cannot find module 'electron-squirrel-startup'` 的问题，将启动依赖一并打入应用。
- 修复打包时遗漏应用图标资源导致 macOS 窗口无法打开的问题。
- 发布前直接运行打包后的应用，验证启动、本地导入与播放、数据保留及手动更新流程。

### 主要功能

- 播放本地音乐、HTTP / HTTPS 音频直链和网络电台。
- 音乐库、歌单、收藏、搜索、排序、播放队列和多种循环模式。
- 同步歌词、播放速度、均衡器、睡眠定时和迷你播放器。
- 支持浅色 / 深色主题，以及 macOS 和 Windows 桌面操作。
- 检查更新后查看版本与更新日志，前往 GitHub 下载新版本安装包。

### 下载安装

- Apple Silicon Mac：下载 `arm64.dmg`；Intel Mac：下载 `x64.dmg`，打开后将应用拖入 Applications。
- Windows 64 位：下载 `windows-x64.exe` 并运行安装。
- ZIP 为 macOS 应用压缩包；`SHA256SUMS.txt` 用于核对安装包完整性。

### 测试说明

- Beta 版本尚未进行平台签名。macOS 如阻止运行，请在“系统设置 → 隐私与安全性”中确认来源后允许打开；Windows 可能提示 SmartScreen。
- 本应用通过 GitHub 手动下载更新，不自动下载或替换安装。
- 网络音乐需使用可直接播放的音频链接；不支持付费平台解密、平台分享页及 DRM 资源。
- 发现问题请在本仓库 Issues 反馈系统版本、操作步骤与相关截图。
