import type { MediaVariant, ProjectStore } from "./store.js";
import type {
  AspectRatio,
  CanvasState,
  GenerationKind,
  GenerationStatus,
  ManualChecklist,
  OpenAIFileInput,
  ProjectStage,
  ReferenceSlot,
  TemplateId,
  VideoManualChecklist,
  VideoProviderProfile,
} from "./types.js";

export async function executeTool(store: ProjectStore, name: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  switch (name) {
    case "render_workbench": {
      const projects = await store.listProjects();
      const requestedId = typeof input.projectId === "string" ? input.projectId : projects[0]?.id;
      const project = requestedId ? store.toClientProject(await store.getProject(requestedId)) : undefined;
      return { projects, project, mediaOrigin: store.mediaOrigin };
    }
    case "list_projects":
      return { projects: await store.listProjects() };
    case "get_project":
      return { project: store.toClientProject(await store.getProject(String(input.projectId))) };
    case "get_media":
      return await store.getMediaData(
        String(input.projectId),
        String(input.path),
        String(input.variant ?? "preview") as MediaVariant,
      );
    case "create_project":
      return {
        project: await store.createProject({
          name: String(input.name ?? ""),
          templateId: (input.templateId ?? "blank") as TemplateId,
          aspectRatio: (input.aspectRatio ?? "9:16") as AspectRatio,
          shotCount: Number(input.shotCount ?? 6),
        }),
      };
    case "delete_project":
      return await store.deleteProject(String(input.projectId));
    case "update_project":
      return {
        project: await store.updateProject(String(input.projectId), {
          name: input.name as string | undefined,
          brief: input.brief as string | undefined,
          aspectRatio: input.aspectRatio as AspectRatio | undefined,
          stage: input.stage as ProjectStage | undefined,
        }),
      };
    case "update_shot":
      return {
        project: await store.updateShot(String(input.projectId), String(input.shotId), {
          title: input.title as string | undefined,
          cast: input.cast as string | undefined,
          scene: input.scene as string | undefined,
          action: input.action as string | undefined,
          composition: input.composition as string | undefined,
          instruction: input.instruction as string | undefined,
        }),
      };
    case "add_shot":
      return { project: await store.addShot(String(input.projectId)) };
    case "delete_shot":
      return { project: await store.deleteShot(String(input.projectId), String(input.shotId)) };
    case "move_shot":
      return { project: await store.moveShot(String(input.projectId), String(input.shotId), Number(input.direction) < 0 ? -1 : 1) };
    case "resize_shot_count":
      return {
        project: await store.resizeShotCount(String(input.projectId), {
          targetCount: Number(input.targetCount),
          confirmRemoval: Boolean(input.confirmRemoval),
        }),
      };
    case "import_reference":
      return {
        project: await store.importReference(
          String(input.projectId),
          String(input.slot) as ReferenceSlot,
          String(input.dataUrl),
          String(input.fileName ?? `${String(input.slot)}.png`),
        ),
      };
    case "import_editor_image":
      return {
        project: await store.importEditorImage(
          String(input.projectId),
          String(input.dataUrl),
          String(input.fileName ?? "source.png"),
        ),
      };
    case "remove_reference":
      return {
        project: await store.removeReference(String(input.projectId), String(input.slot) as ReferenceSlot),
      };
    case "update_reference_constraint":
      return {
        project: await store.updateReferenceConstraint(
          String(input.projectId),
          String(input.slot) as ReferenceSlot,
          String(input.constraint ?? ""),
        ),
      };
    case "save_canvas":
      return {
        project: await store.saveCanvas(String(input.projectId), {
          viewport: input.viewport as CanvasState["viewport"] | undefined,
          contactSheetPosition: input.contactSheetPosition as CanvasState["contactSheetPosition"] | undefined,
          notes: input.notes as CanvasState["notes"] | undefined,
          shotPositions: input.shotPositions as Record<string, { x: number; y: number }> | undefined,
        }),
      };
    case "enqueue_generation":
      return {
        requests: await store.enqueueGeneration({
          projectId: String(input.projectId),
          kind: String(input.kind) as GenerationKind,
          shotIds: Array.isArray(input.shotIds) ? input.shotIds.map(String) : [],
          instruction: input.instruction as string | undefined,
          selectionMaskDataUrl: input.selectionMaskDataUrl as string | undefined,
          annotatedPreviewDataUrl: input.annotatedPreviewDataUrl as string | undefined,
        }),
      };
    case "get_generation_requests":
      return { requests: await store.getGenerationRequests(String(input.projectId)) };
    case "get_generation_context":
      return { context: await store.getGenerationContext(String(input.projectId), String(input.requestId)) };
    case "set_generation_status":
      return {
        request: await store.setGenerationStatus(
          String(input.projectId),
          String(input.requestId),
          String(input.status) as GenerationStatus,
          input.error as string | undefined,
          input.claimToken as string | undefined,
        ),
      };
    case "recover_generation_request":
      return {
        request: await store.recoverGenerationRequest(
          String(input.projectId),
          String(input.requestId),
          input.reason as string | undefined,
        ),
      };
    case "commit_generation_result":
      return {
        project: await store.commitGenerationResult({
          projectId: String(input.projectId),
          requestId: String(input.requestId),
          claimToken: String(input.claimToken ?? ""),
          imageDataUrl: input.imageDataUrl as string | undefined,
          imageFile: input.imageFile as OpenAIFileInput | undefined,
        }),
      };
    case "undo_last_overwrite":
      return { project: await store.undoLastOverwrite(String(input.projectId), String(input.shotId)) };
    case "cancel_queued_request":
      return { request: await store.cancelQueuedRequest(String(input.projectId), String(input.requestId)) };
    case "mark_contact_sheet_review":
      return {
        project: await store.markContactSheetReview(String(input.projectId), Boolean(input.approved)),
      };
    case "mark_shot_review":
      return {
        project: await store.markShotReview(
          String(input.projectId),
          String(input.shotId),
          (input.checklist ?? {}) as ManualChecklist,
          Boolean(input.accepted),
        ),
      };
    case "get_video_prompt_context":
      return {
        context: await store.getVideoPromptContext(
          String(input.projectId),
          Array.isArray(input.shotIds) ? input.shotIds.map(String) : [],
        ),
      };
    case "update_video_plan":
      return {
        project: await store.updateVideoPlan({
          projectId: String(input.projectId), shotId: String(input.shotId),
          prompt: String(input.prompt ?? ""), negativePrompt: String(input.negativePrompt ?? ""),
          frameRate: input.frameRate === undefined ? undefined : Number(input.frameRate),
          frameCount: input.frameCount === undefined ? undefined : Number(input.frameCount),
          source: input.source === "codex" ? "codex" : "user",
        }),
      };
    case "enqueue_video_generation":
      return {
        requests: await store.enqueueVideoGeneration({
          projectId: String(input.projectId),
          shotIds: Array.isArray(input.shotIds) ? input.shotIds.map(String) : [],
          providerId: input.providerId ? String(input.providerId) : undefined,
          allowUnreviewed: Boolean(input.allowUnreviewed),
          allowStalePrompt: Boolean(input.allowStalePrompt),
          confirmExternalCost: Boolean(input.confirmExternalCost),
        }),
      };
    case "get_video_requests":
      return { requests: await store.getVideoRequests(String(input.projectId)) };
    case "cancel_video_request":
      return { request: await store.cancelVideoRequest(String(input.projectId), String(input.requestId)) };
    case "retry_video_request":
      return { request: await store.retryVideoRequest(String(input.projectId), String(input.requestId)) };
    case "mark_video_review":
      return {
        project: await store.markVideoReview(
          String(input.projectId), String(input.shotId),
          (input.checklist ?? {}) as VideoManualChecklist, Boolean(input.accepted),
        ),
      };
    case "list_video_providers":
      return {
        providers: await store.videoProviders.listProfiles(),
        defaultProviderId: await store.videoProviders.getDefaultProfileId(),
      };
    case "save_video_provider":
      return {
        provider: await store.videoProviders.saveProfile(input.profile as VideoProviderProfile, input.workflowJson as string | undefined),
      };
    case "create_video_provider_setup": {
      const request = await store.videoProviders.createSetupRequest({
          description: String(input.description ?? ""),
          docsUrl: input.docsUrl ? String(input.docsUrl) : undefined,
          baseUrl: input.baseUrl ? String(input.baseUrl) : undefined,
          exampleRequest: input.exampleRequest || input.sampleRequest ? String(input.exampleRequest ?? input.sampleRequest) : undefined,
          exampleResponse: input.exampleResponse || input.sampleResponse ? String(input.exampleResponse ?? input.sampleResponse) : undefined,
          workflowJson: input.workflowJson ? String(input.workflowJson) : undefined,
        });
      return { setup: request, request };
    }
    case "get_video_provider_setup": {
      const request = await store.videoProviders.getSetupRequest(String(input.requestId));
      return { setup: request, request };
    }
    case "cancel_video_provider_setup": {
      const request = await store.videoProviders.cancelSetupRequest(String(input.requestId));
      return { setup: request, request };
    }
    case "get_video_provider_setup_context":
      return { context: await store.videoProviders.getSetupContext(String(input.requestId)) };
    case "validate_video_provider_draft": {
      const result = await store.videoProviders.validateSetupDraft(String(input.requestId), input.profile as VideoProviderProfile);
      return { ...result, setup: result.request };
    }
    case "commit_video_provider_draft": {
      const result = await store.videoProviders.commitSetupDraft(
        String(input.requestId),
        input.profile ? input.profile as VideoProviderProfile : undefined,
      );
      return { ...result, setup: result.request, providerId: result.provider.id };
    }
    case "set_video_provider_setup_status": {
      const request = await store.videoProviders.updateSetupRequest(
          String(input.requestId),
          String(input.status) as "queued" | "analyzing" | "ready" | "failed",
          input.error ? String(input.error) : undefined,
        );
      return { setup: request, request };
    }
    case "delete_video_provider":
      await store.videoProviders.deleteProfile(String(input.providerId));
      return { deletedProviderId: String(input.providerId) };
    case "test_video_provider":
      return await store.videoProviders.testProfile(String(input.providerId));
    case "set_default_video_provider":
      await store.videoProviders.setDefaultProfileId(String(input.providerId));
      return { defaultProviderId: String(input.providerId) };
    default:
      throw new Error(`未知工具：${name}`);
  }
}
