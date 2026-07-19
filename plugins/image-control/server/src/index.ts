import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ProjectStore } from "./store.js";
import { executeTool } from "./tools.js";
import { VideoWorker } from "./video-worker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(process.env.IMAGE_CONTROL_ROOT ?? path.join(__dirname, "..", ".."));

function pluginVersion(): string {
  try {
    const manifest = JSON.parse(fsSync.readFileSync(path.join(ROOT_DIR, ".codex-plugin", "plugin.json"), "utf8")) as { version?: unknown };
    if (typeof manifest.version === "string" && manifest.version.trim()) return manifest.version.trim();
  } catch { /* Development roots may intentionally omit a plugin manifest. */ }
  return "development";
}

const SERVER_VERSION = pluginVersion();
// Codex caches embedded resources by URI. Tying the URI to the manifest
// version refreshes the widget automatically for every installed release.
const UI_URI = `ui://image-control/workbench-${SERVER_VERSION.replace(/[^0-9A-Za-z._-]/g, "-")}.html`;
const UI_URI_TEMPLATE = "ui://image-control/workbench-{version}.html";
const DEFAULT_STATE_ROOT = process.platform === "win32"
  ? path.join(process.env.LOCALAPPDATA?.trim() || os.homedir(), "CodexImageControl")
  : process.env.XDG_STATE_HOME?.trim()
    ? path.join(process.env.XDG_STATE_HOME.trim(), "codex-image-control")
    : path.join(os.homedir(), ".codex-image-control");
const STATE_ROOT = path.resolve(process.env.IMAGE_CONTROL_STATE_ROOT ?? DEFAULT_STATE_ROOT);
const PROJECTS_ROOT = path.resolve(process.env.IMAGE_CONTROL_PROJECTS_ROOT ?? path.join(STATE_ROOT, "data", "projects"));
const HTTP_PORT = Number(process.env.IMAGE_CONTROL_PORT ?? 4317);
const MEDIA_ORIGIN = `http://127.0.0.1:${HTTP_PORT}`;
const store = new ProjectStore(ROOT_DIR, MEDIA_ORIGIN, PROJECTS_ROOT, STATE_ROOT);

const annotationsRead = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const annotationsWrite = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const annotationsDestructive = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;
const annotationsExternalRead = { readOnlyHint: true, destructiveHint: false, openWorldHint: true } as const;
const annotationsExternalIrreversible = { readOnlyHint: false, destructiveHint: true, openWorldHint: true } as const;

const HTTP_CAPABILITY_FILE = path.join(store.runtimeDir, "http-capability.json");
const HTTP_SESSION_COOKIE = "image_control_session";
const HTTP_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function safeTextEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function loadOrCreateHttpCapability(): Promise<string> {
  fsSync.mkdirSync(store.runtimeDir, { recursive: true });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const stats = fsSync.lstatSync(HTTP_CAPABILITY_FILE);
      if (stats.isSymbolicLink() || !stats.isFile()) throw new Error("本机 HTTP 能力文件类型不安全");
      const parsed = JSON.parse(fsSync.readFileSync(HTTP_CAPABILITY_FILE, "utf8")) as { version?: unknown; secret?: unknown };
      if (parsed.version !== 1 || typeof parsed.secret !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(parsed.secret)) {
        throw new Error("本机 HTTP 能力文件已损坏");
      }
      try { fsSync.chmodSync(HTTP_CAPABILITY_FILE, 0o600); } catch { /* Windows ACLs remain authoritative. */ }
      return parsed.secret;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        const secret = randomBytes(32).toString("base64url");
        try {
          fsSync.writeFileSync(HTTP_CAPABILITY_FILE, `${JSON.stringify({ version: 1, secret })}\n`, {
            encoding: "utf8",
            flag: "wx",
            mode: 0o600,
          });
          return secret;
        } catch (writeError) {
          if ((writeError as NodeJS.ErrnoException).code !== "EEXIST") throw writeError;
        }
      } else if (attempt >= 19 || !(error instanceof SyntaxError)) {
        throw error;
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("无法初始化本机 HTTP 能力");
}

function healthProof(secret: string, challenge: string): string {
  return createHmac("sha256", secret)
    .update([challenge, SERVER_VERSION, ROOT_DIR, STATE_ROOT, PROJECTS_ROOT].join("\0"))
    .digest("base64url");
}

function bearerToken(header: string | undefined): string | undefined {
  const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(header ?? "");
  return match?.[1];
}

function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) cookies.set(key, value);
  }
  return cookies;
}

const openAiFileSchema = z.object({
  download_url: z.string(),
  file_id: z.string(),
  mime_type: z.string().optional(),
  file_name: z.string().optional(),
});

function widgetHtml(): string {
  const htmlPath = path.resolve(ROOT_DIR, "app", "dist", "index.html");
  if (!fsSync.existsSync(htmlPath)) {
    return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body style="font-family:system-ui;padding:24px;background:#161713;color:#f4f1e9"><h1>图片生成中控尚未构建</h1><p>请在项目根目录运行 npm run build。</p></body></html>`;
  }
  return fsSync.readFileSync(htmlPath, "utf8");
}

function widgetResource(uri: string) {
  return {
    contents: [{
      uri,
      mimeType: RESOURCE_MIME_TYPE,
      text: widgetHtml(),
      _meta: {
        ui: {
          prefersBorder: false,
          csp: { connectDomains: [MEDIA_ORIGIN], resourceDomains: [MEDIA_ORIGIN, "data:", "blob:"] },
        },
        "openai/widgetPrefersBorder": false,
      },
    }],
  };
}

function toolResult(data: Record<string, unknown>, message = "操作完成") {
  return {
    structuredContent: data,
    content: [{ type: "text" as const, text: message }],
  };
}

function createMcpServer(): McpServer {
  const server = new McpServer({ name: "image-control", version: SERVER_VERSION });

  registerAppTool(server, "render_workbench", {
    title: "打开图片生成中控",
    description: "打开本机图片项目列表或指定项目的无限画布工作台；默认请求在 Codex 右侧边栏显示。",
    inputSchema: { projectId: z.string().optional() },
    annotations: annotationsRead,
    _meta: {
      ui: { resourceUri: UI_URI, visibility: ["model", "app"] },
      "openai/outputTemplate": UI_URI,
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "正在打开图片工作台…",
      "openai/toolInvocation/invoked": "图片工作台已打开",
    },
  }, async (input) => toolResult(await executeTool(store, "render_workbench", input), "图片生成中控已打开。"));

  registerAppTool(server, "list_projects", {
    title: "列出图片项目",
    description: "列出当前已配置项目目录中的所有图片项目。",
    inputSchema: {}, annotations: annotationsRead,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async () => toolResult(await executeTool(store, "list_projects", {})));

  registerAppTool(server, "get_project", {
    title: "读取图片项目",
    description: "读取一个图片项目、图片参考、文字约束、分镜和画布状态。",
    inputSchema: { projectId: z.string() }, annotations: annotationsRead,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "get_project", input)));

  registerAppTool(server, "get_media", {
    title: "读取工作台图片",
    description: "通过 MCP 工具桥接本机项目图片，供 Codex 沙箱中的工作台安全预览。",
    inputSchema: {
      projectId: z.string().min(1),
      path: z.string().min(1).max(500),
      variant: z.enum(["thumbnail", "preview", "source"]).default("preview"),
    },
    annotations: annotationsRead,
    _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "get_media", input)));

  registerAppTool(server, "create_project", {
    title: "创建图片项目",
    description: "创建单图无限编辑或通用分镜项目，通用分镜支持自定义初始数量。",
    inputSchema: {
      name: z.string().min(1),
      templateId: z.enum(["blank", "image-editor"]).default("blank"),
      aspectRatio: z.enum(["9:16", "3:4", "1:1", "16:9"]).default("9:16"),
      shotCount: z.number().int().min(1).max(24).default(6),
    }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "create_project", input), "项目已创建。"));

  registerAppTool(server, "delete_project", {
    title: "彻底删除图片项目",
    description: "永久删除一个图片项目及其参考图、宫格、正式分镜、撤销备份和运行临时文件。",
    inputSchema: { projectId: z.string().min(1) }, annotations: annotationsDestructive,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "delete_project", input), "项目已彻底删除。"));

  registerAppTool(server, "update_project", {
    title: "更新图片项目",
    description: "更新项目名称、方向摘要、比例或阶段。",
    inputSchema: {
      projectId: z.string(), name: z.string().optional(), brief: z.string().optional(),
      aspectRatio: z.enum(["9:16", "3:4", "1:1", "16:9"]).optional(),
      stage: z.enum(["direction", "storyboard", "production", "complete"]).optional(),
    }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "update_project", input), "项目已更新。"));

  registerAppTool(server, "update_shot", {
    title: "更新分镜",
    description: "更新分镜标题、出场主体、场景、动作、构图和修改要求。",
    inputSchema: {
      projectId: z.string(), shotId: z.string(), title: z.string().optional(), cast: z.string().optional(), scene: z.string().optional(),
      action: z.string().optional(), composition: z.string().optional(), instruction: z.string().optional(),
    }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "update_shot", input), "分镜已更新。"));

  registerAppTool(server, "add_shot", {
    title: "增加分镜", description: "向项目末尾增加一个分镜。",
    inputSchema: { projectId: z.string() }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "add_shot", input), "分镜已增加。"));

  registerAppTool(server, "delete_shot", {
    title: "删除分镜", description: "删除一个分镜及其正式图片。",
    inputSchema: { projectId: z.string(), shotId: z.string() }, annotations: annotationsDestructive,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "delete_shot", input), "分镜已删除。"));

  registerAppTool(server, "move_shot", {
    title: "调整分镜顺序", description: "将一个分镜向前或向后移动一位。",
    inputSchema: { projectId: z.string(), shotId: z.string(), direction: z.enum(["-1", "1"]).or(z.number()) },
    annotations: annotationsWrite,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "move_shot", input), "分镜顺序已更新。"));

  registerAppTool(server, "resize_shot_count", {
    title: "调整分镜数量", description: "将项目调整为 1–24 个分镜；减少数量会删除末尾分镜及其正式图片。",
    inputSchema: { projectId: z.string(), targetCount: z.number().int().min(1).max(24), confirmRemoval: z.boolean().optional() },
    annotations: annotationsDestructive,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "resize_shot_count", input), "分镜数量已调整。"));

  registerAppTool(server, "import_reference", {
    title: "导入参考图", description: "把图片导入项目的人脸、全身、服装、环境或补充身份槽位。",
    inputSchema: {
      projectId: z.string(), slot: z.enum(["face", "body", "outfit", "environment", "identitySupport"]),
      dataUrl: z.string(), fileName: z.string().optional(),
    }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "import_reference", input), "参考图已导入。"));

  registerAppTool(server, "import_editor_image", {
    title: "导入单图编辑原图", description: "把上传图片直接写入单图编辑画布；再次导入会替换当前图并保留一次撤销。",
    inputSchema: { projectId: z.string(), dataUrl: z.string(), fileName: z.string().optional() },
    annotations: annotationsDestructive,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "import_editor_image", input), "图片已放入编辑画布。"));

  registerAppTool(server, "remove_reference", {
    title: "移除参考图", description: "移除一个参考槽位中的图片，保留该槽位的文字约束。",
    inputSchema: { projectId: z.string(), slot: z.enum(["face", "body", "outfit", "environment", "identitySupport"]) },
    annotations: annotationsDestructive,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "remove_reference", input), "参考图已移除。"));

  registerAppTool(server, "update_reference_constraint", {
    title: "更新文字约束", description: "为人脸、全身比例、服装、场景或补充人物保存中文文字约束，可与参考图单独或共同使用。",
    inputSchema: {
      projectId: z.string(), slot: z.enum(["face", "body", "outfit", "environment", "identitySupport"]),
      constraint: z.string().max(8000),
    }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "update_reference_constraint", input), "文字约束已保存。"));

  registerAppTool(server, "save_canvas", {
    title: "保存画布", description: "保存画布视口、分镜位置和便签。",
    inputSchema: {
      projectId: z.string(), viewport: z.any().optional(), contactSheetPosition: z.any().optional(),
      notes: z.array(z.any()).optional(), shotPositions: z.record(z.any()).optional(),
    }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "save_canvas", input), "画布已保存。"));

  registerAppTool(server, "enqueue_generation", {
    title: "登记图片生成请求",
    description: "登记宫格总览、宫格选区重做、正式分镜或局部修改请求；该工具不调用第三方模型。",
    inputSchema: {
      projectId: z.string(), kind: z.enum(["contact_sheet", "contact_sheet_edit", "final", "image_edit", "region_edit"]),
      shotIds: z.array(z.string()), instruction: z.string().optional(),
      selectionMaskDataUrl: z.string().optional(), annotatedPreviewDataUrl: z.string().optional(),
    }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "enqueue_generation", input), "生成请求已登记。"));

  registerAppTool(server, "get_generation_requests", {
    title: "刷新生成状态", description: "读取项目生成队列的实时状态。",
    inputSchema: { projectId: z.string() }, annotations: annotationsRead,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "get_generation_requests", input)));

  registerAppTool(server, "get_generation_context", {
    title: "读取生成上下文", description: "为 Codex 内置生图读取请求、隐藏模板、图片参考、文字约束和选区文件的本机路径。",
    inputSchema: { projectId: z.string(), requestId: z.string() }, annotations: annotationsRead,
    _meta: { ui: { visibility: ["model"] } },
  }, async (input) => toolResult(await executeTool(store, "get_generation_context", input), "生成上下文已读取。"));

  registerAppTool(server, "set_generation_status", {
    title: "认领或更新生成状态", description: "由 Codex 认领一张排队图片，或使用认领令牌更新该图片的保存、失败状态。queued→generating 会返回 request.claimToken；后续状态必须原样携带该令牌。",
    inputSchema: {
      projectId: z.string(), requestId: z.string(),
      status: z.enum(["generating", "saving", "failed"]),
      error: z.string().optional(),
      claimToken: z.string().min(1).optional(),
    }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["model"] } },
  }, async (input) => toolResult(await executeTool(store, "set_generation_status", input), "生成状态已更新。"));

  registerAppTool(server, "recover_generation_request", {
    title: "作废超时图片任务",
    description: "显式作废租约已过期（或旧版缺少租约）的 generating/saving 图片请求，清除旧认领令牌并标记失败；租约仍有效时拒绝操作。作废后请重新登记图片请求。",
    inputSchema: {
      projectId: z.string(), requestId: z.string(), reason: z.string().max(1200).optional(),
    }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "recover_generation_request", input), "超时图片任务已作废，可重新登记。"));

  registerAppTool(server, "commit_generation_result", {
    title: "保存内置生图结果",
    description: "使用认领时返回的 claimToken，把 Codex 内置生图结果原子写回宫格或正式分镜；未认领、令牌失效或已作废的迟到结果会被拒绝。",
    inputSchema: {
      projectId: z.string(), requestId: z.string(), claimToken: z.string().min(1), imageDataUrl: z.string().optional(), imageFile: openAiFileSchema.optional(),
    }, annotations: annotationsExternalIrreversible,
    _meta: { ui: { visibility: ["model"] }, "openai/fileParams": ["imageFile"] },
  }, async (input) => toolResult(await executeTool(store, "commit_generation_result", input), "图片已写回工作台。"));

  registerAppTool(server, "undo_last_overwrite", {
    title: "撤销上次覆盖", description: "恢复分镜上一张图片并消耗一次撤销备份。",
    inputSchema: { projectId: z.string(), shotId: z.string() }, annotations: annotationsDestructive,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "undo_last_overwrite", input), "已恢复上一张图片。"));

  registerAppTool(server, "cancel_queued_request", {
    title: "取消排队请求", description: "取消尚未开始的图片生成请求。",
    inputSchema: { projectId: z.string(), requestId: z.string() }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "cancel_queued_request", input), "排队请求已取消。"));

  registerAppTool(server, "mark_contact_sheet_review", {
    title: "确认宫格总览", description: "人工确认或撤销确认当前宫格总览；确认后才允许生成正式分镜。",
    inputSchema: { projectId: z.string(), approved: z.boolean() }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "mark_contact_sheet_review", input), input.approved ? "宫格总览已确认。" : "宫格确认已撤销。"));

  registerAppTool(server, "mark_shot_review", {
    title: "兼容旧版图片检查", description: "仅兼容旧项目调用；统一画布中的正式图片写回后已可直接使用。",
    inputSchema: { projectId: z.string(), shotId: z.string(), checklist: z.record(z.boolean()), accepted: z.boolean() },
    annotations: annotationsWrite,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "mark_shot_review", input), "旧版图片检查状态已保存。"));

  registerAppTool(server, "get_video_prompt_context", {
    title: "读取视频提示词上下文", description: "读取正式首帧、镜头动作和前后镜连续性，供 Codex 准备视频提示词。",
    inputSchema: { projectId: z.string(), shotIds: z.array(z.string()).default([]) }, annotations: annotationsRead,
    _meta: { ui: { visibility: ["model"] } },
  }, async (input) => toolResult(await executeTool(store, "get_video_prompt_context", input), "视频提示词上下文已读取。"));

  registerAppTool(server, "update_video_plan", {
    title: "保存视频提示词", description: "保存一个分镜的肯定式正向提示词、独立负面提示词，以及固定 16fps 下的 49、65、81、97 或 113 帧方案（约 3–7 秒，默认以约 5 秒为基准）。",
    inputSchema: {
      projectId: z.string(), shotId: z.string(), prompt: z.string().min(1).max(12000), negativePrompt: z.string().max(8000).optional(),
      frameRate: z.literal(16).default(16), frameCount: z.union([z.literal(49), z.literal(65), z.literal(81), z.literal(97), z.literal(113)]).default(81),
      source: z.enum(["codex", "user"]).default("codex"),
    }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "update_video_plan", input), "视频提示词已保存。"));

  registerAppTool(server, "enqueue_video_generation", {
    title: "提交分镜视频", description: "经用户明确确认后，将一个或多个正式分镜提交给可能访问外部服务并产生费用的视频接口队列。",
    inputSchema: {
      projectId: z.string(), shotIds: z.array(z.string()).min(1), providerId: z.string().optional(),
      allowUnreviewed: z.boolean().default(false), allowStalePrompt: z.boolean().default(false),
      confirmExternalCost: z.boolean().default(false),
    }, annotations: annotationsExternalIrreversible,
    _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "enqueue_video_generation", input), "视频任务已进入本机后台队列。"));

  registerAppTool(server, "get_video_requests", {
    title: "刷新视频状态", description: "读取视频队列、远端进度、失败原因和完成结果。",
    inputSchema: { projectId: z.string() }, annotations: annotationsRead,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "get_video_requests", input)));

  registerAppTool(server, "cancel_video_request", {
    title: "取消本地视频排队", description: "取消尚未提交远端的视频请求；不会中断共享服务器中的运行任务。",
    inputSchema: { projectId: z.string(), requestId: z.string() }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "cancel_video_request", input), "本地视频请求已取消。"));

  registerAppTool(server, "retry_video_request", {
    title: "重试视频请求", description: "由用户在工作台中重试一个失败或已取消的视频镜头；重试会再次访问外部接口并可能产生费用。",
    inputSchema: { projectId: z.string(), requestId: z.string() }, annotations: annotationsExternalIrreversible,
    _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "retry_video_request", input), "视频请求已重新排队。"));

  registerAppTool(server, "mark_video_review", {
    title: "兼容旧版视频检查", description: "仅兼容旧项目调用；统一画布中的视频校验完成后即可直接播放。",
    inputSchema: { projectId: z.string(), shotId: z.string(), checklist: z.record(z.boolean()), accepted: z.boolean() }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "mark_video_review", input), "旧版视频检查状态已保存。"));

  registerAppTool(server, "list_video_providers", {
    title: "列出视频接口", description: "列出只保存在本机的接口配置和默认接口，不返回凭据明文。",
    inputSchema: {}, annotations: annotationsRead,
    _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
  }, async () => toolResult(await executeTool(store, "list_video_providers", {})));

  registerAppTool(server, "save_video_provider", {
    title: "保存视频接口", description: "保存本机 ComfyUI 或通用 HTTP 接口；凭据由独立本机入口写入 Windows 凭据库。",
    inputSchema: { profile: z.any(), workflowJson: z.string().optional() }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "save_video_provider", input), "视频接口已保存在本机。"));

  registerAppTool(server, "create_video_provider_setup", {
    title: "让 Codex 帮我接入视频模型",
    description: "登记一份本机视频接口接入材料。只保存脱敏后的说明、文档、示例和可选工作流，不接收 API Key。",
    inputSchema: {
      description: z.string().min(1).max(12000),
      docsUrl: z.string().max(4000).optional(),
      baseUrl: z.string().max(4000).optional(),
      exampleRequest: z.string().max(100000).optional(),
      exampleResponse: z.string().max(100000).optional(),
      sampleRequest: z.string().max(100000).optional(),
      sampleResponse: z.string().max(100000).optional(),
      workflowJson: z.string().max(25 * 1024 * 1024).optional(),
    }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "create_video_provider_setup", input), "视频模型接入请求已登记。"));

  registerAppTool(server, "get_video_provider_setup", {
    title: "读取视频模型接入请求", description: "读取接入请求的本机状态，不返回工作流正文或任何凭据。",
    inputSchema: { requestId: z.string() }, annotations: annotationsRead,
    _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "get_video_provider_setup", input)));

  registerAppTool(server, "cancel_video_provider_setup", {
    title: "取消视频模型接入", description: "取消尚未完成的视频接口接入分析。",
    inputSchema: { requestId: z.string() }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "cancel_video_provider_setup", input), "视频模型接入请求已取消。"));

  registerAppTool(server, "get_video_provider_setup_context", {
    title: "读取视频接口接入上下文",
    description: "读取用户说明、脱敏示例、工作流安全路径、节点摘要和允许的声明式字段，供 Codex 生成连接器草稿。",
    inputSchema: { requestId: z.string() }, annotations: annotationsRead,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "get_video_provider_setup_context", input), "视频接口接入上下文已读取。"));

  registerAppTool(server, "validate_video_provider_draft", {
    title: "校验视频接口草稿",
    description: "严格校验并规范化声明式接口草稿；不会执行代码、脚本或发起模型任务。",
    inputSchema: { requestId: z.string(), profile: z.any() }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "validate_video_provider_draft", input), "视频接口草稿校验通过。"));

  registerAppTool(server, "commit_video_provider_draft", {
    title: "保存已校验的视频接口",
    description: "再次严格校验并保存声明式接口配置和本机工作流；凭据仍需由用户在独立本机入口填写。",
    inputSchema: { requestId: z.string(), profile: z.any().optional() }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "commit_video_provider_draft", input), "视频接口已安全写入本机。"));

  registerAppTool(server, "set_video_provider_setup_status", {
    title: "更新视频接口接入状态", description: "更新 Codex 对接入请求的分析、就绪或失败状态。",
    inputSchema: {
      requestId: z.string(), status: z.enum(["queued", "analyzing", "ready", "failed"]), error: z.string().max(4000).optional(),
    }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "set_video_provider_setup_status", input), "视频接口接入状态已更新。"));

  registerAppTool(server, "delete_video_provider", {
    title: "删除视频接口", description: "删除本机接口配置、私有工作流和对应 Windows 凭据。",
    inputSchema: { providerId: z.string() }, annotations: annotationsDestructive,
    _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "delete_video_provider", input), "视频接口已删除。"));

  registerAppTool(server, "test_video_provider", {
    title: "免费探测视频接口", description: "只探测接口地址、本机密钥就绪状态与工作流文件；不会提交生成请求，也不会产生模型调用费用。",
    inputSchema: { providerId: z.string() }, annotations: annotationsExternalRead,
    _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "test_video_provider", input)));

  registerAppTool(server, "set_default_video_provider", {
    title: "设置默认视频接口", description: "将一个已启用的本机接口设为默认。",
    inputSchema: { providerId: z.string() }, annotations: annotationsWrite,
    _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
  }, async (input) => toolResult(await executeTool(store, "set_default_video_provider", input), "默认视频接口已更新。"));

  registerAppResource(server, "图片生成中控工作台", UI_URI, {
    mimeType: RESOURCE_MIME_TYPE,
    description: "分镜、图片与视频一体化生产工作台",
  }, async () => widgetResource(UI_URI));

  // A Codex task can retain a tool descriptor from the plugin version that
  // originally opened it. Keep every historical version-shaped URI readable
  // while the primary exact resource remains versioned for cache refreshes.
  // The template never selects a file or network target; every match returns
  // the same bundled, read-only workbench HTML.
  server.registerResource(
    "图片生成中控工作台（版本兼容）",
    new ResourceTemplate(UI_URI_TEMPLATE, { list: undefined }),
    {
      mimeType: RESOURCE_MIME_TYPE,
      description: "兼容旧 Codex 任务缓存的图片生成中控工作台地址",
    },
    async (uri) => widgetResource(uri.toString()),
  );

  return server;
}

async function startHttpServer(): Promise<boolean> {
  const httpCapability = await loadOrCreateHttpCapability();
  store.setMediaSigningSecret(httpCapability);
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self' data: blob:; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
    );
    next();
  });

  type LocalSession = { csrf: string; expiresAt: number };
  const sessions = new Map<string, LocalSession>();
  const expectedHost = new URL(MEDIA_ORIGIN).host.toLowerCase();
  const hasExactLocalOrigin = (req: express.Request): boolean => (
    req.get("origin") === MEDIA_ORIGIN && (req.get("host") ?? "").toLowerCase() === expectedHost
  );
  const pruneSessions = () => {
    const timestamp = Date.now();
    for (const [id, session] of sessions) if (session.expiresAt <= timestamp) sessions.delete(id);
    while (sessions.size > 128) sessions.delete(sessions.keys().next().value as string);
  };
  const requestSession = (req: express.Request): LocalSession | undefined => {
    const id = parseCookies(req.get("cookie")).get(HTTP_SESSION_COOKIE);
    if (!id || !/^[A-Za-z0-9_-]{43}$/.test(id)) return undefined;
    const session = sessions.get(id);
    if (!session || session.expiresAt <= Date.now()) {
      sessions.delete(id);
      return undefined;
    }
    return session;
  };
  const rejectExternalOrigin: express.RequestHandler = (req, res, next) => {
    if (!hasExactLocalOrigin(req)) {
      res.status(403).json({ error: "本机接口只接受同源工作台请求" });
      return;
    }
    next();
  };
  const requireLocalSession: express.RequestHandler = (req, res, next) => {
    if (!hasExactLocalOrigin(req)) {
      res.status(403).json({ error: "本机接口只接受同源工作台请求" });
      return;
    }
    const session = requestSession(req);
    const csrf = req.get("x-image-control-csrf") ?? "";
    if (!session || !csrf || !safeTextEqual(session.csrf, csrf)) {
      res.status(401).json({ error: "本机工作台会话无效，请刷新页面后重试" });
      return;
    }
    next();
  };

  app.get("/health", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const challenge = typeof req.query.challenge === "string" ? req.query.challenge : "";
    const suppliedCapability = bearerToken(req.get("authorization"));
    if (!challenge && !suppliedCapability) {
      res.json({ ok: true, service: "image-control", version: SERVER_VERSION });
      return;
    }
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(challenge)
      || !suppliedCapability
      || !safeTextEqual(httpCapability, suppliedCapability)) {
      res.status(401).json({ ok: false, service: "image-control" });
      return;
    }
    res.json({ ok: true, service: "image-control", version: SERVER_VERSION, proof: healthProof(httpCapability, challenge) });
  });

  app.use("/api", (req, res, next) => {
    if (req.method === "OPTIONS") {
      res.status(403).json({ error: "本机接口不接受跨站预检请求" });
      return;
    }
    next();
  });
  app.post("/api/session", rejectExternalOrigin, (req, res) => {
    pruneSessions();
    const sessionId = randomBytes(32).toString("base64url");
    const session: LocalSession = { csrf: randomBytes(32).toString("base64url"), expiresAt: Date.now() + HTTP_SESSION_TTL_MS };
    sessions.set(sessionId, session);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Set-Cookie",
      `${HTTP_SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(HTTP_SESSION_TTL_MS / 1000)}`,
    );
    res.json({ ok: true, csrf: session.csrf, expiresAt: new Date(session.expiresAt).toISOString() });
  });
  app.use("/api", requireLocalSession);
  app.use("/api", express.json({ limit: "35mb", type: "application/json" }));
  app.post("/api/video-providers/:providerId/credential", async (req, res) => {
    try {
      await store.videoProviders.setCredential(req.params.providerId, String(req.body?.secret ?? ""));
      res.json({ ok: true, hasCredential: await store.videoProviders.hasCredential(req.params.providerId) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  app.delete("/api/video-providers/:providerId/credential", async (req, res) => {
    try {
      await store.videoProviders.deleteCredential(req.params.providerId);
      res.json({ ok: true, hasCredential: false });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  app.delete("/api/video-provider-credentials", async (_req, res) => {
    try {
      const deletedCount = await store.videoProviders.deleteAllCredentials();
      res.json({ ok: true, deletedCount });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  app.post("/api/tools/:toolName", async (req, res) => {
    try {
      res.json({ structuredContent: await executeTool(store, req.params.toolName, req.body ?? {}) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  app.use("/api", (_req, res) => res.status(404).json({ error: "本机接口不存在" }));

  app.get("/credential/:providerId", (req, res) => {
    const providerId = req.params.providerId;
    const credentialManager = providerId === "__all_credentials__";
    if (!credentialManager && !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(providerId)) {
      res.status(404).type("text/plain").send("视频接口不存在");
      return;
    }
    const nonce = randomBytes(18).toString("base64url");
    const providerIdJson = JSON.stringify(providerId).replace(/</g, "\\u003c");
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; connect-src 'self'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'`,
    );
    res.setHeader("Cache-Control", "no-store");
    res.type("html").send(`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>本机视频接口凭据</title><style nonce="${nonce}">
:root{color-scheme:dark;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#11130f;color:#f4f1e9}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box}.card{width:min(520px,100%);padding:24px;border:1px solid #34382d;border-radius:14px;background:#1b1e18;box-shadow:0 20px 60px #0008}h1{font-size:20px;margin:0 0 8px}p{color:#adb3a2;line-height:1.6}.id{font-family:ui-monospace,monospace;color:#d7ff63}label{display:grid;gap:8px;margin-top:20px;font-weight:650}input{height:44px;padding:0 12px;border:1px solid #454b3b;border-radius:8px;background:#10120e;color:#fff;font:inherit}button{min-height:40px;padding:0 14px;border:1px solid #4d5637;border-radius:8px;background:#2a311e;color:#eefec1;font-weight:700;cursor:pointer}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.danger{border-color:#6a3932;background:#321d19;color:#ffb2a4}.muted{background:transparent;color:#bbc0b1}#status{min-height:24px;margin-top:14px;color:#d7ff63}.warning{padding:10px 12px;border-radius:8px;background:#251e13;color:#e8c98a;font-size:13px}.cleanup{margin-top:22px;padding-top:18px;border-top:1px solid #34382d}.cleanup p{font-size:13px;margin:0}
</style></head><body><main class="card"><h1 id="heading">只在本机保存接口凭据</h1><p id="provider-row">接口 ID：<span class="id" id="provider"></span></p><p class="warning">密钥只会写入本机系统凭据库，不会发送给 Codex，也不会放入网址或项目文件。</p><form id="form"><label>API Key / Token<input id="secret" type="password" autocomplete="new-password" required></label><div class="actions"><button type="submit">保存到本机</button><button class="danger" id="remove" type="button">移除当前接口密钥</button></div></form><section class="cleanup"><p>彻底卸载前，可在这里一并清除本插件服务名下的全部密钥，包括已删除连接器留下的旧密钥。</p><div class="actions"><button class="danger" id="remove-all" type="button">清除本插件全部密钥</button><button class="muted" id="close" type="button">关闭窗口</button></div></section><p id="status" role="status"></p></main>
<script nonce="${nonce}">(()=>{const providerId=${providerIdJson};const manager=providerId==="__all_credentials__";const form=document.getElementById("form");const providerRow=document.getElementById("provider-row");document.getElementById("provider").textContent=providerId;if(manager){document.getElementById("heading").textContent="彻底清除本插件凭据";form.hidden=true;providerRow.hidden=true}const status=document.getElementById("status");let csrf="";async function session(){const response=await fetch("/api/session",{method:"POST",credentials:"same-origin"});const data=await response.json();if(!response.ok)throw new Error(data.error||"无法建立本机会话");csrf=data.csrf}async function request(url,method,body){if(!csrf)await session();const response=await fetch(url,{method,credentials:"same-origin",headers:{"Content-Type":"application/json","X-Image-Control-CSRF":csrf},body});const data=await response.json();if(!response.ok)throw new Error(data.error||"操作失败");return data}form.addEventListener("submit",async(event)=>{event.preventDefault();status.textContent="正在保存…";try{const input=document.getElementById("secret");await request("/api/video-providers/"+encodeURIComponent(providerId)+"/credential","POST",JSON.stringify({secret:input.value}));input.value="";status.textContent="已安全保存到本机凭据库。"}catch(error){status.textContent=error instanceof Error?error.message:String(error)}});document.getElementById("remove").addEventListener("click",async()=>{if(!confirm("确认移除当前接口在这台电脑中保存的密钥？"))return;status.textContent="正在移除…";try{await request("/api/video-providers/"+encodeURIComponent(providerId)+"/credential","DELETE");status.textContent="已移除当前接口的本机密钥。"}catch(error){status.textContent=error instanceof Error?error.message:String(error)}});document.getElementById("remove-all").addEventListener("click",async()=>{if(!confirm("确认永久清除本插件在 Windows 凭据库中保存的全部密钥？此操作无法撤销。"))return;status.textContent="正在清除全部密钥…";try{const data=await request("/api/video-provider-credentials","DELETE");status.textContent="已清除 "+data.deletedCount+" 条本机密钥。"}catch(error){status.textContent=error instanceof Error?error.message:String(error)}});document.getElementById("close").addEventListener("click",()=>window.close());session().catch(error=>{status.textContent=error instanceof Error?error.message:String(error)})})();</script></body></html>`);
  });

  app.use("/media/:projectId", async (req, res) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.status(405).setHeader("Allow", "GET, HEAD");
        res.end();
        return;
      }
      const relativePath = decodeURIComponent(req.path.replace(/^\//, ""));
      const signedRequest = store.verifyMediaSignature(req.params.projectId, relativePath, req.query.exp, req.query.sig);
      const sessionRequest = Boolean(requestSession(req))
        && (req.get("origin") === MEDIA_ORIGIN || req.get("sec-fetch-site") === "same-origin")
        && (req.get("host") ?? "").toLowerCase() === expectedHost;
      if (!signedRequest && !sessionRequest) {
        res.status(401).json({ error: "媒体访问凭据无效或已经过期" });
        return;
      }
      const filePath = await store.resolveMediaPath(req.params.projectId, relativePath);
      const stats = await fsSync.promises.stat(filePath);
      res.setHeader("Cache-Control", typeof req.query.v === "string" ? "private, max-age=3600, immutable" : "no-cache");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      const extension = path.extname(filePath).toLowerCase();
      res.type(extension === ".png" ? "image/png" : "video/mp4");
      res.setHeader("Content-Disposition", `inline; filename="media${extension}"`);

      const rangeHeader = req.headers.range;
      const range = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
      if (rangeHeader && !range) {
        res.status(416).setHeader("Content-Range", `bytes */${stats.size}`);
        res.end();
        return;
      }
      let start = 0;
      let end = stats.size - 1;
      if (range) {
        if (!range[1] && range[2]) {
          const suffixLength = Number(range[2]);
          start = Math.max(0, stats.size - suffixLength);
        } else {
          start = range[1] ? Number(range[1]) : 0;
          end = range[2] ? Number(range[2]) : end;
        }
        end = Math.min(end, stats.size - 1);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= stats.size) {
          res.status(416).setHeader("Content-Range", `bytes */${stats.size}`);
          res.end();
          return;
        }
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${stats.size}`);
      }
      res.setHeader("Content-Length", String(end - start + 1));
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      const stream = fsSync.createReadStream(filePath, { start, end });
      stream.on("error", (error) => {
        if (res.headersSent) res.destroy(error);
        else res.status(500).end();
      });
      stream.pipe(res);
    } catch {
      res.status(404).json({ error: "媒体不存在或不可访问" });
    }
  });
  app.use("/media", (_req, res) => res.status(404).json({ error: "媒体不存在" }));
  const distDir = path.resolve(ROOT_DIR, "app", "dist");
  if (fsSync.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get(/.*/, (_req, res) => res.sendFile(path.join(distDir, "index.html")));
  }
  return new Promise<boolean>((resolve, reject) => {
    const listener = app.listen(HTTP_PORT, "127.0.0.1", () => resolve(true));
    listener.on("error", async (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        try {
          const challenge = randomBytes(24).toString("base64url");
          const response = await fetch(`${MEDIA_ORIGIN}/health?challenge=${encodeURIComponent(challenge)}`, {
            headers: { Authorization: `Bearer ${httpCapability}` },
            redirect: "manual",
            signal: AbortSignal.timeout(2_000),
          });
          const health = await response.json() as { ok?: boolean; service?: string; version?: string; proof?: string };
          if (
            !response.ok
            || !health.ok
            || health.service !== "image-control"
            || health.version !== SERVER_VERSION
            || typeof health.proof !== "string"
            || !safeTextEqual(health.proof, healthProof(httpCapability, challenge))
          ) {
            throw new Error("占用端口的服务不是当前图片生成中控");
          }
          process.stderr.write(`图片生成中控媒体端口 ${HTTP_PORT} 已由同一工作台占用，将安全复用。\n`);
          resolve(false);
        } catch (healthError) {
          reject(new Error(`媒体端口 ${HTTP_PORT} 被其他程序占用：${healthError instanceof Error ? healthError.message : String(healthError)}`));
        }
      } else reject(error);
    });
  });
}

async function main(): Promise<void> {
  await store.init();
  await startHttpServer();
  // Every MCP/HTTP process may stay alive for a different amount of time.
  // VideoWorker performs a cross-process lease election, so one worker is
  // active and another process can take over after its owner exits.
  new VideoWorker(store).start();
  if (process.argv.includes("--stdio")) {
    const server = createMcpServer();
    await server.connect(new StdioServerTransport());
    process.stderr.write(`Image Control MCP ${SERVER_VERSION} ready.\n`);
    return;
  }
  process.stderr.write(`图片生成中控开发服务：http://127.0.0.1:${HTTP_PORT}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
