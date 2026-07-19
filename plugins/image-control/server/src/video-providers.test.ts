import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  renderVideoProviderUrlTemplate,
  VideoProviderStore,
  videoProviderExecutionFingerprint,
  videoProviderRequiresExternalConfirmation,
  videoProviderWorkflowSha256,
  type VideoProviderCredentialBackend,
} from "./video-providers.js";
import type { VideoProviderProfile } from "./types.js";

const timestamps = () => ({ createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
const defaults = { width: 720, height: 1280, frameRate: 16, frameCount: 65, pollSeconds: 5, timeoutMinutes: 30 };

test("Codex-assisted setup rejects secrets and commits only validated declarative HTTP profiles", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-provider-setup-"));
  const store = new VideoProviderStore(root);
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const sensitiveDescription = `接入云端图生视频，${["api", "key"].join("_")}=${["private", "test", "credential"].join("-")}`;
  await assert.rejects(store.createSetupRequest({ description: sensitiveDescription }), /疑似包含凭据/);
  const sensitiveDocs = new URL("https://example.com/docs");
  sensitiveDocs.searchParams.set(["to", "ken"].join(""), ["private", "test", "value"].join("-"));
  await assert.rejects(store.createSetupRequest({ description: "接入云端图生视频", docsUrl: sensitiveDocs.toString() }), /疑似包含凭据/);
  const sensitiveHeader = `${["Authori", "zation"].join("")}: ${["Bear", "er"].join("")} ${["private", "test", "credential", "value"].join("-")}`;
  await assert.rejects(store.createSetupRequest({ description: "接入云端图生视频", exampleRequest: sensitiveHeader }), /疑似包含凭据/);

  let request = await store.createSetupRequest({
    description: "接入用户自有的云端图生视频接口",
    docsUrl: "https://example.com/docs",
    baseUrl: "https://api.example.com/v1",
    exampleRequest: JSON.stringify({ image: "{{image_base64}}", prompt: "{{prompt}}" }),
    exampleResponse: JSON.stringify({ id: "job-1", status: "queued" }),
  });
  assert.equal(request.status, "queued");
  const persisted = await fs.readFile(path.join(store.setupDir(request.id), "request.json"), "utf8");
  assert.doesNotMatch(persisted, /private-test-credential|private-test-value/);

  request = await store.updateSetupRequest(request.id, "analyzing");
  assert.equal(request.status, "analyzing");
  const profile: VideoProviderProfile = {
    id: "cloud-video",
    name: "云端视频",
    description: "用户自己的云端模型",
    kind: "generic-http",
    enabled: true,
    capabilities: {
      source: "cloud", billing: "possibly-paid", modes: ["image-to-video"], aspectRatios: ["9:16"], maxConcurrency: 4,
    },
    defaults,
    http: {
      mode: "async",
      imageMode: "base64",
      submitUrl: "https://api.example.com/v1/jobs",
      submitMethod: "POST",
      bodyTemplate: { image: "{{image_base64}}", prompt: "{{prompt}}" },
      jobIdPath: "data.id",
      statusUrlTemplate: "https://api.example.com/v1/jobs/{{job_id}}",
      statusMethod: "POST",
      statusBodyTemplate: { id: "{{job_id}}" },
      statusPath: "data.status",
      progressPath: "data.progress",
      resultUrlPath: "data.output.url",
      auth: { type: "bearer" },
      downloadAuth: "provider",
      allowedDownloadOrigins: ["https://files.example.com/output/path"],
      idempotencyHeader: "Idempotency-Key",
    },
    ...timestamps(),
  };
  const validated = await store.validateSetupDraft(request.id, profile);
  assert.equal(validated.request.status, "analyzing", "validation alone must not announce an installed provider");
  assert.equal(validated.profile.schemaVersion, 1);
  assert.equal(validated.profile.http?.statusMethod, "POST");
  assert.deepEqual(validated.profile.http?.allowedDownloadOrigins, ["https://files.example.com"]);
  await assert.rejects(store.updateSetupRequest(request.id, "ready"), /先提交并保存/);
  const committed = await store.commitSetupDraft(request.id);
  assert.equal(committed.request.committedProviderId, "cloud-video");
  assert.equal((await store.getProfile("cloud-video")).http?.idempotencyHeader, "Idempotency-Key");
  const mislabeledPublic = await store.saveProfile({
    ...profile,
    id: "mislabeled-public",
    capabilities: { ...profile.capabilities, source: "local", billing: "local" },
    ...timestamps(),
  });
  assert.equal(mislabeledPublic.capabilities?.source, "cloud", "public targets cannot bypass external confirmation by declaring themselves local");
  assert.equal(videoProviderRequiresExternalConfirmation(mislabeledPublic), true);

  const invalidRequest = await store.createSetupRequest({ description: "另一个 HTTP 接口" });
  await assert.rejects(
    store.validateSetupDraft(invalidRequest.id, {
      ...profile,
      id: "unsafe-body",
      http: { ...profile.http!, bodyTemplate: { apiKey: "{{credential}}" } },
    }),
    /不得携带密钥字段/,
  );
  await assert.rejects(
    store.validateSetupDraft(invalidRequest.id, {
      ...profile,
      id: "unsafe-download",
      http: { ...profile.http!, downloadAuth: "provider", allowedDownloadOrigins: [] },
    }),
    /允许的下载来源/,
  );
  await assert.rejects(
    store.validateSetupDraft(invalidRequest.id, {
      ...profile,
      id: "plaintext-cloud",
      http: { ...profile.http!, submitUrl: "http://api.example.com/v1/jobs" },
    }),
    /公网地址必须使用 HTTPS/,
  );
  await assert.rejects(
    store.validateSetupDraft(invalidRequest.id, {
      ...profile,
      id: "variable-host",
      http: { ...profile.http!, statusUrlTemplate: "https://{{job_id}}.example.com/status" },
    }),
    /协议、主机或端口不能使用模板变量/,
  );
  await assert.rejects(
    store.validateSetupDraft(invalidRequest.id, {
      ...profile,
      id: "cross-origin-status",
      http: { ...profile.http!, statusUrlTemplate: "https://status.example.net/jobs/{{job_id}}" },
    }),
    /状态查询地址必须与提交地址同源/,
  );
  await assert.rejects(
    store.validateSetupDraft(invalidRequest.id, {
      ...profile,
      id: "invalid-submit-method",
      http: { ...profile.http!, submitMethod: "DELETE" as never },
    }),
    /提交方法必须是 POST 或 PUT/,
  );
  const cancelled = await store.cancelSetupRequest(invalidRequest.id);
  assert.equal(cancelled.status, "cancelled");
  await assert.rejects(store.updateSetupRequest(invalidRequest.id, "analyzing"), /不能继续更新/);
});

test("URL templates encode path and query values without changing their static origin", () => {
  const rendered = renderVideoProviderUrlTemplate(
    "https://api.example.com/jobs/{{job_id}}?request={{request_id}}",
    { job_id: "folder/name ?&", request_id: "a/b?c&d" },
  );
  assert.equal(new URL(rendered).origin, "https://api.example.com");
  assert.match(rendered, /folder%2Fname%20%3F%26/);
  assert.match(rendered, /request=a%2Fb%3Fc%26d/);
  assert.throws(
    () => renderVideoProviderUrlTemplate("https://api.example.com/jobs/{{job_id}}", { job_id: ".." }),
    /包含不安全值/,
  );
});

test("setup context summarizes both ComfyUI UI workflows and API prompt objects", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-provider-workflow-"));
  const store = new VideoProviderStore(root);
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const uiWorkflow = {
    nodes: [
      { id: 10, type: "LoadImage", title: "首帧", inputs: [{ name: "image" }], widgets_values: [""] },
      { id: 20, type: "TextEncode", title: "提示词", inputs: [{ name: "text" }], widgets_values: [""] },
      { id: 30, type: "VHS_VideoCombine", title: "视频输出", inputs: [{ name: "filename_prefix" }], widgets_values: {} },
      { id: 40, type: "Seed (rgthree)", title: "随机种子", inputs: [], widgets_values: [123, "fixed", false, 0] },
    ],
    links: [],
  };
  const uiRequest = await store.createSetupRequest({ description: "接入本机 ComfyUI", workflowJson: JSON.stringify(uiWorkflow) });
  const uiContext = await store.getSetupContext(uiRequest.id);
  assert.equal(uiContext.workflow?.format, "ui");
  assert.equal(uiContext.workflow?.nodeCount, 4);
  assert.equal(uiContext.workflow?.nodes[1].jsonPath, "$.nodes[1]");
  assert.ok(uiContext.workflow?.localPath.startsWith(store.setupsDir));
  assert.match(uiContext.workflow?.sha256 ?? "", /^[a-f0-9]{64}$/);
  assert.equal(uiContext.workflow?.sha256, videoProviderWorkflowSha256(JSON.stringify(uiWorkflow)));
  assert.notEqual(uiContext.workflow?.sha256, videoProviderWorkflowSha256(JSON.stringify({ ...uiWorkflow, links: [[1, 2, 3]] })));
  assert.deepEqual(uiContext.workflow?.riskFlags, []);
  assert.ok(uiContext.workflow?.nodes.find((node) => node.nodeId === "40")?.inputNames.includes("seed"));
  await assert.rejects(
    store.createSetupRequest({
      description: "导入保留节点名",
      workflowJson: JSON.stringify({ nodes: [{ id: "__proto__", type: "LoadImage", inputs: [{ name: "image" }] }], links: [] }),
    }),
    /不安全的保留名称/,
  );
  const uiProfile: VideoProviderProfile = {
    id: "local-comfy",
    name: "本机 ComfyUI",
    kind: "comfyui-workflow",
    enabled: true,
    capabilities: { source: "local", billing: "local", modes: ["image-to-video"] },
    defaults,
    comfyui: {
      baseUrl: "http://127.0.0.1:8188",
      workflowFile: "workflow.json",
      queuePolicy: "wait-until-empty",
      workflowFormat: "ui",
      bindings: {
        image: { nodeId: "10", inputName: "image" },
        prompt: { nodeId: "20", inputName: "text" },
        filenamePrefix: { nodeId: "30", inputName: "filename_prefix" },
        seed: { nodeId: "40", inputName: "seed" },
      },
      outputNodeId: "30",
    },
    ...timestamps(),
  };
  assert.equal(videoProviderRequiresExternalConfirmation(uiProfile), false);
  await store.validateSetupDraft(uiRequest.id, uiProfile);
  await assert.rejects(
    store.validateSetupDraft(uiRequest.id, {
      ...uiProfile,
      id: "missing-required-binding",
      comfyui: { ...uiProfile.comfyui!, bindings: { image: { nodeId: "10", inputName: "image" } } },
    }),
    /必须明确绑定首帧 image 与正向提示词 prompt/,
  );
  await store.commitSetupDraft(uiRequest.id);
  assert.equal((await store.getProfile("local-comfy")).comfyui?.workflowFormat, "ui");

  const apiWorkflow = {
    "1": { class_type: "LoadImage", inputs: { image: "source.png" }, _meta: { title: "首帧" } },
    "2": { class_type: "TextEncode", inputs: { text: "" }, _meta: { title: "提示词" } },
    "3": { class_type: "SaveVideo", inputs: { filename_prefix: "video" }, _meta: { title: "视频输出" } },
  };
  const apiRequest = await store.createSetupRequest({ description: "导入 API prompt", workflowJson: JSON.stringify(apiWorkflow) });
  const apiContext = await store.getSetupContext(apiRequest.id);
  assert.equal(apiContext.workflow?.format, "api");
  assert.equal(apiContext.workflow?.nodes[0].jsonPath, "$[\"1\"]");
  await store.validateSetupDraft(apiRequest.id, {
    ...uiProfile,
    id: "api-comfy",
    comfyui: {
      ...uiProfile.comfyui!,
      workflowFormat: "api",
      bindings: {
        image: { nodeId: "1", inputName: "image" }, prompt: { nodeId: "2", inputName: "text" },
      },
      outputNodeId: "3",
    },
  });
  const apiCommitted = await store.commitSetupDraft(apiRequest.id);
  assert.equal(apiCommitted.provider.comfyui?.workflowFormat, "api");
  const savedWorkflow = JSON.parse(await fs.readFile(store.workflowPath(apiCommitted.provider), "utf8")) as Record<string, unknown>;
  assert.ok("1" in savedWorkflow);
  assert.ok(!("prompt" in savedWorkflow));
});

test("workflow graph hashes bind explicit risk confirmation and executable nodes fail closed", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-provider-risk-"));
  const store = new VideoProviderStore(root);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const networkWorkflow = {
    "1": { class_type: "LoadImage", inputs: { image: "source.png" } },
    "2": { class_type: "TextEncode", inputs: { text: "" } },
    "3": { class_type: "HttpRequest", inputs: { url: "https://example.com/inference" } },
    "4": { class_type: "SaveVideo", inputs: { source: ["3", 0] } },
  };
  const request = await store.createSetupRequest({ description: "导入含联网节点的工作流", workflowJson: JSON.stringify(networkWorkflow) });
  const context = await store.getSetupContext(request.id);
  assert.equal(context.workflow?.requiresReview, true);
  assert.ok(context.workflow?.riskFlags.some((flag) => flag.startsWith("network-access:")));
  const profile: VideoProviderProfile = {
    id: "reviewed-network-workflow", name: "已审阅联网工作流", kind: "comfyui-workflow", enabled: true, defaults,
    comfyui: {
      baseUrl: "http://127.0.0.1:8188", workflowFile: "workflow.json", queuePolicy: "wait-until-empty", workflowFormat: "api",
      bindings: { image: { nodeId: "1", inputName: "image" }, prompt: { nodeId: "2", inputName: "text" } }, outputNodeId: "4",
    },
    ...timestamps(),
  };
  await assert.rejects(store.validateSetupDraft(request.id, profile), /明确确认当前工作流哈希/);
  const accepted = await store.validateSetupDraft(request.id, {
    ...profile,
    comfyui: { ...profile.comfyui!, workflowRiskAcceptedSha256: context.workflow!.sha256 },
  });
  assert.equal(accepted.profile.comfyui?.workflowSha256, context.workflow?.sha256);
  assert.equal(accepted.profile.comfyui?.workflowRiskAcceptedSha256, context.workflow?.sha256);

  const executableWorkflow = {
    ...networkWorkflow,
    "3": { class_type: "PythonScript", inputs: { code: "print(1)" } },
  };
  const executableRequest = await store.createSetupRequest({ description: "导入脚本节点工作流", workflowJson: JSON.stringify(executableWorkflow) });
  const executableContext = await store.getSetupContext(executableRequest.id);
  await assert.rejects(store.validateSetupDraft(executableRequest.id, {
    ...profile,
    id: "blocked-script-workflow",
    comfyui: { ...profile.comfyui!, workflowRiskAcceptedSha256: executableContext.workflow!.sha256 },
  }), /拒绝安装该工作流/);
});

test("legacy credentials fail closed and scoped credentials never cross endpoint boundaries", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-provider-credentials-"));
  const entries = new Map<string, string>();
  let failNextSet = false;
  const backend: VideoProviderCredentialBackend = {
    getPassword: async (account) => entries.get(account),
    setPassword: async (account, secret) => {
      if (failNextSet) { failNextSet = false; throw new Error("simulated secure-store failure"); }
      entries.set(account, secret);
    },
    deletePassword: async (account) => { entries.delete(account); },
    listAccounts: async () => [...entries.keys()],
  };
  const store = new VideoProviderStore(root, backend);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const profile = await store.saveProfile({
    id: "scoped-credential", name: "凭据隔离测试", kind: "generic-http", enabled: true, defaults,
    http: {
      mode: "sync", imageMode: "base64", submitUrl: "https://api.example.com/video", submitMethod: "POST",
      auth: { type: "bearer" },
    },
    ...timestamps(),
  });
  assert.match(profile.credentialScopeFingerprint ?? "", /^[a-f0-9]{64}$/);

  // Recreate a pre-scope profile/account pair from an older local install.
  const legacyProfile = await store.getProfile(profile.id);
  delete legacyProfile.credentialScopeFingerprint;
  await fs.writeFile(path.join(store.profileDir(profile.id), "profile.json"), JSON.stringify(legacyProfile), "utf8");
  const secret = ["credential", "fixture", "value"].join("-");
  const rotatedSecret = ["rotated", "credential", "fixture"].join("-");
  const replacementSecret = ["replacement", "credential", "fixture"].join("-");
  await backend.setPassword(profile.id, secret);
  assert.equal(await store.getCredential(profile.id), undefined, "an unscoped legacy secret must never bind itself to a profile");
  assert.equal(entries.has(profile.id), true, "read-only listing must not mutate the legacy credential store");

  const normalizedProfile = await store.saveProfile({ ...legacyProfile, name: "补齐安全范围" });
  assert.equal(normalizedProfile.credentialReset, true);
  assert.match(normalizedProfile.credentialRevision ?? "", /^[0-9a-f-]{36}$/i);
  assert.equal(normalizedProfile.credentialState, "ready");
  assert.equal(entries.has(profile.id), false, "saving a legacy profile discards its ambiguous secret");
  const fingerprintBeforeCredential = videoProviderExecutionFingerprint(normalizedProfile);
  await store.setCredential(profile.id, secret);
  assert.equal(await store.getCredential(profile.id), secret);
  const credentialBoundProfile = await store.getProfile(profile.id);
  assert.notEqual(credentialBoundProfile.credentialRevision, normalizedProfile.credentialRevision);
  assert.notEqual(videoProviderExecutionFingerprint(credentialBoundProfile), fingerprintBeforeCredential);
  const credentialBoundFingerprint = await store.getExecutionFingerprint(profile.id);
  assert.equal(credentialBoundFingerprint, videoProviderExecutionFingerprint(credentialBoundProfile));
  assert.equal(await store.getCredentialForExecution(profile.id, credentialBoundFingerprint), secret);
  await store.setCredential(profile.id, rotatedSecret);
  await assert.rejects(
    store.getCredentialForExecution(profile.id, credentialBoundFingerprint),
    /排队后变化/,
  );
  const rotatedFingerprint = await store.getExecutionFingerprint(profile.id);
  assert.equal(await store.getCredentialForExecution(profile.id, rotatedFingerprint), rotatedSecret);
  await store.setCredential(profile.id, secret);
  const presentationOnly = await store.saveProfile({ ...normalizedProfile, name: "仅修改显示名称" });
  assert.equal(presentationOnly.credentialReset, undefined);
  assert.equal(await store.getCredential(profile.id), secret);
  failNextSet = true;
  await assert.rejects(store.setCredential(profile.id, replacementSecret), /连接器已锁定/);
  assert.equal((await store.getProfile(profile.id)).credentialState, "changing");
  await assert.rejects(store.getExecutionFingerprint(profile.id), /凭据边界尚未就绪/);
  await store.setCredential(profile.id, secret);
  assert.equal((await store.getProfile(profile.id)).credentialState, "ready");
  assert.equal(videoProviderExecutionFingerprint(normalizedProfile), videoProviderExecutionFingerprint({ ...normalizedProfile, name: "另一个显示名称" }));
  assert.notEqual(
    videoProviderExecutionFingerprint(normalizedProfile),
    videoProviderExecutionFingerprint({ ...normalizedProfile, defaults: { ...normalizedProfile.defaults, pollSeconds: 19 } }),
  );

  const changed = await store.saveProfile({
    ...presentationOnly,
    http: { ...presentationOnly.http!, submitUrl: "https://api2.example.com/video" },
  });
  assert.equal(changed.credentialReset, true);
  assert.equal(await store.getCredential(profile.id), undefined);
  assert.equal(entries.size, 0);

  // Even if an orphaned legacy entry reappears, a scoped profile never claims it.
  await backend.setPassword(profile.id, secret);
  assert.equal(await store.getCredential(profile.id), undefined);

  await backend.setPassword("v1:deleted-profile:orphaned-scope", secret);
  await backend.setPassword("deleted-legacy-profile", secret);
  assert.equal(await store.deleteAllCredentials(), 3, "service-wide cleanup must include credentials whose profiles are gone");
  assert.equal(entries.size, 0);
});

test("profile saves, credential rotation, and service-wide cleanup serialize across store instances", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-provider-mutation-lock-"));
  const entries = new Map<string, string>();
  let blockNextScopedRead = false;
  let announceBlockedRead: (() => void) | undefined;
  let releaseBlockedRead: (() => void) | undefined;
  let blockedReadStarted = Promise.resolve();
  let blockedReadRelease = Promise.resolve();
  let blockNextScopedDelete = false;
  let announceBlockedDelete: (() => void) | undefined;
  let releaseBlockedDelete: (() => void) | undefined;
  let blockedDeleteStarted = Promise.resolve();
  let blockedDeleteRelease = Promise.resolve();
  const armReadBarrier = () => {
    blockNextScopedRead = true;
    blockedReadStarted = new Promise<void>((resolve) => { announceBlockedRead = resolve; });
    blockedReadRelease = new Promise<void>((resolve) => { releaseBlockedRead = resolve; });
  };
  const armDeleteBarrier = () => {
    blockNextScopedDelete = true;
    blockedDeleteStarted = new Promise<void>((resolve) => { announceBlockedDelete = resolve; });
    blockedDeleteRelease = new Promise<void>((resolve) => { releaseBlockedDelete = resolve; });
  };
  const backend: VideoProviderCredentialBackend = {
    getPassword: async (account) => {
      if (blockNextScopedRead && account.startsWith("v1:")) {
        blockNextScopedRead = false;
        announceBlockedRead?.();
        await blockedReadRelease;
      }
      return entries.get(account);
    },
    setPassword: async (account, secret) => { entries.set(account, secret); },
    deletePassword: async (account) => {
      if (blockNextScopedDelete && account.startsWith("v1:")) {
        blockNextScopedDelete = false;
        announceBlockedDelete?.();
        await blockedDeleteRelease;
      }
      entries.delete(account);
    },
    listAccounts: async () => [...entries.keys()],
  };
  const first = new VideoProviderStore(root, backend);
  const second = new VideoProviderStore(root, backend);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const original = await first.saveProfile({
    id: "concurrent-credential", name: "并发凭据", kind: "generic-http", enabled: true, defaults,
    http: {
      mode: "sync", imageMode: "base64", submitUrl: "https://api.example.com/video", submitMethod: "POST",
      auth: { type: "bearer" },
    },
    ...timestamps(),
  });
  const firstSecret = ["first", "credential", "fixture"].join("-");
  const rotatedSecret = ["rotated", "credential", "fixture"].join("-");
  await first.setCredential(original.id, firstSecret);
  const beforeRotation = await first.getProfile(original.id);
  const preRotationFingerprint = await first.getExecutionFingerprint(original.id);

  armReadBarrier();
  const saveDuringRotation = first.saveProfile({ ...beforeRotation, name: "轮换期间保存的新名称" });
  await blockedReadStarted;
  const rotation = second.setCredential(original.id, rotatedSecret);
  const rotationState = await Promise.race([
    rotation.then(() => "settled" as const),
    new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 80)),
  ]);
  releaseBlockedRead?.();
  await Promise.all([saveDuringRotation, rotation]);
  assert.equal(rotationState, "blocked", "credential rotation must wait for an in-flight profile save in another store instance");
  const afterRotation = await first.getProfile(original.id);
  assert.equal(afterRotation.name, "轮换期间保存的新名称");
  assert.notEqual(afterRotation.credentialRevision, beforeRotation.credentialRevision);
  assert.equal(await first.getCredential(original.id), rotatedSecret);
  await assert.rejects(first.getCredentialForExecution(original.id, preRotationFingerprint), /排队后变化/);
  const rotatedFingerprint = await first.getExecutionFingerprint(original.id);
  assert.equal(await first.getCredentialForExecution(original.id, rotatedFingerprint), rotatedSecret);

  armReadBarrier();
  const saveDuringCleanup = first.saveProfile({ ...afterRotation, name: "清理期间保存的新名称" });
  await blockedReadStarted;
  const cleanup = second.deleteAllCredentials();
  const cleanupState = await Promise.race([
    cleanup.then(() => "settled" as const),
    new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 80)),
  ]);
  releaseBlockedRead?.();
  const [, deletedCount] = await Promise.all([saveDuringCleanup, cleanup]);
  assert.equal(cleanupState, "blocked", "service-wide credential cleanup must wait for an in-flight profile save");
  assert.equal(deletedCount, 1);
  assert.equal((await first.getProfile(original.id)).name, "清理期间保存的新名称");
  assert.equal(await first.getCredential(original.id), undefined);
  await assert.rejects(first.getCredentialForExecution(original.id, rotatedFingerprint), /排队后变化/);

  await first.setDefaultProfileId(original.id);
  armDeleteBarrier();
  const deletion = first.deleteProfile(original.id);
  await blockedDeleteStarted;
  const concurrentDefault = second.setDefaultProfileId(original.id);
  const defaultState = await Promise.race([
    concurrentDefault.then(() => "settled" as const, () => "rejected" as const),
    new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 80)),
  ]);
  releaseBlockedDelete?.();
  await deletion;
  await assert.rejects(concurrentDefault, /ENOENT/);
  assert.equal(defaultState, "blocked", "setting the default must wait for an in-flight provider deletion");
  assert.equal(await first.getDefaultProfileId(), undefined);
});

test("provider mutation locks and recursive profile deletion reject linked external directories", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-provider-linked-state-"));
  const externalProfile = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-provider-external-profile-"));
  const externalLock = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-provider-external-lock-"));
  const backend: VideoProviderCredentialBackend = {
    getPassword: async () => undefined,
    setPassword: async () => undefined,
    deletePassword: async () => undefined,
    listAccounts: async () => [],
  };
  const store = new VideoProviderStore(root, backend);
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(externalProfile, { recursive: true, force: true });
    await fs.rm(externalLock, { recursive: true, force: true });
  });
  const profile = await store.saveProfile({
    id: "linked-profile", name: "链接目录保护", kind: "generic-http", enabled: true, defaults,
    http: {
      mode: "sync", imageMode: "base64", submitUrl: "https://api.example.com/video", submitMethod: "POST",
      auth: { type: "none" },
    },
    ...timestamps(),
  });
  const profileSentinel = path.join(externalProfile, "keep-profile.txt");
  const lockSentinel = path.join(externalLock, "keep-lock.txt");
  await Promise.all([
    fs.writeFile(profileSentinel, "keep", "utf8"),
    fs.writeFile(lockSentinel, "keep", "utf8"),
  ]);
  await fs.rm(store.profileDir(profile.id), { recursive: true, force: true });
  const linkType = process.platform === "win32" ? "junction" : "dir";
  await fs.symlink(externalProfile, store.profileDir(profile.id), linkType);
  await assert.rejects(store.deleteProfile(profile.id), /真实目录|链接|重解析/);
  assert.equal(await fs.readFile(profileSentinel, "utf8"), "keep");

  await fs.rm(store.mutationLocksDir, { recursive: true, force: true });
  await fs.symlink(externalLock, store.mutationLocksDir, linkType);
  await assert.rejects(store.saveProfile({ ...profile, id: "lock-link-rejected" }), /真实本机目录|链接|重解析/);
  assert.equal(await fs.readFile(lockSentinel, "utf8"), "keep");
});

test("generic HTTP connection checks stay non-billable and report their limits honestly", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-provider-probe-"));
  const store = new VideoProviderStore(root);
  let port = 0;
  let postCount = 0;
  const server = http.createServer((request, response) => {
    if (request.method === "POST" || request.method === "PUT") postCount += 1;
    if (request.url === "/probe" && request.method === "OPTIONS") {
      response.writeHead(405); response.end(); return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => { port = (server.address() as { port: number }).port; resolve(); }));
  t.after(async () => { server.close(); await fs.rm(root, { recursive: true, force: true }); });

  const profile = await store.saveProfile({
    id: "safe-probe", name: "免费探测", kind: "generic-http", enabled: true, defaults,
    http: { mode: "sync", imageMode: "multipart", submitUrl: `http://127.0.0.1:${port}/probe`, submitMethod: "POST", auth: { type: "none" } },
    ...timestamps(),
  });
  const result = await store.testProfile(profile.id);
  assert.match(result.message, /未发送生成请求/);
  assert.equal(postCount, 0);

  const missing = await store.saveProfile({
    ...profile, id: "missing-endpoint", name: "错误地址", http: { ...profile.http!, submitUrl: `http://127.0.0.1:${port}/missing` }, ...timestamps(),
  });
  await assert.rejects(store.testProfile(missing.id), /404/);

  const credentialRequired = await store.saveProfile({
    ...profile, id: "credential-required", name: "需要密钥", http: { ...profile.http!, auth: { type: "bearer" } }, ...timestamps(),
  });
  await assert.rejects(store.testProfile(credentialRequired.id), /先在本机填写/);
  assert.equal(postCount, 0);
});
