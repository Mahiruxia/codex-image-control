# 从旧项目迁移

迁移后的程序维护源只有本仓库。插件程序、本机私有状态、项目素材和系统凭据必须继续分层保存，不能把外部数据重新放回源码仓库或 Codex 插件缓存。

## 迁移后的目录

| 内容 | 默认或指定位置 | 生命周期 |
| --- | --- | --- |
| 插件程序与模板 | Codex 安装缓存中的当前版本 | 安装或升级时可替换 |
| 本机私有配置 | `%LOCALAPPDATA%\CodexImageControl\data\local` | 跨插件版本保留 |
| 临时运行状态 | `%LOCALAPPDATA%\CodexImageControl\.runtime` | 可重建，不迁移、不备份 |
| 用户项目与素材 | `<有效状态根>\data\projects`，或显式的 `IMAGE_CONTROL_PROJECTS_ROOT` | 单独备份和维护 |
| API 密钥与密码 | Windows 凭据库 | 不进入文件迁移或备份 |

“有效状态根”是用户级 `IMAGE_CONTROL_STATE_ROOT` 的值；未设置时为 `%LOCALAPPDATA%\CodexImageControl`。“有效项目根”是用户级 `IMAGE_CONTROL_PROJECTS_ROOT` 的值；未设置时为 `<有效状态根>\data\projects`。

## 迁移前准备

1. 在旧版本中等待所有视频任务完成或明确取消。迁移脚本会检查项目 JSON；只要存在 `queued`、`uploading`、`submitting`、`running`、`downloading` 或 `waiting_remote` 请求就会停止，不会让新版在重启后自动续跑付费任务。
2. 完全退出 Codex 和独立工作台，确认旧进程不再写入状态或项目文件。
3. 按 [备份与恢复](docs/BACKUP_AND_RECOVERY.md) 分别备份项目和最终连接器配置，并核对文件数量、总大小和 SHA-256。
4. 预先确定一个**已经存在**的项目根目录。它必须位于旧仓库、新仓库、插件缓存和状态私有目录之外，也不能是磁盘根、用户主目录、桌面或文档目录本身。

`ProjectsRoot` 是强制参数，脚本不会猜测或沿用一个未确认的旧值。如果现有项目仍位于 `<旧仓库>\data\projects`，先把它们单独迁移到专用素材目录，核对项目 JSON、代表性图片和视频以及备份哈希，再把该目录传给脚本。脚本本身不会复制项目素材，因此旧仓库才能真正只作为短期回退副本，而不是继续承担日常数据写入。

所有迁移根目录必须是本机普通目录。脚本逐级拒绝符号链接、目录联接、挂载点和其他重解析点，也拒绝 UNC/共享目录、Codex 插件目录、源码目录以及互相重叠的路径。唯一允许的嵌套是 `ProjectsRoot` **恰好等于** `<StateRoot>\data\projects`。

## 执行一次性迁移

在新仓库根目录运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\migrate-legacy-state.ps1 `
  -LegacyRoot "<旧项目根目录>" `
  -ProjectsRoot "<已确认的独立项目素材目录>"
```

如需使用非默认状态根，显式增加：

```powershell
  -StateRoot "<新的本机状态目录>"
```

只想先验证文件迁移、不修改用户级环境变量时增加 `-SkipEnvironment`。脚本不修改当前 PowerShell 进程中的环境；正式设置成功后仍需完全重启 Codex。

旧版 `-Merge` 已被禁用。目标 `<StateRoot>\data\local` 只要已经存在，脚本就会停止；不得用递归覆盖把旧 profile、工作流或默认设置压到新版状态上。同名连接器冲突应在应用中逐项审核和重建。

## 脚本实际复制的内容

迁移使用严格允许列表，只复制：

- `data/local/video-providers/settings.json`；
- 每个合法连接器目录中的 `profile.json`；
- `comfyui-workflow` profile 明确引用、且通过 JSON 校验的工作流文件。

以下内容始终排除：

- `.runtime` 队列、进程锁和临时文件；
- `data/local/video-provider-setups` 中未完成的接入请求、草稿和上传文件；
- `data/local/backups` 中的项目迁移副本；
- 任何不在允许列表内的测试文件、备份、日志、临时文件或媒体；
- 项目目录和素材副本。

复制先进入目标磁盘上的唯一 staging 目录。脚本逐文件比较长度与 SHA-256，并确认 staging 没有额外文件，再用同目录原子重命名让 `data\local` 生效。所有文件和项目队列检查完成后，脚本才更新用户级 `IMAGE_CONTROL_STATE_ROOT` 与 `IMAGE_CONTROL_PROJECTS_ROOT`。

成功后会在 `<StateRoot>\data\migration-records\<迁移编号>\` 保存：

- `migration-record.json`：旧值、新值、复制清单、哈希与排除清单；
- `rollback.ps1`：将迁移后的 `data\local` 隔离保存，并在环境变量仍等于本次新值时恢复迁移前的用户级环境变量。

运行回滚前同样必须关闭 Codex 和工作台。回滚不会销毁迁移后的文件，而是把它们移动到记录目录中的 `rolled-back-local`。旧来源在完整验收前不得删除。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<记录目录>\rollback.ps1"
```

## 私有 profile 与凭据

文件迁移不会导出或复制 Windows 凭据库中的密码，但“没有复制密码”不等于同机一定没有可用凭据：

| 场景 | 凭据行为 |
| --- | --- |
| 同一电脑、同一 Windows 用户、相同 profile ID 和安全范围，且已有 scoped credential | 可能继续找到原有 scoped credential；测试前仍应核对端点和认证范围 |
| 无安全范围指纹的旧 profile 或无 scope 的 legacy credential | 不会自动绑定或迁移；保存规范化 profile 后只通过连接器界面重新录入 |
| 端点、认证方式、状态来源或下载认证范围改变 | 旧凭据必须失效，并只通过连接器界面重新录入 |
| 新电脑或新 Windows 用户 | 必须只通过连接器界面重新录入 |

不要手工向 Windows 凭据库构造内部账户名。启动连接测试或视频任务前，先人工核对 profile、工作流哈希、提交地址、状态地址和下载来源；来源不再可信时，先在服务端撤销或轮换旧密钥。

## 切换和验收

1. 在本仓库运行 `npm run verify`。
2. 将本仓库注册为本地 marketplace，并安装 `image-control@codex-image-control`。
3. 禁用或卸载旧来源的同名插件，确保只有一个版本使用端口和工具名。
4. 完全重启 Codex，新建任务核对项目数量与名称。
5. 随机打开每个项目的输入素材、正式图片和视频。
6. 逐个检查连接器端点、工作流哈希和 `hasCredential` 状态；先做免费连接探测，不直接批量提交任务。
7. 完成一次备份与恢复演练后，再决定是否删除旧程序目录。

删除旧目录前再次确认当前 `ProjectsRoot` 不在旧目录内。以后所有版本升级、发布包、Git 标签和维护任务都只从本仓库产生，不从 Codex 插件缓存反向修改代码。
