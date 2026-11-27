import { isSameOriginAdminRequest } from "@/lib/admin-ops-ai/request-origin";
import { auth } from "@/lib/auth";
import { hasAuthoringActor } from "@/lib/auth/authoring-actor";
import { authorizeAdminCoursePdf } from "@/lib/native/academic/course-pdf";
import { createAdminMaterialPdfHandler } from "@/lib/native/academic/course-pdf-response";
import { readNativeMaterialPdf } from "@/lib/native/material-pdf-bytes";

export const runtime = "nodejs";

const handle = createAdminMaterialPdfHandler({
  isSameOrigin: isSameOriginAdminRequest,
  async session(request) {
    const session = await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true, disableRefresh: true } });
    return session?.user?.id && session.session?.id ? {
      accountId: session.user.id, sessionId: session.session.id, expiresAt: new Date(session.session.expiresAt).getTime(),
    } : null;
  },
  hasAdmin: id => hasAuthoringActor(id, ["admin"]),
  authorize: authorizeAdminCoursePdf,
  read: readNativeMaterialPdf,
});

export const HEAD = handle;
export const GET = handle;
