import type { AuthUser } from "@/lib/auth-session";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getStudentSocialSettings } from "@/lib/gamification/social";
import { getStudentGamificationAccess } from "@/lib/gamification/access";
import { getAchievementBadges, getGamificationRewards } from "@/lib/gamification/queries";
import { ProfileSettings } from "@/components/gamification/profile-settings";
import { ProfileEditForm } from "./profile-edit-form";
import { ProfileCompleteness } from "./profile-completeness";

export async function getProfileEditorData(account: AuthUser) {
  const userPromise = db
    .select()
    .from(userTable)
    .where(eq(userTable.id, account.id))
    .limit(1);
  const [[dbUser], access] = await Promise.all([userPromise, getStudentGamificationAccess()]);
  const customization = access
    ? await Promise.all([getStudentSocialSettings(account.id), getAchievementBadges(account.id), getGamificationRewards(account.id)])
    : null;

  const currentUser = {
    id: account.id,
    name: dbUser?.name ?? account.name ?? "",
    email: dbUser?.email ?? account.email ?? "",
    faculty: dbUser?.faculty ?? account.faculty ?? null,
    major: dbUser?.major ?? account.major ?? null,
    entryYear: dbUser?.entryYear ?? account.entryYear ?? null,
  };

  return { currentUser, customization, image: dbUser?.image ?? null };
}

export function ProfileEditor({
  currentUser,
  customization,
  image,
  stayOnPage = false,
}: Awaited<ReturnType<typeof getProfileEditorData>> & { stayOnPage?: boolean }) {
  const academicForm = <ProfileEditForm user={currentUser} stayOnPage={stayOnPage} />;
  const completeness = <ProfileCompleteness profile={currentUser} />;
  if (!customization) {
    return (
      <div className="space-y-(--group-gap)">
        {completeness}
        {academicForm}
      </div>
    );
  }

  const [socialSettings, badges, rewards] = customization;
  return (
    <ProfileSettings
      initial={socialSettings}
      badges={badges}
      rewards={rewards}
      name={currentUser.name}
      image={image}
      academicForm={academicForm}
      completeness={completeness}
    />
  );
}
