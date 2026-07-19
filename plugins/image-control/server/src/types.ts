export type TemplateId = "blank" | "image-editor";
export type AspectRatio = "9:16" | "3:4" | "1:1" | "16:9";
export type ProjectStage = "direction" | "storyboard" | "production" | "complete";
export type ShotStatus = "empty" | "queued" | "generating" | "saving" | "review" | "accepted" | "failed";
export type GenerationKind = "contact_sheet" | "contact_sheet_edit" | "final" | "image_edit" | "region_edit";
export type GenerationStatus = "queued" | "generating" | "saving" | "review" | "completed" | "failed" | "cancelled";
export type ReferenceSlot = "face" | "body" | "outfit" | "environment" | "identitySupport";
export type VideoShotStatus = "missing_prompt" | "ready" | "queued" | "uploading" | "running" | "downloading" | "review" | "accepted" | "failed";
export type VideoRequestStatus = "queued" | "waiting_remote" | "uploading" | "submitting" | "running" | "downloading" | "completed" | "failed" | "cancelled";
export type VideoProviderKind = "comfyui-workflow" | "generic-http";
export type VideoProviderSetupStatus = "queued" | "analyzing" | "ready" | "failed" | "cancelled";
export type VideoProviderMode = "image-to-video" | "text-to-video" | "first-last-frame";
export type ComfyUiWorkflowFormat = "ui" | "api";
export type ComfyUiBindingRole =
  | "image"
  | "prompt"
  | "negativePrompt"
  | "width"
  | "height"
  | "frameCount"
  | "frameRate"
  | "seed"
  | "filenamePrefix";

export interface Point {
  x: number;
  y: number;
}

export interface ContactSheetGrid {
  columns: number;
  rows: number;
}

export interface Viewport extends Point {
  zoom: number;
}

export interface ManualChecklist {
  face: boolean;
  outfit: boolean;
  contact: boolean;
  lighting: boolean;
  space: boolean;
  continuity: boolean;
}

export interface VideoManualChecklist {
  identity: boolean;
  outfit: boolean;
  motion: boolean;
  contact: boolean;
  stability: boolean;
  continuity: boolean;
}

export interface VideoPlan {
  prompt: string;
  negativePrompt: string;
  frameRate: number;
  frameCount: number;
  durationSeconds: number;
  sourceImageSha256: string;
  source: "codex" | "user";
  stale: boolean;
  updatedAt: string;
}

export interface VideoArtifact {
  path: string;
  mimeType: "video/mp4";
  providerId: string;
  requestId: string;
  createdAt: string;
  width: number;
  height: number;
  frameRate: number;
  durationSeconds: number;
  sourceImageSha256: string;
  promptSha256: string;
  stale: boolean;
  mediaUrl?: string;
}

export interface StoredAsset {
  slot: ReferenceSlot;
  fileName: string;
  path: string;
  mimeType: "image/png";
  createdAt: string;
  mediaUrl?: string;
}

export interface ShotRecord {
  id: string;
  index: number;
  storageKey: string;
  title: string;
  cast: string;
  scene: string;
  action: string;
  composition: string;
  instruction: string;
  status: ShotStatus;
  position: Point;
  imagePath?: string;
  imageUrl?: string;
  imageSha256?: string;
  imageStale: boolean;
  hasUndo: boolean;
  manualChecklist: ManualChecklist;
  videoStatus: VideoShotStatus;
  videoPlan?: VideoPlan;
  videoArtifact?: VideoArtifact;
  videoChecklist: VideoManualChecklist;
}

export interface CanvasNote {
  id: string;
  text: string;
  position: Point;
  color: "sand" | "sage" | "rose";
}

export interface CanvasState {
  viewport: Viewport;
  contactSheetPosition: Point;
  notes: CanvasNote[];
}

export interface GenerationRequest {
  id: string;
  projectId: string;
  kind: GenerationKind;
  shotIds: string[];
  instruction: string;
  inputRevision?: string;
  status: GenerationStatus;
  /** Opaque lease credential issued when a queued request is claimed. */
  claimToken?: string;
  claimedAt?: string;
  leaseExpiresAt?: string;
  attempt?: number;
  error?: string;
  maskPath?: string;
  annotatedPreviewPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VideoRequestSnapshot {
  prompt: string;
  negativePrompt: string;
  frameRate: number;
  frameCount: number;
  durationSeconds: number;
  width: number;
  height: number;
  sourceImageSha256: string;
}

export interface VideoRequest {
  id: string;
  projectId: string;
  shotId: string;
  providerId: string;
  snapshot: VideoRequestSnapshot;
  status: VideoRequestStatus;
  progress?: number;
  error?: string;
  remoteJobId?: string;
  remoteOutput?: string;
  providerExecutionFingerprint?: string;
  /** Opaque worker lease credential. Never expose it outside the local worker/store boundary. */
  claimToken?: string;
  claimedAt?: string;
  leaseExpiresAt?: string;
  attempt?: number;
  idempotencyKey?: string;
  submissionState?: "not-submitted" | "submitting" | "accepted" | "unknown" | "rejected";
  createdAt: string;
  updatedAt: string;
}

export interface VideoProviderDefaults {
  width: number;
  height: number;
  frameRate: number;
  frameCount: number;
  pollSeconds: number;
  timeoutMinutes: number;
}

export interface VideoProviderCapabilities {
  source?: "local" | "cloud";
  billing?: "local" | "possibly-paid";
  modes?: VideoProviderMode[];
  aspectRatios?: AspectRatio[];
  frameRates?: number[];
  frameCounts?: number[];
  durationsSeconds?: number[];
  supportsNegativePrompt?: boolean;
  supportsAudio?: boolean;
  maxConcurrency?: number;
}

export interface ComfyUiBinding {
  nodeId: string;
  inputName: string;
}

export interface ComfyUiProviderConfig {
  baseUrl: string;
  workflowFile: string;
  queuePolicy: "wait-until-empty";
  workflowFormat?: ComfyUiWorkflowFormat;
  bindings?: Partial<Record<ComfyUiBindingRole, ComfyUiBinding>>;
  outputNodeId?: string;
  /** SHA-256 of the sanitized workflow graph persisted beside this profile. */
  workflowSha256?: string;
  workflowRiskFlags?: string[];
  /** Must equal workflowSha256 when the user explicitly accepts reviewable network-capable nodes. */
  workflowRiskAcceptedSha256?: string;
}

export interface GenericHttpProviderConfig {
  mode: "sync" | "async";
  imageMode: "multipart" | "base64";
  submitUrl: string;
  submitMethod: "POST" | "PUT";
  bodyTemplate?: unknown;
  imageField?: string;
  jobIdPath?: string;
  resultUrlPath?: string;
  statusUrlTemplate?: string;
  statusMethod?: "GET" | "POST";
  statusBodyTemplate?: unknown;
  statusPath?: string;
  progressPath?: string;
  successValues?: string[];
  failureValues?: string[];
  cancelUrlTemplate?: string;
  auth?: { type: "none" | "bearer" | "header"; headerName?: string; scheme?: string };
  downloadAuth?: "none" | "provider";
  allowedDownloadOrigins?: string[];
  idempotencyHeader?: string;
}

export interface VideoProviderProfile {
  schemaVersion?: 1;
  id: string;
  name: string;
  description?: string;
  kind: VideoProviderKind;
  enabled: boolean;
  hasCredential?: boolean;
  /** Hash of only the fields that define where and how a credential may be sent. */
  credentialScopeFingerprint?: string;
  /** Non-secret revision rotated before every credential mutation. */
  credentialRevision?: string;
  /** `changing` fails closed if a secure-store mutation was interrupted. */
  credentialState?: "ready" | "changing";
  /** Response-only signal; it is not persisted in profile.json. */
  credentialReset?: boolean;
  capabilities?: VideoProviderCapabilities;
  defaults: VideoProviderDefaults;
  comfyui?: ComfyUiProviderConfig;
  http?: GenericHttpProviderConfig;
  createdAt: string;
  updatedAt: string;
}

export interface VideoProviderSetupRequest {
  schemaVersion: 1;
  id: string;
  status: VideoProviderSetupStatus;
  description: string;
  docsUrl?: string;
  baseUrl?: string;
  exampleRequest?: string;
  exampleResponse?: string;
  sampleRequest?: string;
  sampleResponse?: string;
  workflowFile?: string;
  workflowFileName?: string;
  workflowFormat?: ComfyUiWorkflowFormat;
  draft?: VideoProviderProfile;
  committedProviderId?: string;
  providerId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VideoProviderWorkflowNodeSummary {
  nodeId: string;
  classType: string;
  title?: string;
  inputNames: string[];
  jsonPath: string;
  riskFlags?: string[];
}

export interface VideoProviderSetupContext {
  request: VideoProviderSetupRequest;
  workflow?: {
    format: ComfyUiWorkflowFormat;
    localPath: string;
    nodeCount: number;
    nodes: VideoProviderWorkflowNodeSummary[];
    sha256: string;
    riskFlags: string[];
    requiresReview: boolean;
  };
  rules: {
    declarativeOnly: true;
    credentialsStoredSeparately: true;
    templateVariables: string[];
    bindingRoles: ComfyUiBindingRole[];
  };
}

export interface ProjectRecord {
  schemaVersion: 2;
  id: string;
  name: string;
  templateId: TemplateId;
  aspectRatio: AspectRatio;
  stage: ProjectStage;
  brief: string;
  createdAt: string;
  updatedAt: string;
  references: Partial<Record<ReferenceSlot, StoredAsset>>;
  referenceConstraints: Partial<Record<ReferenceSlot, string>>;
  shots: ShotRecord[];
  canvas: CanvasState;
  contactSheetPath?: string;
  contactSheetUrl?: string;
  contactSheetGrid?: ContactSheetGrid;
  contactSheetStale?: boolean;
  contactSheetApprovedAt?: string;
  generationRequests: GenerationRequest[];
  defaultVideoProviderId?: string;
  videoRequests: VideoRequest[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  templateId: TemplateId;
  aspectRatio: AspectRatio;
  stage: ProjectStage;
  updatedAt: string;
  shotCount: number;
  acceptedCount: number;
  previewPath?: string;
  previewUrl?: string;
}

export interface OpenAIFileInput {
  download_url: string;
  file_id: string;
  mime_type?: string;
  file_name?: string;
}

export interface GenerationContext {
  request: GenerationRequest;
  project: Pick<ProjectRecord, "id" | "name" | "templateId" | "aspectRatio" | "brief">;
  shots: ShotRecord[];
  referencePaths: Partial<Record<ReferenceSlot, string>>;
  referenceConstraints: Partial<Record<ReferenceSlot, string>>;
  templatePromptPath?: string;
  contactSheetPath?: string;
  contactSheetGrid: ContactSheetGrid;
  currentImagePath?: string;
  maskPath?: string;
  annotatedPreviewPath?: string;
}

export const emptyChecklist = (): ManualChecklist => ({
  face: false,
  outfit: false,
  contact: false,
  lighting: false,
  space: false,
  continuity: false,
});

export const emptyVideoChecklist = (): VideoManualChecklist => ({
  identity: false,
  outfit: false,
  motion: false,
  contact: false,
  stability: false,
  continuity: false,
});
