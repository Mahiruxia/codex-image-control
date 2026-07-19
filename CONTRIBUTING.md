# Contributing

感谢参与图片生成中控的维护。本仓库同时保存源码和可安装载荷，plugins/image-control/ 是唯一实现来源。

## 开发环境

- Windows 10/11 x64。
- Node.js 22；新版本 Node.js 可用于本地辅助检查，但合并前必须在 Node.js 22 的 CI 上通过。
- 使用视频功能或相关测试时，系统 PATH 中需要 ffmpeg 与 ffprobe。

安装锁定依赖：

~~~powershell
npm run install:all
~~~

两个工作区必须继续使用 npm ci 与已提交的 package-lock.json。不要提交 node_modules。

## 变更流程

1. 从 main 创建短生命周期分支。
2. 修改源码、测试、技能或模板。
3. 服务端协议或持久化格式变化必须同步测试与迁移说明；多个 React 组件变化需要做浏览器验证。
4. 更新用户可见文档和 CHANGELOG.md。
5. 运行 npm run verify。
6. 在拉取请求中说明变化、威胁边界、验证结果、数据兼容性和许可证影响。

app/dist/ 与 runtime/ 是版本化发布产物。源码变化后必须重新构建并提交对应更新；CI 会执行 git diff --exit-code 检查遗漏。

## 隐私测试夹具

仓库、测试和文档只能使用 example.com、占位符与人工构造的数据。不得粘贴真实端点、内网地址、签名 URL、令牌、工作流、Windows 用户路径、项目图片或视频。

需要测试扫描或清洗逻辑时，在测试运行期间由多个无害字符串片段拼装模拟值，避免源码本身看起来像可用凭据。测试仍必须验证拒绝、清洗、失败关闭和不回显敏感值，不能通过弱化扫描规则来“修复”测试。

提交前运行：

~~~powershell
npm run test:release-scripts
npm run scan:release
npm run audit:dependencies
~~~

## 技能与插件结构

- skills/image-control-workbench/ 只放 Codex 执行工作所需的 SKILL.md、agents/ 和直接引用资料。
- 用户安装、迁移、备份和发布文档保留在仓库根目录与 docs/。
- 修改技能后运行系统 skill-creator 的 quick_validate.py。
- 修改插件结构后运行系统 plugin-creator 的 validate_plugin.py。

## 许可证与第三方代码

新贡献默认按根 LICENSE 的 Apache-2.0 发布。复制或改造第三方代码前必须确认许可证兼容，保留所需的版权、LICENSE 和 NOTICE，并更新 THIRD_PARTY_NOTICES.md。根目录和插件内的第三方说明必须同步。

plugins/image-control/app/LICENSE 与 app/NOTICE 是 TwitCanva 上游文件，必须原样保留；不能用项目自己的根 LICENSE 覆盖。正式发布包同时携带上游文件和机器生成的依赖清单。

## 版本与发布

- npm run set-version -- 版本 会同步根项目、插件、前端、服务端与两个锁文件。
- npm run cache-bust 仅用于同一基础版本的本地重新安装，只修改 plugin.json。
- 正式发布前执行 npm run cache-reset；package:windows 会拒绝 +codex. 后缀。
- 更新 CHANGELOG.md 并完成 [发布检查清单](docs/RELEASE_CHECKLIST.md)。
- npm run package:windows 会生成 ZIP、SHA-256、SBOM 和第三方组件清单。
- 不手工覆盖已发布的 GitHub Release；发现问题应修复后发布新版本。

不要提交 data/、.runtime/、.codex_tmp/、artifacts/、真实素材、浏览器资料、凭据、私有接口或开发者电脑绝对路径。长期数据始终位于插件安装目录之外。
