import { canUseTour, isTourRole, parseTourMutation, type TourWriteAction, type TourRole, type TourState, type TourMutationResult } from "./tour-state";

type TourApiDependencies = {
  getSession: () => Promise<{ user: { id: string; role?: string | null } } | null>;
  getRoles: (userId: string) => Promise<readonly string[]>;
  get: (userId: string, role: TourRole) => Promise<TourState | null>;
  mutate: (userId: string, role: TourRole, action: TourWriteAction) => Promise<TourMutationResult>;
  selectCourse: (userId: string, role: TourRole, hint: string | null) => Promise<string | null>;
};

const headers = { "Cache-Control": "private, no-store" };
const failure = (status: number, error: string) => Response.json({ error }, { status, headers });

export function createTourApi(dependencies: TourApiDependencies) {
  async function actor(request: Request, role: TourRole): Promise<string | Response> {
    const session = await dependencies.getSession();
    if (!session?.user.id) return failure(401, "Sign in to continue");
    // This explicit account identity also prevents simple cross-site form writes.
    if (request.headers.get("x-user-id") !== session.user.id) return failure(409, "Account changed");
    const roles = await dependencies.getRoles(session.user.id);
    if (!canUseTour(role, roles, session.user.role)) return failure(403, "Tour is not available for this role");
    return session.user.id;
  }

  return {
    async GET(request: Request): Promise<Response> {
      try {
        const role = new URL(request.url).searchParams.get("role");
        if (!isTourRole(role)) return failure(400, "Choose a valid role");
        const userId = await actor(request, role);
        if (userId instanceof Response) return userId;
        return Response.json({ state: await dependencies.get(userId, role) }, { headers });
      } catch {
        return failure(500, "Unable to load tour progress");
      }
    },
    async PUT(request: Request): Promise<Response> {
      try {
        if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
          return failure(415, "Use JSON for tour progress");
        }
        let body: unknown;
        try { body = await request.json(); } catch { return failure(400, "Invalid tour progress"); }
        const input = parseTourMutation(body);
        if (!input) return failure(400, "Invalid tour progress");
        const userId = await actor(request, input.role);
        if (userId instanceof Response) return userId;
        let action = input;
        if (input.action === "start" || input.action === "restart") {
          const current = await dependencies.get(userId, input.role);
          // Resume and stale retries keep their saved plan without a catalog lookup.
          if ((input.action === "start" && current) || input.generation !== (current?.generation ?? 0)) {
            return Response.json({ state: current, applied: false }, { headers });
          }
          action = { ...input, courseId: await dependencies.selectCourse(userId, input.role, input.courseId ?? null) };
        }
        return Response.json(await dependencies.mutate(userId, input.role, action), { headers });
      } catch {
        return failure(500, "Unable to save tour progress");
      }
    },
  };
}
