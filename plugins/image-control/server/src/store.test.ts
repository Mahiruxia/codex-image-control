import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { isPublicImageDownloadAddress, ProjectStore, validateImageDownloadUrl } from "./store.js";
import { emptyChecklist } from "./types.js";

function isolatedStore(stateRoot: string): ProjectStore {
  const sourceRoot = path.join(path.dirname(stateRoot), `${path.basename(stateRoot)}-plugin-source`);
  return new ProjectStore(sourceRoot, "http://127.0.0.1:4317", undefined, stateRoot);
}

async function imageDataUrl(red: number, green: number, blue: number): Promise<string> {
  const buffer = await sharp({
    create: { width: 12, height: 20, channels: 4, background: { r: red, g: green, b: blue, alpha: 1 } },
  }).png().toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function claimGeneration(store: ProjectStore, projectId: string, requestId: string): Promise<string> {
  const request = await store.setGenerationStatus(projectId, requestId, "generating");
  assert.ok(request.claimToken);
  assert.ok(request.claimedAt);
  assert.ok(request.leaseExpiresAt);
  return request.claimToken;
}

async function commitClaimedGeneration(
  store: ProjectStore,
  input: { projectId: string; requestId: string; imageDataUrl: string },
) {
  const claimToken = await claimGeneration(store, input.projectId, input.requestId);
  return store.commitGenerationResult({ ...input, claimToken });
}

async function claimVideo(store: ProjectStore, expectedRequestId: string): Promise<string> {
  const request = await store.claimPendingVideoRequest();
  assert.equal(request?.id, expectedRequestId);
  assert.ok(request?.claimToken);
  assert.ok(request.claimedAt);
  assert.ok(request.leaseExpiresAt);
  return request.claimToken;
}

async function advanceVideoForCommit(store: ProjectStore, projectId: string, requestId: string, claimToken: string): Promise<void> {
  await store.updateVideoRequestStatus(projectId, requestId, "running", {
    progress: 80,
    submissionState: "accepted",
  }, claimToken);
  await store.updateVideoRequestStatus(projectId, requestId, "downloading", { progress: 92 }, claimToken);
}

async function sizedImageDataUrl(width: number, height: number, red: number, green: number, blue: number, alpha = 1): Promise<string> {
  const buffer = await sharp({
    create: { width, height, channels: 4, background: { r: red, g: green, b: blue, alpha } },
  }).png().toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function halfSelectionMaskDataUrl(): Promise<string> {
  const buffer = await sharp({
    create: { width: 12, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{
    input: { create: { width: 6, height: 20, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } },
    left: 0,
    top: 0,
  }]).png().toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}


async function emptySelectionMaskDataUrl(): Promise<string> {
  return sizedImageDataUrl(12, 20, 0, 0, 0, 0);
}

test("video worker lease is exclusive across store instances and can be handed over", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-worker-lease-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const firstStore = isolatedStore(root);
  const secondStore = isolatedStore(root);
  await Promise.all([firstStore.init(), secondStore.init()]);

  const firstLease = await firstStore.tryAcquireVideoWorkerLease();
  assert.ok(firstLease);
  assert.equal(await secondStore.tryAcquireVideoWorkerLease(), undefined);

  await firstLease.release();
  const secondLease = await secondStore.tryAcquireVideoWorkerLease();
  assert.ok(secondLease);
  await secondLease.release();
});

test("rejects unsafe storage overlap before creating any state directory", async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-storage-boundary-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const sourceRoot = path.join(base, "plugin-source");
  await fs.mkdir(sourceRoot);

  const stateInsideSource = path.join(sourceRoot, "private-state");
  const stateOverlapStore = new ProjectStore(sourceRoot, "http://127.0.0.1:4317", undefined, stateInsideSource);
  await assert.rejects(() => stateOverlapStore.init(), /源码目录重叠/);
  await assert.rejects(() => fs.access(stateInsideSource));

  const stateRoot = path.join(base, "separate-state");
  const customNestedProjects = path.join(stateRoot, "custom-projects");
  const nestedStore = new ProjectStore(sourceRoot, "http://127.0.0.1:4317", customNestedProjects, stateRoot);
  await assert.rejects(() => nestedStore.init(), /<state>\/data\/projects|不得重叠/);
  await assert.rejects(() => fs.access(stateRoot));

  const containingState = path.join(base, "state-containing-source");
  const nestedSource = path.join(containingState, "plugin-source");
  await fs.mkdir(nestedSource, { recursive: true });
  const containingStore = new ProjectStore(nestedSource, "http://127.0.0.1:4317", undefined, containingState);
  await assert.rejects(() => containingStore.init(), /源码目录重叠/);

  const defaultStore = new ProjectStore(sourceRoot);
  assert.notEqual(defaultStore.stateDir, path.resolve(sourceRoot), "default private state must no longer live in plugin source");
});

test("fails closed on linked cleanup roots and entries without deleting their targets", async (t) => {
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-cleanup-link-state-"));
  const externalTarget = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-cleanup-link-target-"));
  const sentinel = path.join(externalTarget, "keep.txt");
  await fs.writeFile(sentinel, "must survive", "utf8");
  const store = isolatedStore(stateRoot);
  await store.init();
  t.after(async () => {
    await fs.rm(stateRoot, { recursive: true, force: true });
    await fs.rm(externalTarget, { recursive: true, force: true });
  });

  const linkType = process.platform === "win32" ? "junction" : "dir";
  const linkedEntry = path.join(store.projectDeletingDir, "linked-external-project");
  try {
    await fs.symlink(externalTarget, linkedEntry, linkType);
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) {
      t.skip("当前系统不允许创建测试用目录链接或联接点");
      return;
    }
    throw error;
  }
  try {
    await assert.rejects(() => store.init(), /符号链接|目录联接|重解析/);
    assert.equal(await fs.readFile(sentinel, "utf8"), "must survive");
  } finally {
    await fs.unlink(linkedEntry);
  }

  const legacyDeletingRoot = path.join(store.runtimeDir, "deleting");
  await fs.rmdir(legacyDeletingRoot);
  await fs.symlink(externalTarget, legacyDeletingRoot, linkType);
  try {
    await assert.rejects(() => store.init(), /符号链接|目录联接|重解析/);
    assert.equal(await fs.readFile(sentinel, "utf8"), "must survive");
  } finally {
    await fs.unlink(legacyDeletingRoot);
  }
});

test("single-image editor imports a source and supports repeated whole and masked edits", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-single-editor-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = isolatedStore(root);
  await store.init();

  let project = await store.createProject({ name: "单图反复修改", templateId: "image-editor", shotCount: 12 });
  assert.equal(project.shots.length, 1);
  assert.equal(project.stage, "production");
  const shotId = project.shots[0].id;

  project = await store.importEditorImage(project.id, await imageDataUrl(180, 30, 30), "原始照片.jpg");
  assert.equal(project.shots[0].status, "accepted");
  assert.equal(project.shots[0].hasUndo, false);
  assert.equal(project.shots[0].title, "原始照片");
  assert.equal(project.aspectRatio, "9:16");

  const wholeRequest = (await store.enqueueGeneration({
    projectId: project.id,
    kind: "image_edit",
    shotIds: [shotId],
    instruction: "保持主体不变，把背景换成自然窗边光线",
  }))[0];
  const wholeContext = await store.getGenerationContext(project.id, wholeRequest.id);
  assert.ok(wholeContext.currentImagePath?.endsWith(path.join("shots", "01", "current.png")));
  assert.equal(wholeContext.maskPath, undefined);
  project = await commitClaimedGeneration(store, { projectId: project.id, requestId: wholeRequest.id, imageDataUrl: await imageDataUrl(30, 180, 30) });
  assert.equal(project.shots[0].hasUndo, true);

  const maskedRequest = (await store.enqueueGeneration({
    projectId: project.id,
    kind: "region_edit",
    shotIds: [shotId],
    instruction: "只修改左半边背景",
    selectionMaskDataUrl: await halfSelectionMaskDataUrl(),
    annotatedPreviewDataUrl: await imageDataUrl(30, 180, 30),
  }))[0];
  const maskedContext = await store.getGenerationContext(project.id, maskedRequest.id);
  assert.ok(maskedContext.currentImagePath);
  assert.ok(maskedContext.maskPath);
  project = await commitClaimedGeneration(store, { projectId: project.id, requestId: maskedRequest.id, imageDataUrl: await imageDataUrl(30, 30, 180) });
  assert.equal(project.shots[0].hasUndo, true);

  const current = path.join(root, "data", "projects", project.id, "shots", "01", "current.png");
  const { data: editedPixels, info: editedInfo } = await sharp(current).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const editedPixel = (x: number, y: number) => {
    const offset = (y * editedInfo.width + x) * editedInfo.channels;
    return [...editedPixels.subarray(offset, offset + 3)];
  };
  assert.deepEqual(editedPixel(2, 10), [30, 30, 180], "选区内应采用本次生成结果");
  assert.deepEqual(editedPixel(10, 10), [30, 180, 30], "选区外像素必须与编辑前严格一致");

  const emptyMask = await emptySelectionMaskDataUrl();
  const currentPreview = await imageDataUrl(30, 30, 180);
  await assert.rejects(() => store.enqueueGeneration({
    projectId: project.id,
    kind: "region_edit",
    shotIds: [shotId],
    instruction: "空选区不应提交",
    selectionMaskDataUrl: emptyMask,
    annotatedPreviewDataUrl: currentPreview,
  }));
  const wrongSizeMask = await sizedImageDataUrl(11, 20, 255, 255, 255);
  await assert.rejects(() => store.enqueueGeneration({
    projectId: project.id,
    kind: "region_edit",
    shotIds: [shotId],
    instruction: "尺寸错误的选区不应提交",
    selectionMaskDataUrl: wrongSizeMask,
    annotatedPreviewDataUrl: currentPreview,
  }));

  project = await store.undoLastOverwrite(project.id, shotId);
  assert.equal(project.shots[0].hasUndo, false);
  const pixels = await sharp(current).raw().toBuffer();
  assert.deepEqual([...pixels.subarray(0, 3)], [30, 180, 30]);
});

async function digest(filePath: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

async function createAndApproveContactSheet(store: ProjectStore, projectId: string) {
  let project = await store.getProject(projectId);
  if (!project.brief.trim()) project = await store.updateProject(projectId, { brief: "统一场景中的连续图片故事" });
  for (const shot of project.shots) {
    const update: { cast?: string; scene?: string; action?: string } = {};
    if (!shot.cast.trim()) update.cast = "主要主体 1 个；总数严格为 1；身份与外形保持一致";
    if (!shot.scene.trim() && !shot.action.trim() && !shot.instruction.trim()) {
      update.scene = "同一室内空间";
      update.action = `完成分镜 ${shot.index + 1} 的单一动作`;
    }
    if (Object.keys(update).length) project = await store.updateShot(projectId, shot.id, update);
  }
  const request = (await store.enqueueGeneration({
    projectId,
    kind: "contact_sheet",
    shotIds: project.shots.map((shot) => shot.id),
  }))[0];
  await commitClaimedGeneration(store, { projectId, requestId: request.id, imageDataUrl: await imageDataUrl(180, 160, 120) });
  return store.markContactSheetReview(projectId, true);
}

async function createQueuedLocalVideo(store: ProjectStore, providerId: string) {
  let project = await store.createProject({ name: `视频队列 ${providerId}`, templateId: "blank", shotCount: 1 });
  project = await createAndApproveContactSheet(store, project.id);
  const imageRequest = (await store.enqueueGeneration({ projectId: project.id, kind: "final", shotIds: [project.shots[0].id] }))[0];
  project = await commitClaimedGeneration(store, {
    projectId: project.id,
    requestId: imageRequest.id,
    imageDataUrl: await imageDataUrl(60, 100, 140),
  });
  const provider = await store.videoProviders.saveProfile({
    id: providerId,
    name: "本机视频测试",
    kind: "generic-http",
    enabled: true,
    capabilities: { source: "local", billing: "local", modes: ["image-to-video"] },
    defaults: { width: 720, height: 1280, frameRate: 16, frameCount: 49, pollSeconds: 1, timeoutMinutes: 1 },
    http: {
      mode: "sync",
      imageMode: "base64",
      submitUrl: "http://127.0.0.1:9901/video",
      submitMethod: "POST",
      resultUrlPath: "result.url",
      auth: { type: "none" },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  project = await store.updateVideoPlan({
    projectId: project.id,
    shotId: project.shots[0].id,
    prompt: "初始状态：人物稳定站立。唯一主动作：右手整理衣袖。物理过程：手指沿袖口平稳移动。结束状态：右手自然垂落。镜头表现：固定手机机位。",
    frameRate: 16,
    frameCount: 49,
  });
  const request = (await store.enqueueVideoGeneration({
    projectId: project.id,
    shotIds: [project.shots[0].id],
    providerId: provider.id,
  }))[0];
  return { project, provider, request };
}

test("generic storyboard workflow keeps cast, atomic overwrite, one undo, runtime cleanup and persistence", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = isolatedStore(root);
  await store.init();

  let project = await store.createProject({ name: "通用分镜闭环测试", templateId: "blank" });
  assert.equal(project.shots.length, 6);
  assert.equal(new Set(project.shots.map((shot) => shot.storageKey)).size, 6);

  await assert.rejects(() => store.enqueueGeneration({
    projectId: project.id,
    kind: "contact_sheet",
    shotIds: project.shots.map((shot) => shot.id),
  }), /方向分析/);
  project = await store.updateProject(project.id, { brief: "复古卧室中的连续出门准备" });
  const castLock = "男主 1 人 + 女主 1 人；主要人物总数严格为 2 人；两者身份、性别与外形不可互换或复制";
  for (const shot of project.shots) {
    project = await store.updateShot(project.id, shot.id, {
      action: `男主与女主共同完成第 ${shot.index + 1} 个连续动作`,
    });
  }
  await assert.rejects(() => store.enqueueGeneration({
    projectId: project.id,
    kind: "contact_sheet",
    shotIds: project.shots.map((shot) => shot.id),
  }), /出场主体锁定/);
  for (const shot of project.shots) project = await store.updateShot(project.id, shot.id, { cast: castLock });

  await assert.rejects(() => store.enqueueGeneration({
    projectId: project.id,
    kind: "contact_sheet",
    shotIds: project.shots.slice(0, -1).map((shot) => shot.id),
  }), /必须一次覆盖当前全部分镜/);
  const canonicalShotIds = project.shots.map((shot) => shot.id);
  const contactRequests = await store.enqueueGeneration({
    projectId: project.id,
    kind: "contact_sheet",
    shotIds: [...canonicalShotIds].reverse(),
  });
  assert.deepEqual(contactRequests[0].shotIds, canonicalShotIds);
  const canonicalContext = await store.getGenerationContext(project.id, contactRequests[0].id);
  assert.deepEqual(canonicalContext.shots.map((shot) => shot.id), canonicalShotIds);
  assert.ok(canonicalContext.shots.every((shot) => shot.cast === castLock));
  project = await commitClaimedGeneration(store, {
    projectId: project.id,
    requestId: contactRequests[0].id,
    imageDataUrl: await imageDataUrl(180, 160, 120),
  });
  assert.equal(project.generationRequests.at(-1)?.status, "completed");
  assert.ok(project.contactSheetPath);
  assert.ok(project.shots.every((shot) => shot.status === "empty"));

  await assert.rejects(() => store.enqueueGeneration({
    projectId: project.id,
    kind: "final",
    shotIds: [project.shots[0].id],
  }), /确认宫格总览/);

  const reference = await imageDataUrl(220, 210, 200);
  await store.importReference(project.id, "face", reference, "face.png");
  await store.importReference(project.id, "body", reference, "body.png");
  project = await store.importReference(project.id, "outfit", reference, "outfit.png");
  assert.equal(project.contactSheetStale, true);
  await assert.rejects(() => store.markContactSheetReview(project.id, true), /已过期/);
  project = await createAndApproveContactSheet(store, project.id);
  assert.ok(project.contactSheetApprovedAt);
  assert.equal(project.stage, "production");

  const thumbnail = await store.getMediaData(project.id, project.references.face!.path, "thumbnail");
  assert.match(thumbnail.dataUrl, /^data:image\/webp;base64,/);
  assert.ok(thumbnail.width <= 360 && thumbnail.height <= 360);
  const sourceMedia = await store.getMediaData(project.id, project.references.face!.path, "source");
  assert.match(sourceMedia.dataUrl, /^data:image\/png;base64,/);
  assert.equal(sourceMedia.width, 12);
  assert.equal(sourceMedia.height, 20);

  const videoDir = path.join(root, "data", "projects", project.id, "shots", "01", "video");
  await fs.mkdir(videoDir, { recursive: true });
  await fs.writeFile(path.join(videoDir, "current.mp4"), Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]));
  await assert.rejects(
    () => store.getMediaData(project.id, "shots\\01\\video\\current.mp4", "source"),
    /未登记/,
  );

  const firstShotId = project.shots[0].id;
  const secondShotId = project.shots[1].id;
  const finalRequests = await store.enqueueGeneration({
    projectId: project.id,
    kind: "final",
    shotIds: [firstShotId, secondShotId],
  });
  assert.equal(finalRequests.length, 2);
  await assert.rejects(() => store.enqueueGeneration({
    projectId: project.id,
    kind: "final",
    shotIds: [firstShotId],
  }), /已有待处理请求/);

  const firstFinalClaimToken = await claimGeneration(store, project.id, finalRequests[0].id);
  project = await store.commitGenerationResult({
    projectId: project.id,
    requestId: finalRequests[0].id,
    claimToken: firstFinalClaimToken,
    imageDataUrl: await imageDataUrl(220, 30, 30),
  });
  const firstShot = project.shots.find((shot) => shot.id === firstShotId)!;
  const firstCurrent = path.join(root, "data", "projects", project.id, firstShot.imagePath!);
  const redDigest = await digest(firstCurrent);
  assert.equal(firstShot.status, "accepted");
  assert.equal(firstShot.hasUndo, false);

  await assert.rejects(() => store.moveShot(project.id, firstShotId, 1), /正在处理图片/);
  for (const pendingRequest of finalRequests.slice(1)) await store.cancelQueuedRequest(project.id, pendingRequest.id);
  project = await store.moveShot(project.id, firstShotId, 1);
  assert.equal(project.shots[1].id, firstShotId);
  assert.equal(project.shots[1].storageKey, firstShot.storageKey);

  const failedEdit = (await store.enqueueGeneration({
    projectId: project.id,
    kind: "region_edit",
    shotIds: [firstShotId],
    instruction: "只改选区",
    selectionMaskDataUrl: await imageDataUrl(255, 255, 255),
    annotatedPreviewDataUrl: await imageDataUrl(255, 255, 0),
  }))[0];
  const failedEditClaimToken = await claimGeneration(store, project.id, failedEdit.id);
  await assert.rejects(async () => store.commitGenerationResult({
    projectId: project.id,
    requestId: failedEdit.id,
    claimToken: failedEditClaimToken,
    imageDataUrl: "data:text/plain;base64,SGVsbG8=",
  }), /只接受 PNG/);
  assert.equal(await digest(firstCurrent), redDigest);
  project = await store.getProject(project.id);
  assert.equal(project.generationRequests.find((item) => item.id === failedEdit.id)?.status, "failed");
  await assert.rejects(() => fs.access(path.join(root, ".runtime", "requests", failedEdit.id)));

  const validEdit = (await store.enqueueGeneration({
    projectId: project.id,
    kind: "region_edit",
    shotIds: [firstShotId],
    instruction: "只改选区",
    selectionMaskDataUrl: await imageDataUrl(255, 255, 255),
    annotatedPreviewDataUrl: await imageDataUrl(0, 255, 255),
  }))[0];
  project = await commitClaimedGeneration(store, {
    projectId: project.id,
    requestId: validEdit.id,
    imageDataUrl: await imageDataUrl(20, 70, 220),
  });
  assert.notEqual(await digest(firstCurrent), redDigest);
  assert.equal(project.shots.find((shot) => shot.id === firstShotId)?.hasUndo, true);
  await assert.rejects(() => fs.access(path.join(root, ".runtime", "requests", validEdit.id)));

  project = await store.undoLastOverwrite(project.id, firstShotId);
  assert.equal(await digest(firstCurrent), redDigest);
  assert.equal(project.shots.find((shot) => shot.id === firstShotId)?.hasUndo, false);
  await assert.rejects(() => store.undoLastOverwrite(project.id, firstShotId), /没有可撤销/);

  await assert.rejects(() => store.markShotReview(project.id, firstShotId, emptyChecklist(), true), /六项人工检查/);
  const allChecked: ReturnType<typeof emptyChecklist> = {
    face: true,
    outfit: true,
    contact: true,
    lighting: true,
    space: true,
    continuity: true,
  };
  project = await store.markShotReview(project.id, firstShotId, allChecked, true);
  assert.equal(project.shots.find((shot) => shot.id === firstShotId)?.status, "accepted");

  await assert.rejects(() => store.resolveMediaPath(project.id, "../project.json"), /路径越界/);
  await assert.rejects(() => store.getMediaData(project.id, "../project.json", "preview"), /路径越界/);
  await assert.rejects(() => store.enqueueGeneration({
    projectId: project.id,
    kind: "final",
    shotIds: ["shot_does_not_exist"],
  }), /不存在的分镜/);

  const restarted = isolatedStore(root);
  const restored = await restarted.getProject(project.id);
  assert.equal(restored.shots.find((shot) => shot.id === firstShotId)?.status, "accepted");
  assert.ok(restored.shots.every((shot) => shot.cast === castLock));
  assert.equal(await digest(firstCurrent), redDigest);
});

test("edits arbitrary selected contact-sheet cells with a mask and atomically writes the sheet back", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-contact-edit-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = isolatedStore(root);
  let project = await store.createProject({ name: "宫格多选重做", templateId: "blank", shotCount: 8 });
  const whiteMask = await imageDataUrl(255, 255, 255);
  const halfMask = await halfSelectionMaskDataUrl();
  const yellowPreview = await imageDataUrl(255, 255, 0);
  await assert.rejects(() => store.enqueueGeneration({
    projectId: project.id,
    kind: "contact_sheet_edit",
    shotIds: [project.shots[1].id],
    instruction: "重做选中格",
    selectionMaskDataUrl: whiteMask,
    annotatedPreviewDataUrl: yellowPreview,
  }), /先生成当前版本/);

  project = await createAndApproveContactSheet(store, project.id);
  const approvedAtBeforeFailedEdit = project.contactSheetApprovedAt;
  assert.deepEqual(project.contactSheetGrid, { columns: 4, rows: 2 });
  const originalClientContactUrl = store.toClientProject(project).contactSheetUrl;
  const contactPath = path.join(root, "data", "projects", project.id, project.contactSheetPath!);
  const originalDigest = await digest(contactPath);
  const failedRequest = (await store.enqueueGeneration({
    projectId: project.id,
    kind: "contact_sheet_edit",
    shotIds: [project.shots[0].id],
    instruction: "测试失败后仍可重试选格",
    selectionMaskDataUrl: halfMask,
    annotatedPreviewDataUrl: yellowPreview,
  }))[0];
  const failedRequestClaimToken = await claimGeneration(store, project.id, failedRequest.id);
  await store.setGenerationStatus(project.id, failedRequest.id, "failed", "测试生成失败", failedRequestClaimToken);
  project = await store.getProject(project.id);
  assert.equal(project.contactSheetStale, false);
  assert.equal(project.contactSheetApprovedAt, approvedAtBeforeFailedEdit);
  assert.equal(store.toClientProject(project).contactSheetUrl, originalClientContactUrl);
  const selectedShotIds = [project.shots[1].id, project.shots[3].id, project.shots[6].id];
  await assert.rejects(() => store.enqueueGeneration({
    projectId: project.id,
    kind: "contact_sheet_edit",
    shotIds: selectedShotIds,
    instruction: "动作更自然",
  }), /缺少选区蒙版/);

  const request = (await store.enqueueGeneration({
    projectId: project.id,
    kind: "contact_sheet_edit",
    shotIds: selectedShotIds,
    instruction: "只把选中的三格改成更自然的手机抓拍，其他格保持原样",
    selectionMaskDataUrl: halfMask,
    annotatedPreviewDataUrl: yellowPreview,
  }))[0];
  project = await store.getProject(project.id);
  assert.equal(project.contactSheetStale, false);
  assert.equal(project.contactSheetApprovedAt, approvedAtBeforeFailedEdit);
  assert.equal(store.toClientProject(project).contactSheetUrl, originalClientContactUrl);
  assert.ok(project.shots.every((shot) => shot.status === "empty"));
  const context = await store.getGenerationContext(project.id, request.id);
  assert.deepEqual(context.contactSheetGrid, { columns: 4, rows: 2 });
  assert.equal(context.shots.length, 3);
  assert.ok(context.currentImagePath?.endsWith(path.join("storyboard", "contact-sheet.png")));
  assert.ok(context.maskPath?.endsWith(path.join(request.id, "selection-mask.png")));
  assert.ok(context.annotatedPreviewPath?.endsWith(path.join(request.id, "annotated-preview.png")));
  await assert.rejects(() => store.enqueueGeneration({
    projectId: project.id,
    kind: "contact_sheet",
    shotIds: project.shots.map((shot) => shot.id),
  }), /已有待处理请求/);

  project = await commitClaimedGeneration(store, {
    projectId: project.id,
    requestId: request.id,
    imageDataUrl: await imageDataUrl(40, 120, 180),
  });
  assert.notEqual(await digest(contactPath), originalDigest);
  const { data: pixels, info } = await sharp(contactPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => {
    const offset = (y * info.width + x) * info.channels;
    return [...pixels.subarray(offset, offset + 3)];
  };
  assert.deepEqual(pixel(2, 10), [40, 120, 180]);
  assert.deepEqual(pixel(10, 10), [180, 160, 120]);
  assert.equal(project.generationRequests.find((item) => item.id === request.id)?.status, "completed");
  assert.equal(project.contactSheetStale, false);
  assert.equal(project.contactSheetApprovedAt, undefined);
  assert.deepEqual(project.contactSheetGrid, { columns: 4, rows: 2 });
  const editedClientContactUrl = store.toClientProject(project).contactSheetUrl;
  assert.notEqual(editedClientContactUrl, originalClientContactUrl);
  project = await store.saveCanvas(project.id, { notes: [{ id: "note_url_stability", text: "不应刷新宫格媒体", position: { x: 10, y: 10 }, color: "sage" }] });
  assert.equal(store.toClientProject(project).contactSheetUrl, editedClientContactUrl);
  await assert.rejects(() => fs.access(path.join(root, ".runtime", "requests", request.id)));
});

test("rejects unsupported and oversized image payloads", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-limits-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = isolatedStore(root);
  const project = await store.createProject({ name: "输入边界", templateId: "blank" });
  await assert.rejects(() => store.importReference(project.id, "face", "data:image/gif;base64,R0lGODlhAQABAAAAACw="), /只接受 PNG/);
  const tooLarge = `data:image/png;base64,${Buffer.alloc(25 * 1024 * 1024 + 1).toString("base64")}`;
  await assert.rejects(() => store.importReference(project.id, "face", tooLarge), /超过 25MB/);
});

test("rejects private image download targets before any network request", async (t) => {
  assert.equal(isPublicImageDownloadAddress("127.0.0.1"), false);
  assert.equal(isPublicImageDownloadAddress("169.254.169.254"), false);
  assert.equal(isPublicImageDownloadAddress("10.2.3.4"), false);
  assert.equal(isPublicImageDownloadAddress("::1"), false);
  assert.equal(isPublicImageDownloadAddress("fc00::1"), false);
  assert.equal(isPublicImageDownloadAddress("8.8.8.8"), true);
  assert.equal(isPublicImageDownloadAddress("2606:4700:4700::1111"), true);
  assert.throws(() => validateImageDownloadUrl("http://example.com/image.png"), /公网 HTTPS/);
  assert.throws(() => validateImageDownloadUrl("https://127.0.0.1/image.png"), /私网/);
  const embeddedCredentialUrl = `https://${["user", "pass"].join(":")}@example.com/image.png`;
  assert.throws(() => validateImageDownloadUrl(embeddedCredentialUrl), /用户名或密码/);
  assert.equal(validateImageDownloadUrl("https://example.com/image.png#fragment").hash, "");

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-download-guard-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = isolatedStore(root);
  let project = await store.createProject({ name: "下载保护", templateId: "blank", shotCount: 1 });
  project = await createAndApproveContactSheet(store, project.id);
  const request = (await store.enqueueGeneration({
    projectId: project.id,
    kind: "final",
    shotIds: [project.shots[0].id],
  }))[0];
  const claimToken = await claimGeneration(store, project.id, request.id);
  await assert.rejects(() => store.commitGenerationResult({
    projectId: project.id,
    requestId: request.id,
    claimToken,
    imageFile: { download_url: "https://127.0.0.1/private.png", file_id: "test-private-target" },
  }), /私网/);
});

test("serves only registered real PNG or MP4 media and signs client URLs", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-media-guard-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = isolatedStore(root);
  store.setMediaSigningSecret("test-media-signing-secret-that-is-long-enough-0001");
  let project = await store.createProject({ name: "媒体保护", templateId: "image-editor" });
  project = await store.importEditorImage(project.id, await imageDataUrl(90, 120, 150), "source.png");
  const relativePath = project.shots[0].imagePath!;
  const resolved = await store.resolveMediaPath(project.id, relativePath);
  assert.ok(resolved.endsWith(path.join("shots", "01", "current.png")));
  await assert.rejects(() => store.resolveMediaPath(project.id, "project.json"), /未登记/);

  const client = store.toClientProject(await store.getProject(project.id));
  const signedUrl = new URL(client.shots[0].imageUrl!);
  assert.equal(store.verifyMediaSignature(
    project.id,
    relativePath,
    signedUrl.searchParams.get("exp"),
    signedUrl.searchParams.get("sig"),
  ), true);
  assert.equal(store.verifyMediaSignature(
    project.id,
    "project.json",
    signedUrl.searchParams.get("exp"),
    signedUrl.searchParams.get("sig"),
  ), false);

  const original = await fs.readFile(resolved);
  await fs.writeFile(resolved, "not a png", "utf8");
  await assert.rejects(() => store.resolveMediaPath(project.id, relativePath), /内容与声明类型不一致/);
  await fs.writeFile(resolved, original);

  const outside = path.join(root, "outside.png");
  await fs.writeFile(outside, original);
  const backup = `${resolved}.backup`;
  await fs.rename(resolved, backup);
  try {
    try {
      await fs.symlink(outside, resolved, "file");
      await assert.rejects(() => store.resolveMediaPath(project.id, relativePath), /符号链接|联接点/);
      await fs.rm(resolved, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    }
  } finally {
    await fs.rm(resolved, { force: true });
    await fs.rename(backup, resolved);
  }
});

test("claims image requests once and rejects duplicate, late, or stale writes", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-generation-guard-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = isolatedStore(root);
  let project = await store.createProject({ name: "生成状态保护", templateId: "blank", shotCount: 1 });
  project = await createAndApproveContactSheet(store, project.id);
  const shotId = project.shots[0].id;

  const first = (await store.enqueueGeneration({ projectId: project.id, kind: "final", shotIds: [shotId] }))[0];
  await assert.rejects(async () => store.commitGenerationResult({
    projectId: project.id,
    requestId: first.id,
    claimToken: "unclaimed",
    imageDataUrl: await imageDataUrl(180, 30, 30),
  }), /尚未认领/);
  const claims = await Promise.allSettled([
    store.setGenerationStatus(project.id, first.id, "generating"),
    store.setGenerationStatus(project.id, first.id, "generating"),
  ]);
  assert.equal(claims.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(claims.filter((result) => result.status === "rejected").length, 1);
  const firstClaim = claims.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])[0];
  assert.ok(firstClaim?.claimToken);
  assert.equal(firstClaim.attempt, 1);
  const firstClaimToken = firstClaim.claimToken;
  const publicProject = store.toClientProject(await store.getProject(project.id));
  assert.equal(publicProject.generationRequests.find((request) => request.id === first.id)?.claimToken, undefined);
  assert.equal((await store.getGenerationRequests(project.id)).find((request) => request.id === first.id)?.claimToken, undefined);
  assert.equal((await store.getGenerationContext(project.id, first.id)).request.claimToken, undefined);
  await assert.rejects(async () => store.commitGenerationResult({
    projectId: project.id,
    requestId: first.id,
    claimToken: "wrong-owner",
    imageDataUrl: await imageDataUrl(30, 180, 30),
  }), /认领令牌无效/);
  project = await store.commitGenerationResult({ projectId: project.id, requestId: first.id, claimToken: firstClaimToken, imageDataUrl: await imageDataUrl(180, 30, 30) });
  const currentPath = path.join(root, "data", "projects", project.id, project.shots[0].imagePath!);
  const firstDigest = await digest(currentPath);
  assert.equal(project.shots[0].hasUndo, false);

  await assert.rejects(async () => store.commitGenerationResult({ projectId: project.id, requestId: first.id, claimToken: firstClaimToken, imageDataUrl: await imageDataUrl(30, 180, 30) }), /不会接收迟到结果/);
  assert.equal(await digest(currentPath), firstDigest);
  assert.equal(project.shots[0].hasUndo, false);

  const late = (await store.enqueueGeneration({ projectId: project.id, kind: "final", shotIds: [shotId] }))[0];
  const lateClaimToken = await claimGeneration(store, project.id, late.id);
  const failedRequest = await store.setGenerationStatus(project.id, late.id, "failed", "主动结束测试", lateClaimToken);
  assert.equal(failedRequest.claimToken, undefined);
  const lateImage = await imageDataUrl(30, 30, 180);
  await assert.rejects(() => store.commitGenerationResult({ projectId: project.id, requestId: late.id, claimToken: lateClaimToken, imageDataUrl: lateImage }), /不会接收迟到结果/);
  assert.equal(await digest(currentPath), firstDigest);

  const stale = (await store.enqueueGeneration({ projectId: project.id, kind: "final", shotIds: [shotId] }))[0];
  const staleClaimToken = await claimGeneration(store, project.id, stale.id);
  await store.updateProject(project.id, { brief: "生成期间改变了方向" });
  const staleImage = await imageDataUrl(200, 200, 30);
  await assert.rejects(() => store.commitGenerationResult({ projectId: project.id, requestId: stale.id, claimToken: staleClaimToken, imageDataUrl: staleImage }), /已经变化/);
  project = await store.getProject(project.id);
  assert.equal(project.generationRequests.find((request) => request.id === stale.id)?.status, "failed");
  assert.equal(project.shots[0].status, "accepted");
  assert.equal(await digest(currentPath), firstDigest);

  const recoverable = (await store.enqueueGeneration({
    projectId: project.id,
    kind: "region_edit",
    shotIds: [shotId],
    instruction: "测试超时租约恢复",
    selectionMaskDataUrl: await imageDataUrl(255, 255, 255),
    annotatedPreviewDataUrl: await imageDataUrl(20, 20, 20),
  }))[0];
  const expiredClaimToken = await claimGeneration(store, project.id, recoverable.id);
  await assert.rejects(() => store.recoverGenerationRequest(project.id, recoverable.id), /租约仍有效/);
  const projectFile = path.join(root, "data", "projects", project.id, "project.json");
  const persisted = JSON.parse(await fs.readFile(projectFile, "utf8")) as { generationRequests: Array<{ id: string; leaseExpiresAt?: string }> };
  const persistedRequest = persisted.generationRequests.find((request) => request.id === recoverable.id)!;
  persistedRequest.leaseExpiresAt = new Date(Date.now() - 1_000).toISOString();
  await fs.writeFile(projectFile, `${JSON.stringify(persisted, null, 2)}\n`, "utf8");
  await assert.rejects(async () => store.commitGenerationResult({
    projectId: project.id,
    requestId: recoverable.id,
    claimToken: expiredClaimToken,
    imageDataUrl: await imageDataUrl(10, 10, 10),
  }), /执行租约已过期/);
  const recovered = await store.recoverGenerationRequest(project.id, recoverable.id, "测试作废超时任务");
  assert.equal(recovered.status, "failed");
  assert.equal(recovered.claimToken, undefined);
  assert.ok(recovered.claimedAt, "claim audit metadata remains available after recovery");
  assert.ok(recovered.leaseExpiresAt, "expired lease deadline remains available for diagnosis");
  assert.match(recovered.error ?? "", /测试作废/);
  await assert.rejects(async () => store.commitGenerationResult({
    projectId: project.id,
    requestId: recoverable.id,
    claimToken: expiredClaimToken,
    imageDataUrl: await imageDataUrl(10, 10, 10),
  }), /不会接收迟到结果/);
});

test("keeps independently claimed image failures isolated", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-generation-isolation-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = isolatedStore(root);
  let project = await store.createProject({ name: "单张失败隔离", templateId: "blank", shotCount: 2 });
  project = await createAndApproveContactSheet(store, project.id);
  const requests = await store.enqueueGeneration({
    projectId: project.id,
    kind: "final",
    shotIds: project.shots.map((shot) => shot.id),
  });
  const [failedToken, successfulToken] = await Promise.all(requests.map((request) => claimGeneration(store, project.id, request.id)));
  await store.setGenerationStatus(project.id, requests[0].id, "failed", "仅第一张失败", failedToken);
  project = await store.commitGenerationResult({
    projectId: project.id,
    requestId: requests[1].id,
    claimToken: successfulToken,
    imageDataUrl: await imageDataUrl(30, 160, 90),
  });
  assert.equal(project.generationRequests.find((request) => request.id === requests[0].id)?.status, "failed");
  assert.equal(project.generationRequests.find((request) => request.id === requests[1].id)?.status, "completed");
  assert.equal(project.shots[0].imagePath, undefined);
  assert.ok(project.shots[1].imagePath);
  assert.equal(project.shots[1].status, "accepted");
});

test("rejects removed templates, migrates legacy projects and resizes generic storyboards between 1 and 24 shots", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-template-migration-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = isolatedStore(root);

  await assert.rejects(() => store.createProject({
    name: "已移除类型",
    templateId: "womens-ecommerce" as never,
    shotCount: 7,
  }), /项目类型不受支持/);

  let project = await store.createProject({ name: "通用分镜数量", templateId: "blank", shotCount: 5 });
  assert.equal(project.shots.length, 5);
  assert.ok(project.shots.every((shot) => shot.cast === ""));
  project = await store.resizeShotCount(project.id, { targetCount: 11 });
  assert.equal(project.shots.length, 11);
  assert.equal(new Set(project.shots.map((shot) => shot.storageKey)).size, 11);
  assert.equal(new Set(project.shots.map((shot) => `${shot.position.x},${shot.position.y}`)).size, 11);
  await assert.rejects(() => store.resizeShotCount(project.id, { targetCount: 3 }), /请先确认/);
  project = await store.resizeShotCount(project.id, { targetCount: 3, confirmRemoval: true });
  assert.equal(project.shots.length, 3);
  assert.deepEqual(project.shots.map((shot) => shot.index), [0, 1, 2]);

  const legacy = await store.createProject({ name: "旧项目兼容", templateId: "blank", shotCount: 2 });
  const legacyFile = path.join(root, "data", "projects", legacy.id, "project.json");
  const legacyJson = JSON.parse(await fs.readFile(legacyFile, "utf8"));
  legacyJson.templateId = "womens-ecommerce";
  legacyJson.brief = "同一位男主和同一位女主在统一场景中完成连续情节";
  legacyJson.shots[0].action = "男主和女主一同看向桌面上的线索";
  for (const shot of legacyJson.shots) delete shot.cast;
  await fs.writeFile(legacyFile, JSON.stringify(legacyJson), "utf8");

  const migrated = await store.getProject(legacy.id);
  assert.equal(migrated.templateId, "blank");
  assert.match(migrated.shots[0].cast, /男主 1 人 \+ 女主 1 人/);
  assert.match(migrated.shots[0].cast, /总数严格为 2 人/);
  const persisted = JSON.parse(await fs.readFile(legacyFile, "utf8"));
  assert.equal(persisted.templateId, "blank");
  assert.equal(typeof persisted.shots[0].cast, "string");
});

test("keeps generic reference constraints and exact per-shot cast in generation context without template-specific gates", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-constraints-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = isolatedStore(root);
  let project = await store.createProject({ name: "通用文字约束", templateId: "blank", shotCount: 4 });
  assert.equal(project.shots.length, 4);
  assert.ok(project.shots[2].position.y > project.shots[0].position.y);
  project = await store.addShot(project.id);
  assert.equal(new Set(project.shots.map((shot) => `${shot.position.x},${shot.position.y}`)).size, 5);
  project = await store.updateReferenceConstraint(project.id, "face", "男主短发方脸，女主深棕长发鹅蛋脸，两人身份全程分别固定");
  project = await store.updateReferenceConstraint(project.id, "body", "男主高挑，女主自然匀称，两人身材比例分别固定");
  project = await store.updateReferenceConstraint(project.id, "outfit", "男主深蓝夹克，女主灰色针织衫，服装不可互换");
  const castLock = "男主 1 人 + 女主 1 人；主要人物总数严格为 2 人；两者身份、性别与外形不可互换或复制";
  project = await store.updateShot(project.id, project.shots[0].id, {
    cast: castLock,
    scene: "同一间客厅",
    action: "男主与女主分别坐在沙发两端，同时看向桌面线索",
  });

  await assert.rejects(() => store.enqueueGeneration({
    projectId: project.id,
    kind: "final",
    shotIds: [project.shots[0].id],
  }), /宫格总览/);
  project = await createAndApproveContactSheet(store, project.id);

  const request = (await store.enqueueGeneration({
    projectId: project.id,
    kind: "final",
    shotIds: [project.shots[0].id],
  }))[0];
  const context = await store.getGenerationContext(project.id, request.id);
  assert.equal(context.referenceConstraints.outfit, project.referenceConstraints.outfit);
  assert.deepEqual(context.referencePaths, {});
  assert.equal(context.shots[0].cast, castLock);
  await store.cancelQueuedRequest(project.id, request.id);

  project = await store.updateReferenceConstraint(project.id, "outfit", "");
  project = await createAndApproveContactSheet(store, project.id);
  const noOutfitRequest = (await store.enqueueGeneration({ projectId: project.id, kind: "final", shotIds: [project.shots[0].id] }))[0];
  const noOutfitContext = await store.getGenerationContext(project.id, noOutfitRequest.id);
  assert.equal(noOutfitContext.referenceConstraints.outfit, undefined);
  assert.equal(noOutfitContext.shots[0].cast, castLock);
  await store.cancelQueuedRequest(project.id, noOutfitRequest.id);
});

test("keeps a JianYing-ready daily material layout synchronized without deleting user files", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-material-layout-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = isolatedStore(root);
  let project = await store.createProject({ name: "剪映批量导入", templateId: "blank", shotCount: 2 });
  const projectPath = path.join(root, "data", "projects", project.id);

  await Promise.all([
    fs.access(path.join(projectPath, "00_输入素材")),
    fs.access(path.join(projectPath, "01_分镜图")),
    fs.access(path.join(projectPath, "02_分镜视频")),
  ]);
  assert.match(await fs.readFile(path.join(projectPath, "今日方案.md"), "utf8"), /图片生成中控自动同步/);

  project = await store.importReference(project.id, "face", await imageDataUrl(210, 190, 170), "人物参考.jpg");
  project = await store.updateShot(project.id, project.shots[0].id, { title: "晨光坐起", scene: "卧室窗边", action: "坐起整理裙摆" });
  project = await store.updateShot(project.id, project.shots[1].id, { title: "玄关穿鞋", scene: "同一公寓玄关", action: "坐稳穿鞋" });
  project = await createAndApproveContactSheet(store, project.id);
  const imageRequests = await store.enqueueGeneration({
    projectId: project.id,
    kind: "final",
    shotIds: project.shots.map((shot) => shot.id),
  });
  project = await commitClaimedGeneration(store, { projectId: project.id, requestId: imageRequests[0].id, imageDataUrl: await imageDataUrl(180, 70, 70) });
  project = await commitClaimedGeneration(store, { projectId: project.id, requestId: imageRequests[1].id, imageDataUrl: await imageDataUrl(70, 180, 70) });

  const inputExport = path.join(projectPath, "00_输入素材", "主体身份_人物参考.png");
  const firstImageExport = path.join(projectPath, "01_分镜图", "scene_01_晨光坐起.png");
  const secondImageExport = path.join(projectPath, "01_分镜图", "scene_02_玄关穿鞋.png");
  await Promise.all([fs.access(inputExport), fs.access(firstImageExport), fs.access(secondImageExport)]);
  assert.equal(await digest(firstImageExport), await digest(path.join(projectPath, project.shots[0].imagePath!)));

  const provider = await store.videoProviders.saveProfile({
    id: "material-layout-mock", name: "素材包模拟后端", kind: "generic-http", enabled: true,
    defaults: { width: 720, height: 1280, frameRate: 16, frameCount: 49, pollSeconds: 1, timeoutMinutes: 1 },
    http: { mode: "async", imageMode: "multipart", submitUrl: "http://127.0.0.1:9999/video", submitMethod: "POST", jobIdPath: "id", statusUrlTemplate: "http://127.0.0.1:9999/tasks/{{job_id}}", statusPath: "status", resultUrlPath: "result.url", auth: { type: "none" } },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  await store.videoProviders.setDefaultProfileId(provider.id);
  const firstShotId = project.shots[0].id;
  project = await store.updateVideoPlan({
    projectId: project.id,
    shotId: firstShotId,
    prompt: "初始状态：人物坐在床边。唯一主动作：人物双手整理裙摆。物理过程：手指沿布料平稳移动。结束状态：双手自然停在膝上。镜头表现：固定手机机位。",
    negativePrompt: "手部变形，衣物穿模",
    frameRate: 16,
    frameCount: 49,
  });
  const videoRequest = (await store.enqueueVideoGeneration({ projectId: project.id, shotIds: [firstShotId], confirmExternalCost: true }))[0];
  const fakeVideo = path.join(root, ".runtime", "material-layout.mp4");
  await fs.writeFile(fakeVideo, Buffer.from("material-layout-video"));
  const videoClaimToken = await claimVideo(store, videoRequest.id);
  await assert.rejects(
    () => store.commitVideoResult(project.id, videoRequest.id, fakeVideo, { width: 720, height: 1280, frameRate: 16, durationSeconds: 49 / 16 }, videoClaimToken),
    /downloading.*accepted/,
  );
  await advanceVideoForCommit(store, project.id, videoRequest.id, videoClaimToken);
  project = await store.commitVideoResult(project.id, videoRequest.id, fakeVideo, { width: 720, height: 1280, frameRate: 16, durationSeconds: 49 / 16 }, videoClaimToken);

  const firstVideoExport = path.join(projectPath, "02_分镜视频", "scene_01_晨光坐起.mp4");
  await fs.access(firstVideoExport);
  assert.equal(await digest(firstVideoExport), await digest(path.join(projectPath, project.shots[0].videoArtifact!.path)));

  const userFile = path.join(projectPath, "02_分镜视频", "我的剪辑备注.mp4");
  await fs.writeFile(userFile, "keep me", "utf8");
  project = await store.moveShot(project.id, firstShotId, 1);
  await assert.rejects(() => fs.access(firstVideoExport));
  await fs.access(path.join(projectPath, "02_分镜视频", "scene_02_晨光坐起.mp4"));
  await Promise.all([
    fs.access(path.join(projectPath, "01_分镜图", "scene_01_玄关穿鞋.png")),
    fs.access(path.join(projectPath, "01_分镜图", "scene_02_晨光坐起.png")),
    fs.access(userFile),
  ]);

  project = await store.updateVideoPlan({
    projectId: project.id,
    shotId: firstShotId,
    prompt: "初始状态：人物坐在床边。唯一主动作：人物抬手整理发丝。物理过程：右手沿脸侧平稳抬起。结束状态：右手停在耳侧。镜头表现：固定手机机位。",
    negativePrompt: "手部变形，画面闪烁",
    frameRate: 16,
    frameCount: 65,
  });
  assert.equal(project.shots.find((shot) => shot.id === firstShotId)?.videoArtifact?.stale, true);
  await assert.rejects(() => fs.access(path.join(projectPath, "02_分镜视频", "scene_02_晨光坐起.mp4")));
  await fs.access(userFile);
});

test("permanently deletes a project and its queued runtime files", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-delete-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = isolatedStore(root);
  let project = await store.createProject({ name: "待彻底删除", templateId: "blank" });
  project = await createAndApproveContactSheet(store, project.id);
  const finalRequest = (await store.enqueueGeneration({
    projectId: project.id,
    kind: "final",
    shotIds: [project.shots[0].id],
  }))[0];
  project = await commitClaimedGeneration(store, {
    projectId: project.id,
    requestId: finalRequest.id,
    imageDataUrl: await imageDataUrl(40, 80, 120),
  });
  const request = (await store.enqueueGeneration({
    projectId: project.id,
    kind: "region_edit",
    shotIds: [project.shots[0].id],
    instruction: "测试运行文件清理",
    selectionMaskDataUrl: await imageDataUrl(255, 255, 255),
    annotatedPreviewDataUrl: await imageDataUrl(255, 0, 0),
  }))[0];
  const projectPath = path.join(root, "data", "projects", project.id);
  const runtimePath = path.join(root, ".runtime", "requests", request.id);

  await fs.access(path.join(projectPath, "project.json"));
  await fs.access(runtimePath);
  assert.deepEqual(await store.deleteProject(project.id), { deletedProjectId: project.id });
  assert.equal((await store.listProjects()).some((item) => item.id === project.id), false);
  await assert.rejects(() => fs.access(projectPath));
  await assert.rejects(() => fs.access(runtimePath));
  await assert.rejects(() => store.getProject(project.id));
  await assert.rejects(() => store.deleteProject("../outside"), /项目 ID 不合法/);
});

test("stores and deletes projects in a configured external project root", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-plugin-root-"));
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-external-state-"));
  const projectsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-external-projects-"));
  t.after(async () => {
    await Promise.all([
      fs.rm(root, { recursive: true, force: true }),
      fs.rm(stateRoot, { recursive: true, force: true }),
      fs.rm(projectsRoot, { recursive: true, force: true }),
    ]);
  });
  const store = new ProjectStore(root, "http://127.0.0.1:4317", projectsRoot, stateRoot);
  const project = await store.createProject({ name: "外部项目目录", templateId: "blank", shotCount: 2 });
  const externalProjectPath = path.join(projectsRoot, project.id);

  await fs.access(path.join(externalProjectPath, "project.json"));
  assert.equal(store.rootDir, path.resolve(root));
  assert.equal(store.stateDir, path.resolve(stateRoot));
  assert.equal(store.projectsDir, path.resolve(projectsRoot));
  assert.equal(store.runtimeDir, path.join(path.resolve(stateRoot), ".runtime"));
  assert.equal(store.videoProviders.rootDir, path.resolve(stateRoot));
  assert.equal((await store.listProjects()).some((item) => item.id === project.id), true);

  await store.deleteProject(project.id);
  await assert.rejects(() => fs.access(externalProjectPath));
  await fs.access(path.join(stateRoot, ".runtime"));
  await assert.rejects(() => fs.access(path.join(root, ".runtime")));
});

test("keeps private video provider configuration when the plugin root changes", async (t) => {
  const firstRoot = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-plugin-v1-"));
  const secondRoot = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-plugin-v2-"));
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-persistent-state-"));
  const projectsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-persistent-projects-"));
  t.after(async () => {
    await Promise.all([firstRoot, secondRoot, stateRoot, projectsRoot].map((directory) => (
      fs.rm(directory, { recursive: true, force: true })
    )));
  });

  const first = new ProjectStore(firstRoot, "http://127.0.0.1:4317", projectsRoot, stateRoot);
  await first.init();
  await first.videoProviders.saveProfile({
    id: "persistent-provider",
    name: "持久视频接口",
    description: "跨插件版本保留",
    kind: "generic-http",
    enabled: true,
    capabilities: { source: "local", billing: "local", modes: ["image-to-video"] },
    defaults: { width: 720, height: 1280, frameRate: 16, frameCount: 65, pollSeconds: 5, timeoutMinutes: 30 },
    http: {
      mode: "sync",
      imageMode: "base64",
      submitUrl: "http://127.0.0.1:8188/video",
      submitMethod: "POST",
      bodyTemplate: { image: "{{image_base64}}", prompt: "{{prompt}}" },
      resultUrlPath: "output.url",
      auth: { type: "none" },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const second = new ProjectStore(secondRoot, "http://127.0.0.1:4317", projectsRoot, stateRoot);
  await second.init();
  assert.equal((await second.videoProviders.getProfile("persistent-provider")).name, "持久视频接口");
  await fs.access(path.join(stateRoot, "data", "local", "video-providers", "persistent-provider", "profile.json"));
  await assert.rejects(() => fs.access(path.join(firstRoot, "data", "local")));
  await assert.rejects(() => fs.access(path.join(secondRoot, "data", "local")));
});

test("serializes concurrent project writes across independent store instances", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-cross-process-lock-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const first = isolatedStore(root);
  const second = isolatedStore(root);
  await Promise.all([first.init(), second.init()]);
  const project = await first.createProject({ name: "跨进程保存", templateId: "blank", shotCount: 16 });

  await Promise.all(project.shots.map((shot, index) => (
    (index % 2 === 0 ? first : second).updateShot(project.id, shot.id, {
      action: `并发写入动作 ${index + 1}`,
    })
  )));

  const restored = await first.getProject(project.id);
  assert.deepEqual(restored.shots.map((shot) => shot.action), project.shots.map((_, index) => `并发写入动作 ${index + 1}`));
  const projectFiles = await fs.readdir(path.join(root, "data", "projects", project.id));
  assert.equal(projectFiles.some((name) => /^project\.json\..+\.(tmp|bak)$/.test(name)), false);
});

test("binds queued video work to the reviewed provider configuration", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-provider-snapshot-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = isolatedStore(root);
  let project = await store.createProject({ name: "接口快照", templateId: "blank", shotCount: 1 });
  project = await createAndApproveContactSheet(store, project.id);
  const imageRequest = (await store.enqueueGeneration({ projectId: project.id, kind: "final", shotIds: [project.shots[0].id] }))[0];
  project = await commitClaimedGeneration(store, {
    projectId: project.id,
    requestId: imageRequest.id,
    imageDataUrl: await imageDataUrl(80, 120, 160),
  });
  const provider = await store.videoProviders.saveProfile({
    id: "snapshot-provider",
    name: "本机模拟接口",
    kind: "generic-http",
    enabled: true,
    capabilities: { source: "local", billing: "local", modes: ["image-to-video"] },
    defaults: { width: 720, height: 1280, frameRate: 16, frameCount: 49, pollSeconds: 1, timeoutMinutes: 1 },
    http: {
      mode: "sync",
      imageMode: "base64",
      submitUrl: "http://127.0.0.1:9901/video",
      submitMethod: "POST",
      resultUrlPath: "result.url",
      auth: { type: "none" },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  project = await store.updateVideoPlan({
    projectId: project.id,
    shotId: project.shots[0].id,
    prompt: "初始状态：人物稳定站立。唯一主动作：右手整理衣袖。物理过程：手指沿袖口平稳移动。结束状态：右手自然垂落。镜头表现：固定手机机位。",
    frameRate: 16,
    frameCount: 49,
  });
  const queued = (await store.enqueueVideoGeneration({ projectId: project.id, shotIds: [project.shots[0].id], providerId: provider.id }))[0];
  await store.videoProviders.saveProfile({
    ...provider,
    http: { ...provider.http!, submitUrl: "http://127.0.0.1:9902/video" },
  });

  assert.equal(await store.claimPendingVideoRequest(), undefined);
  const stopped = (await store.getVideoRequests(project.id)).find((item) => item.id === queued.id);
  assert.equal(stopped?.status, "failed");
  assert.match(stopped?.error ?? "", /配置已在排队后发生变化/);
});

test("video claims are exclusive, expire before takeover, and reject stale workers", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-video-claim-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = isolatedStore(root);
  const { project, request } = await createQueuedLocalVideo(store, "claim-provider");

  const first = await store.claimPendingVideoRequest();
  assert.equal(first?.id, request.id);
  assert.ok(first?.claimToken);
  assert.equal(first.attempt, 1);
  assert.equal(await store.claimPendingVideoRequest(), undefined, "an unexpired claim must not be overwritten");

  const projectFile = path.join(root, "data", "projects", project.id, "project.json");
  const persisted = JSON.parse(await fs.readFile(projectFile, "utf8")) as { videoRequests: Array<{ id: string; leaseExpiresAt?: string }> };
  const persistedRequest = persisted.videoRequests.find((item) => item.id === request.id)!;
  persistedRequest.leaseExpiresAt = new Date(Date.now() - 1_000).toISOString();
  await fs.writeFile(projectFile, JSON.stringify(persisted), "utf8");

  await assert.rejects(
    () => store.updateVideoRequestStatus(project.id, request.id, "uploading", {}, first.claimToken),
    /租约已过期/,
  );
  const takeover = await store.claimPendingVideoRequest();
  assert.equal(takeover?.id, request.id);
  assert.ok(takeover?.claimToken);
  assert.notEqual(takeover.claimToken, first.claimToken);
  assert.equal(takeover.attempt, 2);
  await assert.rejects(
    () => store.updateVideoRequestStatus(project.id, request.id, "uploading", {}, first.claimToken),
    /认领已失效/,
  );

  await store.releaseVideoRequestClaim(project.id, request.id, takeover.claimToken);
  const reclaimed = await store.claimPendingVideoRequest();
  assert.equal(reclaimed?.id, request.id);
  assert.equal(reclaimed?.attempt, 3);
});

test("video submission boundary requires a live claim and the reviewed provider fingerprint", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-video-boundary-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = isolatedStore(root);
  const { project, provider, request } = await createQueuedLocalVideo(store, "boundary-provider");

  await assert.rejects(
    () => store.updateVideoRequestStatus(project.id, request.id, "uploading"),
    /认领已失效/,
  );
  await assert.rejects(
    () => store.updateVideoRequestStatus(project.id, request.id, "submitting", {
      submissionState: "submitting",
      idempotencyKey: request.id,
    }),
    /认领已失效/,
  );
  const claim = await store.claimPendingVideoRequest();
  assert.equal(claim?.id, request.id);
  await store.updateVideoRequestStatus(project.id, request.id, "uploading", {}, claim!.claimToken);
  await store.videoProviders.saveProfile({
    ...provider,
    http: { ...provider.http!, submitUrl: "http://127.0.0.1:9902/video" },
  });
  await assert.rejects(
    () => store.updateVideoRequestStatus(project.id, request.id, "submitting", {
      submissionState: "submitting",
      idempotencyKey: request.id,
    }, claim!.claimToken),
    /配置已经变化|old task was not submitted|old task was not submitted remotely/i,
  );
  const stopped = (await store.getVideoRequests(project.id)).find((item) => item.id === request.id);
  assert.equal(stopped?.status, "failed");
});

test("retry keeps one active video request per shot even across multiple failed histories", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-video-retry-exclusive-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = isolatedStore(root);
  const { project, request: firstRequest } = await createQueuedLocalVideo(store, "retry-exclusive-provider");

  const firstClaim = await claimVideo(store, firstRequest.id);
  await store.updateVideoRequestStatus(project.id, firstRequest.id, "failed", { error: "first failed task" }, firstClaim);
  const secondRequest = (await store.enqueueVideoGeneration({
    projectId: project.id,
    shotIds: [project.shots[0].id],
    providerId: "retry-exclusive-provider",
  }))[0];
  const secondClaim = await claimVideo(store, secondRequest.id);
  await store.updateVideoRequestStatus(project.id, secondRequest.id, "failed", { error: "second failed task" }, secondClaim);

  const retriedFirst = await store.retryVideoRequest(project.id, firstRequest.id);
  assert.equal(retriedFirst.status, "queued");
  await assert.rejects(
    () => store.retryVideoRequest(project.id, secondRequest.id),
    /正在生成视频/,
    "a second historical failure must not be revived beside an active retry",
  );

  await store.cancelVideoRequest(project.id, firstRequest.id);
  const currentRequest = (await store.enqueueVideoGeneration({
    projectId: project.id,
    shotIds: [project.shots[0].id],
    providerId: "retry-exclusive-provider",
  }))[0];
  assert.equal(currentRequest.status, "queued");
  await assert.rejects(
    () => store.retryVideoRequest(project.id, secondRequest.id),
    /正在生成视频/,
    "a historical failure must not run beside a newly queued request",
  );
});

test("retry refuses an old paid snapshot after the current video plan changes", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-video-retry-snapshot-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = isolatedStore(root);
  let { project, request } = await createQueuedLocalVideo(store, "retry-snapshot-provider");
  const claim = await claimVideo(store, request.id);
  await store.updateVideoRequestStatus(project.id, request.id, "failed", { error: "provider rejected old plan" }, claim);

  project = await store.updateVideoPlan({
    projectId: project.id,
    shotId: project.shots[0].id,
    prompt: "初始状态：人物稳定站立。唯一主动作：左手整理衣领。物理过程：手指沿领口平稳移动。结束状态：左手自然垂落。镜头表现：固定手机机位。",
    frameRate: 16,
    frameCount: 65,
  });
  await assert.rejects(
    () => store.retryVideoRequest(project.id, request.id),
    /提示词或时长计划已变化/,
  );
});

test("legacy active video requests without an execution fingerprint fail closed", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-video-legacy-fingerprint-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = isolatedStore(root);
  const { project, request } = await createQueuedLocalVideo(store, "legacy-fingerprint-provider");
  const projectFile = path.join(root, "data", "projects", project.id, "project.json");
  const persisted = JSON.parse(await fs.readFile(projectFile, "utf8")) as { videoRequests: Array<{ id: string; providerExecutionFingerprint?: string }> };
  delete persisted.videoRequests.find((item) => item.id === request.id)!.providerExecutionFingerprint;
  await fs.writeFile(projectFile, JSON.stringify(persisted), "utf8");

  assert.equal(await store.claimPendingVideoRequest(), undefined);
  const stopped = (await store.getVideoRequests(project.id)).find((item) => item.id === request.id);
  assert.equal(stopped?.status, "failed");
  assert.match(stopped?.error ?? "", /缺少已确认的接口配置指纹/);
});

test("migrates old projects and keeps video plans, snapshots, review and stale state independent from images", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-video-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = isolatedStore(root);
  let project = await store.createProject({ name: "视频协议测试", templateId: "blank", shotCount: 2 });
  const file = path.join(root, "data", "projects", project.id, "project.json");
  const legacy = JSON.parse(await fs.readFile(file, "utf8"));
  legacy.schemaVersion = 1;
  delete legacy.videoRequests;
  for (const shot of legacy.shots) { delete shot.videoStatus; delete shot.videoChecklist; }
  await fs.writeFile(file, JSON.stringify(legacy), "utf8");
  project = await store.getProject(project.id);
  assert.equal(project.schemaVersion, 2);
  assert.deepEqual(project.videoRequests, []);
  assert.ok(project.shots.every((shot) => shot.videoStatus === "missing_prompt"));
  const migrationBackups = await fs.readdir(path.join(root, "data", "local", "backups", "project-migrations", project.id));
  assert.equal(migrationBackups.length, 1);
  assert.match(migrationBackups[0], /^schema-1-[a-f0-9]{16}\.json$/);

  project = await createAndApproveContactSheet(store, project.id);
  const imageRequest = (await store.enqueueGeneration({ projectId: project.id, kind: "final", shotIds: [project.shots[0].id] }))[0];
  project = await commitClaimedGeneration(store, { projectId: project.id, requestId: imageRequest.id, imageDataUrl: await imageDataUrl(20, 120, 200) });
  project = await store.markShotReview(project.id, project.shots[0].id, {
    face: true, outfit: true, contact: true, lighting: true, space: true, continuity: true,
  }, true);

  const provider = await store.videoProviders.saveProfile({
    id: "mock-http", name: "模拟 HTTP", kind: "generic-http", enabled: true,
    defaults: { width: 720, height: 1280, frameRate: 16, frameCount: 65, pollSeconds: 1, timeoutMinutes: 1 },
    http: { mode: "async", imageMode: "multipart", submitUrl: "http://127.0.0.1:9999/video", submitMethod: "POST", jobIdPath: "id", statusUrlTemplate: "http://127.0.0.1:9999/tasks/{{job_id}}", statusPath: "status", resultUrlPath: "result.url", auth: { type: "none" } },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  await store.videoProviders.setDefaultProfileId(provider.id);
  project = await store.updateVideoPlan({ projectId: project.id, shotId: project.shots[0].id, prompt: "人物双脚稳定站立，随后右手平稳整理包带，最终手臂自然垂落，镜头固定。", negativePrompt: "脚底滑移，手部变形，镜头突变", frameRate: 16, frameCount: 49, source: "codex" });
  assert.equal(project.shots[0].videoStatus, "ready");
  assert.equal(project.shots[0].videoPlan?.durationSeconds, 49 / 16);

  const activeImageRequest = (await store.enqueueGeneration({ projectId: project.id, kind: "final", shotIds: [project.shots[0].id] }))[0];
  await assert.rejects(() => store.getVideoPromptContext(project.id, [project.shots[0].id]), /正在处理图片/);
  await assert.rejects(() => store.updateProject(project.id, { aspectRatio: "1:1" }), /仍有生成任务/);
  await assert.rejects(() => store.resizeShotCount(project.id, { targetCount: 3 }), /仍有生成任务/);
  await assert.rejects(() => store.updateShot(project.id, project.shots[0].id, { action: "图片生成期间修改动作" }), /正在处理图片/);
  await assert.rejects(() => store.updateVideoPlan({ projectId: project.id, shotId: project.shots[0].id, prompt: "新的视频提示词", frameRate: 16, frameCount: 49 }), /正在处理图片/);
  await assert.rejects(() => store.enqueueVideoGeneration({ projectId: project.id, shotIds: [project.shots[0].id] }), /正在处理图片/);
  await store.cancelQueuedRequest(project.id, activeImageRequest.id);

  const promptContext = await store.getVideoPromptContext(project.id, [project.shots[0].id]) as {
    shots: Array<{
      id: string;
      action: string;
      imagePath?: string;
      imageAvailable: boolean;
      imageSha256?: string;
      current: { id: string; action: string; imagePath?: string; imageAvailable: boolean; imageSha256?: string; imageStale: boolean };
      next?: { id: string; action: string; imagePath?: string; imageAvailable: boolean; imageSha256?: string; imageStale: boolean };
    }>;
  };
  const promptShot = promptContext.shots[0];
  assert.equal(promptShot.current.id, project.shots[0].id);
  assert.equal(promptShot.current.action, project.shots[0].action);
  assert.equal(promptShot.current.imageAvailable, true);
  assert.equal(promptShot.current.imagePath, path.resolve(root, "data", "projects", project.id, project.shots[0].imagePath!));
  assert.equal(promptShot.current.imageSha256, project.shots[0].imageSha256);
  assert.equal(promptShot.imagePath, promptShot.current.imagePath, "legacy top-level absolute imagePath remains available");
  assert.equal(promptShot.next?.id, project.shots[1].id);
  assert.equal(promptShot.next?.action, project.shots[1].action);
  assert.equal(promptShot.next?.imageAvailable, false);
  assert.equal(promptShot.next?.imagePath, undefined);
  assert.equal(promptShot.next?.imageStale, false);

  await assert.rejects(
    () => store.enqueueVideoGeneration({ projectId: project.id, shotIds: [project.shots[0].id] }),
    /可能产生费用|确认/,
  );
  let videoRequest = (await store.enqueueVideoGeneration({
    projectId: project.id,
    shotIds: [project.shots[0].id],
    confirmExternalCost: true,
  }))[0];
  assert.equal(videoRequest.snapshot.prompt, project.shots[0].videoPlan?.prompt);
  assert.equal(videoRequest.snapshot.frameCount, 49);
  await assert.rejects(() => store.enqueueGeneration({ projectId: project.id, kind: "final", shotIds: [project.shots[0].id] }), /正在生成视频/);
  await assert.rejects(() => store.updateShot(project.id, project.shots[0].id, { action: "视频生成期间修改动作" }), /正在生成视频/);
  await assert.rejects(() => store.updateVideoPlan({ projectId: project.id, shotId: project.shots[0].id, prompt: "视频生成期间修改提示词", frameRate: 16, frameCount: 49 }), /正在生成视频/);
  await assert.rejects(() => store.enqueueVideoGeneration({
    projectId: project.id,
    shotIds: [project.shots[0].id],
    confirmExternalCost: true,
  }), /已有视频任务/);
  const cancelledClaimToken = await claimVideo(store, videoRequest.id);
  assert.equal((await store.getVideoRequests(project.id)).find((item) => item.id === videoRequest.id)?.claimToken, undefined);
  assert.equal(store.toClientProject(await store.getProject(project.id)).videoRequests.find((item) => item.id === videoRequest.id)?.claimToken, undefined);
  videoRequest = await store.cancelVideoRequest(project.id, videoRequest.id);
  assert.equal(videoRequest.status, "cancelled");
  await assert.rejects(
    () => store.updateVideoRequestStatus(project.id, videoRequest.id, "submitting", { submissionState: "submitting" }, cancelledClaimToken),
    /认领已失效|已经结束/,
  );
  const fakeVideo = path.join(root, ".runtime", "fake.mp4");
  await fs.writeFile(fakeVideo, Buffer.from("verified-video-placeholder"));
  await assert.rejects(
    () => store.commitVideoResult(project.id, videoRequest.id, fakeVideo, { width: 720, height: 1280, frameRate: 16, durationSeconds: 49 / 16 }),
    /不会接收迟到结果/,
  );
  const imageRequestDuringRetry = (await store.enqueueGeneration({ projectId: project.id, kind: "final", shotIds: [project.shots[0].id] }))[0];
  await assert.rejects(() => store.retryVideoRequest(project.id, videoRequest.id), /正在处理图片/);
  await store.cancelQueuedRequest(project.id, imageRequestDuringRetry.id);
  videoRequest = await store.retryVideoRequest(project.id, videoRequest.id);
  assert.equal(videoRequest.status, "queued");

  const videoClaimToken = await claimVideo(store, videoRequest.id);
  await advanceVideoForCommit(store, project.id, videoRequest.id, videoClaimToken);
  project = await store.commitVideoResult(project.id, videoRequest.id, fakeVideo, { width: 720, height: 1280, frameRate: 16, durationSeconds: 49 / 16 }, videoClaimToken);
  assert.equal(project.shots[0].videoStatus, "accepted");
  assert.ok(project.shots[0].videoArtifact?.path.endsWith("current.mp4"));
  const firstClientMedia = store.toClientProject(project);
  const secondClientMedia = store.toClientProject(project);
  assert.equal(firstClientMedia.shots[0].imageUrl, secondClientMedia.shots[0].imageUrl);
  assert.equal(firstClientMedia.shots[0].videoArtifact?.mediaUrl, secondClientMedia.shots[0].videoArtifact?.mediaUrl);
  assert.match(firstClientMedia.shots[0].videoArtifact?.mediaUrl ?? "", /current\.mp4\?v=/);

  const inconsistent = JSON.parse(await fs.readFile(file, "utf8"));
  const inconsistentRequest = inconsistent.videoRequests.find((item: { id: string }) => item.id === videoRequest.id);
  const inconsistentShot = inconsistent.shots.find((item: { id: string }) => item.id === project.shots[0].id);
  inconsistentRequest.status = "running";
  inconsistentRequest.progress = 88;
  inconsistentRequest.error = "EPERM: simulated stale writer";
  inconsistentShot.videoStatus = "failed";
  await fs.writeFile(file, JSON.stringify(inconsistent), "utf8");

  project = await store.getProject(project.id);
  assert.equal(project.videoRequests.find((item) => item.id === videoRequest.id)?.status, "completed");
  assert.equal(project.videoRequests.find((item) => item.id === videoRequest.id)?.progress, 100);
  assert.equal(project.videoRequests.find((item) => item.id === videoRequest.id)?.error, undefined);
  assert.equal(project.shots[0].videoStatus, "accepted");
  const persistedRepair = JSON.parse(await fs.readFile(file, "utf8"));
  assert.equal(persistedRepair.videoRequests.find((item: { id: string }) => item.id === videoRequest.id).status, "completed");

  await assert.rejects(
    () => store.updateVideoRequestStatus(project.id, videoRequest.id, "running", { progress: 88, error: "late stale update" }),
    /已经结束/,
  );

  project = await store.commitVideoResult(project.id, videoRequest.id, fakeVideo, { width: 720, height: 1280, frameRate: 16, durationSeconds: 49 / 16 });
  assert.equal(project.videoRequests.find((item) => item.id === videoRequest.id)?.status, "completed");
  project = await store.markVideoReview(project.id, project.shots[0].id, {
    identity: true, outfit: true, motion: true, contact: true, stability: true, continuity: true,
  }, true);
  assert.equal(project.shots[0].videoStatus, "accepted");

  await assert.rejects(() => store.updateVideoPlan({ projectId: project.id, shotId: project.shots[0].id, prompt: "人物不要移动", frameRate: 16, frameCount: 49 }), /正向提示词包含否定式/);
  await assert.rejects(() => store.updateVideoPlan({ projectId: project.id, shotId: project.shots[0].id, prompt: "人物稳定站立", frameRate: 24, frameCount: 49 }), /固定使用 16fps/);
  await assert.rejects(() => store.updateVideoPlan({ projectId: project.id, shotId: project.shots[0].id, prompt: "人物稳定站立", frameRate: 16, frameCount: 57 }), /49、65、81、97 或 113/);
  project = await store.updateVideoPlan({
    projectId: project.id,
    shotId: project.shots[0].id,
    prompt: "初始状态：人物稳定站立。唯一主动作：右手整理包带。物理过程：手指沿包带平稳移动。结束状态：右手停在包带下方。镜头表现：固定手机机位。",
    negativePrompt: "手部变形，脚底滑移",
    frameRate: 16,
    frameCount: 113,
  });
  assert.equal(project.shots[0].videoStatus, "ready");
  assert.equal(project.shots[0].videoArtifact?.stale, true);
  assert.equal(project.shots[0].videoPlan?.durationSeconds, 113 / 16);

  project = await store.updateShot(project.id, project.shots[0].id, { action: "人物改为轻抬手腕查看时间" });
  assert.equal(project.shots[0].imageStale, true);
  assert.equal(project.shots[0].videoStatus, "missing_prompt");
  assert.equal(project.shots[0].videoPlan?.stale, true);
  assert.equal(project.shots[0].videoArtifact?.stale, true);
  await assert.rejects(() => store.enqueueVideoGeneration({ projectId: project.id, shotIds: [project.shots[0].id] }), /图片来自旧方向/);
});
