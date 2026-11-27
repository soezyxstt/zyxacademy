import { createHash } from "node:crypto";
import { z } from "zod";

export const contractResponseOptionsSchema = z.object({
  responseMode: z.enum(["full", "compact"]).optional(),
  productProfile: z.enum(["v4", "v5", "all"]).optional(),
  knownViewChecksum: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
export type ContractResponseOptions = z.infer<typeof contractResponseOptionsSchema>;
type ContractViewInput<T> = { stage: string; rules: readonly string[]; outputs: T };
type FullContractView<T> = Pick<ContractViewInput<T>, "rules" | "outputs">;
type CompactContractView = {
  responseMode: "compact"; stage: string; productProfile: "v4" | "v5" | "all" | null;
  viewChecksum: string; bootstrapRequired: true;
} & ({ contentStatus: "included"; rules: readonly string[]; outputs: Record<string, unknown> }
  | { contentStatus: "unchanged"; rules?: undefined; outputs?: undefined });
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const v5Common = new Set(["revisions", "discovery", "initialDraft", "localPreview", "compatibleReadVersions", "solutionCollection", "scopeBoundary", "assessmentWorkflowBoundary", "forbiddenAssessmentEntityTypes", "ideaPublicationRequired", "publicationPermitted", "publicationScope"]);

/** A cached document never replaces fresh bootstrap/run or environment identity. */
export function compactContractView<T>(input: ContractViewInput<T>, options: ContractResponseOptions & { responseMode: "compact" }): CompactContractView;
export function compactContractView<T>(input: ContractViewInput<T>, options: ContractResponseOptions & { responseMode?: "full" }): FullContractView<T>;
export function compactContractView<T>(input: ContractViewInput<T>, options: ContractResponseOptions): FullContractView<T> | CompactContractView;
export function compactContractView<T>(input: ContractViewInput<T>, options: ContractResponseOptions): FullContractView<T> | CompactContractView {
  if (options.responseMode !== "compact") {
    if (options.productProfile || options.knownViewChecksum) throw new Error("AUTHORING_MCP_CONTRACT_PROJECTION_REQUIRES_COMPACT");
    return { rules: input.rules, outputs: input.outputs };
  }
  if (options.productProfile && input.stage !== "product") throw new Error("AUTHORING_MCP_CONTRACT_PROFILE_STAGE_MISMATCH");
  const all = record(input.outputs);
  const selected = input.stage === "product" ? { productBundle: all.productBundle }
    : input.stage === "idea" ? { ideaBundle: all.ideaBundle } : all;
  const outputs = { ...selected } as Record<string, unknown>;
  if (outputs.productBundle) {
    const { pilot: _pilot, ...product } = record(outputs.productBundle);
    const verification = record(product.verification);
    const execution = record(record(verification.pdf).execution ?? verification.execution);
    if (execution.mode !== "local_operator" || execution.available !== true) {
      const { localOperator: _local, ...activeVerification } = verification;
      product.verification = activeVerification;
    }
    if (options.productProfile === "v5") {
      const solution = record(product.solutionCollection);
      const schemaDocuments = [
        ...(Array.isArray(solution.schemaDocuments) ? solution.schemaDocuments : []),
        ...(Array.isArray(product.schemaDocuments) ? product.schemaDocuments.filter(document => record(document).name === "productDraftInput") : []),
      ];
      outputs.productBundle = { ...Object.fromEntries(Object.entries(product).filter(([key]) => v5Common.has(key))),
        schemaVersion: "product-bundle.v5", writeEntityTypes: ["solution_collection"], schemaDocuments };
    } else {
      if (options.productProfile === "v4") {
        delete product.solutionCollection;
        product.writeEntityTypes = Array.isArray(product.writeEntityTypes) ? product.writeEntityTypes.filter(value => value !== "solution_collection") : product.writeEntityTypes;
      }
      outputs.productBundle = product;
    }
  }
  const document = { stage: input.stage, productProfile: input.stage === "product" ? options.productProfile ?? "all" : null, rules: input.rules, outputs };
  const viewChecksum = createHash("sha256").update(JSON.stringify(document)).digest("hex");
  const unchanged = options.knownViewChecksum === viewChecksum;
  const common = { responseMode: "compact" as const, stage: input.stage, productProfile: document.productProfile, viewChecksum, bootstrapRequired: true as const };
  return unchanged ? { ...common, contentStatus: "unchanged" } : { ...common, contentStatus: "included", rules: input.rules, outputs };
}
