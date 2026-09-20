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
import { ProfileEditForm } from "./profile-edit-form";

export const metadata: Metadata = {
  title: pageTitle("Edit Profil Akademis"),
  description: "Lengkapi identitas akademis ITB Anda untuk personalisasi rekomendasi materi dan kelas.",
};

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

  const currentUser = {
    id: session.user.id,
    name: dbUser?.name ?? session.user.name ?? "Siswa",
    email: dbUser?.email ?? session.user.email ?? "",
    faculty: dbUser?.faculty ?? (session.user as any).faculty ?? null,
    major: dbUser?.major ?? (session.user as any).major ?? null,
    entryYear: dbUser?.entryYear ?? (session.user as any).entryYear ?? null,
  };

  return (
    <ApplicationPage>
      <PageHeader
        title="Edit Profil Akademis"
        icon={UserCheck}
        backHref="/profile"
        backLabel="Profil Saya"
      />
      <Reveal className="mt-6">
        <ProfileEditForm user={currentUser} />
      </Reveal>
    </ApplicationPage>
  );
}
