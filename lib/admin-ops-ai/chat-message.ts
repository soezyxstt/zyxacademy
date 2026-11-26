import type {
  OpsAiWorkStep,
  OpsAiCitation,
  OpsAiActionProposalV2,
  OpsAiErrorData,
} from "./contracts";
import type { OpsFollowup } from "./followups";

export interface OpsAiMessageV2 {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
  workSteps?: OpsAiWorkStep[];
  citations?: OpsAiCitation[];
  proposals?: OpsAiActionProposalV2[];
  followups?: OpsFollowup[];
  error?: OpsAiErrorData;
}
