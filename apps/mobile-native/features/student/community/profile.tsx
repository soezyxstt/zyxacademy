import { useState } from "react";
import { View } from "react-native";
import { getMajorsForFaculty, ITB_FACULTIES } from "../../../../../packages/student-community/itb-academic-data";
import type { StudentSocialSettingsInput } from "../../../../../lib/gamification/social-contracts";
import type { Profile, PublicStudentProfile, ReflectionPage, StudentIdentity } from "../../../../../packages/native-parity/student/community/contracts";
import { BadgeRows, RankSummary, RewardRows } from "./achievements";
import { Action, Actions, Avatar, Choices, Copy, Field, Notice, Page, Remote, Row, Rows, Toggle, communityPath, dateLabel, operationResult, post, styles, useCommunity, useOperation, useRemote } from "./ui";

function profilePath(publicId: string) { return `/students/${encodeURIComponent(publicId)}`; }
type Section = "followers" | "following" | "search";

function People({ section }: { section: Section }) {
  const { tr, request, navigate } = useCommunity();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<string>();
  const state = useRemote<StudentIdentity[] | { entries: StudentIdentity[]; nextCursor: string | null }>(
    section === "search" ? query.length >= 2 ? communityPath("people", { search: query }) : null
      : communityPath("following", { direction: section, cursor }),
  );
  const action = useOperation();
  return <>
    {section === "search" && <View style={styles.block}>
      <Field label={tr("Nama siswa", "Student name")} value={search} onChangeText={setSearch} maxLength={80}
        returnKeyType="search" onSubmitEditing={() => setQuery(search.trim())} />
      <Actions><Action label={tr("Cari", "Search")} disabled={search.trim().length < 2} onPress={() => setQuery(search.trim())} /></Actions>
    </View>}
    <Notice notice={action.notice} />
    {(section !== "search" || query.length >= 2) && <Remote state={state}>{data => {
      const entries = Array.isArray(data) ? data : data.entries;
      return <>
        {!entries.length && <Copy kind="muted">{tr("Belum ada siswa.", "No students found.")}</Copy>}
        <Rows>{entries.map(student => <Row key={student.publicId} title={student.displayName} meta={student.rankKey} onPress={() => navigate(profilePath(student.publicId))}>
          {section !== "search" && <Actions><Action label={section === "followers" ? tr("Hapus pengikut", "Remove follower") : tr("Berhenti mengikuti", "Unfollow")}
            disabled={action.pending} onPress={() => void action.run(async () => {
              operationResult(await post(request, "social", { id: student.publicId, action: section === "followers" ? "remove" : "unfollow" }));
              state.reload();
            })} /></Actions>}
        </Row>)}</Rows>
        {!Array.isArray(data) && <Actions>
          {cursor && <Action label={tr("Halaman pertama", "First page")} onPress={() => setCursor(undefined)} />}
          {data.nextCursor && <Action label={tr("Berikutnya", "Next")} onPress={() => setCursor(data.nextCursor ?? undefined)} />}
        </Actions>}
      </>;
    }}</Remote>}
  </>;
}

export function ProfileScreen() {
  const { tr, navigate } = useCommunity();
  const state = useRemote<Profile>(communityPath("profile"));
  const [section, setSection] = useState<Section | null>(null);
  return <Page title={tr("Profil", "Profile")}>
    <Remote state={state}>{profile => <ProfileOverview profile={profile} />}</Remote>
    <Actions><Action label={tr("Edit profil", "Edit profile")} onPress={() => navigate("/settings?tab=profile")} />
      <Action label={tr("Refleksi mingguan", "Weekly reflections")} onPress={() => navigate("/profile/reflections")} /></Actions>
    {state.data?.customization && <>
      <Choices value={section} options={[
        { value: "followers", label: tr("Pengikut", "Followers") }, { value: "following", label: tr("Mengikuti", "Following") },
        { value: "search", label: tr("Cari siswa", "Find students") },
      ]} onSelect={setSection} />
      {section && <People key={section} section={section} />}
    </>}
  </Page>;
}

function ProfileOverview({ profile }: { profile: Profile }) {
  const { tr, navigate } = useCommunity();
  const name = profile.customization?.settings.displayName || profile.account.name;
  const academic = [profile.account.faculty, profile.account.major, profile.account.entryYear].filter(Boolean).join(" · ");
  return <>
    <View style={styles.actions}><Avatar name={name} uri={profile.account.image} /><View style={styles.rowBody}>
      <Copy kind="heading">{name}</Copy>
      {academic ? <Copy kind="muted">{academic}</Copy> : null}
    </View></View>
    {profile.summary && <RankSummary summary={profile.summary} />}
    {profile.stats && <Rows>
      <Row title={tr("Kelas aktif", "Active classes")} aside={String(profile.courses.length)} />
      <Row title={tr("Materi selesai", "Completed materials")} aside={String(profile.stats.completedMaterials)} />
      <Row title={tr("Ujian selesai", "Completed exams")} aside={String(profile.stats.completedExams)} />
      {profile.stats.averageScore !== null && <Row title={tr("Nilai rata-rata", "Average score")} aside={String(profile.stats.averageScore)} />}
    </Rows>}
    {profile.customization && <>
      <Copy kind="heading">{tr("Papan lencana", "Badge board")}</Copy>
      <BadgeRows badges={profile.customization.badges} collectedOnly />
      <Actions><Action label={tr("Pencapaian", "Achievements")} onPress={() => navigate("/achievements?tab=badges")} /></Actions>
      <Copy kind="heading">{tr("Kelas yang diikuti", "Enrolled classes")}</Copy>
      {profile.courses.length
        ? <Rows>{profile.courses.map(course => <Row key={course.id} title={course.title} onPress={() => navigate(`/courses/${encodeURIComponent(course.id)}`)} />)}</Rows>
        : <Copy kind="muted">{tr("Belum ada kelas yang diikuti.", "No enrolled classes.")}</Copy>}
      <Actions><Action label={tr("Kelompok", "Groups")} onPress={() => navigate("/dashboard/groups")} />
        <Action label={tr("Jadwal", "Schedule")} onPress={() => navigate("/dashboard/schedule")} /></Actions>
    </>}
  </>;
}

function AcademicForm({ account }: { account: Profile["account"] }) {
  const { tr, request } = useCommunity();
  const [faculty, setFaculty] = useState(account.faculty ?? "");
  const [major, setMajor] = useState(account.major ?? "");
  const [entryYear, setEntryYear] = useState(String(account.entryYear ?? ""));
  const action = useOperation();
  const majors = faculty ? getMajorsForFaculty(faculty) : [];
  return <View style={styles.block}>
    <Copy kind="heading">{tr("Profil akademis", "Academic profile")}</Copy>
    <Copy>{account.name}</Copy><Copy kind="muted">{account.email}</Copy>
    <Copy kind="strong">{tr("Fakultas", "Faculty")}</Copy>
    <Choices options={ITB_FACULTIES.map(item => ({ value: item.code, label: item.code }))} value={faculty}
      disabled={action.pending} onSelect={value => { setFaculty(value); setMajor(""); }} />
    {majors.length > 0 && <>
      <Copy kind="strong">{tr("Program studi", "Major")}</Copy>
      <Choices options={majors.map(value => ({ value, label: value }))} value={major} onSelect={setMajor} disabled={action.pending} />
    </>}
    <Field label={tr("Tahun masuk", "Entry year")} value={entryYear} onChangeText={setEntryYear} keyboardType="number-pad" maxLength={4} />
    <Notice notice={action.notice} />
    <Actions><Action label={tr("Simpan profil", "Save profile")} mode="default" busy={action.pending}
      disabled={!faculty || !major || !/^\d{4}$/.test(entryYear)} onPress={() => void action.run(async () => {
        operationResult(await post(request, "profile", { faculty, major, entryYear }));
      }, tr("Profil tersimpan.", "Profile saved."))} /></Actions>
  </View>;
}

function PrivacyForm({ data }: { data: NonNullable<Profile["customization"]> }) {
  const { tr, request } = useCommunity();
  const { publicId: _publicId, ...initial } = data.settings;
  const [draft, setDraft] = useState<StudentSocialSettingsInput>(initial);
  const action = useOperation();
  const keys = ["showMajor", "showFaculty", "allowFollows", "leaderboardOptIn"] as const;
  const labels = {
    showMajor: tr("Tampilkan program studi", "Show major"), showFaculty: tr("Tampilkan fakultas", "Show faculty"),
    allowFollows: tr("Izinkan pengikut", "Allow followers"), leaderboardOptIn: tr("Ikut peringkat partisipasi", "Join the participation leaderboard"),
  };
  return <View style={styles.block}>
    <Copy kind="heading">{tr("Privasi profil", "Profile privacy")}</Copy>
    <Field label={tr("Nama tampilan", "Display name")} value={draft.displayName ?? ""} maxLength={80}
      onChangeText={displayName => setDraft({ ...draft, displayName })} />
    <Choices options={[{ value: "private", label: tr("Privat", "Private") }, { value: "members", label: tr("Anggota", "Members") }]}
      value={draft.visibility} onSelect={visibility => setDraft({ ...draft, visibility })} />
    {keys.map(key => <Toggle key={key} label={labels[key]} value={draft[key]} onChange={value => setDraft({ ...draft, [key]: value })} disabled={action.pending} />)}
    <Copy kind="strong">{tr("Lencana pilihan", "Featured badges")}</Copy>
    {data.badges.filter(badge => badge.tier > 0).map(badge => {
      const picked = draft.featuredBadgeIds.includes(badge.family);
      return <Toggle key={badge.family} label={badge.family.replaceAll("_", " ")} value={picked}
        disabled={action.pending || (!picked && draft.featuredBadgeIds.length >= 3)} onChange={value => setDraft({
          ...draft, featuredBadgeIds: value ? [...draft.featuredBadgeIds, badge.family] : draft.featuredBadgeIds.filter(item => item !== badge.family),
        })} />;
    })}
    <Notice notice={action.notice} />
    <Actions><Action label={tr("Simpan privasi", "Save privacy")} mode="default" busy={action.pending} onPress={() => void action.run(async () => {
      operationResult(await post(request, "social-settings", { ...draft, displayName: draft.displayName?.trim() || null }));
    }, tr("Privasi tersimpan.", "Privacy settings saved."))} /></Actions>
  </View>;
}

export function ProfileEditorPanel() {
  const state = useRemote<Profile>(communityPath("profile", { view: "edit" }));
  const { tr } = useCommunity();
  return <Remote state={state}>{data => <>
    <AcademicForm account={data.account} />
    {data.customization && <><PrivacyForm data={data.customization} />
      <Copy kind="heading">{tr("Tampilan profil", "Profile appearance")}</Copy>
      <RewardRows rewards={data.customization.rewards.filter(item => item.owned && ["frame", "theme", "title", "zyra_skin", "zyra_avatar"].includes(item.slot))}
        balance={0} refresh={state.reload} /></>}
  </>}</Remote>;
}
export function ProfileEditorScreen() {
  const { tr } = useCommunity();
  return <Page title={tr("Edit profil", "Edit profile")}><ProfileEditorPanel /></Page>;
}

function PublicProfile({ profile, reload }: { profile: PublicStudentProfile; reload(): void }) {
  const { tr, request } = useCommunity();
  const [confirmation, setConfirmation] = useState<"block" | "report" | null>(null);
  const [reason, setReason] = useState<"harassment" | "impersonation" | "inappropriate" | "other">("other");
  const action = useOperation();
  const apply = (type: string) => void action.run(async () => {
    operationResult(await post(request, "social", { id: profile.publicId, action: type, ...(type === "report" ? { reason } : {}) }));
    setConfirmation(null);
    if (type !== "report") reload();
  }, type === "report" ? tr("Laporan terkirim.", "Report sent.") : undefined);
  return <>
    <View style={styles.actions}><Avatar name={profile.displayName} uri={profile.avatarUrl} /><View style={styles.rowBody}>
      <Copy kind="heading">{profile.displayName}</Copy>
      <Copy kind="muted">{[profile.faculty, profile.major, profile.rankKey].filter(Boolean).join(" · ")}</Copy>
      {profile.baseXpMicro !== null && <Copy>{profile.baseXpMicro / 1e6} XP</Copy>}
    </View></View>
    <Copy kind="muted">{profile.followerCount} {tr("pengikut", "followers")} · {profile.followingCount} {tr("mengikuti", "following")}</Copy>
    <BadgeRows collectedOnly badges={profile.earnedBadges.filter(badge => profile.featuredBadgeIds.includes(badge.family)).map(badge => ({
      family: badge.family as Parameters<typeof BadgeRows>[0]["badges"][number]["family"], tier: badge.tier, count: badge.tier, nextThreshold: null,
    }))} />
    <Notice notice={action.notice} />
    <Actions>
      {(profile.canFollow || profile.isFollowing) && <Action label={profile.isFollowing ? tr("Berhenti mengikuti", "Unfollow") : tr("Ikuti", "Follow")}
        mode="default" busy={action.pending} onPress={() => apply(profile.isFollowing ? "unfollow" : "follow")} />}
      <Action label={tr("Blokir", "Block")} disabled={action.pending} onPress={() => setConfirmation("block")} />
      <Action label={tr("Laporkan", "Report")} disabled={action.pending} onPress={() => setConfirmation("report")} />
    </Actions>
    {confirmation && <>
      {confirmation === "block" ? <Copy>{tr("Pemblokiran menghapus hubungan mengikuti kedua arah.", "Blocking removes follows in both directions.")}</Copy>
        : <Choices value={reason} options={[
          { value: "harassment", label: tr("Pelecehan", "Harassment") }, { value: "impersonation", label: tr("Penyamaran", "Impersonation") },
          { value: "inappropriate", label: tr("Konten tidak pantas", "Inappropriate content") }, { value: "other", label: tr("Lainnya", "Other") },
        ]} onSelect={setReason} />}
      <Actions><Action label={confirmation === "block" ? tr("Konfirmasi blokir", "Confirm block") : tr("Kirim laporan", "Send report")}
        mode={confirmation === "block" ? "destructive" : "default"} busy={action.pending} onPress={() => apply(confirmation)} />
        <Action label={tr("Batal", "Cancel")} disabled={action.pending} onPress={() => setConfirmation(null)} /></Actions>
    </>}
  </>;
}
export function PublicProfileScreen() {
  const { tr, route } = useCommunity();
  const state = useRemote<PublicStudentProfile>(communityPath("public-profile", { id: route.params.publicId }));
  return <Page title={tr("Profil siswa", "Student profile")}><Remote state={state}>{data => <PublicProfile profile={data} reload={state.reload} />}</Remote></Page>;
}

export function ReflectionsScreen() {
  const { tr, session } = useCommunity();
  const [before, setBefore] = useState<string>();
  const [expanded, setExpanded] = useState<string>();
  const state = useRemote<ReflectionPage>(communityPath("reflections", { before }));
  return <Page title={tr("Refleksi mingguan", "Weekly reflections")}>
    <Remote state={state}>{({ entries, nextCursor }) => <>
      {!entries.length && <Copy kind="muted">{tr("Belum ada refleksi mingguan.", "No weekly reflections yet.")}</Copy>}
      <Rows>{entries.map(({ id, weekStart, payload }) => <Row key={id} title={dateLabel(weekStart, session.locale)}
        onPress={() => setExpanded(expanded === id ? undefined : id)}>
        {expanded === id && <View style={styles.field}>
          <Copy>{tr("Kuis", "Quizzes")} {payload.completed.quizzes} · {tr("Flashcard", "Flashcards")} {payload.completed.flashcards} · {tr("Materi", "Materials")} {payload.completed.modules}</Copy>
          <Copy>{tr("Pertumbuhan penguasaan", "Mastery growth")} {payload.masteryGrowth}</Copy>
          {payload.mostImproved && <Copy>{tr("Paling berkembang", "Most improved")} · {payload.mostImproved}</Copy>}
          <Copy>{tr("Runtun saat ini", "Current streak")} {payload.streak.currentStreak} · {tr("Terpanjang", "Longest streak")} {payload.streak.longestStreak}</Copy>
        </View>}
      </Row>)}</Rows>
      <Actions>
        {before && <Action label={tr("Refleksi terbaru", "Latest reflections")} onPress={() => { setBefore(undefined); setExpanded(undefined); }} />}
        {nextCursor && <Action label={tr("Refleksi sebelumnya", "Older reflections")} onPress={() => {
          setBefore(nextCursor); setExpanded(undefined);
        }} />}
      </Actions>
    </>}</Remote>
  </Page>;
}
