import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const excludedDirectories = new Set([".git", "node_modules", "runtime", "artifacts", "dist"]);
const textExtensions = new Set([".css", ".html", ".json", ".md", ".mjs", ".ps1", ".ts", ".tsx", ".txt", ".yaml", ".yml"]);
const extensionlessTextFiles = new Set(["LICENSE", "NOTICE", ".gitignore", ".gitattributes"]);
let updated = 0;

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath);
      continue;
    }
    if (!textExtensions.has(path.extname(entry.name).toLowerCase()) && !extensionlessTextFiles.has(entry.name)) continue;
    const original = fs.readFileSync(absolutePath, "utf8");
    const normalized = `${original.replaceAll("\r\n", "\n").split("\n").map((line) => line.trimEnd()).join("\n").trimEnd()}\n`;
    if (normalized !== original) {
      fs.writeFileSync(absolutePath, normalized, "utf8");
      updated += 1;
    }
  }
}

walk(repoRoot);
console.log(`Formatted ${updated} text files`);
