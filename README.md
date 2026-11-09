# Hydro

企业级通用 App 框架：**uni-app 薄壳 + WebView 容器 + JSBridge + H5 业务**。业务全部 H5 化，通过统一桥协议调用原生能力；框架以脚手架形态交付，支持 `create` 创建与 `update` 双通道受控升级。

## 快速开始

```bash
# 1. 安装依赖（Node ≥ 20 / pnpm ≥ 9）
pnpm install

# 2. 创建项目（仓库内会自动 link 本地 @hydro/* 包）
node packages/create-hydro/bin/index.js my-app
cd my-app
pnpm install

# 3. 浏览器开发（MockBridge，无需壳与真机）
pnpm dev

# 4. 壳工程（需要 HBuilderX）
pnpm dev:shell
```

生成的项目：

```text
my-app/
├── .hydro-manifest.json     # 受管模板文件 hash + 框架版本
├── hydro.config.ts          # Web 入口 / 白名单 / 调试开关
├── apps/shell/              # 薄壳（模板通道管理）
└── portals/order/           # 业务代码（用户所有，update 永不触碰）
```

## 常用命令

```bash
pnpm lint && pnpm test                 # 全仓校验
pnpm build                             # 构建各 CLI 包
pnpm -F @hydro/bridge-sdk test         # 桥接 SDK（含覆盖率）

# 在生成项目内
hydro update --dry-run --to 0.2.0      # 双通道更新预演
hydro update --to 0.2.0                # 依赖 + 模板更新，自动 commit
hydro doctor                           # Node / 依赖 / manifest / 插件 / 协议体检
hydro codemod --to 0.1.0 --yes         # 破坏性变更自动迁移（需显式 --yes）
```

离线包：

```bash
hydro-offline pack --dir dist --app my-app --version 1.0.0 --secret <key>
hydro-offline publish --zip releases/my-app-prod-1.0.0.zip --server http://127.0.0.1:8787
cd services/offline-server && pnpm dev  # 默认 :8787
```

## 仓库结构

| 路径                      | 内容                                                     |
| ------------------------- | -------------------------------------------------------- |
| `packages/shared`         | 桥协议类型、API 注册表、事件契约（两端共用）             |
| `packages/bridge-sdk`     | 双实现桥（浏览器 Mock / 壳内真实）、日志与 vConsole 面板 |
| `packages/web-sdk`        | 请求（token 注入 / 401 刷新重放）、埋点、轻量 UI         |
| `packages/create-hydro`   | `npm create hydro` 脚手架                                |
| `packages/cli`            | `hydro update / doctor / codemod`                        |
| `packages/offline-packer` | `hydro-offline pack / diff / publish`                    |
| `templates/shell`         | uni-app 壳、容器、桥原生侧、双通道原生插件               |
| `templates/portal`        | 业务模块模板（e2e demo）                                 |
| `services/offline-server` | 离线包版本 / 签名 / 下载 / 指标聚合服务                  |
| `codemods/`               | 按版本组织的 jscodeshift 迁移脚本                        |

## 文档

- [架构设计](docs/architecture.md)
- [脚手架设计](docs/scaffold-design.md)
- [开发与调试指南](docs/development-guide.md)
- [分阶段开发计划](docs/implementation-plan.md)

## 待人工验证

以下验收依赖 HBuilderX / 真机，代码已就绪但尚未完成实机验证：

- Phase 3：自定义基座 + 真机桥接链路、白名单拦截
- Phase 9：真机差量 / 离线重启、原生插件下载校验
- Phase 10：真机 e2e 全链路与 `/metrics` 上报
