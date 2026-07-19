import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArguments(argv) {
  const options = { outputDir: path.join(repoRoot, "artifacts", "release-metadata"), check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--output-dir") options.outputDir = path.resolve(argv[++index] ?? "");
    else if (value === "--base-name") options.baseName = argv[++index];
    else if (value === "--check") options.check = true;
    else throw new Error(`未知参数：${value}`);
  }
  if (!options.outputDir) throw new Error("--output-dir 不能为空");
  return options;
}

function packageNameFromLockPath(lockPath, value) {
  if (typeof value.name === "string" && value.name) return value.name;
  const normalized = lockPath.replaceAll("\\", "/");
  const marker = normalized.lastIndexOf("node_modules/");
  if (marker < 0) return undefined;
  return normalized.slice(marker + "node_modules/".length);
}

function packageUrl(name, version) {
  const encodedName = encodeURIComponent(name).replaceAll("%2F", "/");
  return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`;
}

function integrityHash(integrity) {
  if (typeof integrity !== "string") return undefined;
  const match = integrity.match(/^(sha256|sha384|sha512)-([A-Za-z0-9+/=]+)$/i);
  if (!match) return undefined;
  return {
    alg: match[1].toUpperCase().replace("SHA", "SHA-"),
    content: Buffer.from(match[2], "base64").toString("hex"),
  };
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

export function buildSupplyChainDocuments() {
  const rootPackage = readJson("package.json");
  const manifest = readJson("plugins/image-control/.codex-plugin/plugin.json");
  const baseVersion = String(manifest.version).split("+")[0];
  if (rootPackage.version !== baseVersion) {
    throw new Error(`根版本 ${rootPackage.version} 与插件基础版本 ${baseVersion} 不一致`);
  }

  const components = new Map();
  for (const workspace of ["app", "server"]) {
    const lock = readJson(`plugins/image-control/${workspace}/package-lock.json`);
    for (const [lockPath, value] of Object.entries(lock.packages ?? {})) {
      if (!lockPath || !lockPath.includes("node_modules/") || !value?.version) continue;
      const name = packageNameFromLockPath(lockPath, value);
      if (!name) continue;
      const purl = packageUrl(name, value.version);
      const existing = components.get(purl) ?? {
        name,
        version: value.version,
        purl,
        license: value.license ?? "NOASSERTION",
        workspaces: new Set(),
        developmentOnly: true,
        optional: true,
        hashes: new Map(),
      };
      existing.workspaces.add(workspace);
      existing.developmentOnly &&= Boolean(value.dev);
      existing.optional &&= Boolean(value.optional);
      const hash = integrityHash(value.integrity);
      if (hash) existing.hashes.set(`${hash.alg}:${hash.content}`, hash);
      components.set(purl, existing);
    }
  }

  const ordered = [...components.values()].sort((left, right) => left.purl.localeCompare(right.purl, "en"));
  const inventory = {
    schemaVersion: 1,
    project: "codex-image-control",
    version: baseVersion,
    notice: "This machine-generated inventory complements THIRD_PARTY_NOTICES.md and the license files shipped with bundled packages.",
    components: ordered.map((component) => ({
      name: component.name,
      version: component.version,
      license: component.license,
      purl: component.purl,
      workspaces: [...component.workspaces].sort(),
      developmentOnly: component.developmentOnly,
      optional: component.optional,
    })),
  };

  const applicationReference = "pkg:generic/image-control@" + encodeURIComponent(baseVersion);
  const sbom = {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: {
      component: {
        type: "application",
        name: "image-control",
        version: baseVersion,
        "bom-ref": applicationReference,
        licenses: [{ license: { id: "Apache-2.0" } }],
      },
      tools: {
        components: [{ type: "application", name: "image-control-supply-chain-generator", version: "1" }],
      },
    },
    components: ordered.map((component) => ({
      type: "library",
      name: component.name,
      version: component.version,
      "bom-ref": component.purl,
      purl: component.purl,
      scope: component.developmentOnly ? "excluded" : component.optional ? "optional" : "required",
      licenses: [{ license: { name: component.license } }],
      ...(component.hashes.size ? {
        hashes: [...component.hashes.values()].sort((left, right) =>
          (left.alg + ":" + left.content).localeCompare(right.alg + ":" + right.content, "en")),
      } : {}),
      properties: [
        { name: "image-control:workspaces", value: [...component.workspaces].sort().join(",") },
        { name: "image-control:development-only", value: String(component.developmentOnly) },
      ],
    })),
    dependencies: [
      {
        ref: applicationReference,
        dependsOn: ordered.filter((component) => !component.developmentOnly).map((component) => component.purl),
      },
      ...ordered.map((component) => ({ ref: component.purl, dependsOn: [] })),
    ],
  };

  return { baseVersion, inventory, sbom };
}

export function writeSupplyChainDocuments(outputDir, baseName) {
  const { baseVersion, inventory, sbom } = buildSupplyChainDocuments();
  const safeBaseName = baseName ?? `image-control-${baseVersion}`;
  if (!/^[0-9A-Za-z._-]+$/.test(safeBaseName)) throw new Error("输出文件前缀包含不安全字符");
  fs.mkdirSync(outputDir, { recursive: true });
  const sbomPath = path.join(outputDir, `${safeBaseName}-sbom.cdx.json`);
  const inventoryPath = path.join(outputDir, `${safeBaseName}-third-party-components.json`);
  fs.writeFileSync(sbomPath, `${JSON.stringify(sbom, null, 2)}\n`, "utf8");
  fs.writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  return { baseVersion, sbomPath, inventoryPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  if (options.check) {
    const result = buildSupplyChainDocuments();
    process.stdout.write("供应链清单检查通过：" + result.baseVersion + "，" + result.inventory.components.length + " 个组件\n");
  } else {
    const result = writeSupplyChainDocuments(options.outputDir, options.baseName);
    process.stdout.write("SBOM：" + result.sbomPath + "\n第三方组件清单：" + result.inventoryPath + "\n");
  }
}
