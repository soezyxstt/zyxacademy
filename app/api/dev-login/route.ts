import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Dev-only one-tap login, for testing on real phones against a local server
 * where Google OAuth is unavailable (no client secret locally).
 *
 *   GET /api/dev-login?as=student   (default)
 *   GET /api/dev-login?as=teacher
 *   GET /api/dev-login?as=admin
 *
 * Signs in the matching seeded dev user (db/seed.ts, password zyxdev123),
 * forwards better-auth's session cookie, and redirects to the app.
 * Hard-gated: responds 404 in production builds.
 */
const DEV_USERS: Record<string, { email: string; redirect: string }> = {
  student: { email: "student@zyx.edu", redirect: "/dashboard" },
  teacher: { email: "teacher@zyx.edu", redirect: "/tutor" },
  admin: { email: "admin@zyx.edu", redirect: "/admin" },
};

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const as = request.nextUrl.searchParams.get("as") ?? "student";
  const target = DEV_USERS[as];
  if (!target) {
    return NextResponse.json(
      { error: `Unknown role '${as}'; use student, teacher, or admin.` },
      { status: 400 }
    );
  }

  const signInResponse = await auth.api.signInEmail({
    body: { email: target.email, password: "zyxdev123" },
    asResponse: true,
  });

  if (!signInResponse.ok) {
    return NextResponse.json(
      {
        error:
          "Dev sign-in failed. Did you run `bun run db:migrate` and `bun run db:seed`?",
        status: signInResponse.status,
      },
      { status: 500 }
    );
  }

  // Relative Location on purpose: with `next dev -H 0.0.0.0`, request.url
  // reports the bind address (0.0.0.0), which phones cannot follow. Browsers
  // resolve a relative Location against the origin they actually used.
  const redirect = new NextResponse(null, {
    status: 302,
    headers: { Location: target.redirect },
  });
  // Forward every Set-Cookie from better-auth (session token, etc.)
  signInResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      redirect.headers.append("set-cookie", value);
    }
  });
  return redirect;
}
