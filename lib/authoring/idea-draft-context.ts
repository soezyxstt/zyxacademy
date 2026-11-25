import { readStoredSourcePack, resolveSourcePackImport } from "@/lib/bundle/source-staging";
import { sha256Text } from "@/lib/bundle/validator";
import type { IdeaDraftContext } from "./idea-draft-builder";
import type { IdeaDraftCreationPorts } from "./idea-draft-service";

export type IdeaDraftSourcePorts = { resolve: typeof resolveSourcePackImport; read: typeof readStoredSourcePack };
const sourcePorts: IdeaDraftSourcePorts = { resolve: resolveSourcePackImport, read: readStoredSourcePack };

/** Exact stored revision only. An unbound or legacy source uses the archive path. */
export async function loadIdeaDraftContext(input: Parameters<IdeaDraftCreationPorts["loadContext"]>[0], ports: IdeaDraftSourcePorts = sourcePorts): Promise<IdeaDraftContext> {
  const { run, principal, draftKey } = input;
  if (!run.chapterId || !run.sourcePackId || !run.sourcePackChecksum) throw new Error("AUTHORING_MCP_SOURCE_PACK_REQUIRED");
  const stored = await ports.resolve({ packId: run.sourcePackId, ...(run.sourcePackImportId ? { importId: run.sourcePackImportId } : {}), checksum: run.sourcePackChecksum });
  if (!stored) throw new Error("AUTHORING_MCP_SOURCE_PACK_NOT_FOUND");
  if (stored.bundleId !== run.sourcePackId || stored.checksum.toLowerCase() !== run.sourcePackChecksum.toLowerCase() || (run.sourcePackImportId && stored.id !== run.sourcePackImportId)) throw new Error("AUTHORING_MCP_SOURCE_PACK_IMPORT_MISMATCH");
  const report = stored.validationReport;
  if (stored.status !== "validated" || report?.valid !== true || report.quality?.valid !== true) throw new Error("IDEA_DRAFT_SOURCE_NOT_VALIDATED");
  if (report.packId !== stored.bundleId || typeof report.checksum !== "string" || report.checksum.toLowerCase() !== stored.checksum.toLowerCase()) throw new Error("AUTHORING_MCP_SOURCE_PACK_IMPORT_MISMATCH");
  if ((report.courseId ?? stored.courseId) !== run.courseId || report.chapterId !== run.chapterId) throw new Error("IDEA_DRAFT_SOURCE_NOT_IN_SCOPE");
  const sourcePack = await ports.read(stored.sourceUriOrKey);
  if (sourcePack.manifest.packId !== run.sourcePackId || sourcePack.archive.checksum.toLowerCase() !== run.sourcePackChecksum.toLowerCase()) throw new Error("AUTHORING_MCP_SOURCE_PACK_IMPORT_MISMATCH");
  return { bundleId: `mcp-idea-${sha256Text(`${run.runId}:${principal.actorId}:${draftKey}`).slice(0, 32)}`,
    courseId: run.courseId, chapterId: run.chapterId, creatorId: principal.actorId, createdAt: new Date(run.issuedAt).toISOString(), sourcePack };
}
