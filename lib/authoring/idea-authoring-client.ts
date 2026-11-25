import { createRevisionAuthoringClient, type AuthoringRevisionIdentity, type AuthoringRevisionTransport } from "./revision-authoring-client";

export { AuthoringRevisionClientError as IdeaAuthoringClientError } from "./revision-authoring-client";
export type {
  AuthoringRevisionIdentity as IdeaAuthoringIdentity,
  AuthoringRevisionTarget as IdeaAuthoringTarget,
  AuthoringRevisionPatch as IdeaAuthoringPatch,
  AuthoringRevisionTransport as IdeaAuthoringTransport,
  AuthoringRevisionResponse as IdeaAuthoringResponse,
} from "./revision-authoring-client";

/** Exact-revision Idea editing shares the Product client without Product-only verification. */
export function createIdeaAuthoringClient(options: {
  transport: AuthoringRevisionTransport;
  bootstrapToken: string;
  identity: AuthoringRevisionIdentity;
}) {
  const { verificationInput: _productOnly, ...client } = createRevisionAuthoringClient({ ...options, kind: "idea" });
  return client;
}
