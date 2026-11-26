import type { NativeSessionState } from "../../auth/session-controller";
import type { NativeSessionScope, NativeSessionTransport } from "../../network/transport";

type FormSession = { state: NativeSessionState; transport: NativeSessionTransport | null; revalidating: boolean };
type DraftOwner = NativeSessionScope | "anonymous" | null;

function sameIdentity(scope: NativeSessionScope, identity: Pick<NativeSessionScope, "accountId" | "sessionId">) {
  return scope.sessionId === identity.sessionId && scope.accountId === identity.accountId;
}

export function formDraftOwner({ state, transport }: FormSession, previous: DraftOwner): DraftOwner {
  if (state.status === "signed-out") return "anonymous";
  if (state.status === "signed-in") {
    const scope = transport?.scope;
    if (!scope || !sameIdentity(scope, state)) {
      return previous && previous !== "anonymous" && sameIdentity(previous, state) ? previous : null;
    }
    return previous && previous !== "anonymous" && previous.origin === scope.origin && sameIdentity(previous, scope) ? previous : scope;
  }
  if (state.status === "unavailable") {
    const identity = state.offlineIdentity;
    return !identity || (previous && previous !== "anonymous" && sameIdentity(previous, identity)) ? previous : null;
  }
  return null;
}

export function formWriteAccess({ state, transport, revalidating }: FormSession, owner: DraftOwner) {
  if (!owner || revalidating) return null;
  if (owner === "anonymous") return state.status === "signed-out" ? owner : null;
  return state.status === "signed-in" && sameIdentity(owner, state) && transport?.scope.origin === owner.origin
    && sameIdentity(owner, transport.scope) && transport.isCurrent() ? transport : null;
}

export async function recoverFormWriteSession(
  session: { getSnapshot(): FormSession; refresh(): Promise<void> },
  owner: NativeSessionScope,
  signal: AbortSignal,
): Promise<{ status: "session-pending" | "session-retry" }> {
  const currentDraft = () => !signal.aborted && formDraftOwner(session.getSnapshot(), owner) === owner;
  if (!currentDraft()) return { status: "session-pending" };
  await session.refresh();
  if (!currentDraft() || !formWriteAccess(session.getSnapshot(), owner)) return { status: "session-pending" };
  return { status: "session-retry" };
}
