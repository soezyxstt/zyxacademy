import { PawPrint } from "lucide-react";
import { redirect } from "next/navigation";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { StudentPetStudio } from "@/components/gamification/student-pet-studio";
import { requireStudentGamificationAccess } from "@/lib/gamification/access";
import { getGamificationRewards, getGamificationSummary } from "@/lib/gamification/queries";
import { getTranslations } from "@/lib/i18n/server";

export default async function PetPage() {
  const t = await getTranslations("student");
  let content;
  try {
    const { user } = await requireStudentGamificationAccess();
    const [items, account] = await Promise.all([getGamificationRewards(user.id), getGamificationSummary(user.id)]);
    content = <StudentPetStudio rewards={items.filter(item => ["zyra_avatar", "pet_suit", "pet_action"].includes(item.slot))} balance={account.lpBalance} />;
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") redirect("/sign-in?next=%2Fpet");
    content = <AdminEmptyState title={t(error instanceof Error && error.message === "Forbidden" ? "achievementPage.forbidden" : "achievementPage.unavailable")} />;
  }
  return <ApplicationPage><PageHeader title="Pet" icon={PawPrint} />{content}</ApplicationPage>;
}
