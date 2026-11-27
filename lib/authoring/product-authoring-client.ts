import { createRevisionAuthoringClient, type AuthoringRevisionIdentity, type AuthoringRevisionTransport } from "./revision-authoring-client";

export { AuthoringRevisionClientError as ProductAuthoringClientError } from "./revision-authoring-client";
export type {
  AuthoringRevisionIdentity as ProductAuthoringIdentity,
  AuthoringRevisionTarget as ProductAuthoringTarget,
  AuthoringRevisionPatch as ProductAuthoringPatch,
  AuthoringRevisionPatchOptions as ProductAuthoringPatchOptions,
  AuthoringRevisionTransport as ProductAuthoringTransport,
  AuthoringRevisionResponse as ProductAuthoringResponse,
} from "./revision-authoring-client";

/** Keeps the original Product helper API and error codes. */
export function createProductAuthoringClient(options: {
  transport: AuthoringRevisionTransport;
  bootstrapToken: string;
  identity: AuthoringRevisionIdentity;
}) {
  return createRevisionAuthoringClient({ ...options, kind: "product" });
}
