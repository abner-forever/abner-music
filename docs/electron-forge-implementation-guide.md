# Electron Forge 落地指南：签名、安装与更新、代码组织、现有前端接入

> 配套文档：[Electron Forge 桌面客户端技术选型](./electron-forge-tech-selection.md)。
>
> 基线：`0.1.0-beta.11`，包含 Beta.8 → Beta.11 的 Windows 安装器修复；文档日期 2026-10-27。
>
> 本文只覆盖四件事：**代码签名、安装与更新、代码组织、如何把现有前端项目接成桌面客户端**。框架对比与整体选型见配套文档，不在这里重复。

---

## 0. 一页结论

| 主题     | 结论                                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 代码签名 | macOS 用 Developer ID + Hardened Runtime + 公证；Windows 分两层签：应用 EXE 在 Forge packager 阶段签，安装器在 NSIS maker 阶段签 |
| 安装     | Windows 继续用 NSIS 自定义向导，保留 Beta.11 的页面裁剪、Z 序、路径校验修复；macOS 用 DMG + ZIP                                  |
| 更新     | 未签名阶段继续“检查 + 跳转 GitHub 手动下载”；签名、公证、更新元数据齐备后再评估 `electron-updater`                               |
| 代码组织 | 壳层（main / preload）、共享契约（shared）、业务功能（features）、渲染层（renderer）四层分离；应用标识收敛到单一配置             |
| 前端接入 | 现有 Vite 项目直接作为 renderer；补 `desktop/` 壳层与平台适配层；路由改 hash、静态资源用相对路径、存储迁到主进程                 |

---

## 1. 代码签名

### 1.1 签名对象与顺序

```text
macOS:
  Forge package
    → 生成 .app
    → codesign（应用及内部二进制）
    → notarytool 公证 .app
    → stapler staple .app
    → maker-dmg / maker-zip
    → （可选）公证并 staple DMG

Windows:
  Forge package
    → 生成 app.exe（资源编辑、图标、版本信息已完成）
    → 用 windowsSign 签 app.exe
    → MakerNSIS 生成安装器
    → 签安装器 EXE、卸载器 EXE
```

三条原则：

1. **先改资源，再签名。** 版本信息、图标、执行级别由打包工具写入；签名后再改 EXE 会使签名失效。
2. **应用和安装器分别签。** Windows 上“应用已签名”不等于“安装器已签名”，用户最先看到的恰恰是安装器。
3. **时间戳必开。** 证书过期后，没有可信时间戳的签名会失效；使用 RFC 3161 时间戳服务。

### 1.2 macOS 签名与公证

**前置条件**

- Apple Developer Program 账号。
- `Developer ID Application` 证书（不是 Mac App Distribution）。
- 导出 `.p12` 供 CI 导入钥匙串。
- 公证凭据：Apple ID + App 专用密码 + Team ID，或 App Store Connect API Key，或钥匙串 profile。

**Forge 配置**

当前项目已按环境变量条件启用，保留这个形态即可：

```ts
const appleApiKey = process.env.APPLE_API_KEY;
const macSigning =
  process.env.APPLE_SIGN_IDENTITY != null
    ? {
        osxSign: {
          identity: process.env.APPLE_SIGN_IDENTITY,
          optionsForFile: () => ({
            hardenedRuntime: true,
            entitlements: 'build/entitlements.mac.plist',
          }),
        },
        osxNotarize: appleApiKey
          ? {
              appleApiKey,
              appleApiKeyId: process.env.APPLE_API_KEY_ID!,
              ...(process.env.APPLE_API_ISSUER
                ? { appleApiIssuer: process.env.APPLE_API_ISSUER }
                : {}),
            }
          : {
              appleId: process.env.APPLE_ID!,
              appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD!,
              teamId: process.env.APPLE_TEAM_ID!,
            },
      }
    : {};

const config: ForgeConfig = {
  packagerConfig: {
    // ...
    ...macSigning,
  },
};
```

两种公证凭据的取舍：

| 方式                      | 字段                                               | 适用                                                   |
| ------------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| Apple ID + App 专用密码   | `appleId` / `appleIdPassword` / `teamId`           | 个人或小团队，配置简单                                 |
| App Store Connect API Key | `appleApiKey` / `appleApiKeyId` / `appleApiIssuer` | CI 推荐，可吊销、可审计                                |
| 钥匙串 profile            | `keychainProfile` / `keychain`                     | 自托管 runner，预先执行 `notarytool store-credentials` |

**CI 导入证书**

```bash
KEYCHAIN="$RUNNER_TEMP/build.keychain"
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security import "$RUNNER_TEMP/cert.p12" -k "$KEYCHAIN" \
  -P "$CERT_PASSWORD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple:,codesign: \
  -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security list-keychains -d user -s "$KEYCHAIN" \
  $(security list-keychains -d user | tr -d '"')
```

`cert.p12` 来自 Secrets（Base64 解码到临时目录），用完删除；不要提交到仓库。

**entitlements**

当前 `build/entitlements.mac.plist` 只有：

```xml
<key>com.apple.security.cs.allow-jit</key><true/>
<key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
```

这是 Electron 的常规最小集。新增麦克风、摄像头、辅助功能、自动更新等能力时，再按需增加 entitlement 和 `NSMicrophoneUsageDescription` 等 plist 字段；不要一次性放开全部权限。

**签名与公证校验**

```bash
APP="out/Abner Music-darwin-arm64/Abner Music.app"

codesign --verify --deep --strict --verbose=2 "$APP"
codesign -dv --verbose=4 "$APP"
spctl --assess --type execute --verbose=4 "$APP"
xcrun stapler validate "$APP"
```

DMG 如需单独公证：

```bash
xcrun notarytool submit "Abner-Music-0.1.0-arm64.dmg" \
  --keychain-profile "$APPLE_KEYCHAIN_PROFILE" --wait
xcrun stapler staple "Abner-Music-0.1.0-arm64.dmg"
spctl --assess --type open --context context:primary-signature -v \
  "Abner-Music-0.1.0-arm64.dmg"
```

Forge 的 `osxNotarize` 作用于 `.app`，DMG 在 `make` 阶段稍后生成。内部 app 已公证并 stapled 时，多数场景可直接分发；对 Gatekeeper 要求严格的渠道，再加 `postMake` 钩子公证 DMG。

**常见失败**

| 现象                               | 原因                                                      | 处理                                             |
| ---------------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| `errSecInternalComponent`          | 钥匙串未解锁或未授权 codesign                             | 解锁钥匙串并执行 `set-key-partition-list`        |
| `code object is not signed at all` | identity 错误或嵌套二进制未签                             | 检查证书名称；确认原生模块在 `app.asar.unpacked` |
| notarization `Invalid`             | 未开 Hardened Runtime、entitlement 不足、存在未签名 dylib | 查看 notarytool 日志逐项修复                     |
| 公证成功但用户仍被拦截             | 未 staple，或用户下载的是旧包                             | `stapler validate`，重新下载                     |
| 证书过期后旧包失效                 | 未加时间戳                                                | 确保公证与签名都带时间戳                         |

### 1.3 Windows 签名

**证书选择**

| 方案                         | 优点                      | 缺点                      | 适用             |
| ---------------------------- | ------------------------- | ------------------------- | ---------------- |
| OV 代码签名证书（PFX）       | 便宜、CI 易用             | SmartScreen 信誉积累慢    | 早期版本         |
| EV 证书（硬件令牌 / 云 HSM） | 信誉更好                  | 成本高、CI 集成复杂       | 正式商业分发     |
| Azure Trusted Signing        | 无硬件、按量计费、CI 友好 | 需要 Azure 订阅与身份配置 | 新建项目优先评估 |
| 自签名                       | 本地验证                  | 用户仍会被告警            | 仅开发测试       |

**两层签名**

`electron-forge-maker-nsis` 内部委托 `app-builder-lib`。因此 Windows 上有两个签名入口：

| 对象                   | 配置位置                                          | 工具                       |
| ---------------------- | ------------------------------------------------- | -------------------------- |
| 应用 `abner-music.exe` | `forge.config.ts` → `packagerConfig.windowsSign`  | `@electron/windows-sign`   |
| 安装器 / 卸载器 EXE    | `package.json#build.win`（electron-builder 约定） | app-builder-lib + signtool |

应用 EXE：

```ts
const windowsCertificate = process.env.WINDOWS_CERTIFICATE_FILE;

packagerConfig: {
  // ...
  ...(windowsCertificate
    ? {
        windowsSign: {
          certificateFile: windowsCertificate,
          certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
          description: 'Abner Music',
          website: 'https://github.com/abner-forever/abner-music',
          timestampServer: 'http://timestamp.digicert.com',
        },
      }
    : {}),
}
```

`@electron/windows-sign` 也会读取 `WINDOWS_CERTIFICATE_FILE` 与 `WINDOWS_CERTIFICATE_PASSWORD`，显式传入便于排查。

安装器签名（`package.json`）：

```json
{
  "build": {
    "win": {
      "signtoolOptions": {
        "signingHashAlgorithms": ["sha256"],
        "rfc3161TimeStampServer": "http://timestamp.digicert.com",
        "publisherName": "Abner"
      }
    }
  }
}
```

证书通过 CI 环境变量提供，不要写进 `package.json`：

```text
CSC_LINK            # PFX 的 Base64 或路径
CSC_KEY_PASSWORD    # PFX 密码
```

使用 Azure Trusted Signing 时改为：

```json
{
  "build": {
    "win": {
      "azureSignOptions": {
        "publisherName": "Abner",
        "endpoint": "https://<region>.codesigning.azure.net",
        "certificateProfileName": "<profile>",
        "codeSigningAccountName": "<account>"
      }
    }
  }
}
```

并配置 `AZURE_TENANT_ID`、`AZURE_CLIENT_ID`、`AZURE_CLIENT_SECRET`（Azure Identity 的 EnvironmentCredential）。

**校验**

```powershell
Get-ChildItem out/make -Recurse -Filter *.exe | ForEach-Object {
  $sig = Get-AuthenticodeSignature $_.FullName
  [pscustomobject]@{
    File   = $_.FullName
    Status = $sig.Status
    Signer = $sig.SignerCertificate.Subject
    Time   = $sig.TimeStamperCertificate.Subject
  }
}
```

要求：`Status = Valid`、`Signer` 是预期主体、存在时间戳证书。

**常见坑**

- 只签了应用，没签安装器：用户运行安装器时仍显示“未知发布者”。
- 只签了安装器，没签应用：安装完成后 EXE 属性无签名，更新校验可能失败。
- 签名发生在图标/版本信息写入之前：签名被后续资源编辑破坏。
- 使用已废弃的 SHA-1 时间戳服务：换成 RFC 3161。
- 证书过期：签名仍“有效”但信任链失败；时间戳不能替代未过期证书。
- SmartScreen 信誉不是即时生效的：新证书仍可能提示，需下载量积累；EV 或 Trusted Signing 更快。

### 1.4 CI 中的签名开关

建议显式区分“允许不签名”和“必须签名”：

```ts
if (process.env.REQUIRE_SIGNING === '1' && !process.env.APPLE_SIGN_IDENTITY) {
  throw new Error('REQUIRE_SIGNING=1 but APPLE_SIGN_IDENTITY is missing');
}
if (process.env.REQUIRE_SIGNING === '1' && !process.env.CSC_LINK) {
  throw new Error('REQUIRE_SIGNING=1 but CSC_LINK is missing');
}
```

- PR / 日常 CI：不设置签名变量，走未签名路径，速度快。
- 发布标签：设置 `REQUIRE_SIGNING=1`，缺少凭据直接失败。
- 签名后增加校验步骤，校验失败不创建 Release。

---

## 2. 安装与更新

### 2.1 Windows 安装器现状

| 项       | 当前实现                                               |
| -------- | ------------------------------------------------------ |
| Maker    | `electron-forge-maker-nsis` 26.18.0                    |
| 底层     | `app-builder-lib`（electron-builder 的 NSIS 管线）     |
| 配置来源 | `forge.config.ts` 的 maker 参数 + `package.json#build` |
| 安装模式 | 默认当前用户，可切换所有用户（触发 UAC）               |
| 安装目录 | 可编辑；允许新建目录；拒绝相对路径、根目录、非空目录   |
| 界面     | 800 × 520 无边框圆角窗口，左侧插画，右侧欢迎/进度/完成 |
| 语言     | 中文、英文，按系统语言选择                             |
| 缩放     | 按系统 DPI 等比布局                                    |
| 完成后   | 不自动启动，由用户从桌面或开始菜单打开                 |
| 卸载     | 保留原始文件与应用数据                                 |

关键文件：

```text
build/installer.nsh           # 挂接 MUI 页面与安装模式
build/installer-ui.nsh        # 自绘页面、按钮、进度、路径校验
build/installer-*.bmp         # 背景与中英文按钮素材
scripts/generate-installer-assets.mjs
tests/desktop/windows-installer.ps1
```

核心 maker 配置（节选自 `forge.config.ts`）：

```ts
new MakerNSIS({
  oneClick: false, // 启用自定义页面
  perMachine: false, // 默认当前用户
  allowElevation: true, // 允许切换到所有用户
  include: 'build/installer.nsh', // 挂接自绘界面
  installerLanguages: ['zh_CN', 'en_US'],
  language: '2052', // 默认中文
  createDesktopShortcut: true,
  createStartMenuShortcut: true,
  deleteAppDataOnUninstall: false, // 卸载保留用户数据
  differentialPackage: false, // 不使用增量更新元数据
  artifactName: 'Abner-Music-${version}-windows-${arch}.exe',
});
```

`oneClick: false` 是自定义向导的前提；`include` 决定界面脚本；`differentialPackage` 与自动更新配套，当前手动更新阶段保持关闭。签名配置不在 maker 参数里，而由 `package.json#build.win` 读取，见 1.3。

### 2.2 Beta.8 → Beta.11 的安装器修复

这些修复解决了自定义 NSIS 界面最容易复现的一类问题：**自绘控件与 MUI 原生控件的绘制顺序、裁剪和句柄生命周期**。

| 提交      | 问题                                                             | 修复                                                                            | 复用要点                                      |
| --------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------- |
| `84da18a` | 输入一个尚不存在的新目录被判定为无效                             | 改用 `kernel32::GetFullPathNameW`，不再依赖对不存在的路径会置错的 NSIS 内置调用 | 允许新目录；仍拒绝相对路径、根目录、非空目录  |
| `859cec9` | 编辑框边框样式使用了当前环境不支持的常量；测试在素材未呈现时截图 | 改用受支持的 `WS_BORDER`（`0x00800000`）字面值；测试等待合成器呈现后再截图      | 不要依赖未定义的常量；视觉验证要等真实呈现    |
| `eb4f7a5` | 背景重绘覆盖向导控件                                             | 父窗口开启 `WS_CLIPCHILDREN`；背景 STATIC 使用带裁剪兄弟窗口的样式              | 自绘背景必须裁剪，否则标签和输入框会闪烁/消失 |
| `ad0707a` | 圆角按钮素材在页面切换后丢失                                     | 每个按钮使用独立 STATIC 子窗口承载位图，并按 DPI 设置圆角区域                   | 页面切换后重新应用 region，不要只设置一次     |
| `63d7270` | 编辑安装路径时页面标签消失                                       | 给欢迎页与安装进度页开启 `WS_CLIPCHILDREN`                                      | 页面级裁剪能避免整页重绘擦掉静态标签          |
| `369b17f` | 新建页面被背景盖住                                               | 页面创建后把背景 `SetWindowPos` 到 `HWND_BOTTOM`                                | Z 序必须在每次创建新页后重新保证              |
| 测试侧    | 快捷方式中文路径、相对路径、截图时机不稳                         | 用 `IShellLinkW` 读取 Unicode 目标；比较解析后的长路径；等待合成器呈现后再截图  | 安装器测试必须跑真实窗口，不能只做无头校验    |

**维护规则**

1. 任何 `installer-ui.nsh` 改动，都必须在干净的 Windows 测试账户上跑一次 `npm run test:installer`。
2. 修复绘制问题时，优先调整裁剪标志与 Z 序，不要靠定时器“等一会再画”。
3. 每次修复保留截图证据（`test-results/windows-installer/`），否则下次回归无法判断是视觉问题还是功能问题。
4. 安装器素材（BMP）与脚本一起提交，发布时不要再临时生成。

### 2.3 安装行为契约

```text
启动安装器
  → 欢迎页：显示安装位置、安装选项
  → 校验目录：新目录允许；相对路径 / 根目录 / 非空目录拒绝
  → 点击安装：显示真实进度
  → 完成页：不自动启动
  → 桌面 + 开始菜单快捷方式
  → 系统“安装的应用”注册表项与图标
  → 卸载：移除程序与快捷方式，保留用户数据
```

升级行为：

- 同一 `appId`、同一安装目录下覆盖升级。
- 旧版 Squirrel 安装包不能自动升级到 NSIS 版本，需要先卸载旧版；用户数据与原始音乐文件保留。
- `deleteAppDataOnUninstall: false`，卸载不删除用户数据。
- 修改 `appId`、`executableName` 或安装目录会导致“新装一个应用”，旧数据不会自动迁移。

### 2.4 安装器测试

```bash
npm run make
npm run test:installer
```

当前 `tests/desktop/windows-installer.ps1` 在无旧版安装的测试账户上验证：

- 安装器 EXE 图标与品牌。
- 无默认标题栏、无返回按钮、窗口尺寸 800 × 520。
- 欢迎页、目录控件对齐、按钮绘制。
- 取消安装不写文件。
- 安装选项默认折叠；展开后可切换当前用户/所有用户。
- `/currentuser` 时安装范围锁定。
- 相对路径拒绝；非空目录拒绝且不改动已有文件。
- 新目录允许；中文与带空格路径允许。
- 进度页与完成页真实出现。
- 完成后不自动启动应用。
- 安装后的 EXE、卸载器、系统应用列表图标。
- 桌面与开始菜单快捷方式指向正确目标（Unicode 路径）。
- 安装后的应用冒烟测试。
- 测试结束卸载临时安装。

所有用户安装与 UAC 取消分支仍需要在 Windows 上人工补测。

### 2.5 macOS 安装包

- `maker-zip` 与 `maker-dmg` 同时产出。
- DMG 使用 660 × 440 窗口、品牌背景、应用图标与 `/Applications` 链接。
- `postPackage` 校验 `.app` 内没有绝对路径符号链接，且框架与可执行文件存在。
- `test:dmg` 挂载最终 DMG，校验符号链接、背景与 Finder 布局，复制到临时目录后执行完整冒烟。
- 签名与公证完成后，DMG 内 app 必须已 stapled；对分发渠道要求高时再公证 DMG 本身。

### 2.6 更新流程

当前采用“检查 + 跳转 GitHub 手动下载”，链路如下：

```text
Renderer: app.checkUpdate()
  → Preload: ipcRenderer.invoke('app:check-update')
  → Main: net.fetch GitHub Releases API
  → shared/updates.ts: 过滤草稿、旧版本、通道不匹配
  → Main: webContents.send('app:update-status', status)
  → Renderer: 展示版本号、发布时间、更新日志
  → 用户点击“前往 GitHub 下载”
  → Main: 校验 URL 属于预期仓库与 tag
  → shell.openExternal(release.url)
```

规则：

- 版本号必须是合法 semver；草稿不参与更新。
- Beta 客户端可检测更高 Beta 与正式版；正式版只检测正式版。
- 发布页 URL 必须与预期 `https://github.com/<owner>/<repo>/releases/tag/<tag>` 一致，防止被 API 数据带偏。
- 请求 30 秒超时；403/429 提示限流；并发检查去重。
- 不自动下载、不自动替换自身。

**建议补强**

| 项                                   | 原因                                                             |
| ------------------------------------ | ---------------------------------------------------------------- |
| 本地缓存检查结果（6–12 小时）与 ETag | 未认证 GitHub API 每小时仅 60 次，多客户端或频繁点击容易触发限流 |
| 展示当前版本与通道                   | 用户能判断为什么收不到某些版本                                   |
| 发布资产命名稳定                     | 下载页与脚本依赖文件名；版本号变化不能改变结构                   |
| SHA256SUMS                           | 用户可校验下载完整性；发布流程已生成                             |
| 降级与备份说明                       | 新版本数据迁移后，旧版本可能无法读取                             |

### 2.7 以后接入自动更新

前提：

- macOS 完成签名与公证，并产出 ZIP。
- Windows 使用 NSIS，安装器与更新包都已签名。
- 有稳定的版本元数据（`latest.yml` / `latest-mac.yml` 或等价物）。
- 有回滚与灰度策略。

**Forge 的现状与坑**

- Forge 本身不生成 `electron-updater` 需要的 `app-update.yml` / `latest.yml`。
- 当前 NSIS maker 走 `app-builder-lib`，理论上可通过 `package.json#build.publish` 让底层生成更新元数据，但 Forge Publisher 与 electron-builder publish 是两套体系。落地前必须做一个 PoC，确认产物中确实包含元数据，并验证客户端能读取。
- 如果依赖自动更新成为核心能力，重新评估“Forge + MakerNSIS”与“electron-builder 直接打包”的成本，不要在两套发布体系之间长期打补丁。

**推荐路径**

1. 先做“下载安装包 + 校验签名/哈希 + 启动安装器”的半自动更新，风险最低。
2. 再根据用户量决定是否静默更新。
3. 自动更新必须支持：通道（Beta/Stable）、失败回退、手动下载兜底、更新前数据备份。
4. Windows 当前用户安装更适合静默更新；所有用户安装涉及 UAC，不能假设无感升级。

### 2.8 发布检查清单

- [ ] `package.json#version` 已更新，lockfile 同步。
- [ ] 标签与版本完全一致（例如 `v0.1.0-beta.12`）。
- [ ] 三平台构建通过，打包后冒烟通过。
- [ ] macOS DMG 挂载验证通过。
- [ ] Windows 安装向导验证通过，截图已归档。
- [ ] 应用 EXE、安装器 EXE、卸载器 EXE 签名与时间戳有效。
- [ ] SHA256SUMS 已生成并上传。
- [ ] Beta 自动发布为 Prerelease；正式版保留草稿并人工确认。
- [ ] 发布说明包含升级注意事项与数据兼容性说明。

---

## 3. 代码组织

### 3.1 分层与依赖规则

```text
┌────────────────────────────────────────────┐
│ main（Node / Electron）                     │
│  窗口、托盘、菜单、文件、协议、更新、存储     │
└───────────────▲───────────────┬────────────┘
                │ IPC           │ events
┌───────────────┴───────────────▼────────────┐
│ preload（sandbox）                          │
│  contextBridge + 通道白名单 + 类型收窄       │
└───────────────▲───────────────┬────────────┘
                │ window.desktop│
┌───────────────┴───────────────▼────────────┐
│ renderer（浏览器环境）                      │
│  页面、组件、状态、平台适配层                │
└────────────────────────────────────────────┘
                shared：类型 + 纯函数
```

| 规则                         | 说明                                                    |
| ---------------------------- | ------------------------------------------------------- |
| `renderer` 不 import `main`  | 渲染层不能直接使用 Node / Electron API                  |
| `main` 不 import `renderer`  | 主进程不依赖 UI 框架                                    |
| `preload` 不 import 业务实现 | 只做通道映射与参数收窄                                  |
| `shared` 保持同构            | 只放类型、常量、纯函数；不 import `electron`、`node:fs` |
| 平台能力统一走适配层         | 组件不直接访问 `window.desktop`                         |

`src/shared/updates.ts`、`src/shared/range.ts` 是很好的例子：纯逻辑、可在主进程和单元测试中复用，不依赖 Electron。

### 3.2 目录建议

当前项目规模不大，扁平结构可继续使用。新客户端或业务域增加后，建议按功能收敛：

```text
src/
├─ app.config.ts              # 应用标识单一来源
├─ main/
│  ├─ index.ts                # app 生命周期
│  ├─ window.ts               # 窗口与安全配置
│  ├─ tray.ts
│  ├─ menu.ts
│  ├─ protocol.ts
│  └─ ipc/
│     └─ index.ts             # 注册各 feature handler
├─ preload.ts
├─ shared/
│  ├─ types.ts
│  └─ *.ts                    # 纯函数
├─ features/
│  └─ library/
│     ├─ contract.ts          # 通道名 + 类型
│     ├─ main.ts              # 主进程实现
│     ├─ renderer/            # store / 组件
│     └─ index.ts
└─ renderer/
   ├─ main.ts
   ├─ App.vue
   ├─ platform/               # 桌面 / 浏览器适配
   └─ components/
```

原则：**按业务域切 feature，而不是按技术层无限拆目录**。一个 feature 内的主进程实现、契约、渲染层代码放在一起，读代码时不需要跨半个仓库。

### 3.3 应用标识单一来源

多客户端复用最常见的错误，是产品名、`appId`、协议名、更新仓库散落在五六个文件里。建议：

```ts
// src/app.config.ts
export const appConfig = {
  appId: 'com.abner.music',
  productName: 'Abner Music',
  executableName: 'abner-music',
  scheme: 'abner-media',
  updateRepository: 'abner-forever/abner-music',
  dataFile: 'library.json',
  window: { width: 1200, height: 800, minWidth: 1000, minHeight: 720 },
} as const;
```

使用方：

- `forge.config.ts`：`name`、`appBundleId`、`executableName`、协议、publisher。
- `src/main.ts`：`app.setName`、`setAppUserModelId`、数据文件、窗口尺寸。
- `src/shared/updates.ts`：更新仓库。
- `src/renderer`：窗口标题、设置页版本信息。

`package.json#build` 无法 import TS，无法完全消除重复。用单元测试兜底：

```ts
// tests/unit/app-config.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import packageInfo from '../../package.json' with { type: 'json' };
import { appConfig } from '../../src/app.config.ts';

test('package.json and app.config stay in sync', () => {
  assert.equal(packageInfo.build.appId, appConfig.appId);
  assert.equal(packageInfo.productName, appConfig.productName);
});
```

### 3.4 IPC 契约组织

每个 feature 一份契约，通道名统一 `<domain>:<action>`：

```ts
// src/features/library/contract.ts
import type { Track } from '../../shared/types';

export interface ImportResult {
  tracks: Track[];
  skipped: number;
}

export interface LibraryApi {
  list(): Promise<Track[]>;
  importFiles(folder?: boolean): Promise<ImportResult>;
  remove(id: string): Promise<void>;
}

export const libraryChannels = {
  list: 'library:list',
  import: 'library:import',
  remove: 'library:remove',
} as const;
```

主进程注册：

```ts
// src/features/library/main.ts
import type { IpcMain } from 'electron';
import { libraryChannels } from './contract';

export function registerLibraryIpc(ipcMain: IpcMain, deps: LibraryDeps) {
  ipcMain.handle(
    libraryChannels.list,
    withTrustedSender(deps, () => deps.list()),
  );
  ipcMain.handle(
    libraryChannels.import,
    withTrustedSender(deps, (_event, folder) => deps.importFiles(folder === true)),
  );
  ipcMain.handle(
    libraryChannels.remove,
    withTrustedSender(deps, (_event, id) => {
      if (typeof id !== 'string' || !id) throw new Error('Invalid track id');
      return deps.remove(id);
    }),
  );
}
```

preload 只做映射：

```ts
const bridge: DesktopBridge = {
  library: {
    list: () => ipcRenderer.invoke(libraryChannels.list),
    importFiles: (folder = false) => ipcRenderer.invoke(libraryChannels.import, folder),
    remove: (id) => ipcRenderer.invoke(libraryChannels.remove, id),
  },
};
```

事件通道返回取消订阅函数，避免监听器泄漏：

```ts
onStatus(callback) {
  const listener = (_event, status) => callback(status);
  ipcRenderer.on('app:update-status', listener);
  return () => ipcRenderer.removeListener('app:update-status', listener);
}
```

### 3.5 渲染层平台适配层

不要让组件散落 `window.desktop?.xxx`。集中到一个适配层：

```ts
// src/renderer/platform/index.ts
import type { DesktopBridge } from '../../shared/types';

export const desktop: DesktopBridge | undefined = window.desktop;
export const isDesktop = Boolean(desktop);

export async function pickMusic(folder = false) {
  if (desktop) return desktop.library.importFiles(folder);
  // 浏览器回退：使用 <input type="file"> 或拖放
  return { tracks: [], skipped: 0 };
}

export async function openExternal(url: string) {
  if (desktop) return desktop.app.openExternal(url);
  window.open(url, '_blank', 'noopener,noreferrer');
}
```

桥接层应提供受白名单约束的 `openExternal`，不要直接把任意 URL 交给 `shell.openExternal`。外部链接、发布页、文档地址分别列白名单，或至少校验协议与域名。

好处：

- 浏览器预览、E2E 测试、未来 Web 版共用一套业务代码。
- 桌面能力缺失时有明确降级，而不是运行时崩溃。
- 单元测试可注入 mock adapter。

### 3.6 资源与数据

| 目录 / API                | 用途                                   | 注意                             |
| ------------------------- | -------------------------------------- | -------------------------------- |
| `public/`                 | 渲染层静态资源                         | 会复制到构建产物；路径用相对路径 |
| `build/`                  | 打包资源（图标、安装器素材、签名配置） | 不要被渲染层 import              |
| `src/assets/`             | 组件引用的图片、字体                   | 由 Vite 处理哈希                 |
| `app.getPath('userData')` | 用户数据、数据库、日志                 | 唯一可写目录；不要写安装目录     |
| `process.resourcesPath`   | `extraResource` 运行时资源             | 只读，随安装包更新               |

数据文件建议包含 `schemaVersion`，并在启动时迁移；写入使用 `tmp` + `rename`，并用串行队列避免并发。

### 3.7 新增一个 feature 的步骤

1. 在 `features/<name>/contract.ts` 定义类型与通道名。
2. 在 `features/<name>/main.ts` 实现 handler，所有入口先做 sender 与参数校验。
3. 在 `src/main/ipc/index.ts` 注册。
4. 在 `src/preload.ts` 与 `src/shared/types.ts` 扩展桥接类型。
5. 在 `src/renderer/platform/` 暴露适配方法。
6. 写 UI 与 store；浏览器回退行为明确。
7. 补单元测试与 E2E；需要原生能力时补打包后冒烟。
8. 更新文档中的通道表。

### 3.8 多客户端复用

第一个客户端保持模板化，第二个客户端复制模板；第三个客户端或壳层开始频繁同步修改时，再抽 `shell` / `bridge` / `storage` / `updates` / `forge-preset` 共享包。详细路线见配套文档第 5 节。

---

## 4. 集成现有前端项目

### 4.1 先判断接入方式

| 现有项目                     | 推荐方式                                 | 成本 | 备注                                         |
| ---------------------------- | ---------------------------------------- | ---- | -------------------------------------------- |
| Vite（Vue / React / Svelte） | 直接作为 Forge renderer                  | 低   | 最顺滑，本文重点                             |
| Webpack / CRA                | 迁移到 Vite，或保留 Webpack 产出静态文件 | 中   | Forge Vite 插件不接管 Webpack                |
| Next.js                      | 静态导出（`output: 'export'`）           | 中高 | 不能使用 SSR、Server Actions、动态服务端能力 |
| Nuxt                         | `ssr: false` + 静态生成                  | 中高 | 路由与资源路径需桌面化                       |
| 多页应用 / 微前端            | 每个入口一个 renderer 或统一 SPA 壳      | 高   | 多窗口、多 renderer 配置                     |
| 已有 Electron 项目           | 只替换壳层，保留 renderer                | 中   | 注意安全配置与 IPC 兼容                      |

### 4.2 Vite 项目最小接入

假设现有前端在 `web/`，桌面壳层新增在 `desktop/`：

```text
project/
├─ web/                      # 现有前端，保持不动
│  ├─ index.html
│  ├─ src/
│  └─ vite.config.ts
├─ desktop/
│  ├─ main.ts
│  ├─ preload.ts
│  ├─ vite.main.config.ts
│  └─ vite.preload.config.ts
├─ forge.config.ts
└─ package.json
```

**第一步：package.json**

```json
{
  "type": "module",
  "main": ".vite/build/main.cjs",
  "scripts": {
    "start": "electron-forge start",
    "dev": "vite --config web/vite.config.ts --host 127.0.0.1",
    "build:web": "vite build --config web/vite.config.ts"
  }
}
```

`main` 必须指向 `.vite/` 下的文件，Forge Vite 插件会检查这一点。`build:web` 仅用于浏览器独立构建；`electron-forge make` 会自行构建 renderer，不要把两者混用。

**第二步：Forge 配置**

```ts
new VitePlugin({
  build: [
    { entry: 'desktop/main.ts', config: 'desktop/vite.main.config.ts', target: 'main' },
    { entry: 'desktop/preload.ts', config: 'desktop/vite.preload.config.ts', target: 'preload' },
  ],
  renderer: [{ name: 'main_window', config: 'web/vite.config.ts' }],
});
```

**第三步：渲染配置**

Forge 默认给 renderer 设置 `base: './'` 与 `outDir: '.vite/renderer/<name>'`，但 `root` 默认为 Forge 项目根目录。现有前端不在根目录时，需要显式设置：

```ts
// web/vite.config.ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig((environment) => ({
  root,
  base: './',
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 'forgeConfigSelf' in environment ? 5174 : 5173,
    strictPort: true,
  },
}));
```

要点：

- `root` 指向 `web/`，否则 Vite 找不到 `index.html`。
- 不要覆盖 `build.outDir`，Forge 需要 `.vite/renderer/main_window`。
- `base` 保持 `'./'`；现有配置若写了 `/` 或子路径，桌面端会白屏。
- 浏览器预览 5173，Forge 开发服务器 5174，使用 `'forgeConfigSelf' in environment` 区分。
- 端口 `strictPort: true`，避免 Forge 主进程拿到错误端口。

**第四步：主进程加载**

```ts
if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
  await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
} else {
  await mainWindow.loadFile(
    path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
  );
}
```

这两个全局常量由 Forge Vite 插件注入，名称由 renderer 的 `name` 决定（`main_window` → `MAIN_WINDOW_VITE_*`）。

**第五步：preload 与类型**

```ts
// desktop/preload.ts
import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge } from '../web/src/desktop-types';

const bridge: DesktopBridge = {
  platform: process.platform,
  // ...
};

contextBridge.exposeInMainWorld('desktop', bridge);
```

渲染层声明：

```ts
// web/src/env.d.ts
import type { DesktopBridge } from './desktop-types';

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}
```

**第六步：浏览器回退**

现有前端在没有 `window.desktop` 时仍应完整可用。把桌面能力包在适配层里（见 3.5），不要在每个组件里判断。

### 4.3 路由与静态资源

**路由必须改 hash 或自定义协议**

`file://` 下 `history` 路由刷新会 404：

```ts
// Vue Router
createWebHashHistory();

// React Router
createHashRouter(routes);
// 或 <HashRouter>
```

如果坚持 history 路由，可注册 `app://` 自定义协议，把未知路径回退到 `index.html`。代价是要处理 MIME、缓存、Range 与 CSP，复杂度高于 hash。

**资源路径**

| 写法                                  | `file://` 下         | 建议                                        |
| ------------------------------------- | -------------------- | ------------------------------------------- |
| `/logo.png`                           | 指向磁盘根目录，失败 | 改为 `./logo.png` 或 `import logo from ...` |
| `new URL('./x.png', import.meta.url)` | 正确                 | 推荐                                        |
| `public/` 下绝对路径                  | 失败                 | 使用相对路径或 `import.meta.env.BASE_URL`   |
| CSS `url('/font.woff2')`              | 失败                 | 改为相对路径                                |
| 动态 `import('/views/x.js')`          | 可能失败             | 使用静态可分析的动态 import                 |

**多页应用**

Forge 可以为每个入口配置独立 renderer：

```ts
renderer: [
  { name: 'main_window', config: 'web/vite.main.config.ts' },
  { name: 'settings_window', config: 'web/vite.settings.config.ts' },
],
```

每个配置需要独立 `root`、入口 HTML 和端口。主进程按窗口加载对应 URL 或文件。不要在一个 renderer 里用 `window.open` 创建新窗口，统一走主进程 `BrowserWindow`。

### 4.4 平台能力适配

需要改写的常见 Web API：

| Web 能力              | 桌面实现                                      | 浏览器回退                     |
| --------------------- | --------------------------------------------- | ------------------------------ |
| `<input type="file">` | 主进程 `dialog.showOpenDialog`                | file input / 拖放              |
| 下载文件              | 主进程保存对话框 + `writeFile`                | `<a download>`                 |
| `window.open`         | `shell.openExternal`（白名单）                | `window.open`                  |
| 通知                  | Electron `Notification` 或渲染层 Notification | Web Notification               |
| 剪贴板                | Electron `clipboard`（需要时）                | `navigator.clipboard`          |
| 开机启动              | `app.setLoginItemSettings`                    | 不支持                         |
| 托盘 / 全局快捷键     | 主进程                                        | 不支持                         |
| 窗口控制              | 主进程 `BrowserWindow`                        | 隐藏                           |
| 本地文件扫描          | 主进程 `fs`                                   | File System Access API（受限） |

适配层示例：

```ts
export interface Platform {
  pickFiles(options: { directory?: boolean }): Promise<string[]>;
  saveText(name: string, content: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  canControlWindow: boolean;
}

export const platform: Platform = window.desktop
  ? createDesktopPlatform(window.desktop)
  : createWebPlatform();
```

组件只依赖 `Platform`，不依赖 Electron。

### 4.5 存储迁移

桌面端的 origin 与 Web 端不同：

| 环境              | origin                                     |
| ----------------- | ------------------------------------------ |
| Web               | `https://example.com`                      |
| 开发（Forge）     | `http://127.0.0.1:5174`                    |
| 打包（`file://`） | `file://`（不同路径可能被视为不同 origin） |
| 自定义协议        | `app://...` 或 `myapp://...`               |

因此：

- 浏览器里的 `localStorage` / `IndexedDB` **不会**自动带到桌面端。
- 桌面的权威数据应放主进程（`userData`），渲染层只放 UI 偏好。
- 需要迁移时提供“导出 / 导入”JSON，或在首次启动时引导用户重新选择数据目录。
- 不要尝试从 Web 域直接读取桌面端的存储；跨 origin 不可行。
- 如果使用自定义协议，协议名或路径变化也会改变存储位置；发布后保持稳定。

### 4.6 网络、CSP 与 CORS

现有 Web 项目通常没有严格 CSP。接入桌面后必须收紧：

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self';
    script-src 'self';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob: https:;
    media-src 'self' blob: app-media: https: http:;
    connect-src 'self' ws://127.0.0.1:* ws://localhost:*;
    font-src 'self' data:;
    object-src 'none';
    base-uri 'self'"
/>
```

按需调整：

| 需求               | 修改                                       |
| ------------------ | ------------------------------------------ |
| 渲染层直接请求 API | `connect-src` 加 `https://api.example.com` |
| WebSocket / SSE    | `connect-src` 加 `wss://...`               |
| 远程图片           | `img-src` 加对应域名                       |
| 本地自定义协议媒体 | `media-src` 加协议名                       |
| 内联样式           | 保留 `'unsafe-inline'`；尽量改用样式表     |
| 内联脚本           | 不建议；改用外部文件或 nonce               |

**CORS**

- 浏览器环境受 CORS 限制；桌面渲染层仍是 Chromium，同样受限。
- 主进程 `net.fetch` 不受页面 CORS 限制，但不要把主进程做成任意 URL 代理；必须按业务白名单校验。
- 第三方 API 不允许跨域时，走主进程代理，并在主进程做鉴权、超时、响应大小限制。
- 不要在渲染层硬编码密钥；所有 Secret 留在主进程或服务端。

### 4.7 桌面窗口适配

当前项目在 macOS 使用 `titleBarStyle: 'hidden'` + traffic lights，在 Windows 使用无边框窗口并由渲染层绘制控制按钮。现有 Web UI 接入时需要补：

```css
.titlebar {
  -webkit-app-region: drag;
}

.titlebar button,
.titlebar input,
.titlebar a {
  -webkit-app-region: no-drag;
}
```

要点：

- macOS 预留左上角红绿灯位置（当前 `trafficLightPosition: { x: 22, y: 23 }`）。
- Windows 无边框窗口需要自行提供最小化、最大化、关闭按钮，并处理双击标题栏最大化。
- 拖拽区域不能覆盖可交互元素，否则按钮点不到。
- 设置最小尺寸，避免现有响应式布局在桌面窗口下塌陷。
- 高 DPI 下使用逻辑像素，不要写死物理像素。
- 托盘、菜单、全局快捷键属于主进程能力，Web 端隐藏或提示“桌面端可用”。

### 4.8 Webpack / CRA 项目

三种选择：

| 方案               | 做法                                                            | 评价                                         |
| ------------------ | --------------------------------------------------------------- | -------------------------------------------- |
| 迁移到 Vite        | 保留业务代码，替换构建配置                                      | 长期最省心；React/Vue 迁移通常几天内完成     |
| 保留 Webpack 产出  | 先 `webpack build` 到静态目录，再让主进程加载                   | 可行但构建链割裂；需处理 `ignore` 与资源路径 |
| Forge Webpack 插件 | 用 `@electron-forge/plugin-webpack` 重建主进程/preload/renderer | 可行；但和现有 Webpack 配置需要重新对齐      |

注意 Forge Vite 插件会把 `packagerConfig.ignore` 设置为“只保留 `.vite`”。如果 renderer 产物不在 `.vite` 下，必须自定义 `ignore` 或把产物复制到 `.vite/renderer/<name>`，否则打包后是白屏。

### 4.9 Next.js / Nuxt

**Next.js**

Forge Vite 插件不能构建 Next。可行路径：

1. `next.config` 设置 `output: 'export'`、`images.unoptimized: true`。
2. `next build` 产出静态文件。
3. 把静态产物放入 `.vite/renderer/main_window/`（或自定义 `ignore` 后放到独立目录）。
4. 主进程加载该目录的 `index.html`。
5. 不使用 SSR、Server Actions、Route Handlers、动态服务端渲染、依赖 Node 运行时的 API。
6. 路由使用 hash 或导出为多个静态页面；动态路由需要 `generateStaticParams`。
7. 资源前缀使用相对路径，验证 `_next/static` 在 `file://` 下可加载。

如果应用强依赖 Next 服务端能力，建议不要硬塞进 Electron：要么改成 Vite SPA，要么在主进程启动本地服务（复杂度和安全面都会上升）。

**Nuxt**

- `ssr: false`，使用 `nuxt generate` 产出静态站点。
- 设置相对 `baseURL`，路由改 hash 或使用自定义协议回退。
- 同样避免 Nitro 服务端路由与运行时依赖。

### 4.10 Monorepo 接入

```text
repo/
├─ apps/
│  ├─ web/                 # 现有前端
│  └─ desktop/             # Electron 壳层 + Forge
├─ packages/
│  └─ shared/              # 跨端类型与纯逻辑
├─ package.json            # npm workspaces
└─ forge.config.ts
```

要点：

- Forge 的 `projectDir` 是 `apps/desktop`，renderer 配置指向 `apps/web/vite.config.ts`，并设置 `root`。
- Forge Vite 默认 `resolve.preserveSymlinks: true`。npm/pnpm workspace 的符号链接可能导致依赖解析与常规 Vite 不同，出现 React 重复实例或包找不到；必要时配置 alias 或在桌面包中显式声明依赖。
- 构建顺序：先构建共享包，再启动 Forge。CI 中不要依赖开发态软链。
- `packagerConfig.ignore` 只保留 `.vite` 时，renderer 产物必须在 `.vite` 下；共享包若需运行时加载，应被打包进 bundle，而不是作为外部文件。
- 原生模块放桌面包，不要放 Web 包，避免 Web 构建尝试打包 Node 二进制。

### 4.11 测试接入后的项目

| 层         | 命令                                          | 说明                                         |
| ---------- | --------------------------------------------- | -------------------------------------------- |
| 类型检查   | `npm run typecheck`                           | Web 与桌面类型都要覆盖                       |
| 浏览器 E2E | `npm run test:e2e`                            | 继续跑 5173，验证 Web 回退                   |
| 打包冒烟   | `npm run package && npm run test:desktop`     | 启动真实可执行文件，验证 asar、preload、协议 |
| 安装包验证 | `npm run test:dmg` / `npm run test:installer` | 对应平台原生 runner                          |

新增桌面专属行为时，至少补一条打包后冒烟；只在浏览器里点过不算验证。

### 4.12 接入检查清单

- [ ] `base` 为 `'./'`，静态资源全部相对路径。
- [ ] 路由改为 hash，或自定义协议有 SPA 回退。
- [ ] `root` 指向现有前端目录，`index.html` 可被 Vite 找到。
- [ ] `package.json#main` 指向 `.vite/build/main.cjs`。
- [ ] preload 输出为 CJS，主进程路径正确。
- [ ] `window.desktop` 类型声明齐全，浏览器回退可用。
- [ ] 文件选择、保存、外链、通知等能力走适配层。
- [ ] CSP 收紧，未出现 `unsafe-eval` 与任意远程脚本。
- [ ] 存储从 Web origin 迁移到主进程，或提供导入导出。
- [ ] 标题栏拖拽区域与窗口控制按钮可用。
- [ ] 开发态 5173 / 5174 不冲突。
- [ ] 打包后冒烟通过，无白屏、无 404、无 preload 缺失。
- [ ] 安装包验证通过。

---

## 5. 常见问题速查

| 现象                          | 常见原因                                          | 处理                                            |
| ----------------------------- | ------------------------------------------------- | ----------------------------------------------- |
| 开发正常，打包白屏            | `base` 不是 `./`；资源用了绝对路径                | 改 `base`，检查 `/assets`、`/fonts`             |
| 刷新后 404                    | history 路由在 `file://` 下无回退                 | 改 hash 路由或加协议回退                        |
| `window.desktop` 为 undefined | preload 路径错误、sandbox 限制、构建未输出 `.cjs` | 检查 `preload.cjs` 路径与产物                   |
| `require is not defined`      | 渲染层误用了 Node API                             | 移到主进程，通过 IPC 暴露                       |
| 本地文件无法播放              | 直接用 `file://` 或路径未映射                     | 使用自定义协议 + Range                          |
| 请求被 CORS 拦截              | 渲染层直连第三方 API                              | 主进程代理并做白名单                            |
| 打包后字体/图片丢失           | `public` 路径或 `ignore` 配置错误                 | 用相对路径；确认资源在 `.vite` 产物内           |
| 安装器文字闪烁/标签消失       | 自绘背景未裁剪、页面 Z 序错误                     | 参考 2.2 的 `WS_CLIPCHILDREN` 与 `SetWindowPos` |
| 安装器提示目录无效            | 路径校验把新目录当成错误                          | 使用 `GetFullPathNameW`，允许不存在但合法的路径 |
| 签名后应用无法启动            | 签名破坏了 asar 或资源                            | 先打包完成再签，签后不要修改文件                |
| 更新提示但下载页 404          | 资产命名或 tag 不一致                             | 固定 artifact 命名，校验 tag 与版本             |
| 用户升级后数据丢失            | `appId` / `executableName` / 数据路径改变         | 发布后保持稳定；变更时做迁移                    |

---

## 6. 建议的落地顺序

1. **先接前端**：让现有 Vite 项目在 Forge 里跑起来，打通主进程、preload、renderer 与浏览器回退。
2. **再收安全**：CSP、`sandbox`、IPC 校验、外链白名单、自定义协议。
3. **再定代码组织**：`app.config.ts`、feature 契约、平台适配层。
4. **再做安装器**：复用现有 NSIS 脚本与素材生成，按产品替换品牌资源。
5. **最后做签名与自动更新**：签名先于公证，公证先于自动更新；自动更新先做半自动，再做静默。
