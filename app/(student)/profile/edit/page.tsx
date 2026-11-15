import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { UserCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { pageTitle } from "@/lib/site";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { Reveal } from "@/components/ui/reveal";
import { getStudentSocialSettings } from "@/lib/gamification/social";
import { getStudentGamificationAccess } from "@/lib/gamification/access";
import { getAchievementBadges, getGamificationRewards } from "@/lib/gamification/queries";
import { ProfileSettings } from "@/components/gamification/profile-settings";
import { ProfileEditForm } from "./profile-edit-form";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("student");
  return { title: pageTitle(t("metadata.profileEditTitle")), description: t("metadata.profileEditDescription") };
}

/**
 * Server-rendered page allowing students to view and update their ITB academic profile.
 */
export default async function ProfileEditPage() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });

  if (!session?.user?.id) {
    redirect(`/sign-in?next=${encodeURIComponent("/profile/edit")}`);
  }

  const [dbUser] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, session.user.id))
    .limit(1);

  const access = await getStudentGamificationAccess();
  const customization = access
    ? await Promise.all([getStudentSocialSettings(session.user.id), getAchievementBadges(session.user.id), getGamificationRewards(session.user.id)])
    : null;

  const currentUser = {
    id: session.user.id,
    name: dbUser?.name ?? session.user.name ?? "",
    email: dbUser?.email ?? session.user.email ?? "",
    faculty: dbUser?.faculty ?? (session.user as any).faculty ?? null,
    major: dbUser?.major ?? (session.user as any).major ?? null,
    entryYear: dbUser?.entryYear ?? (session.user as any).entryYear ?? null,
  };

  return (
    <ApplicationPage>
      <PageHeader
        title={<TranslatedText namespace="student" messageKey="profile.editTitle" />}
        icon={UserCheck}
        backHref="/profile"
        backLabel={<TranslatedText namespace="student" messageKey="profile.pageTitle" />}
      />
      <Reveal className="mt-6">
        <div className="space-y-6">{customization && <ProfileSettings initial={customization[0]} badges={customization[1]} rewards={customization[2]} name={currentUser.name} image={dbUser?.image ?? null} />}<ProfileEditForm user={currentUser} /></div>
      </Reveal>
    </ApplicationPage>
  );
}
