import { useCallback, useEffect, useRef, useState, useContext } from "react";
import { Text, View, StyleSheet, useWindowDimensions } from "react-native";
import {
  administrationReadPath, type LiveAdministrationRead, type LiveRow,
} from "../../../../../packages/native-parity/academic/administration/live";
import { matchAdministrationRoute, type AdministrationPattern } from "../../../../../packages/native-parity/academic/administration/routes";
import { nativeTypography } from "../../../typography";
import { NativeListRow, NativeStatusPanel, ResponsiveTable, type SharedUiAction, type SharedUiActionHandler } from "../../shared-ui";
import { BroadcastComposer } from "./broadcast-composer";
import { ScheduleEventEditor } from "./schedule-event-editor";
import { AdministrationCalendar } from "./calendar";
import { LiveEnrollmentTokenEditor } from "./enrollment-token-editor";
import type { EnrollmentTokenUnavailable } from "./enrollment-token-client";
import { LiveStudyGroupEditor } from "./study-group-editor";
import { StudyGroupMembersEditor } from "./study-group-members-editor";
import { PkaAnnouncementEditor } from "./pka-edit";
import { clearPkaLifecycle, PkaLifecycleDialog, recoverPkaLifecycle, type PkaLifecycleTarget } from "./pka-lifecycle";
import { clearPkaScheduleRecovery, PkaScheduleEditor } from "./pka-schedule-editor";
import { UserRolesEditor } from "./user-roles-editor";
import { UserStatusEditor } from "./user-status-editor";
import { DiktatPdfControls, readDiktatScope } from "./diktat-controls";
import { IdeaReviewEditor } from "./idea-review-editor";
import type { AcademicTransport } from "../client";
import type { AcademicScreenProps } from "../contracts";
import { CourseTheme, PendingCourses, useCourseColors } from "../courses/ui";
import { AdministrationReadError, readAdministration } from "./live-client";
import {
  Action, AdministrationPage, CourseDialog, CourseStatus, Ink, Metrics, Picker, RecordsEmpty, SearchBox, Tabs, layout,
} from "./ui";

type LiveProps = AcademicScreenProps & { transport: AcademicTransport };
type LoadState = { status: "loading" | "denied" | "missing" | "error" } | { status: "ready"; data: LiveAdministrationRead };

function useRead(transport: AcademicTransport, path: string) {
  const [result, setResult] = useState<{ transport: AcademicTransport; path: string; state: LoadState }>();
  const [attempt, bump] = useState(0);
  const active = useRef<{ transport: AcademicTransport; path: string; controller: AbortController }>(null);
  useEffect(() => {
    const controller = new AbortController();
    active.current = { transport, path, controller };
    setResult({ transport, path, state: { status: "loading" } });
    readAdministration(transport, path, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult({ transport, path, state: { status: "ready", data } });
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      const code = failure instanceof AdministrationReadError ? failure.status : 500;
      const status = code === 401 || code === 403 ? "denied" : code === 404 ? "missing" : "error";
      setResult({ transport, path, state: { status } });
    });
    return () => controller.abort();
  }, [attempt, transport, path]);
  const invalidate = useCallback((status: EnrollmentTokenUnavailable) => {
    const read = active.current;
    if (read?.transport !== transport || read.path !== path) return;
    read.controller.abort();
    setResult({ transport, path, state: { status } });
  }, [path, transport]);
  return {
    state: result?.transport === transport && result.path === path ? result.state : { status: "loading" } as const,
    retry: () => bump((current) => current + 1),
    invalidate,
  };
}

const pkaTabs = [
  { id: "registrations", label: "Pendaftaran" }, { id: "announcements", label: "Pengumuman" }, { id: "schedules", label: "Jadwal" },
] as const;
const scheduleTabs = [
  { id: "calendar", label: "Kalender" }, { id: "academic", label: "Daftar jadwal" },
  { id: "tutors", label: "Tutor" }, { id: "tickets", label: "Tiket" }, { id: "audit", label: "Jejak audit" },
] as const;
const usersRole = [
  { id: "", label: "Semua peran" }, { id: "admin", label: "Admin" }, { id: "tutor", label: "Tutor" }, { id: "murid", label: "Peserta" },
] as const;
const usersStatus = [{ id: "", label: "Semua status" }, { id: "active", label: "Aktif" }, { id: "suspended", label: "Ditangguhkan" }] as const;
const groupsStatus = [
  { id: "", label: "Semua status" }, { id: "active", label: "Aktif" }, { id: "completed", label: "Selesai" },
  { id: "inactive", label: "Nonaktif" }, { id: "archived", label: "Diarsipkan" },
] as const;
const emptyMessages: Partial<Record<AdministrationPattern, string>> = {
  "/admin/users": "Belum ada pengguna.",
  "/admin/groups": "Belum ada kelompok belajar.",
  "/admin/tokens": "Belum ada token pendaftaran.",
  "/admin/schedules": "Tidak ada jadwal pada periode ini.",
  "/admin/notifications": "Belum ada riwayat notifikasi.",
  "/admin/tutorial-pka/registrations": "Belum ada pendaftaran PKA.",
  "/admin/tutorial-pka/schedules": "Belum ada jadwal PKA.",
  "/admin/tutorial-pka/announcements": "Belum ada pengumuman PKA.",
};

function LiveContent({ route, ...props }: LiveProps & { route: NonNullable<ReturnType<typeof matchAdministrationRoute>> }) {
  const { pattern, title } = route;
  const { params, query, transport, navigate, replace, back } = props;
  const [eventDraft, setEventDraft] = useState<{ transport: AcademicTransport; row?: LiveRow }>();
  const tokenPage = pattern === "/admin/tokens";
  const pkaSchedulePage = pattern === "/admin/tutorial-pka/schedules";
  const pkaAnnouncementPage = pattern === "/admin/tutorial-pka/announcements";
  const searchEnabled = pattern === "/admin/users" || pattern === "/admin/groups" || tokenPage
    || pattern === "/admin/tutorial-pka/registrations";
  const [search, setSearch] = useState(query.search ?? "");
  const [filters, setFilters] = useState({ ...query });
  const [selected, setSelected] = useState<LiveRow>();
  const [pdfRow, setPdfRow] = useState<LiveRow>();
  const [ideaDraft, setIdeaDraft] = useState<{ actorTransport: AcademicTransport; slug: string; importId: string; id: string }>();
  const [pkaDraft, setPkaDraft] = useState<{ actorTransport: AcademicTransport; row: LiveRow }>();
  const [pkaScheduleDraft, setPkaScheduleDraft] = useState<{ actorTransport: AcademicTransport; id: string }>();
  const [pkaLifecycle, setPkaLifecycle] = useState<{ actorTransport: AcademicTransport; target: PkaLifecycleTarget }>();
  const [rolesDraft, setRolesDraft] = useState<{ actorTransport: AcademicTransport; row: LiveRow }>();
  const [userStatusDraft, setUserStatusDraft] = useState<{ actorTransport: AcademicTransport; row: LiveRow }>();
  const [groupDraft, setGroupDraft] = useState<{ actorTransport: AcademicTransport; id?: string }>();
  const [groupMembersDraft, setGroupMembersDraft] = useState<{ actorTransport: AcademicTransport; id: string }>();
  const [tokenDraft, setTokenDraft] = useState<{ actorTransport: AcademicTransport; id?: string }>();
  const [success, setSuccess] = useState("");
  const [broadcastTransport, setBroadcastTransport] = useState<AcademicTransport>();
  const groupEditor = groupDraft?.actorTransport === transport ? groupDraft : undefined;
  const groupMembersEditor = pattern === "/admin/groups" && groupMembersDraft?.actorTransport === transport ? groupMembersDraft : undefined;
  const tokenEditor = tokenDraft?.actorTransport === transport ? tokenDraft : undefined;
  const announcement = pkaDraft?.actorTransport === transport ? pkaDraft.row : undefined;
  const rolesRow = rolesDraft?.actorTransport === transport && pattern === "/admin/users" ? rolesDraft.row : undefined;
  const userStatusRow = userStatusDraft?.actorTransport === transport && pattern === "/admin/users" ? userStatusDraft.row : undefined;
  const theme = useContext(CourseTheme);
  const palette = useCourseColors();
  const { width, fontScale } = useWindowDimensions();
  const article = pattern === "/admin/courses/[slug]/review/product/[bundleId]";
  const ideaReviewPage = pattern === "/admin/courses/[slug]/review/idea/[bundleId]";
  const idea = ideaReviewPage && ideaDraft?.actorTransport === transport && ideaDraft.slug === params.slug && ideaDraft.importId === params.bundleId
    ? ideaDraft : undefined;
  const pdfPending = article && readDiktatScope(query, params.bundleId);
  const { state, retry, invalidate } = useRead(transport, administrationReadPath(pattern, params, filters));
  const target = state.status === "ready" && state.data.type === "redirect" ? state.data.target : undefined;
  useEffect(() => { if (target) replace(target); }, [target, replace]);
  const page = Math.max(1, Number(filters.page) || 1);
  const week = Number(filters.week) || 0;
  const data = state.status === "ready" && state.data.type === "page" ? state.data : undefined;
  const recoveredPka = data ? recoverPkaLifecycle(transport) : undefined;
  const canRecoverPka = Boolean(recoveredPka && (pkaAnnouncementPage
    ? recoveredPka.attempt.command.action === "announcement-state"
    : pkaSchedulePage && recoveredPka.attempt.command.action !== "announcement-state"));
  const startPkaLifecycle = (target: PkaLifecycleTarget) => {
    setSuccess("");
    setPkaLifecycle({ actorTransport: transport, target });
  };
  const tokenRow = tokenEditor?.id ? data?.rows.find((row) => row.id === tokenEditor.id) : undefined;
  const pkaSchedule = pkaSchedulePage && pkaScheduleDraft?.actorTransport === transport
    ? data?.rows.find((row) => row.id === pkaScheduleDraft.id) : undefined;
  const visibleSelection = (tokenPage || pkaSchedulePage || ideaReviewPage) && selected ? data?.rows.find((row) => row.id === selected.id) : selected;
  const tokenAccessEnded = tokenPage && (state.status === "denied" || state.status === "missing");
  const clearTokenContext = useCallback(() => {
    setSelected(undefined);
    setTokenDraft(undefined);
    setSuccess("");
    setSearch("");
  }, []);
  useEffect(() => {
    if (tokenAccessEnded) clearTokenContext();
  }, [tokenAccessEnded, clearTokenContext]);
  const tokenUnavailable = useCallback((status: EnrollmentTokenUnavailable) => {
    invalidate(status);
    clearTokenContext();
  }, [invalidate, clearTokenContext]);
  const clearPkaScheduleContext = useCallback(() => {
    setPkaScheduleDraft(undefined);
    setSelected(undefined);
    setSuccess("");
  }, []);
  const pkaScheduleAccessEnded = pkaSchedulePage && (state.status === "denied" || state.status === "missing");
  useEffect(() => {
    if (pkaScheduleAccessEnded) {
      if (state.status === "denied") clearPkaScheduleRecovery(transport);
      clearPkaScheduleContext();
    }
  }, [pkaScheduleAccessEnded, state.status, transport, clearPkaScheduleContext]);
  const pkaRoleEnded = (pkaAnnouncementPage || pkaSchedulePage) && state.status === "denied";
  useEffect(() => {
    if (!pkaRoleEnded) return;
    clearPkaLifecycle(transport);
    setPkaLifecycle(undefined);
    setPkaDraft(undefined);
    setSelected(undefined);
  }, [pkaRoleEnded, transport]);
  function reloadTokens() {
    setFilters((previous) => ({ ...previous, search: "", page: "1" }));
    retry();
  }
  const pkaTab = pkaTabs.find(({ id }) => pattern.endsWith(`/tutorial-pka/${id}`))?.id;
  const scheduleTab = scheduleTabs.find((item) => item.id === filters.tab)?.id ?? "calendar";
  function filter(name: string, value: string) {
    setSelected(undefined);
    setSuccess("");
    setFilters((previous) => ({ ...previous, [name]: value, ...(name === "page" ? {} : { page: "1" }) }));
  }
  const filtered = Boolean(filters.search || filters.status || filters.role);
  return <AdministrationPage title={title} back={back}>
    {pkaTab ? <Tabs options={pkaTabs} selected={pkaTab} onSelect={(id) => navigate(`/admin/tutorial-pka/${id}`)} /> : null}
    {pattern === "/admin/schedules" && data?.scheduleCourses && transport.command ? <View style={layout.row}>
      <Action label="Buat agenda" onPress={() => setEventDraft({ transport })} />
      {eventDraft?.transport === transport ? <ScheduleEventEditor row={eventDraft.row} courses={data.scheduleCourses}
        transport={transport} send={transport.command} close={() => setEventDraft(undefined)}
        reload={() => { setEventDraft(undefined); setSelected(undefined); retry(); }} /> : null}
    </View> : null}
    {pattern === "/admin/notifications" ? <View style={layout.row}>
      <Ink kind="heading">Riwayat notifikasi</Ink>
      {data && transport.command ? <Action label="Tulis notifikasi" variation="default" onPress={() => setBroadcastTransport(transport)} testID="academic-live-broadcast-open" /> : null}
    </View> : null}
    {pattern === "/admin/notifications" && broadcastTransport === transport && state.status !== "denied" ? <BroadcastComposer
      transport={transport} close={() => setBroadcastTransport(undefined)} refreshHistory={() => {
        setBroadcastTransport(undefined);
        retry();
      }} /> : null}
    {searchEnabled && (!tokenPage || data) ? <View style={layout.row}>
      <View style={layout.flex}><SearchBox label="Cari" value={search} onChange={setSearch} /></View>
      <Action label="Cari" onPress={() => filter("search", search.trim())} />
    </View> : null}
    {pattern === "/admin/users" ? <View style={layout.row}>
      <Picker label="Peran" options={usersRole} selected={filters.role ?? ""} onSelect={(id) => filter("role", id)} />
      <Picker label="Status" options={usersStatus} selected={filters.status ?? ""} onSelect={(id) => filter("status", id)} />
    </View> : null}
    {tokenPage && data && transport.command ? <View style={layout.row}>
      <Action label="Buat token" variation="default" testID="academic-live-token-create" onPress={() => {
        setSuccess("");
        setTokenDraft({ actorTransport: transport });
      }} />
    </View> : null}
    {pattern === "/admin/groups" ? <View style={layout.row}>
      {data && transport.command ? <Action label="Buat kelompok" variation="default" testID="academic-live-group-create" onPress={() => {
        setSuccess("");
        setGroupDraft({ actorTransport: transport });
      }} /> : null}
      <Picker label="Status" options={groupsStatus} selected={filters.status ?? ""} onSelect={(id) => filter("status", id)} />
    </View> : null}
    {pkaAnnouncementPage ? <View style={layout.row}>
      <Action selected={filters.status !== "archived"} label="Aktif" onPress={() => filter("status", "")} />
      <Action selected={filters.status === "archived"} label="Arsip" onPress={() => filter("status", "archived")} />
      {canRecoverPka && recoveredPka ? <Action label="Periksa perubahan pengumuman" onPress={() => startPkaLifecycle(recoveredPka.target)} /> : null}
    </View> : null}
    {pkaSchedulePage ? <View style={layout.row}>
      <Picker label="Periode" options={[{ id: "", label: "Semua sesi" }, { id: "upcoming", label: "Akan datang" }, { id: "past", label: "Riwayat" }]}
        selected={filters.status ?? ""} onSelect={(value) => filter("status", value)} />
      {data && transport.command ? canRecoverPka && recoveredPka
        ? <Action label="Periksa perubahan jadwal" onPress={() => startPkaLifecycle(recoveredPka.target)} />
        : <Action label="Buat jadwal PKA" variation="default" testID="academic-live-pka-create" disabled={Boolean(recoveredPka)}
          onPress={() => startPkaLifecycle({ action: "create-schedule" })} /> : null}
    </View> : null}
    {pattern === "/admin/schedules" ? <Tabs options={scheduleTabs} selected={scheduleTab} onSelect={(id) => filter("tab", id)} /> : null}
    {data?.week ? <>
      <View style={layout.row}><Action label="Hari ini" onPress={() => filter("week", "0")} /></View>
      <AdministrationCalendar start={data.week.start} today={data.week.today} dayOffset={week}
        onPeriodChange={(direction) => filter("week", String(week + direction))}
        events={data.rows.flatMap((row) => row.dateId ? [{
          dateId: row.dateId, title: row.title, id: row.id, caption: [row.subtitle, row.detail].filter(Boolean).join(" · "),
        }] : [])} onEventPress={(id) => setSelected(data.rows.find((row) => row.id === id))} />
    </> : pattern === "/admin/schedules" ? <View style={layout.row}>
      <Action label="Minggu sebelumnya" onPress={() => filter("week", String(week - 1))} disabled={week <= -520} />
      <Action label="Hari ini" onPress={() => filter("week", "0")} />
      <Action label="Minggu berikutnya" onPress={() => filter("week", String(week + 1))} disabled={week >= 520} />
    </View> : null}
    {state.status === "loading" ? <PendingCourses /> : null}
    {state.status === "denied" && (tokenPage || pkaSchedulePage || ideaReviewPage
      ? <NativeStatusPanel title="Akses admin diperlukan." message="Masuk kembali jika sesi berakhir." tone="error" theme={theme}
        action={{ id: "retry", label: "Coba lagi" }} onAction={tokenPage ? reloadTokens : retry} />
      : <NativeStatusPanel title="Akses admin diperlukan." message="Masuk kembali jika sesi berakhir." tone="error" theme={theme} />)}
    {state.status === "missing" ? <CourseStatus label={pkaSchedulePage ? "Jadwal tidak ditemukan."
      : tokenPage ? "Token tidak tersedia." : "Halaman atau data tidak ditemukan."}
      retry={tokenPage ? reloadTokens : pkaSchedulePage || ideaReviewPage ? retry : undefined} error /> : null}
    {state.status === "error" ? <NativeStatusPanel title="Data administrasi gagal dimuat." tone="error" theme={theme} action={{ id: "retry", label: "Coba lagi" }} onAction={retry} /> : null}
    {target ? <CourseStatus label="Membuka halaman tujuan…" /> : null}
    {success ? <View accessibilityLiveRegion="polite"><Ink>{success}</Ink></View> : null}
    {data?.summary?.length ? <Metrics values={data.summary} /> : null}
    {data?.rows.length === 0 && !data.week && pattern !== "/admin/notifications" ? <RecordsEmpty label={emptyMessages[pattern] ?? "Belum ada item."} filtered={filtered} /> : null}
    {article && (data || pdfPending) ? <DiktatPdfControls {...props} authorized={data?.rows.flatMap((row) => row.pdf ? [row.pdf] : []) ?? []}
      target={pdfRow?.pdf} title={pdfRow?.title}
      closeConfirmation={() => setPdfRow(undefined)} refresh={retry} /> : null}
    {data && pattern === "/admin/notifications" ? <ResponsiveTable rows={data.rows} theme={theme}
      getRowKey={(row) => row.id} empty={<RecordsEmpty label="Belum ada riwayat notifikasi." />}
      columns={[
        { id: "title", label: "Notifikasi", weight: 3, renderCell: (row) => <NativeListRow title={row.title} subtitle={row.detail}
          theme={theme} layout="compact" primary={{ onPress: () => setSelected(row) }} /> },
        { id: "recipient", label: "Penerima", weight: 2, renderCell: (row) => row.subtitle ?? "Belum tersedia" },
        { id: "success", label: "Berhasil", renderCell: (row) => row.fields?.find((field) => field.label === "Berhasil")?.value ?? "0" },
        { id: "failure", label: "Gagal", renderCell: (row) => row.fields?.find((field) => field.label === "Gagal")?.value ?? "0" },
      ]} /> : !data?.week ? data?.rows.map((row) => {
      type ActionId = "pdf" | "review-idea" | "edit" | "edit-pka-schedule" | "edit-group" | "group-members" | "revoke-token" | "user-status" | "user-roles"
        | "pka-pin" | "pka-archive" | "pka-delete";
      const actions: SharedUiAction<ActionId>[] = [];
      if (row.pdf && transport.command && !pdfPending) actions.push({ id: "pdf", label: "Minta PDF" });
      if (ideaReviewPage && row.ideaReviewId) actions.push({ id: "review-idea", label: "Review Idea" });
      if (row.tokenActive !== undefined && transport.command) actions.push({ id: "revoke-token", label: row.tokenActive ? "Cabut token" : "Status token" });
      if (row.groupEditable && transport.command) actions.push({ id: "edit-group", label: "Edit kelompok" }, { id: "group-members", label: "Kelola anggota" });
      if (row.announcementEdit && transport.command) actions.push({ id: "edit", label: "Edit pengumuman" });
      if (row.pkaScheduleEdit && transport.command) actions.push({ id: "edit-pka-schedule", label: "Edit jadwal" });
      if (row.announcementState && transport.command && !recoveredPka) actions.push(
        { id: "pka-pin", label: row.announcementState.pinned ? "Lepas sematan" : "Sematkan" },
        { id: "pka-archive", label: row.announcementState.archived ? "Pulihkan" : "Arsipkan" });
      if (row.pkaScheduleEdit && transport.command && !recoveredPka) actions.push({ id: "pka-delete", label: "Hapus jadwal" });
      if (row.userRolesEdit && transport.command) actions.push({ id: "user-roles", label: "Kelola peran" });
      if (row.userStatusEdit && transport.command) actions.push({ id: "user-status", label: "Ubah status" });
      const onAction: SharedUiActionHandler<ActionId> = (id) => {
        if (id === "pdf") setPdfRow(row);
        else {
          setSuccess("");
          if (id === "review-idea" && row.ideaReviewId) setIdeaDraft({
            actorTransport: transport, slug: params.slug, importId: params.bundleId, id: row.ideaReviewId,
          });
          else if (id === "edit-group") setGroupDraft({ actorTransport: transport, id: row.id });
          else if (id === "group-members") setGroupMembersDraft({ actorTransport: transport, id: row.id });
          else if (id === "revoke-token") setTokenDraft({ actorTransport: transport, id: row.id });
          else if (id === "user-roles") setRolesDraft({ actorTransport: transport, row });
          else if (id === "user-status") setUserStatusDraft({ actorTransport: transport, row });
          else if (id === "edit-pka-schedule") setPkaScheduleDraft({ actorTransport: transport, id: row.id });
          else if (id === "pka-delete" && row.pkaScheduleEdit) startPkaLifecycle({ title: row.title, command: {
            action: "delete-schedule", id: row.id, expectedRevision: row.pkaScheduleEdit.revision,
          } });
          else if ((id === "pka-pin" || id === "pka-archive") && row.announcementState) {
            const field = id === "pka-pin" ? "pinned" : "archived";
            startPkaLifecycle({ title: row.title, command: {
              action: "announcement-state", id: row.id, field, value: !row.announcementState[field],
              expectedRevision: row.announcementState.revision,
            } });
          }
          else setPkaDraft({ actorTransport: transport, row });
        }
      };
      return <View key={row.id} style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.border }}>
        <NativeListRow theme={theme} layout={width >= 768 * fontScale ? "wide" : "compact"} title={row.title}
          subtitle={[row.subtitle, row.detail].filter(Boolean).join(" · ")}
          primary={row.fields?.length ? { onPress: () => setSelected(row) } : undefined}
          actions={actions} onAction={onAction} />
      </View>;
    }) : null}
    {data && idea ? <IdeaReviewEditor key={idea.id} slug={idea.slug} importId={idea.importId} ideaId={idea.id} transport={transport}
      close={() => setIdeaDraft(undefined)}
      unavailable={(status) => { setIdeaDraft(undefined); setSelected(undefined); setSuccess(""); invalidate(status); }}
      saved={() => { setIdeaDraft(undefined); setSuccess("Review Idea tersimpan."); retry(); }} /> : null}
    {data && (page > 1 || data.nextPage) ? <View style={layout.row}>
      <Action label="Sebelumnya" onPress={() => filter("page", String(page - 1))} disabled={page <= 1} />
      <Ink kind="meta">{`Halaman ${page}`}</Ink>
      <Action label="Berikutnya" onPress={() => filter("page", String(page + 1))} disabled={!data.nextPage} />
    </View> : null}
    {announcement?.announcementEdit ? <PkaAnnouncementEditor id={announcement.id} initial={announcement.announcementEdit}
      transport={transport} cancel={() => { setPkaDraft(undefined); retry(); }}
      saved={() => { setPkaDraft(undefined); setSuccess("Pengumuman diperbarui."); retry(); }} /> : null}
    {data && pkaSchedule?.pkaScheduleEdit ? <PkaScheduleEditor key={pkaSchedule.id} id={pkaSchedule.id}
      initial={pkaSchedule.pkaScheduleEdit} transport={transport} close={() => { setPkaScheduleDraft(undefined); retry(); }}
      unavailable={invalidate}
      saved={() => { setPkaScheduleDraft(undefined); setSuccess("Jadwal diperbarui."); retry(); }} /> : null}
    {data && pkaLifecycle?.actorTransport === transport ? <PkaLifecycleDialog target={pkaLifecycle.target} transport={transport}
      recovery={recoveredPka?.target === pkaLifecycle.target ? recoveredPka : undefined}
      close={() => setPkaLifecycle(undefined)}
      reload={() => { setPkaLifecycle(undefined); setSelected(undefined); retry(); }}
      denied={() => { clearPkaLifecycle(transport); setPkaLifecycle(undefined); setSelected(undefined); invalidate("denied"); }}
      saved={(action) => {
        setPkaLifecycle(undefined);
        setSelected(undefined);
        if (action === "create-schedule" && filters.status === "upcoming") filter("status", "past");
        setSuccess(action === "delete-schedule" ? "Jadwal dihapus." : action === "create-schedule" ? "Jadwal tersimpan." : "Pengumuman diperbarui.");
        retry();
      }} /> : null}
    {data && rolesRow?.userRolesEdit && transport.command ? <UserRolesEditor key={rolesRow.id} id={rolesRow.id} name={rolesRow.title}
      email={rolesRow.subtitle} initial={rolesRow.userRolesEdit} transport={transport} send={transport.command}
      close={() => setRolesDraft(undefined)} refresh={() => { setRolesDraft(undefined); retry(); }}
      denied={() => { setRolesDraft(undefined); invalidate("denied"); }}
      saved={() => { setRolesDraft(undefined); setSuccess("Peran diperbarui."); retry(); }} /> : null}
    {data && userStatusRow?.userStatusEdit ? <UserStatusEditor key={userStatusRow.id} id={userStatusRow.id} name={userStatusRow.title}
      email={userStatusRow.subtitle} initial={userStatusRow.userStatusEdit} transport={transport}
      close={() => setUserStatusDraft(undefined)}
      refresh={() => { setUserStatusDraft(undefined); retry(); }}
      denied={() => { setUserStatusDraft(undefined); setSelected(undefined); invalidate("denied"); }}
      saved={() => { setUserStatusDraft(undefined); setSuccess("Status akun diperbarui."); retry(); }} /> : null}
    {groupEditor ? <LiveStudyGroupEditor key={groupEditor.id ?? "create"} id={groupEditor.id} transport={transport}
      cancel={() => setGroupDraft(undefined)} saved={() => {
        setSuccess(groupEditor.id ? "Kelompok diperbarui." : "Kelompok dibuat.");
        setGroupDraft(undefined);
        retry();
      }} /> : null}
    {groupMembersEditor && state.status !== "denied" ? <StudyGroupMembersEditor key={groupMembersEditor.id} id={groupMembersEditor.id}
      transport={transport} close={() => setGroupMembersDraft(undefined)} saved={retry}
      denied={() => { setGroupMembersDraft(undefined); setSelected(undefined); invalidate("denied"); }} /> : null}
    {data && tokenEditor && (!tokenEditor.id || tokenRow) ? <LiveEnrollmentTokenEditor key={tokenEditor.id ?? "issue"} id={tokenEditor.id} reference={tokenRow?.title} transport={transport}
      unavailable={tokenUnavailable} cancel={() => setTokenDraft(undefined)} saved={() => {
        setSuccess(tokenEditor.id ? "Token dicabut." : "Token dibuat.");
        if (!tokenEditor.id) {
          setSearch("");
          setFilters((previous) => ({ ...previous, search: "", page: "1" }));
        }
        setTokenDraft(undefined);
        retry();
      }} /> : null}
    {visibleSelection ? <CourseDialog title={tokenPage ? "Token pendaftaran" : visibleSelection.title} onClose={() => setSelected(undefined)}>
      {visibleSelection.academicEvent && data?.scheduleCourses && transport.command ? <Action label="Kelola agenda" onPress={() => {
        setSelected(undefined); setEventDraft({ transport, row: visibleSelection });
      }} /> : null}
      {tokenPage ? <Text selectable style={{ ...nativeTypography.bodyRegular, color: palette.foreground, fontSize: 16, lineHeight: 24 }}>{visibleSelection.title}</Text> : null}
      {visibleSelection.fields?.map((item) => <View key={item.label} style={layout.compact}>
        <Ink kind="strong">{item.label}</Ink><Ink>{item.value}</Ink>
      </View>)}
    </CourseDialog> : null}
  </AdministrationPage>;
}

export function AdministrationLiveScreen(props: LiveProps) {
  const route = matchAdministrationRoute(props.path);
  return <CourseTheme.Provider value={props.theme}>
    {props.actor.role !== "admin" || props.actor.id !== props.transport.accountId ? <AdministrationPage title={route?.title ?? "Administrasi akademik"} back={props.back}>
      <CourseStatus label="Akses admin diperlukan." error />
    </AdministrationPage> : route ? <LiveContent route={route} {...props} /> : <AdministrationPage title="Administrasi akademik" back={props.back}>
      <CourseStatus label="Halaman tidak ditemukan." error />
    </AdministrationPage>}
  </CourseTheme.Provider>;
}
