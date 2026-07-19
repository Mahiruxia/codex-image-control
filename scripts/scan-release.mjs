import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const TEXT_EXTENSIONS = new Set([
  ".cjs", ".cmd", ".css", ".html", ".js", ".json", ".jsx", ".lock", ".md", ".mjs",
  ".ps1", ".sh", ".svg", ".toml", ".ts", ".tsx", ".txt", ".xml", ".yaml", ".yml",
]);
const TEXT_NAMES = new Set(["LICENSE", "NOTICE", ".gitattributes", ".gitignore", ".node-version"]);
const USER_MEDIA_EXTENSIONS = new Set([
  ".avi", ".bmp", ".gif", ".jpeg", ".jpg", ".m4a", ".mkv", ".mov", ".mp3", ".mp4",
  ".png", ".tif", ".tiff", ".wav", ".webm", ".webp",
]);
const SOURCE_SKIP_PREFIXES = [
  ".git/",
  "artifacts/",
  "plugins/image-control/app/node_modules/",
  "plugins/image-control/server/dist/",
  "plugins/image-control/server/node_modules/",
];
const SAFE_ENTROPY_KEYS = new Set([
  "bom-ref", "checksum", "commit", "hash", "integrity", "purl", "resolved", "sha", "source",
]);
const SENSITIVE_QUERY_KEYS = new Set([
  "access_token", "api-key", "apikey", "api_key", "auth", "authorization", "client_secret", "cookie",
  "key", "password", "refresh_token", "secret", "sig", "signature", "token", "x-api-key", "x_amz_signature",
]);

function toRelative(root, absolutePath) {
  const value = path.relative(root, absolutePath).replaceAll("\\", "/");
  return value || ".";
}

function lineNumber(content, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) if (content.charCodeAt(cursor) === 10) line += 1;
  return line;
}

function entropy(value) {
  if (!value) return 0;
  const counts = new Map();
  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
  let result = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    result -= probability * Math.log2(probability);
  }
  return result;
}

function looksLikePlaceholder(value) {
  const normalized = value.trim().replace(/^['"]|['"]$/g, "");
  if (!normalized) return true;
  if (/^(?:x{3,}|\*{3,}|\.{3}|none|null|undefined)$/i.test(normalized)) return true;
  if (/^(?:your|example|sample|placeholder|redacted|dummy|fake|test|change[-_]?me)(?:[-_ ]?[a-z0-9_-]+)*$/i.test(normalized)) return true;
  if (/^(?:\$\{[^{}]+\}|\{\{[^{}]+\}\}|<[^<>]+>|\[[A-Z0-9 _-]+\]|%[A-Z0-9_]+%)$/i.test(normalized)) return true;
  if (/^(?:process\.)?env[.:][A-Z0-9_]+$/i.test(normalized)) return true;
  return false;
}

function characterClassCount(value) {
  return [/[a-z]/.test(value), /[A-Z]/.test(value), /[0-9]/.test(value), /[^A-Za-z0-9]/.test(value)]
    .filter(Boolean).length;
}

function ipv4Parts(hostname) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return undefined;
  const parts = hostname.split(".").map(Number);
  return parts.every((part) => part >= 0 && part <= 255) ? parts : undefined;
}

function isPrivateNetworkHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
  if (/^(?:.+\.)?(?:local|internal|intranet|lan|corp|home)$/.test(host)) return true;
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;
  const parts = ipv4Parts(host);
  if (parts) {
    const [first, second, third] = parts;
    return first === 0
      || first === 10
      || first === 127
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
      || (first === 192 && second === 0 && [0, 2].includes(third))
      || (first === 169 && second === 254)
      || (first === 100 && second >= 64 && second <= 127)
      || (first === 198 && [18, 19].includes(second))
      || (first === 198 && second === 51 && third === 100)
      || (first === 203 && second === 0 && third === 113)
      || first >= 224;
  }
  return !host.includes(".");
}

function safeUrlValue(value) {
  return looksLikePlaceholder(value) || /^(?:example|sample|test|dummy|redacted)/i.test(value);
}

function asciiStrings(buffer) {
  return [...buffer.toString("latin1").matchAll(/[\x20-\x7e]{8,}/g)].map((match) => match[0]).join("\n");
}

function isTextFile(filePath, buffer) {
  const extension = path.extname(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(extension) || TEXT_NAMES.has(path.basename(filePath))) return true;
  return !buffer.subarray(0, Math.min(buffer.length, 8192)).includes(0);
}

function isVendoredNative(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  return relativePath.replaceAll("\\", "/").includes("runtime/") && (extension === ".dll" || extension === ".node");
}

function shouldSkipSource(relativePath) {
  const normalized = `${relativePath.replaceAll("\\", "/").replace(/^\.\//, "")}/`;
  return SOURCE_SKIP_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function forbiddenPathRule(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  const segments = normalized.split("/").map((segment) => segment.toLowerCase());
  for (let index = 0; index < segments.length; index += 1) {
    if (segments[index] === ".runtime" || segments[index] === ".codex_tmp" || segments[index] === "media") return "forbidden-local-path";
    if (segments[index] === "data" && ["local", "projects"].includes(segments[index + 1])) return "forbidden-local-path";
  }
  const baseName = path.basename(normalized).toLowerCase();
  if (baseName === ".env" || (baseName.startsWith(".env.") && baseName !== ".env.example")) return "environment-file";
  if (/^(?:credentials?|cookies?|secrets?)(?:\.[^.]+)?$/i.test(baseName)) return "credential-file";
  if (USER_MEDIA_EXTENSIONS.has(path.extname(baseName))) return "user-media-file";
  return undefined;
}

function workflowFingerprint(content, relativePath) {
  if (path.extname(relativePath).toLowerCase() !== ".json") return false;
  try {
    const value = JSON.parse(content);
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (Array.isArray(value.nodes) && Array.isArray(value.links) && ("last_node_id" in value || value.nodes.length >= 3)) return true;
    const prompt = value.prompt && typeof value.prompt === "object" && !Array.isArray(value.prompt) ? value.prompt : value;
    const nodes = Object.values(prompt).filter((node) => node && typeof node === "object" && !Array.isArray(node));
    return nodes.filter((node) => typeof node.class_type === "string" && node.inputs && typeof node.inputs === "object").length >= 3;
  } catch {
    return false;
  }
}

function embeddedWorkflowFingerprint(content) {
  const classTypes = content.match(/["']class_type["']\s*:/g)?.length ?? 0;
  const inputBlocks = content.match(/["']inputs["']\s*:/g)?.length ?? 0;
  return classTypes >= 5 && inputBlocks >= 5;
}

function scanContent(content, relativePath, binary, add) {
  function absolutePathSeverity(index) {
    if (!binary || !isVendoredNative(relativePath)) return "error";
    const sample = content.slice(index, index + 300);
    const knownVendorBuildPath =
      /^[A-Za-z]:[\\/]Windows[\\/]/i.test(sample)
      || /^[A-Za-z]:[\\/]a[\\/]/i.test(sample)
      || /^[A-Za-z]:[\\/]Users[\\/][^\\/\r\n]+[\\/]\.(?:cargo|rustup|nuget)[\\/]/i.test(sample)
      || /^\/(?:github\/workspace|home\/runner)\//i.test(sample);
    return knownVendorBuildPath ? "warning" : "error";
  }
  const absolutePatterns = [
    new RegExp("\\b[A-Za-z]:[\\\\/][^\\\\/\\r\\n\\\"'<>:|?*]{1,100}[\\\\/]", "g"),
    new RegExp("\\\\\\\\[A-Za-z0-9._$\\u0080-\\uFFFF-]{2,100}\\\\[A-Za-z0-9._$ \\u0080-\\uFFFF-]{2,100}(?:\\\\|$)", "g"),
    new RegExp("(?:^|[\\s\\\"'=(:,])/(?:Users|home|root)/[^/\\s\\\"'<>]+(?:/|$)", "gm"),
  ];
  for (const pattern of absolutePatterns) {
    const match = pattern.exec(content);
    if (match) add("absolute-path", relativePath, lineNumber(content, match.index), absolutePathSeverity(match.index));
  }

  const privateKeyPattern = new RegExp(["-{5}BEGIN\\s+(?:RSA\\s+|EC\\s+|OPENSSH\\s+)?PRIVATE", "\\s+KEY-{5}"].join(""), "i");
  const privateKeyMatch = privateKeyPattern.exec(content);
  if (privateKeyMatch) add("private-key", relativePath, lineNumber(content, privateKeyMatch.index));

  const knownSecretPatterns = [
    new RegExp(`\\b${["gh", "p_"].join("")}[A-Za-z0-9]{30,}\\b`, "g"),
    new RegExp(`\\b${["github", "_pat_"].join("")}[A-Za-z0-9_]{30,}\\b`, "g"),
    new RegExp(`\\b${["sk", "-"].join("")}[A-Za-z0-9_-]{20,}\\b`, "g"),
    new RegExp(`\\b${["xox", "b-"].join("")}[A-Za-z0-9-]{20,}\\b`, "g"),
    new RegExp(`\\b${["AK", "IA"].join("")}[0-9A-Z]{16}\\b`, "g"),
    new RegExp(`\\b${["AI", "za"].join("")}[0-9A-Za-z_-]{30,}\\b`, "g"),
    new RegExp("\\beyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{8,}\\b", "g"),
  ];
  for (const pattern of knownSecretPatterns) {
    const match = pattern.exec(content);
    if (match) add("known-secret-format", relativePath, lineNumber(content, match.index));
  }

  const bearerPattern = /\b(?:bearer|basic)\s+([A-Za-z0-9+/._~=-]{12,})/gi;
  for (const match of content.matchAll(bearerPattern)) {
    if (!looksLikePlaceholder(match[1])) add("authorization-literal", relativePath, lineNumber(content, match.index));
  }

  const keyNames = [
    "api[-_]?key", "x-api-key", "access[-_]?token", "refresh[-_]?token", "client[-_]?secret",
    "authorization", "proxy[-_]?authorization", "private[-_]?key", "password", "passwd", "secret",
    "cookie", "set-cookie", "session(?:id)?", "credential",
  ].join("|");
  const assignmentPattern = new RegExp(`(?:^|[^A-Za-z0-9_])(?:["']?(?:${keyNames})["']?)\\s*[:=]\\s*(?:"([^"\\r\\n]{1,500})"|'([^'\\r\\n]{1,500})')`, "gim");
  for (const match of content.matchAll(assignmentPattern)) {
    const value = match[1] ?? match[2] ?? "";
    if (looksLikePlaceholder(value) || value.length < 12) continue;
    if (/^(?:String|Boolean|Number|Buffer|new|process\.env|import\.meta\.env|req\.|input\.|config\.|profile\.|__nccwpck_require__)/i.test(value)) continue;
    if (entropy(value) >= 3.2) add("secret-assignment", relativePath, lineNumber(content, match.index));
  }

  const configExtension = path.extname(relativePath).toLowerCase();
  if ([".conf", ".config", ".ini", ".properties", ".toml", ".yaml", ".yml"].includes(configExtension)) {
    const bareAssignmentPattern = new RegExp(`(?:^|[^A-Za-z0-9_])(?:["']?(?:${keyNames})["']?)\\s*[:=]\\s*([A-Za-z0-9+/_~.-]{12,500})(?:\\s|$)`, "gim");
    for (const match of content.matchAll(bareAssignmentPattern)) {
      const value = match[1] ?? "";
      if (!looksLikePlaceholder(value) && entropy(value) >= 3.2) {
        add("secret-assignment", relativePath, lineNumber(content, match.index));
      }
    }
  }

  const urlPattern = /\b(?:https?|wss?):\/\/[^\s<>"'`]+/gi;
  for (const match of content.matchAll(urlPattern)) {
    const raw = match[0].replace(/[),.;\]}]+$/g, "");
    try {
      const url = new URL(raw);
      if (url.username || url.password) {
        add("url-embedded-credential", relativePath, lineNumber(content, match.index));
        continue;
      }
      const unqualifiedBinaryHost = binary && !url.hostname.includes(".") && !["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase());
      if (!unqualifiedBinaryHost && isPrivateNetworkHost(url.hostname)) add("private-network-url", relativePath, lineNumber(content, match.index));
      for (const [key, value] of url.searchParams) {
        if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase()) && !safeUrlValue(value)) {
          add("signed-or-secret-url", relativePath, lineNumber(content, match.index));
          break;
        }
      }
    } catch {
      // Template URLs and code fragments are handled by assignment checks instead.
    }
  }

  const extension = path.extname(relativePath).toLowerCase();
  if ([".json", ".yaml", ".yml", ".toml"].includes(extension) && !relativePath.endsWith("package-lock.json")) {
    const valuePattern = /["']?([A-Za-z0-9_.-]+)["']?\s*[:=]\s*["']([A-Za-z0-9+/_~.=-]{32,})["']/g;
    for (const match of content.matchAll(valuePattern)) {
      const key = match[1].toLowerCase();
      const value = match[2];
      if (SAFE_ENTROPY_KEYS.has(key) || looksLikePlaceholder(value) || /^https?:/i.test(value)) continue;
      if (characterClassCount(value) >= 3 && entropy(value) >= 4.5) {
        add("high-entropy-value", relativePath, lineNumber(content, match.index));
      }
    }
  }
}

export function scanTree(rootPath, { sourceMode = false } = {}) {
  const root = path.resolve(rootPath);
  const findings = [];
  const findingKeys = new Set();
  let scannedFiles = 0;
  let scannedBytes = 0;

  function add(rule, relativePath, line = 1, severity = "error") {
    const key = `${severity}:${rule}:${relativePath}`;
    if (findingKeys.has(key)) return;
    findingKeys.add(key);
    findings.push({ severity, rule, path: relativePath, line });
  }

  function visit(absolutePath) {
    const relativePath = toRelative(root, absolutePath);
    if (sourceMode && shouldSkipSource(relativePath)) return;
    const stats = fs.lstatSync(absolutePath);
    if (stats.isSymbolicLink()) {
      add("symlink-or-reparse-point", relativePath);
      return;
    }
    const pathRule = forbiddenPathRule(relativePath);
    if (pathRule) {
      add(pathRule, relativePath);
      if (stats.isDirectory()) return;
    }
    if (stats.isDirectory()) {
      for (const entry of fs.readdirSync(absolutePath).sort((left, right) => left.localeCompare(right, "en"))) {
        visit(path.join(absolutePath, entry));
      }
      return;
    }
    if (!stats.isFile()) {
      add("unsupported-filesystem-entry", relativePath);
      return;
    }
    const buffer = fs.readFileSync(absolutePath);
    scannedFiles += 1;
    scannedBytes += buffer.length;
    const text = isTextFile(absolutePath, buffer);
    const content = text ? buffer.toString("utf8") : asciiStrings(buffer);
    if (workflowFingerprint(content, relativePath) || embeddedWorkflowFingerprint(content)) {
      add("private-workflow-payload", relativePath);
    }
    scanContent(content, relativePath, !text, add);
  }

  if (!fs.existsSync(root)) throw new Error(`扫描目录不存在：${root}`);
  visit(root);
  findings.sort((left, right) => `${left.severity}:${left.path}:${left.rule}`.localeCompare(`${right.severity}:${right.path}:${right.rule}`, "en"));
  return { root, findings, scannedFiles, scannedBytes };
}

export function assertCleanScan(result, label = "release source") {
  const errors = result.findings.filter((finding) => finding.severity === "error");
  const warnings = result.findings.filter((finding) => finding.severity === "warning");
  for (const warning of warnings) {
    process.stderr.write(`发布扫描提示 [${warning.rule}] ${warning.path}:${warning.line}（第三方原生二进制构建路径，未发现维护者凭据）\n`);
  }
  if (errors.length) {
    const summary = errors.map((finding) => `- [${finding.rule}] ${finding.path}:${finding.line}`).join("\n");
    throw new Error(`${label} 脱敏检查失败；为避免泄露，不回显命中的内容：\n${summary}`);
  }
  process.stdout.write(`脱敏检查通过：${label}，${result.scannedFiles} 个文件，${(result.scannedBytes / 1024 / 1024).toFixed(2)} MB` + (warnings.length ? `，${warnings.length} 个第三方二进制提示` : "") + "\n");
}

function parseArguments(argv) {
  let root;
  let sourceMode = false;
  let label = "release source";
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--source") {
      root = argv[++index];
      sourceMode = true;
    } else if (value === "--directory") {
      root = argv[++index];
    } else if (value === "--label") {
      label = argv[++index] ?? label;
    } else throw new Error(`未知参数：${value}`);
  }
  if (!root) throw new Error("用法：node scripts/scan-release.mjs --source <repo> 或 --directory <extracted-plugin>");
  return { root, sourceMode, label };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const options = parseArguments(process.argv.slice(2));
    assertCleanScan(scanTree(options.root, { sourceMode: options.sourceMode }), options.label);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
