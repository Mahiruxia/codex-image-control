import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildSupplyChainDocuments } from "./generate-supply-chain.mjs";
import { scanTree } from "./scan-release.mjs";
import { cacheBustedVersion } from "./set-cachebuster.mjs";

function withTempDirectory(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "image-control-release-test-"));
  try {
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeFixture(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

function errorRules(root) {
  return scanTree(root).findings
    .filter((finding) => finding.severity === "error")
    .map((finding) => finding.rule);
}

test("public placeholders and public example URLs pass", () => withTempDirectory((root) => {
  writeFixture(root, "config.json", JSON.stringify({
    endpoint: "https://example.com/video",
    localHealth: "http://127.0.0.1:4317/health",
    apiKey: "<API_KEY>",
  }));
  assert.deepEqual(errorRules(root), []);
}));

test("private network URLs are rejected", () => withTempDirectory((root) => {
  const privateHosts = [
    ["192", "168", "42", "7"].join("."),
    ["127", "0", "0", "2"].join("."),
    ["0", "0", "0", "0"].join("."),
  ];
  writeFixture(root, "config.json", JSON.stringify({
    endpoints: privateHosts.map((host) => "http://" + host + "/video"),
  }));
  assert.ok(errorRules(root).includes("private-network-url"));
}));

test("literal credentials are rejected without exposing their value", () => withTempDirectory((root) => {
  const keyName = ["api", "Key"].join("");
  const fixtureValue = ["7Yp", "4kQ", "9Lm", "2Nz", "6Rx"].join("");
  writeFixture(root, "config.ts", "const " + keyName + ' = "' + fixtureValue + '";\n');
  assert.ok(errorRules(root).includes("secret-assignment"));
}));

test("developer-machine absolute paths are rejected", () => withTempDirectory((root) => {
  const localPath = ["C:", "Users", "maintainer", "private", "workflow.json"].join("\\");
  const unicodePath = ["D:", "个人项目", "私有工作流", "workflow.json"].join("\\");
  const uncPath = String.fromCharCode(92).repeat(2) + ["工作站", "私有共享", "workflow.json"].join("\\");
  writeFixture(root, "notes.txt", localPath + "\n" + unicodePath + "\n" + uncPath);
  assert.ok(errorRules(root).includes("absolute-path"));
}));

test("private keys are rejected", () => withTempDirectory((root) => {
  const marker = ["-----BEGIN ", "PRIVATE", " KEY-----"].join("");
  writeFixture(root, "key.txt", marker + "\nplaceholder\n");
  assert.ok(errorRules(root).includes("private-key"));
}));

test("ComfyUI-style workflow payloads are rejected", () => withTempDirectory((root) => {
  const workflow = {
    last_node_id: 3,
    nodes: [{ id: 1 }, { id: 2 }, { id: 3 }],
    links: [],
  };
  writeFixture(root, "workflow.json", JSON.stringify(workflow));
  assert.ok(errorRules(root).includes("private-workflow-payload"));
}));

test("embedded API workflow payloads are rejected outside JSON files", () => withTempDirectory((root) => {
  const prompt = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [
    String(index + 1),
    { class_type: "ExampleNode", inputs: { value: index } },
  ]));
  writeFixture(root, "embedded.txt", "prefix=" + JSON.stringify({ prompt }));
  assert.ok(errorRules(root).includes("private-workflow-payload"));
}));

test("symbolic links and reparse-like entries are rejected when supported", (context) => withTempDirectory((root) => {
  writeFixture(root, "target.txt", "public");
  try {
    fs.symlinkSync(path.join(root, "target.txt"), path.join(root, "linked.txt"), "file");
  } catch (error) {
    if (!error || !["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) throw error;
    const directoryTarget = path.join(root, "target-directory");
    fs.mkdirSync(directoryTarget);
    try {
      fs.symlinkSync(directoryTarget, path.join(root, "linked-directory"), "junction");
    } catch (junctionError) {
      if (junctionError && ["EPERM", "EACCES", "ENOTSUP"].includes(junctionError.code)) {
        context.skip("This host does not permit creating symbolic links or junctions.");
        return;
      }
      throw junctionError;
    }
  }
  assert.ok(errorRules(root).includes("symlink-or-reparse-point"));
}));

test("vendored native compiler paths are warnings, not release blockers", () => withTempDirectory((root) => {
  const compilerPath = ["D:", "a", "vendor", "build", "binding.pdb"].join("\\");
  writeFixture(root, "runtime/vendor.node", Buffer.concat([
    Buffer.from([0, 1, 2, 0]),
    Buffer.from(compilerPath, "ascii"),
    Buffer.from([0]),
  ]));
  const result = scanTree(root);
  assert.equal(result.findings.filter((finding) => finding.severity === "error").length, 0);
  assert.ok(result.findings.some((finding) => finding.rule === "absolute-path" && finding.severity === "warning"));
}));

test("unexpected native absolute paths remain release blockers", () => withTempDirectory((root) => {
  const unexpectedPath = ["E:", "maintainer", "private", "binding.pdb"].join("\\");
  writeFixture(root, "runtime/vendor.node", Buffer.concat([
    Buffer.from([0, 1, 2, 0]),
    Buffer.from(unexpectedPath, "utf8"),
    Buffer.from([0]),
  ]));
  assert.ok(errorRules(root).includes("absolute-path"));
}));

test("supply-chain documents are deterministic and identify the release", () => {
  const first = buildSupplyChainDocuments();
  const second = buildSupplyChainDocuments();
  assert.deepEqual(first, second);
  assert.match(first.baseVersion, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.equal(first.sbom.metadata.component.version, first.baseVersion);
  assert.deepEqual(first.sbom.metadata.component.licenses, [{ license: { id: "Apache-2.0" } }]);
  assert.ok(first.inventory.components.length > 0);
});

test("local cache busting replaces one suffix and formal reset returns the base", () => {
  assert.equal(cacheBustedVersion("0.11.0", "0.11.0", "local-1"), "0.11.0+codex.local-1");
  assert.equal(cacheBustedVersion("0.11.0", "0.11.0+codex.local-1", "local-2"), "0.11.0+codex.local-2");
  assert.equal(cacheBustedVersion("0.11.0", "0.11.0+codex.local-2", "--clear"), "0.11.0");
  assert.throws(() => cacheBustedVersion("0.11.0", "0.11.0+codex.one+codex.two", "local"));
});
