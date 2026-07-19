# 给 Codex 的安全安装提示词

把下面整段文字发送给需要安装本插件的用户。对方只需在自己的 Codex 中粘贴并发送；Codex 会检查环境和现有插件来源，再通过固定的 GitHub 标签安装。

```text
请帮我把“图片生成中控 v0.11.1”安全安装为当前 Windows 电脑上的 Codex 插件/MCP App。正常入口必须是 Codex 内嵌工作台，不要打开浏览器版。

唯一允许的公开来源：
https://github.com/Mahiruxia/codex-image-control

固定版本标签：v0.11.1
插件：image-control@codex-image-control

请按以下顺序执行：

1. 先做只读检查：确认系统是 Windows 10/11 x64，Node.js 版本不低于 22，并确认 `codex plugin marketplace --help` 与 `codex plugin add --help` 可用。任一条件不满足就停止，并准确告诉我缺少什么。
2. 运行 `codex plugin marketplace list --json` 和 `codex plugin list --available --json` 检查现状。如果已存在名为 `codex-image-control` 的市场或同名 `image-control` 插件，但来源不是上面的 GitHub 仓库，请停止并向我说明冲突；不要自行删除、覆盖其他来源或清理我的项目数据。
3. 只使用固定仓库和固定标签登记 Git 市场：
   `codex plugin marketplace add Mahiruxia/codex-image-control --ref v0.11.1`
4. 安装插件：
   `codex plugin add image-control@codex-image-control`
5. 再运行 `codex plugin list --json`，确认 `image-control@codex-image-control` 的版本是 `0.11.1`，且 `installed` 和 `enabled` 都为 `true`。把实际版本、市场来源和验证结果告诉我。
6. 不要运行仓库中的开发脚本，不需要执行 `npm install`、重新构建或启动独立 HTTP/浏览器工作台。
7. 提醒我完全退出并重新打开 Codex，然后新建任务并发送“打开图片生成中控”。
8. 公开插件不包含维护者的视频 API、ComfyUI 工作流、账号或密钥。不要寻找、复制或配置维护者的私人视频服务；如果需要视频功能，只能由我自行提供自己的连接器、工作流和凭据。
```

如果对方更希望下载 Release ZIP，请改用 [安装说明](../INSTALL.md) 中的校验文件与本地市场安装流程。
