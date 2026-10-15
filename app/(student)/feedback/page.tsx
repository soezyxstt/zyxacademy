import type { Metadata } from "next";
import { headers } from "next/headers";
import { MessageSquareHeart } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata, pageTitle } from "@/lib/site";
import { auth } from "@/lib/auth";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = createMetadata({
  title: "Masukan Mahasiswa",
  description: "Sampaikan masukan, kendala materi, atau saran fitur untuk pembelajaran di Zyx Academy.",
  path: "/feedback",
});


export default async function FeedbackPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userEmail = session?.user?.email;

  return (
    <ApplicationPage>
      <PageHeader
        title="Masukan Mahasiswa"
        icon={MessageSquareHeart}
      />

      <Reveal className="mt-4">
        <div className="pt-2">
          <FeedbackForm initialEmail={userEmail} />
        </div>
      </Reveal>
    </ApplicationPage>
  );
}
