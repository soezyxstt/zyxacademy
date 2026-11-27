import { useRef, useState, type ComponentRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { nativeColors, nativeLinkInks, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import { filterGroups, filterParticipants, type TutorParticipant, type TutorParticipants as ParticipantsData } from "../../../../../packages/native-parity/academic/tutor/model";
import { Button } from "../../../components/Button";
import { nativeTypography } from "../../../typography";
import { SharedPopover, SharedUiSearch } from "../../shared-ui";
import { NavigationIcon } from "../../shared-ui/navigation-icons";
import type { AcademicScreenProps } from "../contracts";
import { Choices, Empty, Heading, Label, Row, TutorDetail, TutorPage, type TutorTheme } from "./ui";

const enrollmentFilters = [
  ["all", "Semua tipe"], ["direct", "Langsung"], ["group", "Kelompok"], ["both", "Langsung dan kelompok"],
] as const;
const accessNames = { direct: "Langsung", group: "Kelompok", both: "Langsung dan kelompok" };
const rosterTitle = "Peserta dan kelompok";
const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

function participantDate(value: string | null, fallback: string) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.valueOf()) ? dateFormat.format(date) : fallback;
}

function ParticipantRow({ theme, participant, onPress }: { theme: TutorTheme; participant: TutorParticipant; onPress(): void }) {
  const colors = nativeColors[theme];
  const [focused, setFocused] = useState(false);
  const initial = Array.from(participant.name.trim())[0]?.toLocaleUpperCase("id") ?? "?";
  const access = accessNames[participant.enrollmentType];
  const accent = participant.enrollmentType === "direct" ? nativeLinkInks.success : colors.primary;
  const badgeTone = participant.enrollmentType === "group" ? { backgroundColor: colors.muted, borderColor: colors.muted }
    : { backgroundColor: `${accent}14`, borderColor: `${accent}55` };
  const groups = participant.groups.map((group) => [group.id, `${group.name}${group.role === "leader" ? " (Ketua)" : ""}`] as const);
  const enrolled = participantDate(participant.enrolledAt, "Belum tercatat");
  const expiry = participantDate(participant.expiresAt, "Aktif semester ini");
  const muted = { color: colors.mutedForeground };
  return <Pressable accessibilityRole="button" accessibilityHint="Buka rincian peserta"
    accessibilityLabel={[participant.name, participant.email, access, ...groups.map(([, label]) => label),
      `Terdaftar sejak ${enrolled}`, `Masa berlaku ${expiry}`].filter(Boolean).join(", ")}
    testID={`tutor-participant-${participant.userId}`} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.row, { borderColor: `${colors.border}80` }, pressed && { backgroundColor: `${colors.muted}50` },
      focused && { outlineColor: colors.accent, outlineWidth: 2, outlineOffset: -2 }]}>
    <View style={styles.identity}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.initial, { backgroundColor: colors.muted }]}>
        <Text style={[styles.small, nativeTypography.bodySemibold, muted]}>{initial}</Text>
      </View>
      <View style={styles.identityBody}>
        <View style={styles.identityHeading}>
          <Text style={[styles.name, { color: colors.foreground }]}>{participant.name}</Text>
          <Text style={[styles.badge, badgeTone, { color: colors.foreground }]}>{access}</Text>
        </View>
        <Text style={[styles.small, muted]}>{participant.email}</Text>
      </View>
    </View>
    {groups.length ? <View style={styles.groups}>
      {groups.map(([id, label]) => <Text key={id} style={[styles.groupTag, { backgroundColor: colors.muted, color: colors.foreground }]}>{label}</Text>)}
    </View> : null}
    <View style={styles.dates}>
      <View style={styles.date}>
        <Text style={[styles.small, nativeTypography.bodySemibold, muted]}>Terdaftar sejak</Text>
        <Text style={[styles.small, muted]}>{enrolled}</Text>
      </View>
      <View style={styles.date}>
        <Text style={[styles.small, nativeTypography.bodySemibold, muted]}>Masa berlaku</Text>
        <Text style={[styles.small, muted]}>{expiry}</Text>
      </View>
    </View>
  </Pressable>;
}

function ParticipantsEmpty({ theme, filtered }: { theme: TutorTheme; filtered: boolean }) {
  const colors = nativeColors[theme];
  return <View style={styles.empty} accessibilityLiveRegion="polite">
    <NavigationIcon name="people" color={colors.mutedForeground} size={16} />
    <View style={styles.emptyBody}>
      <Label theme={theme} tone="strong">Peserta tidak ditemukan</Label>
      <Text style={[styles.small, { color: colors.mutedForeground }]}>
        {filtered ? "Ubah kata kunci atau filter akses." : "Belum ada peserta aktif untuk kelas ini."}
      </Text>
    </View>
  </View>;
}

export function TutorParticipants({ theme, back, data, query }: Pick<AcademicScreenProps, "theme" | "back" | "query"> & { data: ParticipantsData }) {
  const colors = nativeColors[theme];
  const [tab, setTab] = useState<"people" | "groups">(query.tab === "groups" ? "groups" : "people");
  const [access, setAccess] = useState<(typeof enrollmentFilters)[number][0]>("all");
  const [accessOpen, setAccessOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>();
  const accessControl = useRef<ComponentRef<typeof Button>>(null);
  const participants = filterParticipants(data.participants, search, access);
  const groups = filterGroups(data.groups, search);
  const active = data.participants.find(({ userId }) => userId === activeId);
  const searching = searchOpen || Boolean(search);
  const filterLabel = access === "all" ? "Semua tipe" : accessNames[access];
  const courseTitle = data.course.title;
  const headingLabel = courseTitle ? `${rosterTitle}, ${courseTitle}` : rosterTitle;
  const courseContext = courseTitle ? <Text testID="tutor-roster-course" accessible={false}
    style={[styles.small, { color: colors.mutedForeground }]}>{courseTitle}</Text> : null;

  return <>
    <TutorPage theme={theme} title={rosterTitle} contentStyle={styles.page} header={<View style={styles.header}>
      <View style={styles.headerControls}>
        <Button theme={theme} variant="outline" size="icon-lg" accessibilityLabel="Kembali" testID="tutor-back" style={styles.back}
          onPress={back} renderIcon={(color, size) => <NavigationIcon name="back" color={color} size={size} />} />
        <View accessible accessibilityRole="header" accessibilityLabel={headingLabel}
          style={[styles.heading, searching && styles.visuallyHidden]}>
          <Text style={[styles.title, { color: colors.foreground }]}>{rosterTitle}</Text>
          {searching ? null : courseContext}
        </View>
        <View style={searching ? styles.searching : undefined}>
          <SharedUiSearch theme={theme} label="Cari peserta atau kelompok" clearLabel="Hapus pencarian" value={search}
            onValueChange={setSearch} testID="tutor-roster-search"
            expansion={{ expanded: searchOpen, onExpandedChange: setSearchOpen, closeLabel: "Tutup pencarian" }} />
        </View>
      </View>
      {searching && courseContext ? <View style={styles.searchContext}>{courseContext}</View> : null}
    </View>}>
      <View style={styles.tabs}>
        <Choices theme={theme} label={rosterTitle} value={tab} change={setTab} tabBar
          options={[["people", `Peserta (${data.participants.length})`], ["groups", `Kelompok belajar (${data.groups.length})`]]} />
      </View>
      {tab === "people" ? <>
        <Button ref={accessControl} theme={theme} variant="ghost" accessibilityLabel={`Filter jenis akses, ${filterLabel}`}
          accessibilityState={{ expanded: accessOpen }} onPress={() => setAccessOpen(true)} testID="tutor-roster-access"
          renderIcon={(color, size) => <NavigationIcon name="chevron" color={color} size={size} />}
          iconPosition="end" style={styles.filter}>{filterLabel}</Button>
        <View style={[styles.records, { borderColor: `${colors.border}80` }]}>
          {participants.length ? participants.map((participant) => <ParticipantRow key={participant.userId}
            theme={theme} participant={participant} onPress={() => setActiveId(participant.userId)} />)
            : <ParticipantsEmpty theme={theme} filtered={data.participants.length > 0} />}
        </View>
      </> : groups.length ? <View>{groups.map((group) => (
        <Row key={group.id} theme={theme} title={group.name} subtitle={group.packageName} meta={`${group.membersCount} anggota`}>
          <Label theme={theme} tone="muted">{group.usedQuotaSessions}/{group.totalQuotaSessions} sesi digunakan</Label>
          {group.members.map((member) => <Label key={member.userId} theme={theme}>
            {member.name}{member.role === "leader" ? " (Ketua)" : ""}
          </Label>)}
        </Row>
      ))}</View> : <Empty theme={theme} title={data.groups.length ? "Kelompok tidak ditemukan" : "Belum ada kelompok aktif"} />}
    </TutorPage>
    <SharedPopover open={accessOpen} anchorRef={accessControl} theme={theme} title="Jenis akses" closeLabel="Tutup filter"
      onDismiss={() => setAccessOpen(false)} testID="tutor-roster-access-options">
      {enrollmentFilters.map(([value, label]) => <Button key={value} theme={theme} variant={access === value ? "outline" : "ghost"}
        accessibilityRole="radio" accessibilityState={{ checked: access === value }} testID={`tutor-roster-access-${value}`}
        onPress={() => { setAccess(value); setAccessOpen(false); }} style={styles.filter}>{label}</Button>)}
    </SharedPopover>
    {active ? <TutorDetail theme={theme} title={active.name} subtitle={active.email} onBack={() => setActiveId(undefined)}>
      <Row theme={theme} title="Jenis akses" subtitle={accessNames[active.enrollmentType]} />
      <Row theme={theme} title="Terdaftar sejak" subtitle={participantDate(active.enrolledAt, "Belum tercatat")} />
      <Row theme={theme} title="Masa berlaku" subtitle={participantDate(active.expiresAt, "Aktif semester ini")} />
      <Heading theme={theme} title="Kelompok" count={String(active.groups.length)} />
      {active.groups.map((group) => <Row key={group.id} theme={theme} title={group.name} subtitle={group.role === "leader" ? "Ketua" : "Anggota"} />)}
      {active.groups.length === 0 ? <Empty theme={theme} title="Belum bergabung dalam kelompok" /> : null}
    </TutorDetail> : null}
  </>;
}

const styles = StyleSheet.create({
  page: { paddingTop: 8, gap: 10 },
  header: { gap: 2 },
  headerControls: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },
  back: { height: 44, width: 44, marginStart: -4 },
  heading: { flex: 1, minWidth: 0 },
  title: { ...nativeTypography.headingBold, fontSize: 14, lineHeight: 20, includeFontPadding: false },
  visuallyHidden: { position: "absolute", width: 1, height: 1, overflow: "hidden" },
  searching: { flex: 1, minWidth: 0 },
  searchContext: { marginStart: 46 },
  tabs: { marginHorizontal: -16 },
  filter: { alignSelf: "flex-start", height: "auto", minHeight: 44, maxWidth: "100%", paddingVertical: 8 },
  records: { borderTopWidth: StyleSheet.hairlineWidth },
  row: { paddingVertical: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  identity: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  initial: { height: 32, width: 32, borderRadius: nativeRadii.lg, justifyContent: "center", alignItems: "center" },
  identityBody: { flex: 1, minWidth: 0, gap: 14 },
  identityHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 6 },
  name: { ...nativeTypography.bodySemibold, fontSize: 14, lineHeight: 20, includeFontPadding: false, flexShrink: 1 },
  badge: { ...nativeTypography.bodyRegular, fontSize: 10, lineHeight: 14, includeFontPadding: false, paddingHorizontal: 9, paddingVertical: 2,
    borderRadius: nativeRadii.md, borderWidth: StyleSheet.hairlineWidth, flexShrink: 1 },
  small: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 17, includeFontPadding: false },
  groups: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  groupTag: { ...nativeTypography.bodyMedium, fontSize: 12, lineHeight: 17, includeFontPadding: false, borderRadius: nativeRadii.md,
    paddingHorizontal: 8, paddingVertical: 2, flexShrink: 1 },
  dates: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  date: { flex: 1, minWidth: 120 },
  empty: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 16 },
  emptyBody: { flex: 1, minWidth: 0, gap: 14 },
});
