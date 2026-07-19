import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version)) {
  throw new Error("用法：npm run set-version -- 0.11.0（只接受不含 +codex 缓存标记的基础版本）");
}

const jsonFiles = [
  "package.json",
  "plugins/image-control/package.json",
  "plugins/image-control/app/package.json",
  "plugins/image-control/server/package.json",
  "plugins/image-control/.codex-plugin/plugin.json",
];

for (const relativePath of jsonFiles) {
  const absolutePath = path.join(repoRoot, relativePath);
  const value = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  value.version = version;
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const lockFiles = [
  "plugins/image-control/app/package-lock.json",
  "plugins/image-control/server/package-lock.json",
];

for (const relativePath of lockFiles) {
  const absolutePath = path.join(repoRoot, relativePath);
  const value = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  value.version = version;
  if (!value.packages?.[""]) throw new Error(`锁文件缺少根包元数据：${relativePath}`);
  value.packages[""].version = version;
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

console.log(`版本已同步为 ${version}`);
