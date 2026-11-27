import { auth } from "@/lib/auth";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { handleVideoManagement } from "@/lib/native/academic/video-management-handler";
import { lookupManagedYouTubeVideo, prepareVideoUpload, readVideoManagement, writeVideoManagement } from "@/lib/native/academic/video-management";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ role: string; courseId: string }> };
const services = {
  async session(request: Request) {
    const active = await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true, disableRefresh: true } });
    return active?.user.id && active.session.id ? active : null;
  },
  read: readVideoManagement,
  write: writeVideoManagement,
  prepare: prepareVideoUpload,
  metadata: lookupManagedYouTubeVideo,
};

function gateway(request: Request, context: Context) {
  return context.params.then(input => handleVideoManagement(request, input, new URL(resolveAuthBaseUrl()).origin, services));
}

export { gateway as GET, gateway as POST };
