import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const baseVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const manifestVersionPattern = /^(\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)(?:\+codex\.([0-9A-Za-z-]{1,64}))?$/;

export function cacheBustedVersion(baseVersion, currentManifestVersion, token) {
  if (!baseVersionPattern.test(baseVersion)) throw new Error("根版本必须是纯语义化版本");
  const match = manifestVersionPattern.exec(currentManifestVersion);
  if (!match || match[1] !== baseVersion) throw new Error("插件清单基础版本与根版本不一致");
  if (token === "--clear") return baseVersion;
  if (!/^[0-9A-Za-z-]{1,64}$/.test(token)) throw new Error("缓存标记只允许 1–64 位字母、数字或连字符");
  return baseVersion + "+codex." + token;
}

function main(argv) {
  const rootPackagePath = path.join(repoRoot, "package.json");
  const manifestPath = path.join(repoRoot, "plugins", "image-control", ".codex-plugin", "plugin.json");
  const pluginRoot = path.dirname(path.dirname(manifestPath));
  const requiredPayload = [
    ".mcp.json",
    "app/dist/index.html",
    "runtime/index.js",
  ];
  for (const relativePath of requiredPayload) {
    const absolutePath = path.join(pluginRoot, ...relativePath.split("/"));
    let valid = false;
    try { valid = fs.statSync(absolutePath).isFile() && fs.statSync(absolutePath).size > 0; } catch { /* Report one stable error below. */ }
    if (!valid) throw new Error(`插件安装载荷缺少 ${relativePath}；请先运行 npm run build`);
  }
  const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const token = argv[0] ?? Date.now().toString(36);
  if (argv.length > 1) throw new Error("用法：npm run cache-bust -- [标记]，或 npm run cache-reset");
  manifest.version = cacheBustedVersion(rootPackage.version, manifest.version, token);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  process.stdout.write("插件清单版本已更新为 " + manifest.version + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  }
}
