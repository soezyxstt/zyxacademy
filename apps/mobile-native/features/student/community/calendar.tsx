import { useRef, useState, type ComponentRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../../../components/Button";
import { nativeTypography } from "../../../typography";
import { NativeListRow, SharedPopover } from "../../shared-ui";
import { NavigationIcon } from "../../shared-ui/navigation-icons";
import type { CalendarEventItem } from "../../../../../lib/student/agenda-contract";
import { calendarFilters, describeAgendaEvent, formatAgendaDay, groupCalendarEvents, type CalendarFilter } from "../../../../../lib/student/agenda-presentation";
import studentEn from "../../../../../messages/en/student.json";
import studentId from "../../../../../messages/id/student.json";
import type { AgendaData } from "../../../../../packages/native-parity/student/community/contracts";
import { Action, Actions, Copy, Notice, Page, Remote, communityPath, dateLabel, isHttps, operationResult, post, useCommunity, useOperation, useRemote } from "./ui";

function useCalendarMessages() {
  const { session } = useCommunity();
  return session.locale === "en" ? studentEn : studentId;
}

export function CalendarScreen() {
  const { navigate, colors, theme, tr } = useCommunity();
  const messages = useCalendarMessages();
  const state = useRemote<AgendaData>(communityPath("calendar"));
  const [filter, setFilter] = useState<CalendarFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterAnchor = useRef<ComponentRef<typeof Pressable>>(null);
  return <Page title={messages.routeTitles.calendar} headerAction={
    <Button variant="outline" size="icon-lg" theme={theme} accessibilityRole="link"
      accessibilityLabel={messages.calendar.manageTutorialSlots} onPress={() => navigate("/dashboard/schedule")}
      renderIcon={(color, size) => <NavigationIcon name="schedule" color={color} size={size} />} />
  }>
    <View style={[agendaStyles.toolbar, { borderBottomColor: colors.border }]}>
      <Button ref={filterAnchor} testID="student.calendar.filter" size="lg" theme={theme} variant="ghost"
        style={agendaStyles.filter} accessibilityLabel={`${messages.calendar.eventCategory}: ${messages.calendar[calendarFilters[filter]]}`}
        accessibilityState={{ expanded: filterOpen }} onPress={() => setFilterOpen(true)} iconPosition="end" wrapLabel
        renderIcon={(color, size) => <NavigationIcon name="chevron" color={color} size={size} />}>
        {messages.calendar[calendarFilters[filter]]}
      </Button>
    </View>
    <SharedPopover anchorRef={filterAnchor} align="start" open={filterOpen} onDismiss={() => setFilterOpen(false)}
      title={messages.calendar.eventCategory} closeLabel={tr("Tutup", "Close")} theme={theme}>
      {(Object.keys(calendarFilters) as CalendarFilter[]).map(category => <Button key={category}
        testID={`student.calendar.filter.${category}`} accessibilityState={{ selected: category === filter }}
        variant={category === filter ? "secondary" : "ghost"} theme={theme} style={agendaStyles.option}
        size="lg" wrapLabel onPress={() => { setFilter(category); setFilterOpen(false); }}>
        {messages.calendar[calendarFilters[category]]}
      </Button>)}
    </SharedPopover>
    <Remote state={state}>{data => {
      const { active, past } = groupCalendarEvents(data.events, filter);
      const empty = data.events.length === 0;
      return <>
        <CalendarSync status={data.sync} path="/calendar" reload={state.reload} />
        {!active.length && !past.length ? <View style={agendaStyles.empty}>
          <NavigationIcon name="schedule" size={24} color={colors.mutedForeground} />
          <Text accessibilityRole="header" style={[agendaStyles.heading, agendaStyles.centered, { color: colors.foreground }]}>
            {empty ? messages.calendar.emptyTitle : messages.calendar.emptyFiltered}
          </Text>
          <Button testID="student.calendar.empty-action" variant="outline" theme={theme} wrapLabel style={agendaStyles.action}
            accessibilityRole={empty ? "link" : "button"} onPress={empty ? () => navigate("/courses") : () => setFilter("all")}>
            {empty ? messages.calendar.exploreCourses : messages.calendar.filterAll}
          </Button>
        </View> : <View style={agendaStyles.sections}>
          {active.length > 0 && <AgendaSection title={messages.calendar.upcoming} groups={active} />}
          {past.length > 0 && <AgendaSection title={messages.calendar.past} groups={past} />}
        </View>}
      </>;
    }}</Remote>
  </Page>;
}

function AgendaSection({ title, groups }: { title: string; groups: ReturnType<typeof groupCalendarEvents>["active"] }) {
  const { colors, session } = useCommunity();
  const { calendar } = useCalendarMessages();
  return <View style={agendaStyles.section}>
    <Text accessibilityRole="header" style={[agendaStyles.heading, { color: colors.foreground }]}>{title}</Text>
    {groups.map(({ day, events }) => <View key={day}>
      <View style={[agendaStyles.day, { borderBottomColor: colors.border }]}>
        <Text testID={`student.calendar.day.${day}`} accessibilityRole="header"
          style={[agendaStyles.dayText, { color: colors.mutedForeground }]}>
          {events.some(event => event.status === "today") && <Text style={{ color: colors.foreground }}>{calendar.today} · </Text>}
          {formatAgendaDay(events[0].dateValue, session.locale)}
        </Text>
      </View>
      <View role="list">
        {events.map((event, index) => <AgendaRow key={event.id} event={event} first={index === 0} />)}
      </View>
    </View>)}
  </View>;
}

function AgendaRow({ event, first }: { event: CalendarEventItem; first: boolean }) {
  const { colors, navigate, openExternal, session, theme } = useCommunity();
  const { calendar, schedule } = useCalendarMessages();
  const description = describeAgendaEvent(event, session.locale);
  const { timeLabel } = description;
  const time = timeLabel.key === "scheduledRange"
    ? calendar.scheduledRange.replace("{range}", timeLabel.values.range)
    : calendar[timeLabel.key].replace("{time}", timeLabel.values.time);
  const title = event.category !== "tutorial" ? event.title : event.tutorialTopic
    ? calendar.tutorialWithTopic.replace("{topic}", event.tutorialTopic)
    : calendar.tutorialWithTutor.replace("{name}", event.tutorName || schedule.tutorFallback);
  const meetUrl = event.meetUrl;
  return <View role="listitem" testID={`student.calendar.event.${event.id}`} style={[agendaStyles.row,
    !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
    <View style={agendaStyles.identity}>
      <NativeListRow layout="compact" title={title} subtitle={`${event.courseTitle} · ${calendar[event.categoryLabel]}`}
        titleRole="header" theme={theme} />
      <Text style={[agendaStyles.time, { color: event.status === "past" ? colors.mutedForeground : colors.foreground }]}>
        {time}{event.cancelled ? ` · ${calendar.cancelled}` : ""}
      </Text>
    </View>
    <View style={agendaStyles.rowActions}>
      <Button testID={`student.calendar.action.${event.id}`} variant={description.quietAction ? "ghost" : "outline"}
        accessibilityRole="link" theme={theme} wrapLabel style={agendaStyles.action} onPress={() => navigate(event.actionUrl)}>
        {calendar[description.actionLabel]}
      </Button>
      {meetUrl && isHttps(meetUrl) && openExternal && <Button variant="outline" theme={theme} accessibilityRole="link" wrapLabel style={agendaStyles.action}
        onPress={() => openExternal(meetUrl)}>Google Meet</Button>}
    </View>
  </View>;
}
export function CalendarSync({ status, path, reload }: { status: AgendaData["sync"]; path: string; reload(): void }) {
  const { request, nativeAuthScheme, openExternal, tr, session } = useCommunity();
  const action = useOperation();
  if (!status) return null;
  const connect = () => void action.run(async () => {
    const result = await post<{ url: string | null; nativeBrowser: boolean }>(request, "calendar-connect", { path, scheme: nativeAuthScheme });
    if (!result.nativeBrowser || !result.url?.startsWith("/api/auth/native/google-link/start?")) throw new Error("Calendar connection unavailable");
    openExternal?.(result.url);
  });
  return <>
    <Actions>
      {!status.connected || status.error === "reconnect" ?
        nativeAuthScheme && openExternal && <Action label={tr("Hubungkan Google Calendar", "Connect Google Calendar")} busy={action.pending} onPress={connect} />
        : <Action label={status.pending ? tr("Sinkronisasi berjalan", "Sync pending") : tr("Sinkronkan Google Calendar", "Sync Google Calendar")}
          busy={action.pending} disabled={status.pending} onPress={() => void action.run(async () => {
            operationResult(await post(request, "calendar-sync", {}));
            reload();
          })} />}
      <Action label={tr("Perbarui status sinkronisasi", "Refresh sync status")} onPress={reload} disabled={action.pending} />
    </Actions>
    {status.lastSyncedAt && <Copy kind="muted">{tr("Terakhir disinkronkan", "Last synced")} {dateLabel(status.lastSyncedAt, session.locale, true)}</Copy>}
    {status.error === "failed" && <Copy kind="error">{tr("Sinkronisasi belum berhasil.", "Sync failed.")}</Copy>}
    <Notice notice={action.notice} />
  </>;
}

const agendaStyles = StyleSheet.create({
  toolbar: { alignItems: "flex-start", paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  filter: { height: "auto", minHeight: 36, paddingVertical: 6, paddingHorizontal: 0, maxWidth: "100%" },
  option: { height: "auto", minHeight: 44, paddingVertical: 8 },
  empty: { alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 32 },
  sections: { gap: 28 },
  section: { gap: 16 },
  heading: { ...nativeTypography.headingBold, fontSize: 16, lineHeight: 24 },
  centered: { textAlign: "center" },
  day: { paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  dayText: { ...nativeTypography.bodySemibold, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 12 },
  identity: { flex: 1, minWidth: 0 },
  time: { ...nativeTypography.bodyMedium, fontSize: 12, lineHeight: 17, marginTop: -8 },
  rowActions: { maxWidth: "43%", alignItems: "flex-end", gap: 4 },
  action: { height: "auto", minHeight: 32, maxWidth: "100%", paddingVertical: 5, paddingHorizontal: 8 },
});
