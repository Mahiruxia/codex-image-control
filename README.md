# Codex Image Control

图片生成中控是一个面向 Codex 的本地图片与分镜工作台，支持单图持续编辑、通用分镜策划、正式图片回写、视频提示词管理，以及由每位使用者自行配置的视频连接器。

![Image Control 工作台总览：项目方向、连续分镜与阶段化生产界面](https://github.com/Mahiruxia/codex-image-control/releases/download/v0.11.2/image-control-workbench-overview.png)

本仓库是唯一维护源。plugins/image-control/ 同时包含插件源码与构建后的 Windows 安装载荷；Codex 的插件缓存只是安装结果，不能作为后续修改或发布来源。

## 隐私边界

公开仓库和正式发布包不会内置维护者的视频生成地址、ComfyUI 工作流、API 密钥、账号、用户素材或项目数据。插件没有可供其他用户“借用”的维护者视频模型：每位使用者都必须在自己的电脑上添加自己的连接器、工作流和凭据。

长期数据与插件程序分开存放：

- 本机状态：由 IMAGE_CONTROL_STATE_ROOT 指定，Windows 默认位于 %LOCALAPPDATA%\CodexImageControl。
- 用户项目：由 IMAGE_CONTROL_PROJECTS_ROOT 指定；未设置时位于状态目录的 data/projects/。
- 视频凭据：只保存到 Windows 凭据库；凭据库不可用时插件会拒绝保存或调用，修复系统凭据库后再重试。
- 临时队列：位于状态目录的 .runtime/，不属于备份或发布内容。

安装或升级插件不会主动覆盖外部状态和项目目录。备份、恢复与换机步骤见 [备份与恢复](docs/BACKUP_AND_RECOVERY.md)，完整数据说明见 [隐私与数据边界](docs/PRIVACY_AND_DATA.md)。

## 运行要求

- Windows 10/11 x64。
- Node.js 22 或更高版本；持续集成固定使用 Node.js 22。
- Codex / ChatGPT 桌面应用的本地插件能力。
- 图片生成使用当前 Codex 任务的内置生图能力。
- 使用视频连接器时，系统 PATH 中需要可执行的 ffmpeg 和 ffprobe；只使用图片功能时不需要。

## 仓库结构

~~~text
.agents/plugins/marketplace.json     仓库级本地插件市场
.github/                             固定提交 SHA 的 CI、安全扫描与发布流程
docs/                                隐私、备份与发布操作手册
plugins/image-control/               可安装插件与唯一实现来源
  .codex-plugin/plugin.json          插件清单
  .mcp.json                          便携式 MCP 启动配置
  app/                               React/Vite 工作台与上游许可文件
  server/                            本地 MCP、文件服务与视频连接器
  skills/                            Codex 工作流技能
  templates/                         通用生成模板
  runtime/                           构建后的 Windows x64 自包含服务
scripts/                             版本、脱敏、供应链、验证与发布脚本
~~~

## 首次开发与验证

~~~powershell
npm run install:all
npm run verify
~~~

verify 会重新构建前端和运行包、执行服务端与发布脚本测试、校验插件结构和版本、扫描源码及二进制中的敏感内容，并生成确定性的依赖清单。依赖安装严格使用两个工作区的 package-lock.json。

开发模式：

~~~powershell
npm --prefix plugins/image-control/server run dev
npm --prefix plugins/image-control/app run dev
~~~

构建后也可双击 plugins/image-control/open-workbench.cmd。它使用与 Codex 插件相同的外部状态和项目目录。

## 作为 Codex 插件安装

公开后，其他使用者可以直接把 GitHub 仓库登记为 Codex 插件市场，再安装 `image-control@codex-image-control`；工作台会作为 Codex 内嵌 MCP App 打开，不需要浏览器入口。GitHub、Release ZIP、升级和卸载的完整命令见 [安装说明](INSTALL.md)。

从仓库根目录执行：

~~~powershell
codex plugin marketplace add .
codex plugin add image-control@codex-image-control
~~~

重启桌面应用并新建任务后，在输入框键入 `@`，选择“图片生成中控”，再发送“打开图片生成中控”。显式选择插件可以确保该任务加载它的 MCP 工具与内嵌工作台。若机器上仍有旧来源的同名插件，只保留一个版本启用，避免工具名冲突。

Codex 对同一基础版本的本地插件可能复用缓存。需要重新安装尚未正式发布的本地构建时，只给插件清单增加一个缓存标记：

~~~powershell
npm run cache-bust
npm run verify
~~~

也可显式传入便于辨认的标记：

~~~powershell
npm run cache-bust -- local-1
~~~

脚本只修改 plugin.json，并会替换旧的 +codex. 标记，不会重复叠加。准备正式打包前必须恢复纯基础版本：

~~~powershell
npm run cache-reset
~~~

不要提交带 +codex. 标记的正式版本，也不要从 Codex 安装缓存反向复制代码。

## 正式发布

当前版本示例：

~~~powershell
npm run set-version -- 0.11.2
npm run cache-reset
npm run package:windows
~~~

package:windows 会执行全部构建与测试、依赖漏洞审计、源码脱敏扫描、确定性 SBOM 生成、两次独立 ZIP 构建哈希比对、归档路径与压缩炸弹检查、解包后二次脱敏扫描，以及 MCP 冒烟测试。正式打包拒绝任何 +codex. 缓存标记。

artifacts/ 中会得到四个正式资产：

- image-control-版本-windows-x64.zip
- 对应的 .zip.sha256
- image-control-版本-sbom.cdx.json
- image-control-版本-third-party-components.json

压缩包内部也包含 SBOM、组件清单、项目许可证、TwitCanva 原始 LICENSE/NOTICE 和第三方说明。发布前逐项执行 [发布检查清单](docs/RELEASE_CHECKLIST.md)，更新 CHANGELOG.md，再创建完全一致的 v版本 标签。标签工作流拒绝覆盖已存在的 GitHub Release，并为发布资产生成构建来源证明。

需要转发给普通用户时，可以直接发送 [给 Codex 的安全安装提示词](docs/CODEX_INSTALL_PROMPT.md)，让对方的 Codex 检查环境、来源冲突并从固定 GitHub 标签安装。

## 旧项目合并

旧项目只作为迁移来源和短期回退副本，不再参与构建或发布。先阅读 [迁移说明](MIGRATION.md)，备份状态与项目目录，再运行迁移脚本。迁移不会复制运行队列、构建产物或素材副本。

## 安全与贡献

- 漏洞报告和密钥泄露处理见 [SECURITY.md](SECURITY.md)。
- 开发、测试、许可证和隐私夹具约定见 [CONTRIBUTING.md](CONTRIBUTING.md)。
- 自动扫描是发布门禁，不代替人工检查。发布前仍需确认提交历史、Issue、截图、日志和 GitHub Actions 输出中没有敏感数据。

## 开源与第三方来源

本项目采用 Apache License 2.0。界面底座源自同为 Apache-2.0 的 TwitCanva；当前视频连接器和队列为本仓库重写实现，不是上游后端。原始许可证与 NOTICE 保存在 plugins/image-control/app/，完整归因见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
