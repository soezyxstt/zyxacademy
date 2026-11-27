import { randomBytes } from "node:crypto";
import { assertFixtureRunner } from "./scope";
import { matchesStaffContext, type StaffRole } from "./staff-role";
import type { seedBrowserSession } from "./seed";

type Identity = Awaited<ReturnType<typeof seedBrowserSession>>;
type SessionReader = (headers: Headers) => Promise<{ user: { id: string }; session: { id: string } } | null>;

export function createSavedAccountsJourney(env = process.env) {
  assertFixtureRunner(env);
  const roles = ["tutor", "admin"] as const;
  const claims = roles.map(() => randomBytes(32).toString("hex"));
  const identities = new Map<StaffRole, Identity>();
  const contexts = new Set<StaffRole>();
  const reads: Record<StaffRole, number> = { tutor: 0, admin: 0 };
  let index = 0;

  function next() {
    const role = roles[index];
    return role ? { role, claim: claims[index] } : undefined;
  }

  function recordContext(payload: unknown) {
    for (const [role, identity] of identities) {
      if (matchesStaffContext(role, payload, identity)) contexts.add(role);
    }
  }

  return {
    claims, next,
    seeded(role: StaffRole, identity: Identity) { identities.set(role, identity); },
    exchanged(accountId: string | undefined) {
      const pending = next();
      const identity = pending && identities.get(pending.role);
      if (!identity || identity.accountId !== accountId) return false;
      index++;
      return true;
    },
    recordContext,
    recordRead(role: StaffRole, viewer: { user: { id: string }; session: { id: string } } | null) {
      const identity = identities.get(role);
      if (viewer && identity && viewer.user.id === identity.accountId && viewer.session.id === identity.sessionId) reads[role]++;
    },
    progress() {
      if (reads.tutor >= 2) return "saved Tutor account read again";
      if (reads.admin) return "additional Admin authorized read";
      if (contexts.has("admin")) return "additional Admin context";
      if (reads.tutor) return "initial Tutor authorized read";
      if (contexts.has("tutor")) return "initial Tutor context";
      return undefined;
    },
    async verified(readSession: SessionReader) {
      const tutor = identities.get("tutor");
      const admin = identities.get("admin");
      if (!tutor || !admin || tutor.accountId === admin.accountId || tutor.sessionId === admin.sessionId ||
        contexts.size !== 2 || reads.tutor < 2 || reads.admin < 1) return false;
      const headers = (identity: Identity) => new Headers({ Cookie: identity.cookie.split(";", 1)[0] });
      const [retained, revoked] = await Promise.all([readSession(headers(tutor)), readSession(headers(admin))]);
      return retained?.user.id === tutor.accountId && retained.session.id === tutor.sessionId && !revoked;
    },
  };
}
