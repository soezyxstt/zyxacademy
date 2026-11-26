import { useRef } from "react";

import { materialPath } from "../../../packages/native-parity/student/courses/contract";
import { NativeRouteAccountContext } from "../auth/use-account-context";
import { StudentAlerts } from "../features/student/community/alerts";
import { LocalReminderSettings } from "../features/student/community/local-reminders";
import { VerifiedStudentEntry } from "../features/student/VerifiedStudentEntry";
import type { StudentRouteProps } from "./ProductRoute";
import { StudentChrome } from "./student-chrome";
import { studentCourseId } from "./student-navigation";

export function StudentProductRoute({ href, pattern, locale, theme, showChrome, context, devicePreferences,
  navigate, replace, visit, back }: StudentRouteProps) {
  const scroll = useRef(0);
  const entry = useRef(href.split(/[?#]/, 1)[0]);
  const readerCourseId = pattern === "/courses/[id]/material/[materialId]" ? studentCourseId(href) : undefined;

  return <StudentChrome href={href} pattern={pattern} locale={locale} theme={theme} enabled={showChrome} visit={visit} back={back}>
    <NativeRouteAccountContext context={context}>
      <StudentAlerts theme={theme}><VerifiedStudentEntry path={href} entryKey={entry.current} offlineLocale={locale} devicePreferences={devicePreferences}
        localReminderSettings={<LocalReminderSettings />} initialScrollY={scroll.current} onScrollY={value => { scroll.current = value; }}
        navigate={navigate} replace={replace} back={() => back(readerCourseId ? materialPath(readerCourseId) : "/dashboard")} /></StudentAlerts>
    </NativeRouteAccountContext>
  </StudentChrome>;
}
