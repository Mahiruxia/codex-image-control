import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(repoRoot, "plugins", "image-control");
const errors = [];
const baseVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const manifestVersionPattern = /^(\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)(?:\+codex\.([0-9A-Za-z-]{1,64}))?$/;

const requiredFiles = [
  ".agents/plugins/marketplace.json",
  ".github/dependabot.yml",
  ".github/codeql-config.yml",
  ".github/workflows/ci.yml",
  ".github/workflows/codeql.yml",
  ".github/workflows/release.yml",
  ".node-version",
  "AGENTS.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "INSTALL.md",
  "LICENSE",
  "MIGRATION.md",
  "README.md",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
  "docs/BACKUP_AND_RECOVERY.md",
  "docs/CODEX_INSTALL_PROMPT.md",
  "docs/PRIVACY_AND_DATA.md",
  "docs/RELEASE_CHECKLIST.md",
  "plugins/image-control/.codex-plugin/plugin.json",
  "plugins/image-control/.mcp.json",
  "plugins/image-control/LICENSE",
  "plugins/image-control/README.md",
  "plugins/image-control/THIRD_PARTY_NOTICES.md",
  "plugins/image-control/app/LICENSE",
  "plugins/image-control/app/NOTICE",
  "plugins/image-control/app/dist/index.html",
  "plugins/image-control/runtime/index.js",
  "plugins/image-control/skills/image-control-workbench/SKILL.md",
  "plugins/image-control/templates/通用生成基线/prompt-baseline.md",
  "scripts/generate-supply-chain.mjs",
  "scripts/migrate-legacy-state.ps1",
  "scripts/package-release.ps1",
  "scripts/release-scripts.test.mjs",
  "scripts/scan-release.mjs",
  "scripts/set-cachebuster.mjs",
  "scripts/test-release-package.ps1",
];

for (const relativePath of requiredFiles) {
  if (!fs.existsSync(path.join(repoRoot, relativePath))) errors.push("缺少发布文件：" + relativePath);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

const rootPackage = readJson("package.json");
const pluginPackage = readJson("plugins/image-control/package.json");
const appPackage = readJson("plugins/image-control/app/package.json");
const serverPackage = readJson("plugins/image-control/server/package.json");
const appLock = readJson("plugins/image-control/app/package-lock.json");
const serverLock = readJson("plugins/image-control/server/package-lock.json");
const manifest = readJson("plugins/image-control/.codex-plugin/plugin.json");
const marketplace = readJson(".agents/plugins/marketplace.json");
const mcp = readJson("plugins/image-control/.mcp.json");

const manifestMatch = manifestVersionPattern.exec(manifest.version);
const baseVersion = manifestMatch?.[1];
if (!manifestMatch) {
  errors.push("插件版本无效；仅允许基础语义化版本或单个 +codex.<cachebuster>：" + manifest.version);
}

const versionSources = [
  ["根 package.json", rootPackage.version],
  ["插件工作区 package.json", pluginPackage.version],
  ["前端 package.json", appPackage.version],
  ["服务端 package.json", serverPackage.version],
  ["前端 package-lock.json", appLock.version],
  ["前端锁文件根包", appLock.packages?.[""]?.version],
  ["服务端 package-lock.json", serverLock.version],
  ["服务端锁文件根包", serverLock.packages?.[""]?.version],
];
for (const [label, value] of versionSources) {
  if (!baseVersionPattern.test(String(value ?? ""))) errors.push(label + " 不是纯基础语义化版本：" + value);
  if (baseVersion && value !== baseVersion) errors.push(label + " " + value + " 与插件基础版本 " + baseVersion + " 不一致");
}
if (baseVersion && !readText("CHANGELOG.md").includes("## " + baseVersion + " - ")) {
  errors.push("CHANGELOG.md 缺少当前基础版本 " + baseVersion + " 的发布记录");
}
if (baseVersion) {
  const releaseNotesPath = `.github/releases/v${baseVersion}.md`;
  if (!fs.existsSync(path.join(repoRoot, releaseNotesPath))) {
    errors.push("缺少当前版本的人工审核发布说明：" + releaseNotesPath);
  } else {
    const releaseNotes = readText(releaseNotesPath);
    for (const requiredFragment of [
      `Mahiruxia/codex-image-control --ref v${baseVersion}`,
      "codex plugin add image-control@codex-image-control",
      "不包含维护者的视频 API",
      "复制给 Codex",
    ]) {
      if (!releaseNotes.includes(requiredFragment)) errors.push("发布说明缺少必要内容：" + requiredFragment);
    }
  }
  const installPrompt = readText("docs/CODEX_INSTALL_PROMPT.md");
  for (const requiredFragment of [
    `Mahiruxia/codex-image-control --ref v${baseVersion}`,
    "codex plugin list --json",
    "不要打开浏览器版",
    "不包含维护者的视频 API",
  ]) {
    if (!installPrompt.includes(requiredFragment)) errors.push("Codex 安装提示词缺少必要内容：" + requiredFragment);
  }
}

for (const [label, value] of [
  ["根项目", rootPackage],
  ["插件工作区", pluginPackage],
  ["前端", appPackage],
  ["服务端", serverPackage],
]) {
  if (value.engines?.node !== ">=22") errors.push(label + " 必须声明 Node.js >=22");
}
for (const [label, value] of [["根项目", rootPackage], ["插件工作区", pluginPackage], ["服务端", serverPackage]]) {
  if (!value.os?.includes("win32") || !value.cpu?.includes("x64")) errors.push(label + " 必须声明 Windows x64 平台");
}
if (readText(".node-version").trim() !== "22") errors.push(".node-version 必须锁定 Node.js 22");

if (manifest.name !== "image-control" || path.basename(pluginRoot) !== manifest.name) {
  errors.push("插件目录名与 plugin.json name 不一致");
}
if ([manifest.license, rootPackage.license, pluginPackage.license, appPackage.license, serverPackage.license].some((value) => value !== "Apache-2.0")) {
  errors.push("根项目、插件、前端与服务端必须统一声明 Apache-2.0");
}
if (manifest.mcpServers !== "./.mcp.json" || manifest.skills !== "./skills/") {
  errors.push("插件清单没有使用标准的相对组件路径");
}
if (!String(manifest.interface?.longDescription ?? "").includes("不内置维护者的视频地址、工作流或凭据")) {
  errors.push("插件清单必须明确公开版本不内置维护者视频服务");
}

const marketplaceEntry = marketplace.plugins?.find((item) => item.name === manifest.name);
if (marketplaceEntry?.source?.path !== "./plugins/image-control") {
  errors.push("市场清单没有指向 ./plugins/image-control");
}
const server = mcp.mcpServers?.["image-control"];
if (!server || server.command !== "node" || server.cwd !== "." || server.args?.[0] !== "runtime/index.js" || !server.args?.includes("--stdio")) {
  errors.push("MCP 配置不是从插件根目录便携启动 runtime/index.js --stdio");
}
const forwardedEnvironment = new Set(server?.env_vars ?? []);
for (const variable of ["IMAGE_CONTROL_STATE_ROOT", "IMAGE_CONTROL_PROJECTS_ROOT"]) {
  if (!forwardedEnvironment.has(variable)) errors.push("MCP 配置没有转发长期目录变量：" + variable);
}

const rootLicense = readText("LICENSE");
const pluginLicense = readText("plugins/image-control/LICENSE");
const upstreamLicense = readText("plugins/image-control/app/LICENSE");
const upstreamNotice = readText("plugins/image-control/app/NOTICE");
if (!rootLicense.includes("Apache License") || rootLicense.includes("SankaiAI")) {
  errors.push("根 LICENSE 必须是无第三方署名污染的 Apache-2.0 正文");
}
if (pluginLicense !== rootLicense) errors.push("插件 LICENSE 必须与根 LICENSE 完全一致");
if (!upstreamLicense.includes("SankaiAI") || !upstreamNotice.includes("SankaiAI") || !upstreamNotice.includes("Commercial Usage Notification")) {
  errors.push("TwitCanva 原始 LICENSE 与 NOTICE 必须原样保留在 app/");
}

const rootNotices = readText("THIRD_PARTY_NOTICES.md");
const pluginNotices = readText("plugins/image-control/THIRD_PARTY_NOTICES.md");
if (rootNotices !== pluginNotices) errors.push("根目录与插件内 THIRD_PARTY_NOTICES.md 必须保持一致");
if (!rootNotices.includes("pluggable video connectors") || !rootNotices.includes("not the upstream backend")) {
  errors.push("第三方说明必须准确区分重写的视频连接器与上游后端");
}
if (/image-only Codex workbench|Video, audio, social publishing,[^\n]+were removed/i.test(rootNotices)) {
  errors.push("第三方说明仍包含已过时的“已移除视频能力”表述");
}

const requiredScripts = [
  "audit:dependencies",
  "cache-bust",
  "cache-reset",
  "package:windows",
  "scan:release",
  "supply-chain",
  "supply-chain:check",
  "test:release-scripts",
  "verify",
];
for (const scriptName of requiredScripts) {
  if (!rootPackage.scripts?.[scriptName]) errors.push("根 package.json 缺少脚本：" + scriptName);
}

const excludedNames = new Set([".git", "node_modules", "artifacts", ".runtime", ".codex_tmp"]);
const excludedRelativePrefixes = [
  "plugins/image-control/app/dist/",
  "plugins/image-control/data/projects/",
  "plugins/image-control/data/local/",
  "plugins/image-control/runtime/",
  "plugins/image-control/server/dist/",
];
const textExtensions = new Set([".json", ".md", ".mjs", ".js", ".ts", ".tsx", ".ps1", ".cmd", ".yml", ".yaml", ".toml", ".txt"]);

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (excludedNames.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(repoRoot, absolutePath).replaceAll("\\", "/");
    if (excludedRelativePrefixes.some((prefix) => relativePath.startsWith(prefix))) continue;
    if (entry.isDirectory()) {
      walk(absolutePath);
      continue;
    }
    if (!textExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const content = fs.readFileSync(absolutePath, "utf8");
    if (/\[(?:TODO):[^\]]+\]/.test(content)) errors.push("发现未完成占位符：" + relativePath);
  }
}

walk(repoRoot);

if (errors.length) {
  console.error(errors.map((error) => "- " + error).join("\n"));
  process.exit(1);
}

console.log("发布检查通过：image-control " + manifest.version + "（基础版本 " + baseVersion + "）");
