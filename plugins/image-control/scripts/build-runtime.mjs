import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverRoot = path.join(pluginRoot, "server");
const runtimeRoot = path.join(pluginRoot, "runtime");

if (path.basename(pluginRoot) !== "image-control" || path.basename(serverRoot) !== "server") {
  throw new Error(`拒绝清理无法确认的运行目录：${runtimeRoot}`);
}

fs.rmSync(runtimeRoot, { recursive: true, force: true });
fs.mkdirSync(runtimeRoot, { recursive: true });

const nccCli = path.join(serverRoot, "node_modules", "@vercel", "ncc", "dist", "ncc", "cli.js");
const result = spawnSync(
  process.execPath,
  [nccCli, "build", "dist/index.js", "-o", "../runtime", "--license", "licenses.txt", "-e", "sharp"],
  { cwd: serverRoot, stdio: "inherit" },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const runtimePackages = [
  "sharp",
  "@img/colour",
  "@img/sharp-win32-x64",
  "detect-libc",
  "semver",
];

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourceEntry = path.join(source, entry.name);
    const destinationEntry = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourceEntry, destinationEntry);
    } else if (entry.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(sourceEntry), destinationEntry, "file");
    } else {
      fs.copyFileSync(sourceEntry, destinationEntry);
    }
  }
}

for (const packageName of runtimePackages) {
  const segments = packageName.split("/");
  const source = path.join(serverRoot, "node_modules", ...segments);
  const destination = path.join(runtimeRoot, "node_modules", ...segments);
  if (!fs.existsSync(source)) throw new Error(`缺少 Windows 运行依赖：${packageName}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  copyDirectory(source, destination);
}

console.log("Windows x64 自包含运行包已生成");
