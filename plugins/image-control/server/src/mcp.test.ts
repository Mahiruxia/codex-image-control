import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import sharp from "sharp";

async function availableLoopbackPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("无法分配测试端口");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

test("stdio MCP exposes app resource and image-control tools", async (t) => {
  const configuredRoot = process.env.IMAGE_CONTROL_MCP_ROOT;
  const root = configuredRoot
    ? path.resolve(configuredRoot)
    : await fs.mkdtemp(path.join(os.tmpdir(), "image-control-mcp-"));
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-mcp-state-"));
  const projectsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "image-control-mcp-projects-"));
  const httpPort = await availableLoopbackPort();
  const httpOrigin = `http://127.0.0.1:${httpPort}`;
  const serverEntry = process.env.IMAGE_CONTROL_MCP_ENTRY
    ? path.resolve(process.env.IMAGE_CONTROL_MCP_ENTRY)
    : fileURLToPath(new URL("./index.js", import.meta.url));
  const inheritedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry, "--stdio"],
    cwd: root,
    env: {
      ...inheritedEnvironment,
      IMAGE_CONTROL_ROOT: root,
      IMAGE_CONTROL_STATE_ROOT: stateRoot,
      IMAGE_CONTROL_PROJECTS_ROOT: projectsRoot,
      IMAGE_CONTROL_PORT: String(httpPort),
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "image-control-test", version: "0.1.0" }, { capabilities: {} });
  t.after(async () => {
    await transport.close().catch(() => undefined);
    const cleanup = [
      fs.rm(stateRoot, { recursive: true, force: true }),
      fs.rm(projectsRoot, { recursive: true, force: true }),
    ];
    if (!configuredRoot) cleanup.push(fs.rm(root, { recursive: true, force: true }));
    await Promise.all(cleanup);
  });

  await client.connect(transport);
  const tools = await client.listTools();
  const names = new Set(tools.tools.map((tool) => tool.name));
  for (const expected of [
    "render_workbench",
    "get_media",
    "create_project",
    "import_editor_image",
    "resize_shot_count",
    "delete_project",
    "remove_reference",
    "update_reference_constraint",
    "enqueue_generation",
    "get_generation_context",
    "recover_generation_request",
    "commit_generation_result",
    "undo_last_overwrite",
    "mark_contact_sheet_review",
    "mark_shot_review",
    "get_video_prompt_context",
    "update_video_plan",
    "enqueue_video_generation",
    "get_video_requests",
    "cancel_video_request",
    "retry_video_request",
    "mark_video_review",
    "list_video_providers",
    "create_video_provider_setup",
    "get_video_provider_setup",
    "cancel_video_provider_setup",
    "get_video_provider_setup_context",
    "validate_video_provider_draft",
    "commit_video_provider_draft",
    "set_video_provider_setup_status",
  ]) assert.ok(names.has(expected), `missing MCP tool: ${expected}`);
  assert.equal(names.has("apply_default_subject_references"), false, "removed default-subject tool must not remain exposed");
  const enqueueVideoTool = tools.tools.find((tool) => tool.name === "enqueue_video_generation");
  const retryVideoTool = tools.tools.find((tool) => tool.name === "retry_video_request");
  const testProviderTool = tools.tools.find((tool) => tool.name === "test_video_provider");
  const renderWorkbenchTool = tools.tools.find((tool) => tool.name === "render_workbench");
  assert.equal(enqueueVideoTool?.annotations?.openWorldHint, true);
  assert.equal(enqueueVideoTool?.annotations?.destructiveHint, true);
  assert.deepEqual((enqueueVideoTool?._meta as { ui?: { visibility?: string[] } } | undefined)?.ui?.visibility, ["app"]);
  assert.equal(retryVideoTool?.annotations?.openWorldHint, true);
  assert.deepEqual((retryVideoTool?._meta as { ui?: { visibility?: string[] } } | undefined)?.ui?.visibility, ["app"]);
  assert.equal(testProviderTool?.annotations?.openWorldHint, true);

  const resources = await client.listResources();
  const renderWorkbenchMeta = renderWorkbenchTool?._meta as {
    ui?: { resourceUri?: string };
    "ui/resourceUri"?: string;
    "openai/outputTemplate"?: string;
  } | undefined;
  const toolResourceUri = renderWorkbenchMeta?.ui?.resourceUri;
  assert.match(toolResourceUri ?? "", /^ui:\/\/image-control\/workbench-[0-9A-Za-z._-]+\.html$/);
  assert.equal(renderWorkbenchMeta?.["ui/resourceUri"], toolResourceUri);
  assert.equal(renderWorkbenchMeta?.["openai/outputTemplate"], toolResourceUri);
  const workbenchResource = resources.resources.find((resource) => resource.uri === toolResourceUri);
  assert.ok(workbenchResource);
  const widget = await client.readResource({ uri: workbenchResource.uri });
  assert.equal(widget.contents[0]?.uri, toolResourceUri);
  assert.equal(widget.contents[0]?.mimeType, "text/html;profile=mcp-app");
  const widgetText = widget.contents.find((content) => "text" in content)?.text ?? "";
  assert.match(widgetText, /图片生成中控/);

  const resourceTemplates = await client.listResourceTemplates();
  assert.ok(resourceTemplates.resourceTemplates.some((template) => template.uriTemplate === "ui://image-control/workbench-{version}.html"));
  for (const historicalUri of [
    "ui://image-control/workbench-v26.html",
    "ui://image-control/workbench-0.10.0-codex.cached.html",
  ]) {
    const historicalWidget = await client.readResource({ uri: historicalUri });
    assert.equal(historicalWidget.contents[0]?.uri, historicalUri);
    assert.match(historicalWidget.contents.find((content) => "text" in content)?.text ?? "", /图片生成中控/);
  }
  for (const unrelatedUri of [
    "ui://other/workbench-v26.html",
    "ui://image-control/other-v26.html",
  ]) {
    await assert.rejects(
      () => client.readResource({ uri: unrelatedUri }),
      (error: unknown) => (
        typeof error === "object"
        && error !== null
        && "code" in error
        && (error as { code?: unknown }).code === -32602
      ),
    );
  }

  const publicHealthResponse = await fetch(`${httpOrigin}/health`);
  const publicHealth = await publicHealthResponse.json() as Record<string, unknown>;
  let expectedServerVersion = "development";
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(root, ".codex-plugin", "plugin.json"), "utf8")) as { version?: unknown };
    if (typeof manifest.version === "string" && manifest.version.trim()) expectedServerVersion = manifest.version.trim();
  } catch { /* The isolated development root intentionally has no manifest. */ }
  assert.equal(publicHealthResponse.ok, true);
  assert.equal(publicHealth.service, "image-control");
  assert.equal(publicHealth.version, expectedServerVersion);
  assert.equal("root" in publicHealth, false);
  assert.equal("stateRoot" in publicHealth, false);
  assert.equal("projectsRoot" in publicHealth, false);
  assert.equal("secret" in publicHealth, false);
  assert.equal("proof" in publicHealth, false);

  const capability = JSON.parse(await fs.readFile(path.join(stateRoot, ".runtime", "http-capability.json"), "utf8")) as { secret: string };
  const challenge = randomBytes(24).toString("base64url");
  const challengeResponse = await fetch(`${httpOrigin}/health?challenge=${challenge}`, {
    headers: { Authorization: `Bearer ${capability.secret}` },
  });
  const challengeHealth = await challengeResponse.json() as { version?: string; proof?: string };
  assert.equal(challengeResponse.ok, true);
  assert.equal(challengeHealth.version, expectedServerVersion);
  assert.equal(
    challengeHealth.proof,
    createHmac("sha256", capability.secret)
      .update([challenge, expectedServerVersion, path.resolve(root), path.resolve(stateRoot), path.resolve(projectsRoot)].join("\0"))
      .digest("base64url"),
  );
  const falseChallenge = await fetch(`${httpOrigin}/health?challenge=${challenge}`, {
    headers: { Authorization: `Bearer ${randomBytes(32).toString("base64url")}` },
  });
  assert.equal(falseChallenge.status, 401);

  const untrustedApiRequest = async (origin?: string) => fetch(`${httpOrigin}/api/tools/list_projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(origin === undefined ? {} : { Origin: origin }) },
    body: "{}",
  });
  assert.equal((await untrustedApiRequest()).status, 403, "originless callers must be rejected");
  assert.equal((await untrustedApiRequest("null")).status, 403, "Origin:null callers must be rejected");
  assert.equal((await untrustedApiRequest("https://example.invalid")).status, 403, "cross-site callers must be rejected");
  assert.equal((await untrustedApiRequest(httpOrigin)).status, 401, "same-origin callers still need a session");
  const preflight = await fetch(`${httpOrigin}/api/tools/list_projects`, {
    method: "OPTIONS",
    headers: { Origin: "https://example.invalid", "Access-Control-Request-Method": "POST" },
  });
  assert.equal(preflight.status, 403);
  assert.equal(preflight.headers.get("access-control-allow-origin"), null);

  const sessionResponse = await fetch(`${httpOrigin}/api/session`, { method: "POST", headers: { Origin: httpOrigin } });
  const session = await sessionResponse.json() as { csrf?: string };
  const cookie = sessionResponse.headers.get("set-cookie") ?? "";
  assert.equal(sessionResponse.ok, true);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(session.csrf ?? "", /^[A-Za-z0-9_-]{43}$/);
  const authenticatedHeaders = {
    Origin: httpOrigin,
    Cookie: cookie,
    "Content-Type": "application/json",
    "X-Image-Control-CSRF": session.csrf!,
  };
  const authenticatedTools = await fetch(`${httpOrigin}/api/tools/list_projects`, {
    method: "POST",
    headers: authenticatedHeaders,
    body: "{}",
  });
  assert.equal(authenticatedTools.ok, true);
  const stolenSessionFromNullOrigin = await fetch(`${httpOrigin}/api/tools/list_projects`, {
    method: "POST",
    headers: { ...authenticatedHeaders, Origin: "null" },
    body: "{}",
  });
  assert.equal(stolenSessionFromNullOrigin.status, 403);

  const credentialPage = await fetch(`${httpOrigin}/credential/test-provider`);
  assert.equal(credentialPage.ok, true);
  assert.match(credentialPage.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.match(await credentialPage.text(), /只在本机保存接口凭据/);
  const credentialManagerPage = await fetch(`${httpOrigin}/credential/__all_credentials__`);
  assert.equal(credentialManagerPage.ok, true);
  assert.match(await credentialManagerPage.text(), /清除本插件全部密钥/);

  const created = await client.callTool({
    name: "create_project",
    arguments: { name: "MCP smoke", templateId: "blank", aspectRatio: "1:1", shotCount: 6 },
  });
  const structured = created.structuredContent as { project?: { id?: string; shots?: unknown[] } } | undefined;
  assert.equal(structured?.project?.shots?.length, 6);
  await fs.access(path.join(projectsRoot, structured?.project?.id ?? "", "project.json"));

  const mediaCreated = await client.callTool({
    name: "create_project",
    arguments: { name: "MCP media guard", templateId: "image-editor", aspectRatio: "1:1", shotCount: 1 },
  });
  const mediaProjectId = (mediaCreated.structuredContent as { project?: { id?: string } } | undefined)?.project?.id ?? "";
  const source = await sharp({
    create: { width: 8, height: 8, channels: 4, background: { r: 40, g: 80, b: 120, alpha: 1 } },
  }).png().toBuffer();
  const imported = await client.callTool({
    name: "import_editor_image",
    arguments: { projectId: mediaProjectId, dataUrl: `data:image/png;base64,${source.toString("base64")}`, fileName: "source.png" },
  });
  const mediaProject = (imported.structuredContent as {
    project?: { shots?: Array<{ imagePath?: string; imageUrl?: string }> };
  } | undefined)?.project;
  const imagePath = mediaProject?.shots?.[0]?.imagePath ?? "";
  const imageUrl = mediaProject?.shots?.[0]?.imageUrl ?? "";
  assert.match(imageUrl, /[?&]exp=\d+&sig=/);
  const signedMedia = await fetch(imageUrl);
  assert.equal(signedMedia.ok, true);
  assert.equal(signedMedia.headers.get("content-type"), "image/png");
  assert.equal(signedMedia.headers.get("x-content-type-options"), "nosniff");
  assert.equal(signedMedia.headers.get("cross-origin-resource-policy"), "same-origin");
  const unsignedUrl = new URL(imageUrl);
  unsignedUrl.searchParams.delete("exp");
  unsignedUrl.searchParams.delete("sig");
  assert.equal((await fetch(unsignedUrl)).status, 401);
  const sessionMediaHeaders = { Origin: httpOrigin, Cookie: cookie, "Sec-Fetch-Site": "same-origin" };
  assert.equal((await fetch(unsignedUrl, { headers: sessionMediaHeaders })).status, 200);
  const arbitraryProjectFile = `${httpOrigin}/media/${encodeURIComponent(mediaProjectId)}/project.json`;
  assert.equal((await fetch(arbitraryProjectFile, { headers: sessionMediaHeaders })).status, 404);
  assert.ok(imagePath.endsWith("current.png"));

  const deleted = await client.callTool({
    name: "delete_project",
    arguments: { projectId: structured?.project?.id },
  });
  const deletedContent = deleted.structuredContent as { deletedProjectId?: string } | undefined;
  assert.equal(deletedContent?.deletedProjectId, structured?.project?.id);
  await client.callTool({ name: "delete_project", arguments: { projectId: mediaProjectId } });
});
