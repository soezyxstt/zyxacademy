import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { env } from "@/lib/env";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPkaAnnouncementsAction, getPkaSchedulesAction } from "./actions";
import { AnnouncementsTab } from "./_components/announcements-tab";
import { SchedulesTab } from "./_components/schedules-tab";

export const metadata: Metadata = {
  title: pageTitle("Manajemen Tutorial PKA"),
  description: "Kelola pengumuman dan jadwal sesi review live Tutorial PKA.",
};

export default async function TutorialPkaPage() {
  if (env.FEATURE_PKA !== "1") notFound();

  const [announcements, schedules] = await Promise.all([
    getPkaAnnouncementsAction(),
    getPkaSchedulesAction(),
  ]);

  return (
    <div className="space-y-6">
      <p className="text-body-sm text-muted-foreground">
        Pengumuman dan jadwal dikirim otomatis ke email dan push notification semua peserta Tutorial PKA.
      </p>

      <Tabs defaultValue="announcements" className="w-full">
        <TabsList className="grid h-10 w-full max-w-sm grid-cols-2">
          <TabsTrigger value="announcements" className="text-body-sm font-medium">
            Pengumuman
          </TabsTrigger>
          <TabsTrigger value="schedules" className="text-body-sm font-medium">
            Jadwal Live
          </TabsTrigger>
        </TabsList>

        <TabsContent value="announcements" className="mt-6 focus-visible:outline-none focus-visible:ring-0">
          <AnnouncementsTab history={announcements} />
        </TabsContent>

        <TabsContent value="schedules" className="mt-6 focus-visible:outline-none focus-visible:ring-0">
          <SchedulesTab schedules={schedules} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
