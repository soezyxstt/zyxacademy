export type OpsAiRole = "user" | "assistant" | "system";

export interface OpsAiMessage {
  id: string;
  role: OpsAiRole;
  content: string;
  createdAt: number;
  sources?: OpsAiDocumentSource[];
  proposal?: OpsAiActionProposal;
  toolResult?: {
    toolName: string;
    summary: string;
    data?: unknown;
  };
}

export interface OpsAiDocumentSource {
  title: string;
  filePath: string;
  section?: string;
  snippet: string;
}

export type ActionProposalType =
  | "create_token"
  | "toggle_feature_flag"
  | "navigate_page"
  | "trigger_job";

export interface OpsAiActionProposal {
  id: string;
  type: ActionProposalType;
  title: string;
  description: string;
  params: Record<string, unknown>;
  status: "pending" | "executed" | "cancelled" | "failed";
  result?: Record<string, unknown>;
  error?: string;
}

export interface OpsAiContextPayload {
  currentPath: string;
  queryParams?: Record<string, string>;
  activeEntity?: {
    type?: string;
    id?: string;
    title?: string;
  };
}

export interface OpsAiChatRequest {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  context?: OpsAiContextPayload;
}

// ============================================================================
// Ops AI v2 Contract and Type Exports
// ============================================================================

export type {
  OpsAiProvenanceSource,
  OpsAiCitationAvailability,
  OpsAiCitation,
  OpsAiStepStatus,
  OpsAiStepType,
  OpsAiWorkStep,
  OpsAiActionProposalType as OpsAiActionProposalTypeV2,
  OpsAiProposalStatus,
  OpsAiPreconditionSnapshot,
  OpsAiProposalPreview,
  OpsAiActionProposalV2,
  OpsAiErrorCode,
  OpsAiErrorData,
  OpsAiMessageMetadata,
  OpsAiNotificationData,
  OpsAiDataTypes,
  OpsAiUITools,
  OpsAiUIMessage,
  OpsAiToolClass,
  OpsAiToolSecurityClassification,
  OpsAiThreatCategory,
  OpsAiThreatDefense,
  OpsAiCancellationReason,
  OpsAiUserSearchProjection,
} from "./contracts";
