"use client";

import { useState } from "react";
import { StudentApplicationShell } from "@/components/student-application-shell";
import { StudentExperienceProvider, useStudentExperience } from "@/components/student-experience-provider";
import { OfflineReadingLibrary } from "./offline-reading-library";

export function OfflineStudentShell({ showLive }: { showLive: boolean }) {
  const experience = useStudentExperience();
  const [offlineCourses, setOfflineCourses] = useState<{ id: string; title: string }[]>();

  // The service worker can serve this page at the URL of a failed navigation.
  return (
    <StudentExperienceProvider value={{ ...experience, pathname: "/offline", offlineCourses }}>
      <StudentApplicationShell showLive={showLive} personalizeTypographyAndSpacing>
        <OfflineReadingLibrary onOfflineCoursesChange={setOfflineCourses} />
      </StudentApplicationShell>
    </StudentExperienceProvider>
  );
}
