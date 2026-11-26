import { useRef } from "react";

import { NativeRouteAccountContext } from "../auth/use-account-context";
import { LocalReminderSettings } from "../features/student/community/local-reminders";
import { VerifiedStudentEntry } from "../features/student/VerifiedStudentEntry";
import type { StudentRouteProps } from "./ProductRoute";
import { StudentChrome } from "./student-chrome";

export function StudentProductRoute({ href, pattern, locale, theme, showChrome, context, devicePreferences,
  navigate, replace, visit, back }: StudentRouteProps) {
  const scroll = useRef(0);
  const entry = useRef(href.split(/[?#]/, 1)[0]);

  return <StudentChrome href={href} pattern={pattern} locale={locale} theme={theme} enabled={showChrome} visit={visit} back={back}>
    <NativeRouteAccountContext context={context}>
      <VerifiedStudentEntry path={href} entryKey={entry.current} offlineLocale={locale} devicePreferences={devicePreferences}
        localReminderSettings={<LocalReminderSettings />} initialScrollY={scroll.current} onScrollY={value => { scroll.current = value; }}
        navigate={navigate} replace={replace} back={() => back("/dashboard")} />
    </NativeRouteAccountContext>
  </StudentChrome>;
}
