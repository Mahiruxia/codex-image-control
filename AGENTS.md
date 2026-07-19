# Codex Image Control 维护规范

## 项目边界

- 本仓库同时维护源码与可安装插件；`plugins/image-control/` 是插件根目录和唯一实现来源。
- 工作台只提供“单图无限编辑”和“通用分镜”两种模式，不恢复题材专属入口。
- 图片生成与改图只能由当前 Codex 任务的内置生图能力完成。视频允许使用用户本机配置的 ComfyUI 或通用 HTTP 图生视频接口。
- 不实现配音、字幕、BGM、最终串联、社交发布或账号系统。

## 数据与安全

- 插件源码和安装缓存只存放可发布程序与模板，不承载长期用户数据。
- 长期状态根目录由 `IMAGE_CONTROL_STATE_ROOT` 指定；Windows 默认使用 `%LOCALAPPDATA%\CodexImageControl`。`.runtime/` 与 `data/local/` 均位于该状态目录并跨版本保留。
- 用户项目默认位于状态目录的 `data/projects/`，也可通过 `IMAGE_CONTROL_PROJECTS_ROOT` 指向独立素材目录。
- 私有视频接口、工作流和非公开 URL 只允许存放在状态目录的 `data/local/`；凭据只进入系统凭据库，凭据库不可用时失败关闭。
- 不得提交 `data/`、`.runtime/`、`.codex_tmp/`、真实素材、浏览器资料、凭据、私有接口或开发者电脑绝对路径。
- 发布包只包含 `scripts/package-release.ps1` 明确列出的运行文件。

## 开发与验证

- 任何拟公开的变更都必须通过源码与构建产物脱敏扫描；扫描命中时修正数据或测试夹具，不得加入真实凭据允许列表。
- 正式发布前必须运行完整的 npm run package:windows，不能用手工压缩替代归档后二次扫描、可复现哈希、SBOM 和 MCP 冒烟测试。
- 首次安装运行 `npm run install:all`。
- 每次交付前运行 `npm run verify`。
- 修改服务端文件协议时同步更新测试。
- 修改多个 React 组件后执行 React 质量检查和浏览器验证。
- 修改技能后运行系统 `skill-creator/scripts/quick_validate.py`；修改插件结构后运行系统 `plugin-creator/scripts/validate_plugin.py`。
- `plugins/image-control/app/dist/` 与 `plugins/image-control/runtime/` 是对外安装所需的版本化产物；源码变化后必须重新构建并提交相应更新。

## 版本与发布

- 同一基础版本本地重装只允许用 npm run cache-bust 给 plugin.json 增加一个 +codex. 缓存标记；正式发布前用 npm run cache-reset 恢复纯版本，禁止叠加多个后缀。
- GitHub Release 视为不可变；已发布版本发现问题时增加版本号重新发布，不覆盖旧资产。
- 使用 `npm run set-version -- <semver>` 同步版本，不手工分别改多个版本字段。
- 发布前更新 `CHANGELOG.md`，运行 `npm run verify`，再运行 `npm run package:windows`。
- 当前正式运行包目标为 Windows 10/11 x64 与 Node.js 22+；增加新平台前必须提供该平台构建与验证流程。
- 不从 Codex 安装缓存反向维护源码；缓存只是安装结果，本仓库才是唯一维护入口。
- 旧项目只允许作为迁移回退；新功能、修复、版本号、发布包和本机安装更新全部从本仓库产生。

## 产品不变量

- 通用分镜支持 1–24 镜，并保留主体身份、数量、参考归属与逐镜 `cast` 约束。
- 正式宫格必须覆盖全部镜头，生成图不得带镜号、字幕、水印或其他生成文字。
- 单图编辑只覆盖当前图并保留一次撤销；局部修改必须严格限制在有效蒙版内。
- 视频提示词区分正向动作描述与独立负面字段；16fps，使用 49、65、81、97 或 113 帧。
- 图片和视频质量由用户人工确认，不由服务端自动判定。
- 视频完成下载并通过 ffprobe 验证前不得覆盖旧视频。
