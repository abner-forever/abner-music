# Repository Guidelines

## 项目结构与模块组织

Abner Music 是基于 Electron Forge、Vue 3 和严格模式 TypeScript 的桌面音乐播放器。
`src/main.ts` 管理 Electron 生命周期与原生功能集成；`src/preload.ts` 暴露桌面桥接接口。原生服务放在 `src/desktop/`，跨进程数据契约放在 `src/shared/`。Vue 界面位于 `src/renderer/`，其中 `components/` 存放可复用组件，`stores/` 管理状态，`lib/` 存放工具模块。

测试分布在 `tests/unit/`、`tests/e2e/` 和 `tests/desktop/`。网页静态资源位于 `public/`；安装器素材与 NSIS 脚本位于 `build/`。辅助工具位于 `scripts/`，架构说明位于 `docs/`，持续集成配置位于 `.github/workflows/`。`out/`、`dist/` 和 `.vite/` 均为生成目录。

## 构建、测试与开发命令

使用 Node.js 24 LTS 和 npm。

- `npm install`：安装依赖并下载 Electron。
- `npm start`：启动 Electron 开发应用。
- `npm run dev`：在 `127.0.0.1:5173` 启动浏览器预览。
- `npm run typecheck`：检查 TypeScript 和 Vue 类型。
- `npm run build`：执行类型检查并构建渲染进程。
- `npm test`：运行 Node.js 内置测试框架的单元测试。
- `npm run test:e2e`：运行 Playwright 浏览器测试；首次运行前执行 `npx playwright install chromium` 安装 Chromium。
- `npm run package`：打包桌面应用，之后执行 `npm run test:desktop` 验证。
- `npm run make`：生成对应平台的安装包。
- `npm run format:check`：检查 Prettier 格式；`npm run format` 会直接格式化文件。

## 代码风格与命名规范

使用两空格缩进、单引号、分号和尾随逗号，Prettier 行宽设为 100。Vue 单文件组件优先使用 `<script setup lang="ts">`。组件使用 PascalCase 命名（如 `CoverArt.vue`），函数与变量使用 camelCase，工具模块使用小写或 kebab-case。IPC 数据契约须明确声明类型。

## 测试规范

单元测试命名为 `*.test.ts`，Playwright 测试命名为 `*.spec.ts`。覆盖变更行为与失败场景；目前未配置数值化覆盖率门槛。提交评审前执行类型检查、单元测试、构建及相关浏览器测试。涉及原生功能的变更还需验证打包后的应用。最终 macOS 磁盘映像使用 `test:dmg` 验证，Windows 安装器使用 `test:installer` 验证；浏览器测试不能证明原生功能正常。

## 提交与拉取请求规范

Git 提交信息遵循 Conventional Commits，保留英文类型前缀和可选作用域，描述及正文使用中文，例如 `feat(player): 添加播放队列控制` 或 `fix(release): 修复退出验证`。PR 应说明行为变化、关联相关 issue、列出验证结果与局限；界面变更需附截图。`beta` 和 `main` 分支自动发布，日常贡献不要手动修改版本号或创建发布标签。

## 安全边界

保留渲染进程沙箱、上下文隔离、IPC 校验及受限的本地媒体访问机制。禁止内嵌凭据，禁止通过桌面桥接接口代理任意 URL。
