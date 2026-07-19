# 发布检查清单

每个正式 GitHub Release 都应从干净的仓库工作区和纯基础版本生成。不要手工压缩 plugins/image-control，也不要覆盖已发布资产。

## 版本与范围

- [ ] CHANGELOG.md 已包含当前版本和日期。
- [ ] npm run set-version 已同步根项目、插件、前端、服务端与两个锁文件。
- [ ] npm run cache-reset 已移除本地 +codex. 缓存标记。
- [ ] 发布标签严格为 v加清单版本，且指向待发布提交。
- [ ] app/dist 与 runtime 已由当前源码重新构建并纳入审查。

## 隐私与安全

- [ ] 公开版没有维护者视频端点、工作流、账号、密钥、Cookie、签名 URL、内网地址或用户素材。
- [ ] data/local、data/projects、.runtime、.codex_tmp、日志和浏览器资料没有进入 Git。
- [ ] 迁移脚本只允许最终 provider profile、被引用的工作流和必要 settings；setup、迁移备份、临时文件与媒体均被排除。
- [ ] 迁移脚本拒绝 `-Merge`、已有目标、活动视频请求、reparse/symlink、共享路径、宽泛根目录、源码/插件缓存及危险路径重叠。
- [ ] 迁移演练确认 staging 与目标 SHA-256 一致、原子切换成功、环境变量最后更新，并能用记录目录中的脚本安全回滚。
- [ ] 测试敏感值由无害片段在运行时构造，并继续验证失败关闭与不回显。
- [ ] 已人工检查 Git 历史、差异、Issue、PR、Actions 日志、截图、录屏和待上传资产。
- [ ] npm run audit:dependencies 没有达到 high 或 critical 的漏洞。
- [ ] CodeQL 和依赖评审通过，或已对例外形成公开且可追踪的风险决定。

## 许可证与供应链

- [ ] 根 LICENSE 与插件 LICENSE 是项目的 Apache-2.0 正文。
- [ ] app/LICENSE 和 app/NOTICE 保留 TwitCanva 原始内容。
- [ ] 根目录与插件内 THIRD_PARTY_NOTICES.md 完全一致且描述当前实现。
- [ ] SBOM 和第三方组件清单版本正确、非空，并与锁文件一致。

## 构建与验收

从仓库根目录运行：

~~~powershell
npm run install:all
npm run package:windows
~~~

- [ ] 服务端、前端、技能、插件与发布脚本测试全部通过。
- [ ] 源码扫描和解包后二次扫描通过；原生依赖若只有供应商编译路径提示，已人工确认不含维护者信息。
- [ ] 两次相同输入生成的 ZIP SHA-256 完全一致。
- [ ] 归档通过路径穿越、大小、压缩比、重复路径、大小写冲突和符号链接检查。
- [ ] 解包后的 MCP 冒烟测试通过。
- [ ] ZIP 内含项目 LICENSE、上游 LICENSE/NOTICE、SBOM、组件清单、第三方说明，以及可离线阅读的迁移、备份、隐私、卸载、安全和发布说明。
- [ ] ZIP 内 `open-workbench.ps1` 保留 UTF-8 BOM，并通过 Windows PowerShell 5.1 与当前 PowerShell 的静态解析；测试没有真的打开浏览器。
- [ ] 在干净的 Windows 用户环境中安装候选包，确认没有旧缓存或旧状态时不会出现维护者连接器。
- [ ] 使用测试连接器验证成功路径；移除凭据后验证任务失败关闭。

## 升级、恢复与卸载

- [ ] 用默认嵌套项目根完成一次备份和空目录恢复，确认删除状态根前不会遗漏项目。
- [ ] 用独立外部 StateRoot 与 ProjectsRoot 完成升级、重启和回滚演练，确认所有有效路径均被显示并保持分离。
- [ ] 同 ID、不同安全范围的 profile 冲突会停止或要求重录，不会复用旧凭据。
- [ ] 无 scope 的 legacy credential 不会在只读列出或迁移时自动绑定；必须通过本机 UI 重录。
- [ ] 相同 scope 的已有 scoped credential、范围变化、新 Windows 用户三种恢复路径均符合备份文档中的矩阵。
- [ ] generic 视频任务从提交到下载使用同一内存凭据快照；轮换只影响新任务与崩溃恢复，立即失效依赖远端撤销。
- [ ] 普通卸载保留外部数据；彻底清理先成功执行“彻底清除本插件保存的全部密钥”，再隔离数据目录并清除用户环境变量。
- [ ] 删除 profile 后遗留的 scoped credential 也能由全部密钥清理入口枚举并移除。

## GitHub 发布

- [ ] artifacts 中只有当前版本的四个正式资产：ZIP、SHA-256、SBOM 和组件清单。
- [ ] 本地校验 ZIP 的 SHA-256 与校验文件一致。
- [ ] 推送标签后等待固定 SHA 的 release 工作流完成来源证明和上传。
- [ ] 工作流若发现同名 Release 已存在，应停止并增加版本修复，不能使用覆盖参数。
- [ ] 发布后从 GitHub 下载一次资产，复核哈希并在干净目录解压检查。
