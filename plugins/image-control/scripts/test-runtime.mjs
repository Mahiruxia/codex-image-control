import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "image-control-runtime-assets-"));

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourceEntry = path.join(source, entry.name);
    const destinationEntry = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(sourceEntry, destinationEntry);
    else fs.copyFileSync(sourceEntry, destinationEntry);
  }
}

copyDirectory(path.join(pluginRoot, "app", "dist"), path.join(testRoot, "app", "dist"));
copyDirectory(path.join(pluginRoot, "templates"), path.join(testRoot, "templates"));

let result;
try {
  result = spawnSync(
    process.execPath,
    ["--test", "--test-force-exit", "--test-timeout=30000", "server/dist/mcp.test.js"],
    {
      cwd: pluginRoot,
      env: {
        ...process.env,
        IMAGE_CONTROL_MCP_ENTRY: path.join(pluginRoot, "runtime", "index.js"),
        IMAGE_CONTROL_MCP_ROOT: testRoot,
      },
      stdio: "inherit",
      timeout: 30_000,
    },
  );
} finally {
  fs.rmSync(testRoot, { recursive: true, force: true });
}

if (result.error) throw result.error;
process.exit(result.status ?? 1);
