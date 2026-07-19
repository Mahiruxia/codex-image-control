# 作为 Codex 插件安装

图片生成中控通过 Codex 插件市场与 MCP App 运行。正常使用不需要打开浏览器，也不需要自行构建前端。

## 从 GitHub 仓库安装

安装最新公开版本：

```powershell
$pluginRepo = "Mahiruxia/codex-image-control"
codex plugin marketplace add $pluginRepo
codex plugin add image-control@codex-image-control
```

安装完成后重启 Codex 桌面应用或新建任务，然后说“打开图片生成中控”。工作台会以 Codex 内嵌插件界面打开。

如需固定安装某个正式版本，可在添加市场时指定标签：

```powershell
codex plugin marketplace add $pluginRepo --ref v0.11.1
codex plugin add image-control@codex-image-control
```

希望让 Codex 自动完成环境和来源检查时，直接复制 [给 Codex 的安全安装提示词](docs/CODEX_INSTALL_PROMPT.md)。

## 从 GitHub Release ZIP 安装

1. 下载 `image-control-版本-windows-x64.zip` 和对应的 `.sha256`，核对校验值。
2. 将 ZIP 解压到准备长期保留的稳定目录。
3. 进入解压得到的 `codex-image-control` 目录并执行：

```powershell
codex plugin marketplace add .
codex plugin add image-control@codex-image-control
```

Release ZIP 已包含 Windows x64 运行包，无需执行 `npm install` 或 `npm run build`。本地市场会引用解压目录，因此插件仍在使用时不要移动或删除该目录。

## 升级

GitHub 市场安装版：

```powershell
codex plugin marketplace upgrade codex-image-control
codex plugin add image-control@codex-image-control
```

Release ZIP 安装版应下载并解压新版本，再移除旧市场来源、从新目录重新添加并安装。升级完成后重启 Codex 或新建任务；项目、连接器配置和凭据位于插件目录之外，不会因覆盖插件缓存而迁移。

## 卸载

```powershell
codex plugin remove image-control@codex-image-control
codex plugin marketplace remove codex-image-control
```

这些命令只移除插件和市场登记。是否保留本机项目、视频连接器配置与凭据，请先按 `plugins/image-control/docs/PRIVACY_AND_DATA.md` 和 `plugins/image-control/docs/BACKUP_AND_RECOVERY.md` 的顺序处理。
