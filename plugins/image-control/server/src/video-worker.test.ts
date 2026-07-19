import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { ProjectStore } from "./store.js";
import { VideoWorker } from "./video-worker.js";

function isolatedStore(stateRoot: string): ProjectStore {
  const sourceRoot = path.join(path.dirname(stateRoot), `${path.basename(stateRoot)}-plugin-source`);
  return new ProjectStore(sourceRoot, "http://127.0.0.1:4317", undefined, stateRoot);
}

async function imageDataUrl(): Promise<string> {
  const buffer = await sharp({ create: { width: 128, height: 224, channels: 4, background: { r: 70, g: 90, b: 110, alpha: 1 } } }).png().toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function commitClaimedGeneration(
  store: ProjectStore,
  input: { projectId: string; requestId: string; imageDataUrl: string },
) {
  const claim = await store.setGenerationStatus(input.projectId, input.requestId, "generating");
  assert.ok(claim.claimToken);
  return store.commitGenerationResult({ ...input, claimToken: claim.claimToken });
}

async function makeVideo(filePath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=#556677:s=128x224:r=16", "-frames:v", "49", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", filePath], { windowsHide: true });
    let error = "";
    child.stderr.on("data", (chunk) => { error += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(error)));
  });
}

async function requestBody(request: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function stablePromptId(requestId: string): string {
  const hex = createHash("sha256").update(`image-control:${requestId}`).digest("hex");
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function prepareVideoShots(store: ProjectStore, shotCount: number, name: string) {
  let project = await store.createProject({ name, templateId: "blank", shotCount });
  project = await store.updateProject(project.id, { brief: "同一空间内的连续动作" });
  for (const shot of project.shots) {
    project = await store.updateShot(project.id, shot.id, {
      cast: "同一位主要人物 1 人；主要人物总数严格为 1 人",
      scene: "真实室内",
      action: `人物完成动作 ${shot.index + 1}`,
    });
  }
  const contact = (await store.enqueueGeneration({
    projectId: project.id,
    kind: "contact_sheet",
    shotIds: project.shots.map((shot) => shot.id),
  }))[0];
  project = await commitClaimedGeneration(store, { projectId: project.id, requestId: contact.id, imageDataUrl: await imageDataUrl() });
  project = await store.markContactSheetReview(project.id, true);
  for (const shot of project.shots) {
    const request = (await store.enqueueGeneration({ projectId: project.id, kind: "final", shotIds: [shot.id] }))[0];
    project = await commitClaimedGeneration(store, { projectId: project.id, requestId: request.id, imageDataUrl: await imageDataUrl() });
    project = await store.updateVideoPlan({
      projectId: project.id,
      shotId: shot.id,
      prompt: `初始状态：人物稳定站立。唯一主动作：人物完成动作 ${shot.index + 1}。物理过程：身体平顺移动。结束状态：人物恢复稳定。镜头表现：固定手机机位。`,
      frameRate: 16,
      frameCount: 49,
      source: "codex",
    });
  }
  return project;
}

function minimalComfyWorkflow() {
  return {
    "1": { class_type: "LoadImage", inputs: { image: "placeholder.png" } },
    "2": { class_type: "PositiveText", inputs: { text: "" } },
    "3": { class_type: "VideoSize", inputs: { width: 1, height: 1, frames: 1, fps: 1, seed: 1, prefix: "video" } },
    "9": { class_type: "SaveVideo", inputs: { source: ["3", 0] } },
  };
}

function minimalComfyBindings() {
  return {
    image: { nodeId: "1", inputName: "image" },
    prompt: { nodeId: "2", inputName: "text" },
    width: { nodeId: "3", inputName: "width" },
    height: { nodeId: "3", inputName: "height" },
    frameCount: { nodeId: "3", inputName: "frames" },
    frameRate: { nodeId: "3", inputName: "fps" },
    seed: { nodeId: "3", inputName: "seed" },
    filenamePrefix: { nodeId: "3", inputName: "prefix" },
  };
}

test("background worker handles generic HTTP sync and async video providers", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-worker-"));
  const videoPath = path.join(root, "fixture.mp4");
  await makeVideo(videoPath);
  const video = await fs.readFile(videoPath);
  let submitCount = 0;
  let syncRequestBody = "";
  let port = 0;
  let redirectPort = 0;
  let redirectedBodyHits = 0;
  let worker: VideoWorker | undefined;
  let standbyWorker: VideoWorker | undefined;
  const redirectServer = http.createServer(async (request, response) => {
    redirectedBodyHits += 1;
    await requestBody(request);
    response.writeHead(200, { "content-type": "video/mp4", "content-length": video.length }); response.end(video);
  });
  const server = http.createServer(async (request, response) => {
    const origin = `http://127.0.0.1:${port}`;
    if (request.url === "/sync" && request.method === "POST") {
      submitCount += 1;
      syncRequestBody = (await requestBody(request)).toString("utf8");
      response.writeHead(200, { "content-type": "video/mp4", "content-length": video.length }); response.end(video); return;
    }
    if (request.url === "/async-submit" && request.method === "POST") {
      submitCount += 1;
      response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ id: "job-1" })); return;
    }
    if (request.url === "/tasks/job-1") {
      response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ status: "completed", progress: 100, result: { url: `${origin}/video` } })); return;
    }
    if (request.url === "/tasks/job-resume") {
      response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ status: "completed", progress: 100, result: { url: `${origin}/video` } })); return;
    }
    if (request.url === "/video") {
      response.writeHead(200, { "content-type": "video/mp4", "content-length": video.length }); response.end(video); return;
    }
    if (request.url === "/cross-origin-submit" && request.method === "POST") {
      response.writeHead(307, { location: `http://127.0.0.1:${redirectPort}/should-not-receive` }); response.end(); return;
    }
    if (request.url === "/oversized-error" && request.method === "POST") {
      response.writeHead(500, { "content-type": "text/plain" }); response.end("x".repeat(80 * 1024)); return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise<void>((resolve) => redirectServer.listen(0, "127.0.0.1", () => { redirectPort = (redirectServer.address() as { port: number }).port; resolve(); }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => { port = (server.address() as { port: number }).port; resolve(); }));
  t.after(async () => {
    await Promise.all([worker?.stop(), standbyWorker?.stop()]);
    await Promise.all([
      new Promise<void>((resolve) => server.close(() => resolve())),
      new Promise<void>((resolve) => redirectServer.close(() => resolve())),
    ]);
    await fs.rm(root, { recursive: true, force: true });
  });

  const store = isolatedStore(root);
  let project = await store.createProject({ name: "后台视频闭环", templateId: "blank", shotCount: 5 });
  project = await store.updateProject(project.id, { brief: "同一空间的五个连续动作" });
  for (const shot of project.shots) project = await store.updateShot(project.id, shot.id, { cast: "同一位主要人物 1 人；主要人物总数严格为 1 人", scene: "真实室内", action: `人物完成动作 ${shot.index + 1}` });
  const contact = (await store.enqueueGeneration({ projectId: project.id, kind: "contact_sheet", shotIds: project.shots.map((shot) => shot.id) }))[0];
  project = await commitClaimedGeneration(store, { projectId: project.id, requestId: contact.id, imageDataUrl: await imageDataUrl() });
  project = await store.markContactSheetReview(project.id, true);
  for (const shot of project.shots) {
    const request = (await store.enqueueGeneration({ projectId: project.id, kind: "final", shotIds: [shot.id] }))[0];
    project = await commitClaimedGeneration(store, { projectId: project.id, requestId: request.id, imageDataUrl: await imageDataUrl() });
    project = await store.updateVideoPlan({ projectId: project.id, shotId: shot.id, prompt: `人物处于稳定初始姿态，随后平稳完成动作 ${shot.index + 1}，最终恢复稳定，镜头固定。`, negativePrompt: "时序变形，接触错误", frameRate: 16, frameCount: 49, source: "codex" });
  }

  const common = { width: 128, height: 224, frameRate: 16, frameCount: 49, pollSeconds: 1, timeoutMinutes: 1 };
  await store.videoProviders.saveProfile({ id: "sync", name: "同步", kind: "generic-http", enabled: true, defaults: common, http: { mode: "sync", imageMode: "multipart", submitUrl: `http://127.0.0.1:${port}/sync`, submitMethod: "POST", imageField: "image", auth: { type: "none" } }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await store.videoProviders.saveProfile({ id: "async", name: "异步", kind: "generic-http", enabled: true, defaults: common, http: { mode: "async", imageMode: "base64", submitUrl: `http://127.0.0.1:${port}/async-submit`, submitMethod: "POST", jobIdPath: "id", statusUrlTemplate: `http://127.0.0.1:${port}/tasks/{{job_id}}`, statusPath: "status", progressPath: "progress", successValues: ["completed"], resultUrlPath: "result.url", auth: { type: "none" } }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await store.videoProviders.saveProfile({ id: "redirect", name: "跨来源跳转", kind: "generic-http", enabled: true, defaults: common, http: { mode: "sync", imageMode: "base64", submitUrl: `http://127.0.0.1:${port}/cross-origin-submit`, submitMethod: "POST", auth: { type: "none" } }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await store.videoProviders.saveProfile({ id: "oversized-error", name: "超大错误响应", kind: "generic-http", enabled: true, defaults: common, http: { mode: "sync", imageMode: "base64", submitUrl: `http://127.0.0.1:${port}/oversized-error`, submitMethod: "POST", auth: { type: "none" } }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await store.enqueueVideoGeneration({ projectId: project.id, shotIds: [project.shots[0].id], providerId: "sync", allowUnreviewed: true, confirmExternalCost: true });
  await store.enqueueVideoGeneration({ projectId: project.id, shotIds: [project.shots[1].id], providerId: "async", allowUnreviewed: true, confirmExternalCost: true });
  const resumed = (await store.enqueueVideoGeneration({ projectId: project.id, shotIds: [project.shots[2].id], providerId: "async", allowUnreviewed: true, confirmExternalCost: true }))[0];
  const persistedProjectFile = path.join(root, "data", "projects", project.id, "project.json");
  const persistedProject = JSON.parse(await fs.readFile(persistedProjectFile, "utf8")) as {
    videoRequests: Array<{ id: string; status: string; remoteJobId?: string; progress?: number; submissionState?: string }>;
  };
  const persistedResumed = persistedProject.videoRequests.find((request) => request.id === resumed.id)!;
  persistedResumed.status = "running";
  persistedResumed.remoteJobId = "job-resume";
  persistedResumed.progress = 42;
  persistedResumed.submissionState = "accepted";
  await fs.writeFile(persistedProjectFile, JSON.stringify(persistedProject), "utf8");
  await store.enqueueVideoGeneration({ projectId: project.id, shotIds: [project.shots[3].id], providerId: "redirect", allowUnreviewed: true, confirmExternalCost: true });
  await store.enqueueVideoGeneration({ projectId: project.id, shotIds: [project.shots[4].id], providerId: "oversized-error", allowUnreviewed: true, confirmExternalCost: true });

  worker = new VideoWorker(store); worker.start();
  standbyWorker = new VideoWorker(isolatedStore(root)); standbyWorker.start();
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    project = await store.getProject(project.id);
    if (project.videoRequests.every((request) => ["completed", "failed"].includes(request.status))) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert.deepEqual(project.videoRequests.map((request) => request.status), ["completed", "completed", "completed", "failed", "failed"]);
  assert.equal(submitCount, 2, "a resumed async job must poll its saved job ID instead of submitting a second paid request");
  for (const field of ["prompt", "negative_prompt", "duration", "fps", "frame_count", "width", "height"]) {
    assert.match(syncRequestBody, new RegExp(`name="${field}"`), `default multipart requests must include ${field}`);
  }
  assert.match(syncRequestBody, /人物处于稳定初始姿态/);
  assert.equal(redirectedBodyHits, 0, "a cross-origin redirect must never receive the paid request body");
  assert.match(project.videoRequests[3].error ?? "", /跨来源重定向|无法确认/);
  assert.equal(project.videoRequests[3].submissionState, "unknown");
  assert.match(project.videoRequests[4].error ?? "", /错误内容超过安全限制/);
  assert.equal(project.videoRequests[4].submissionState, "unknown");
  assert.ok(project.shots.slice(0, 3).every((shot) => shot.videoArtifact?.path.endsWith("current.mp4")));
  for (const shot of project.shots.slice(0, 3)) await fs.access(path.join(root, "data", "projects", project.id, shot.videoArtifact!.path));
  await Promise.all([worker.stop(), standbyWorker.stop()]);
});

test("generic recovery replays accepted work only with the original idempotency key", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-generic-recovery-"));
  const videoPath = path.join(root, "fixture.mp4");
  await makeVideo(videoPath);
  const video = await fs.readFile(videoPath);
  let port = 0;
  let unsafeSubmitCount = 0;
  let idempotentSubmitCount = 0;
  let observedIdempotencyKey = "";
  let worker: VideoWorker | undefined;
  const server = http.createServer(async (request, response) => {
    if (request.url === "/unsafe" && request.method === "POST") {
      unsafeSubmitCount += 1;
      await requestBody(request);
      response.writeHead(200, { "content-type": "video/mp4", "content-length": video.length });
      response.end(video);
      return;
    }
    if (request.url === "/idempotent" && request.method === "POST") {
      idempotentSubmitCount += 1;
      observedIdempotencyKey = String(request.headers["idempotency-key"] ?? "");
      await requestBody(request);
      response.writeHead(200, { "content-type": "video/mp4", "content-length": video.length });
      response.end(video);
      return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => { port = (server.address() as { port: number }).port; resolve(); }));
  t.after(async () => {
    await worker?.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  });

  const store = isolatedStore(root);
  let project = await prepareVideoShots(store, 2, "幂等恢复");
  const defaults = { width: 128, height: 224, frameRate: 16, frameCount: 49, pollSeconds: 1, timeoutMinutes: 1 };
  await store.videoProviders.saveProfile({
    id: "recovery-unsafe", name: "无幂等恢复", kind: "generic-http", enabled: true,
    capabilities: { source: "local", billing: "local", modes: ["image-to-video"] }, defaults,
    http: { mode: "sync", imageMode: "base64", submitUrl: `http://127.0.0.1:${port}/unsafe`, submitMethod: "POST", auth: { type: "none" } },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  await store.videoProviders.saveProfile({
    id: "recovery-idempotent", name: "幂等恢复", kind: "generic-http", enabled: true,
    capabilities: { source: "local", billing: "local", modes: ["image-to-video"] }, defaults,
    http: {
      mode: "sync", imageMode: "base64", submitUrl: `http://127.0.0.1:${port}/idempotent`, submitMethod: "POST",
      idempotencyHeader: "Idempotency-Key", auth: { type: "none" },
    },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  const unsafe = (await store.enqueueVideoGeneration({ projectId: project.id, shotIds: [project.shots[0].id], providerId: "recovery-unsafe" }))[0];
  const idempotent = (await store.enqueueVideoGeneration({ projectId: project.id, shotIds: [project.shots[1].id], providerId: "recovery-idempotent" }))[0];
  const unsafeClaim = await store.claimPendingVideoRequest();
  assert.equal(unsafeClaim?.id, unsafe.id);
  await store.updateVideoRequestStatus(project.id, unsafe.id, "running", { submissionState: "accepted" }, unsafeClaim!.claimToken);
  const idempotentClaim = await store.claimPendingVideoRequest();
  assert.equal(idempotentClaim?.id, idempotent.id);
  await store.updateVideoRequestStatus(project.id, idempotent.id, "running", { submissionState: "accepted" }, idempotentClaim!.claimToken);
  await store.releaseVideoRequestClaim(project.id, unsafe.id, unsafeClaim!.claimToken);
  await store.releaseVideoRequestClaim(project.id, idempotent.id, idempotentClaim!.claimToken);

  worker = new VideoWorker(store);
  worker.start();
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    project = await store.getProject(project.id);
    if (project.videoRequests.every((request) => ["completed", "failed"].includes(request.status))) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.deepEqual(project.videoRequests.map((request) => request.status), ["failed", "completed"]);
  assert.equal(unsafeSubmitCount, 0, "accepted work without a remote ID or idempotency contract must fail closed");
  assert.equal(idempotentSubmitCount, 1);
  assert.equal(observedIdempotencyKey, idempotent.id, "recovery must reuse the originally persisted idempotency key");
  await assert.rejects(
    () => store.retryVideoRequest(project.id, unsafe.id),
    /没有幂等键|幂等请求头/,
    "manual retry must keep the same fail-closed boundary",
  );
  await worker.stop();
});

test("generic timeout keeps the remote job ID empty and releases its retryable claim", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-generic-timeout-"));
  const originalFetch = globalThis.fetch;
  let submitCount = 0;
  let worker: VideoWorker | undefined;
  t.after(async () => {
    await worker?.stop();
    globalThis.fetch = originalFetch;
    await fs.rm(root, { recursive: true, force: true });
  });

  const store = isolatedStore(root);
  let project = await prepareVideoShots(store, 1, "超时远端状态");
  await store.videoProviders.saveProfile({
    id: "timeout-no-idempotency", name: "超时且无幂等", kind: "generic-http", enabled: true,
    capabilities: { source: "local", billing: "local", modes: ["image-to-video"] },
    defaults: { width: 128, height: 224, frameRate: 16, frameCount: 49, pollSeconds: 1, timeoutMinutes: 1 },
    http: {
      mode: "sync", imageMode: "base64", submitUrl: "http://127.0.0.1:9919/timeout",
      submitMethod: "POST", auth: { type: "none" },
    },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  const request = (await store.enqueueVideoGeneration({
    projectId: project.id,
    shotIds: [project.shots[0].id],
    providerId: "timeout-no-idempotency",
  }))[0];
  globalThis.fetch = (async () => {
    submitCount += 1;
    throw new DOMException("模拟远端超时", "TimeoutError");
  }) as typeof fetch;

  worker = new VideoWorker(store);
  worker.start();
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    project = await store.getProject(project.id);
    if (project.videoRequests[0]?.status === "failed") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const stopped = project.videoRequests.find((item) => item.id === request.id)!;
  assert.equal(stopped.status, "failed");
  assert.equal(stopped.remoteJobId, undefined, "a generic timeout must never receive a synthetic Comfy prompt ID");
  assert.equal(stopped.submissionState, "unknown");
  assert.equal(stopped.attempt, 2, "retryable waiting must release the claim for an immediate reconciliation pass");
  assert.equal(submitCount, 1, "the second pass must fail closed before another paid submit");
  await worker.stop();
  globalThis.fetch = originalFetch;
});

test("generic definitive 4xx rejection can be retried while 409 remains ambiguous", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-generic-rejected-"));
  const videoPath = path.join(root, "fixture.mp4");
  await makeVideo(videoPath);
  const video = await fs.readFile(videoPath);
  let port = 0;
  let definitiveSubmitCount = 0;
  let ambiguousSubmitCount = 0;
  let worker: VideoWorker | undefined;
  const server = http.createServer(async (request, response) => {
    if (request.url === "/definitive" && request.method === "POST") {
      definitiveSubmitCount += 1;
      await requestBody(request);
      if (definitiveSubmitCount === 1) {
        response.writeHead(422, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "invalid prompt" }));
      } else {
        response.writeHead(200, { "content-type": "video/mp4", "content-length": video.length });
        response.end(video);
      }
      return;
    }
    if (request.url === "/ambiguous" && request.method === "POST") {
      ambiguousSubmitCount += 1;
      await requestBody(request);
      response.writeHead(409, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "possible idempotency conflict" }));
      return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => {
    port = (server.address() as { port: number }).port;
    resolve();
  }));
  t.after(async () => {
    await worker?.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  });

  const store = isolatedStore(root);
  let project = await prepareVideoShots(store, 2, "明确拒绝与不确定提交");
  const defaults = { width: 128, height: 224, frameRate: 16, frameCount: 49, pollSeconds: 1, timeoutMinutes: 1 };
  await store.videoProviders.saveProfile({
    id: "definitive-rejection", name: "明确拒绝", kind: "generic-http", enabled: true,
    capabilities: { source: "local", billing: "local", modes: ["image-to-video"] }, defaults,
    http: { mode: "sync", imageMode: "base64", submitUrl: `http://127.0.0.1:${port}/definitive`, submitMethod: "POST", auth: { type: "none" } },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  await store.videoProviders.saveProfile({
    id: "ambiguous-conflict", name: "不确定冲突", kind: "generic-http", enabled: true,
    capabilities: { source: "local", billing: "local", modes: ["image-to-video"] }, defaults,
    http: { mode: "sync", imageMode: "base64", submitUrl: `http://127.0.0.1:${port}/ambiguous`, submitMethod: "POST", auth: { type: "none" } },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  const rejected = (await store.enqueueVideoGeneration({
    projectId: project.id, shotIds: [project.shots[0].id], providerId: "definitive-rejection",
  }))[0];
  const ambiguous = (await store.enqueueVideoGeneration({
    projectId: project.id, shotIds: [project.shots[1].id], providerId: "ambiguous-conflict",
  }))[0];

  worker = new VideoWorker(store);
  worker.start();
  let deadline = Date.now() + 18_000;
  while (Date.now() < deadline) {
    project = await store.getProject(project.id);
    if (project.videoRequests.every((request) => request.status === "failed")) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const rejectedState = project.videoRequests.find((request) => request.id === rejected.id)!;
  const ambiguousState = project.videoRequests.find((request) => request.id === ambiguous.id)!;
  assert.equal(rejectedState.status, "failed");
  assert.equal(rejectedState.submissionState, "rejected");
  assert.equal(ambiguousState.status, "failed");
  assert.equal(ambiguousState.submissionState, "unknown");
  assert.equal(definitiveSubmitCount, 1);
  assert.equal(ambiguousSubmitCount, 1, "409 must never be replayed without an idempotency header");
  await assert.rejects(() => store.retryVideoRequest(project.id, ambiguous.id), /无法确认|幂等/);

  const retry = await store.retryVideoRequest(project.id, rejected.id);
  assert.equal(retry.status, "queued");
  assert.equal(retry.submissionState, "not-submitted");
  deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    project = await store.getProject(project.id);
    if (project.videoRequests.find((request) => request.id === rejected.id)?.status === "completed") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(project.videoRequests.find((request) => request.id === rejected.id)?.status, "completed");
  assert.equal(definitiveSubmitCount, 2);
  await worker.stop();
});

test("Comfy unknown submissions stop automatically and resume only after an explicit retry", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-comfy-unknown-"));
  const videoPath = path.join(root, "fixture.mp4");
  await makeVideo(videoPath);
  const video = await fs.readFile(videoPath);
  let port = 0;
  let submitted = false;
  let promptId = "";
  let promptSubmitCount = 0;
  let worker: VideoWorker | undefined;
  const server = http.createServer(async (request, response) => {
    if (request.url === "/queue" && request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ queue_running: [], queue_pending: [] }));
      return;
    }
    if (request.url?.startsWith("/history/") && request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(submitted
        ? JSON.stringify({ [promptId]: { status: { status_str: "success" }, outputs: { "9": { videos: [{ filename: "result.mp4", type: "output", format: "video/mp4" }] } } } })
        : "{}");
      return;
    }
    if (request.url === "/upload/image" && request.method === "POST") {
      await requestBody(request);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ name: "retry-first-frame.png" }));
      return;
    }
    if (request.url === "/prompt" && request.method === "POST") {
      const body = JSON.parse((await requestBody(request)).toString("utf8")) as { prompt_id: string };
      promptSubmitCount += 1;
      promptId = body.prompt_id;
      submitted = true;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ prompt_id: promptId }));
      return;
    }
    if (request.url?.startsWith("/view?") && request.method === "GET") {
      response.writeHead(200, { "content-type": "video/mp4", "content-length": video.length });
      response.end(video);
      return;
    }
    if (request.url === "/history" && request.method === "POST") {
      await requestBody(request);
      response.writeHead(200, { "content-type": "application/json" }); response.end("{}");
      return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => { port = (server.address() as { port: number }).port; resolve(); }));
  t.after(async () => {
    await worker?.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  });

  const store = isolatedStore(root);
  let project = await prepareVideoShots(store, 1, "Comfy 未知提交");
  await store.videoProviders.saveProfile({
    id: "comfy-unknown", name: "Comfy 未知提交", kind: "comfyui-workflow", enabled: true,
    capabilities: { source: "local", billing: "local", modes: ["image-to-video"] },
    defaults: { width: 128, height: 224, frameRate: 16, frameCount: 49, pollSeconds: 1, timeoutMinutes: 1 },
    comfyui: {
      baseUrl: `http://127.0.0.1:${port}`, workflowFile: "workflow.json", queuePolicy: "wait-until-empty",
      workflowFormat: "api", outputNodeId: "9", bindings: minimalComfyBindings(),
    },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }, JSON.stringify(minimalComfyWorkflow()));
  const request = (await store.enqueueVideoGeneration({
    projectId: project.id,
    shotIds: [project.shots[0].id],
    providerId: "comfy-unknown",
  }))[0];
  const reservedPromptId = stablePromptId(request.id);
  const claim = await store.claimPendingVideoRequest();
  assert.equal(claim?.id, request.id);
  await store.updateVideoRequestStatus(project.id, request.id, "uploading", {}, claim!.claimToken);
  await store.updateVideoRequestStatus(project.id, request.id, "submitting", {
    remoteJobId: reservedPromptId,
    submissionState: "submitting",
    idempotencyKey: reservedPromptId,
  }, claim!.claimToken);
  await store.updateVideoRequestStatus(project.id, request.id, "waiting_remote", {
    submissionState: "unknown",
  }, claim!.claimToken);
  await store.releaseVideoRequestClaim(project.id, request.id, claim!.claimToken);

  worker = new VideoWorker(store);
  worker.start();
  let deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    project = await store.getProject(project.id);
    if (project.videoRequests[0]?.status === "failed") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(project.videoRequests[0]?.status, "failed");
  assert.equal(promptSubmitCount, 0, "an ambiguous prior submit must never be replayed automatically after an absent lookup");

  await store.retryVideoRequest(project.id, request.id);
  deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    project = await store.getProject(project.id);
    if (project.videoRequests[0]?.status === "completed") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(project.videoRequests[0]?.status, "completed", project.videoRequests[0]?.error);
  assert.equal(promptSubmitCount, 1, "the user's explicit retry may submit once after the old stable ID is confirmed absent");
  assert.equal(promptId, reservedPromptId, "the explicit retry must preserve the stable prompt ID");
  await worker.stop();
});

test("Comfy rechecks the reviewed workflow hash immediately before paid submission", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-comfy-workflow-hash-"));
  let port = 0;
  let promptSubmitCount = 0;
  let worker: VideoWorker | undefined;
  const server = http.createServer(async (request, response) => {
    if ((request.url === "/queue" || request.url?.startsWith("/history/")) && request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(request.url === "/queue" ? JSON.stringify({ queue_running: [], queue_pending: [] }) : "{}");
      return;
    }
    if (request.url === "/upload/image" && request.method === "POST") {
      await requestBody(request);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ name: "hash-check-frame.png" }));
      return;
    }
    if (request.url === "/prompt" && request.method === "POST") {
      promptSubmitCount += 1;
      await requestBody(request);
      response.writeHead(500); response.end();
      return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => { port = (server.address() as { port: number }).port; resolve(); }));
  t.after(async () => {
    await worker?.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  });

  const store = isolatedStore(root);
  let project = await prepareVideoShots(store, 1, "Comfy 工作流指纹");
  const profile = await store.videoProviders.saveProfile({
    id: "comfy-workflow-hash", name: "Comfy 工作流指纹", kind: "comfyui-workflow", enabled: true,
    capabilities: { source: "local", billing: "local", modes: ["image-to-video"] },
    defaults: { width: 128, height: 224, frameRate: 16, frameCount: 49, pollSeconds: 1, timeoutMinutes: 1 },
    comfyui: {
      baseUrl: `http://127.0.0.1:${port}`, workflowFile: "workflow.json", queuePolicy: "wait-until-empty",
      workflowFormat: "api", outputNodeId: "9", bindings: minimalComfyBindings(),
    },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }, JSON.stringify(minimalComfyWorkflow()));
  await store.enqueueVideoGeneration({ projectId: project.id, shotIds: [project.shots[0].id], providerId: profile.id });
  await fs.writeFile(store.videoProviders.workflowPath(profile), JSON.stringify({
    ...minimalComfyWorkflow(),
    "10": { class_type: "UnexpectedChangedNode", inputs: { value: 1 } },
  }), "utf8");

  worker = new VideoWorker(store);
  worker.start();
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    project = await store.getProject(project.id);
    if (project.videoRequests[0]?.status === "failed") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(project.videoRequests[0]?.status, "failed");
  assert.match(project.videoRequests[0]?.error ?? "", /工作流内容已在任务排队后变化/);
  assert.equal(promptSubmitCount, 0, "a changed workflow may be uploaded for validation context but must never reach /prompt");
  await worker.stop();
});

test("background worker applies declarative ComfyUI API bindings before submission", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-comfy-bindings-"));
  const videoPath = path.join(root, "fixture.mp4");
  await makeVideo(videoPath);
  const video = await fs.readFile(videoPath);
  let port = 0;
  let submitted = false;
  let promptId = "";
  let submittedPrompt: Record<string, { inputs?: Record<string, unknown> }> = {};
  let historyDeleteCount = 0;
  let historyDeletedAfterCommit = false;
  let historyDeleteObservedStatus = "";
  let historyDeleteObservedArtifact = false;
  let store: ProjectStore;
  let projectId = "";
  let worker: VideoWorker | undefined;
  const server = http.createServer(async (request, response) => {
    if (request.url === "/queue" && request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ queue_running: [], queue_pending: [] }));
      return;
    }
    if (request.url === "/upload/image" && request.method === "POST") {
      await requestBody(request);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ name: "uploaded-first-frame.png" }));
      return;
    }
    if (request.url === "/prompt" && request.method === "POST") {
      const body = JSON.parse((await requestBody(request)).toString("utf8")) as { prompt_id: string; prompt: typeof submittedPrompt };
      promptId = body.prompt_id;
      submittedPrompt = body.prompt;
      submitted = true;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ prompt_id: promptId }));
      return;
    }
    if (request.url?.startsWith("/history/") && request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(submitted ? JSON.stringify({ [promptId]: { status: { status_str: "success" }, outputs: { "9": { videos: [{ filename: "result.mp4", type: "output", format: "video/mp4" }] } } } }) : "{}");
      return;
    }
    if (request.url?.startsWith("/view?") && request.method === "GET") {
      response.writeHead(200, { "content-type": "video/mp4", "content-length": video.length });
      response.end(video);
      return;
    }
    if (request.url === "/history" && request.method === "POST") {
      await requestBody(request);
      historyDeleteCount += 1;
      const current = await store.getProject(projectId);
      historyDeleteObservedStatus = current.videoRequests[0]?.status ?? "missing";
      historyDeleteObservedArtifact = Boolean(current.shots[0]?.videoArtifact);
      historyDeletedAfterCommit = historyDeleteObservedStatus === "completed" && historyDeleteObservedArtifact;
      response.writeHead(200, { "content-type": "application/json" }); response.end("{}");
      return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => { port = (server.address() as { port: number }).port; resolve(); }));
  t.after(async () => {
    await worker?.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  });

  store = isolatedStore(root);
  let project = await store.createProject({ name: "ComfyUI 语义映射", templateId: "blank", shotCount: 1 });
  projectId = project.id;
  project = await store.updateProject(project.id, { brief: "单镜动作" });
  project = await store.updateShot(project.id, project.shots[0].id, { cast: "同一位主要人物 1 人；主要人物总数严格为 1 人", scene: "真实室内", action: "人物转头看向窗外" });
  const contact = (await store.enqueueGeneration({ projectId: project.id, kind: "contact_sheet", shotIds: [project.shots[0].id] }))[0];
  project = await commitClaimedGeneration(store, { projectId: project.id, requestId: contact.id, imageDataUrl: await imageDataUrl() });
  project = await store.markContactSheetReview(project.id, true);
  const imageRequest = (await store.enqueueGeneration({ projectId: project.id, kind: "final", shotIds: [project.shots[0].id] }))[0];
  project = await commitClaimedGeneration(store, { projectId: project.id, requestId: imageRequest.id, imageDataUrl: await imageDataUrl() });
  project = await store.updateVideoPlan({ projectId: project.id, shotId: project.shots[0].id, prompt: "人物站稳，随后转头看向窗外，头部平顺转动，最终视线停在窗外，固定镜头。", negativePrompt: "时序变形，镜头突变", frameRate: 16, frameCount: 49, source: "codex" });

  const workflow = {
    "1": { class_type: "LoadImage", inputs: { image: "placeholder.png" } },
    "2": { class_type: "PositiveText", inputs: { text: "" } },
    "3": { class_type: "NegativeText", inputs: { text: "" } },
    "4": { class_type: "VideoSize", inputs: { width: 1, height: 1, frames: 1, fps: 1, seed: 1, prefix: "video" } },
    "9": { class_type: "SaveVideo", inputs: { source: ["4", 0] } },
  };
  await store.videoProviders.saveProfile({
    id: "mapped-comfy", name: "映射 ComfyUI", kind: "comfyui-workflow", enabled: true,
    defaults: { width: 128, height: 224, frameRate: 16, frameCount: 49, pollSeconds: 1, timeoutMinutes: 1 },
    comfyui: {
      baseUrl: `http://127.0.0.1:${port}`, workflowFile: "workflow.json", queuePolicy: "wait-until-empty", workflowFormat: "api", outputNodeId: "9",
      bindings: {
        image: { nodeId: "1", inputName: "image" }, prompt: { nodeId: "2", inputName: "text" }, negativePrompt: { nodeId: "3", inputName: "text" },
        width: { nodeId: "4", inputName: "width" }, height: { nodeId: "4", inputName: "height" }, frameCount: { nodeId: "4", inputName: "frames" },
        frameRate: { nodeId: "4", inputName: "fps" }, seed: { nodeId: "4", inputName: "seed" }, filenamePrefix: { nodeId: "4", inputName: "prefix" },
      },
    },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }, JSON.stringify(workflow));
  await store.enqueueVideoGeneration({ projectId: project.id, shotIds: [project.shots[0].id], providerId: "mapped-comfy", allowUnreviewed: true, confirmExternalCost: true });

  worker = new VideoWorker(store); worker.start();
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    project = await store.getProject(project.id);
    if (project.videoRequests[0]?.status === "completed" || project.videoRequests[0]?.status === "failed") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const cleanupDeadline = Date.now() + 2_000;
  while (!historyDeletedAfterCommit && Date.now() < cleanupDeadline) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(project.videoRequests[0]?.status, "completed", project.videoRequests[0]?.error);
  assert.equal(submittedPrompt["1"].inputs?.image, "uploaded-first-frame.png");
  assert.match(String(submittedPrompt["2"].inputs?.text), /转头看向窗外/);
  assert.equal(submittedPrompt["3"].inputs?.text, "时序变形，镜头突变");
  assert.deepEqual(
    [submittedPrompt["4"].inputs?.width, submittedPrompt["4"].inputs?.height, submittedPrompt["4"].inputs?.frames, submittedPrompt["4"].inputs?.fps],
    [128, 224, 49, 16],
  );
  assert.match(String(submittedPrompt["4"].inputs?.prefix), /image-control\//);
  assert.equal(historyDeleteCount, 1);
  assert.equal(historyDeletedAfterCommit, true, `remote history may be deleted only after ffprobe validation and local commit succeed (status=${historyDeleteObservedStatus}, artifact=${historyDeleteObservedArtifact})`);
  await worker.stop();
});
