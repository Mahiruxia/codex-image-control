# 图片生成中控插件

这是 Codex Image Control 仓库中的可安装插件目录，支持单图编辑、通用分镜、视频提示词，以及由使用者自行配置的可插拔视频连接器。

正常入口是 Codex 插件内嵌界面：安装后新建任务并说“打开图片生成中控”。`open-workbench.cmd` 与浏览器模式仅供本地开发诊断，不是普通用户的安装或打开方式。

## 运行条件

- Windows 10/11 x64。
- Node.js 22 或更高版本。
- 使用视频生成时，系统 PATH 中需要 ffmpeg 与 ffprobe。

## 隐私说明

公开插件不包含维护者的视频服务地址、私有工作流、API 密钥、账号或用户素材，也不会让其他使用者调用维护者自己的视频模型。每位使用者需要在本机配置自己的视频服务与凭据。

插件程序使用相对路径启动，但长期状态和安装目录分离：

- IMAGE_CONTROL_STATE_ROOT 指定本机状态，Windows 默认位于 %LOCALAPPDATA%\CodexImageControl。
- IMAGE_CONTROL_PROJECTS_ROOT 可将项目与素材放到独立目录；未设置时，项目位于“有效状态根\data\projects”。删除默认状态根会同时删除默认项目。
- 凭据只进入 Windows 凭据库，凭据库不可用时失败关闭；data/local、data/projects 和 .runtime 不属于发布载荷。

换机或恢复后只通过本机连接器界面重新录入密钥，不要手工构造 Windows 凭据库账户。彻底卸载前，先在视频模型列表使用“彻底清除本插件保存的全部密钥”，确认成功后再隔离或删除外部数据目录。

正式发布包包含 Apache-2.0 许可证、TwitCanva 原始 LICENSE/NOTICE、CycloneDX SBOM 和第三方组件清单。

## 离线维护说明

GitHub Release ZIP 自带以下文档和工具，不需要依赖仓库网页：

- `../../INSTALL.md`：从解压后的本地插件市场安装、升级与卸载。

- `MIGRATION.md` 与 `scripts/migrate-legacy-state.ps1`：安全迁移旧状态；项目根必须显式提供，目标冲突或活动视频任务会停止。
- `docs/BACKUP_AND_RECOVERY.md`：有效路径、精确备份范围、恢复和凭据矩阵。
- `docs/PRIVACY_AND_DATA.md`：数据边界、凭据清理和彻底卸载顺序。
- `SECURITY.md`：私密漏洞报告和泄露响应。
- `docs/RELEASE_CHECKLIST.md`：维护者发布门禁。

从源码构建时仍应阅读仓库根 README。无论从源码还是 ZIP 使用，都不要直接修改 Codex 的插件缓存，也不要把状态、项目或备份放入插件目录。
