import "server-only";
import { getAuthSession } from "@/lib/auth-session";
import { ensureLegacyIdentity } from "@/lib/auth/legacy-identity";
import { getDiscussionActor } from "./access";

export async function getSessionDiscussionActor() {
 const userId = (await getAuthSession())?.user?.id;
 if (!userId) throw new Error("DISCUSSION_UNAVAILABLE");
 await ensureLegacyIdentity(userId);
 return getDiscussionActor(userId);
}
