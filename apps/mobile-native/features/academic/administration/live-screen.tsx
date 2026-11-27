import { useCallback, useEffect, useRef, useState, useContext } from "react";
import { Text, View, StyleSheet, useWindowDimensions } from "react-native";
import {
  administrationReadPath, type LiveAdministrationRead, type LiveRow,
} from "../../../../../packages/native-parity/academic/administration/live";
import { matchAdministrationRoute, type AdministrationPattern } from "../../../../../packages/native-parity/academic/administration/routes";
import { nativeTypography } from "../../../typography";
import { NativeListRow, NativeStatusPanel, ResponsiveTable, type SharedUiAction, type SharedUiActionHandler } from "../../shared-ui";
import { ProductReviewWorkspace } from "./product-review-workspace";
import { adminNotificationField } from "../../../../../packages/academic/admin-notification-history";
import { BroadcastComposer } from "./broadcast-composer";
import { ScheduleMeet } from "./schedule-meet";
import { ScheduleEventEditor } from "./schedule-event-editor";
import { AdminTutorialEditor, type TutorialTarget } from "./tutorial-operations-editor";
import { pendingTutorialOperation } from "./tutorial-operations-client";
import { AdministrationCalendar } from "./calendar";
import { LiveEnrollmentTokenEditor } from "./enrollment-token-editor";
import type { EnrollmentTokenUnavailable } from "./enrollment-token-client";
import { LiveStudyGroupEditor } from "./study-group-editor";
import { StudyGroupMembersEditor } from "./study-group-members-editor";
import { StudyGroupTokens } from "./study-group-tokens";
import { CopyActivationToken, GroupDeletionControl } from "./group-deletion";
import { PkaBrowserLink, PkaRegistrationExport, RegistrationProof } from "./pka-registrations";
import { PkaAnnouncementEditor } from "./pka-edit";
import { clearPkaLifecycle, PkaLifecycleDialog, recoverPkaLifecycle, type PkaLifecycleTarget } from "./pka-lifecycle";
import { clearPkaScheduleRecovery, PkaScheduleEditor } from "./pka-schedule-editor";
import { UserRolesEditor } from "./user-roles-editor";
import { UserStatusEditor } from "./user-status-editor";
import { DiktatPdfControls, readDiktatScope } from "./diktat-controls";
import { IdeaReviewEditor } from "./idea-review-editor";
import { IdeaBundleWorkspace } from "./idea-bundle-workspace";
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
const pkaDeliveryLabels = {
  queued: "Pengiriman dalam antrean", running: "Sedang mengirim", succeeded: "Pengiriman selesai",
  partial: "Sebagian pengiriman gagal", failed: "Pengiriman gagal", unknown: "Hasil pengiriman belum diketahui",
} as const;
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
  const [ideaBundleEditor, setIdeaBundleEditor] = useState<{ transport: AcademicTransport; id: string; slug: string }>();
  const [productEditor, setProductEditor] = useState<{ transport: AcademicTransport; id: string }>();
  const tokenPage = pattern === "/admin/tokens";
  const pkaSchedulePage = pattern === "/admin/tutorial-pka/schedules";
  const pkaAnnouncementPage = pattern === "/admin/tutorial-pka/announcements";
  const searchEnabled = pattern === "/admin/users" || pattern === "/admin/groups" || tokenPage
    || pattern === "/admin/tutorial-pka/registrations";
  const [search, setSearch] = useState(query.search ?? "");
  const [filters, setFilters] = useState({ ...query });
  const [selection, setSelection] = useState<{ transport: AcademicTransport; pattern: AdministrationPattern; row: LiveRow }>();
  const selected = selection?.transport === transport && selection.pattern === pattern ? selection.row : undefined;
  const setSelected = useCallback((row?: LiveRow) => {
    setSelection(row ? { transport, pattern, row } : undefined);
  }, [transport, pattern]);
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
  const [tutorialEditor, setTutorialEditor] = useState<{ transport: AcademicTransport; target: TutorialTarget }>();
  const tutorialTarget = tutorialEditor?.transport === transport ? tutorialEditor.target : undefined;
  const showTutorial = (target: TutorialTarget) => {
    setSelected(undefined);
    setSuccess("");
    setTutorialEditor({ transport, target });
  };
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
  const scheduleTutorials = pattern === "/admin/schedules" ? data?.scheduleTutorials : undefined;
  const tutorialPending = scheduleTutorials ? pendingTutorialOperation(transport) : undefined;
  const selectedTutorialSlot = selected ? scheduleTutorials?.slots.find(slot => slot.id === selected.id) : undefined;

  const recoveredPka = data ? recoverPkaLifecycle(transport) : undefined;
  const canRecoverPka = Boolean(recoveredPka && (pkaAnnouncementPage
    ? recoveredPka.attempt.command.action === "announcement-state" || recoveredPka.attempt.command.action === "send-announcement"
    : pkaSchedulePage && (recoveredPka.attempt.command.action === "create-schedule" || recoveredPka.attempt.command.action === "delete-schedule")));
  const deliveryPending = data?.rows.some(row => row.pkaDelivery === "queued" || row.pkaDelivery === "running" || row.pkaDelivery === "unknown");
  const startPkaLifecycle = (target: PkaLifecycleTarget) => {
    setSuccess("");
    setPkaLifecycle({ actorTransport: transport, target });
  };
  const tokenRow = tokenEditor?.id ? data?.rows.find((row) => row.id === tokenEditor.id) : undefined;
  const pkaSchedule = pkaSchedulePage && pkaScheduleDraft?.actorTransport === transport
    ? data?.rows.find((row) => row.id === pkaScheduleDraft.id) : undefined;
  const visibleSelection = (tokenPage || pkaSchedulePage || ideaReviewPage || pattern === "/admin/tutorial-pka/registrations" || pattern === "/admin/groups") && selected
    ? data?.rows.find((row) => row.id === selected.id) : selected;
  const tokenAccessEnded = tokenPage && (state.status === "denied" || state.status === "missing");
  const clearTokenContext = useCallback(() => {
    setSelected(undefined);
    setTokenDraft(undefined);
    setSuccess("");
    setSearch("");
  }, [setSelected]);
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
  }, [setSelected]);
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
  }, [pkaRoleEnded, setSelected, transport]);
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
  if (ideaReviewPage && data?.ideaBundle && ideaBundleEditor?.transport === transport && ideaBundleEditor.id === params.bundleId && ideaBundleEditor.slug === params.slug) {
    const close = () => setIdeaBundleEditor(undefined);
    return <IdeaBundleWorkspace key={data.ideaBundle.checksum} scope={data.ideaBundle} slug={params.slug} transport={transport}
      back={() => { close(); retry(); }}
      reload={() => { close(); setSelected(undefined); retry(); }}
      listing={() => replace(`/admin/courses/${encodeURIComponent(params.slug)}/review?tab=idea`)}
      unavailable={status => { close(); setSelected(undefined); invalidate(status); }} />;
  }
  if (article && data?.productBundle && !pdfPending && productEditor?.transport === transport && productEditor.id === params.bundleId) {
    return <ProductReviewWorkspace key={params.bundleId} scope={data.productBundle} transport={transport} back={() => setProductEditor(undefined)}
      exit={() => { setProductEditor(undefined); retry(); }} listing={() => replace("/admin/materials/review?section=product")} />;
  }
  return <AdministrationPage title={title} back={back}>
    {ideaReviewPage && data?.ideaBundle ? <Action label="Kelola Idea Bundle" onPress={() => setIdeaBundleEditor({ transport, id: params.bundleId, slug: params.slug })} /> : null}
    {article && data?.productBundle && !pdfPending && transport.command ? <Action label="Review dan publikasi" onPress={() => setProductEditor({ transport, id: params.bundleId })} /> : null}
    {pkaTab ? <Tabs options={pkaTabs} selected={pkaTab} onSelect={(id) => navigate(`/admin/tutorial-pka/${id}`)} /> : null}
    {pattern === "/admin/schedules" && data?.scheduleCourses && transport.command ? <View style={layout.row}>
      <ScheduleMeet transport={transport} refresh={retry} />
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
    {pkaTab === "registrations" && data && <PkaRegistrationExport key={filters.search ?? ""} transport={transport} search={filters.search ?? ""} count={data.rows.length} />}
    {pkaAnnouncementPage ? <View style={layout.row}>
      <Action selected={filters.status !== "archived"} label="Aktif" onPress={() => filter("status", "")} />
      <Action selected={filters.status === "archived"} label="Arsip" onPress={() => filter("status", "archived")} />
      {data && transport.command ? canRecoverPka && recoveredPka
        ? <Action label="Periksa perubahan pengumuman" onPress={() => startPkaLifecycle(recoveredPka.target)} />
        : <Action label="Buat pengumuman PKA" variation="default" testID="academic-live-pka-send" disabled={Boolean(recoveredPka)}
          onPress={() => startPkaLifecycle({ action: "send-announcement" })} /> : null}
      {deliveryPending ? <Action label="Periksa pengiriman" onPress={retry} /> : null}
    </View> : null}
    {pkaSchedulePage ? <View style={layout.row}>
      <Picker label="Periode" options={[{ id: "", label: "Semua sesi" }, { id: "upcoming", label: "Akan datang" }, { id: "past", label: "Riwayat" }]}
        selected={filters.status ?? ""} onSelect={(value) => filter("status", value)} />
      {data && transport.command ? canRecoverPka && recoveredPka
        ? <Action label="Periksa perubahan jadwal" onPress={() => startPkaLifecycle(recoveredPka.target)} />
        : <Action label="Buat jadwal PKA" variation="default" testID="academic-live-pka-create" disabled={Boolean(recoveredPka)}
          onPress={() => startPkaLifecycle({ action: "create-schedule" })} /> : null}
      {deliveryPending ? <Action label="Periksa pengiriman" onPress={retry} /> : null}
    </View> : null}
    {pattern === "/admin/schedules" ? <Tabs options={scheduleTabs} selected={scheduleTab} onSelect={(id) => filter("tab", id)} /> : null}
    {scheduleTutorials && transport.command ? <View style={layout.row}>
      {tutorialPending
        ? <Action label="Periksa perubahan tutorial" onPress={() => showTutorial({ kind: "recover" })} />
        : data?.week ? <Action label="Tambah ketersediaan" onPress={() => showTutorial({ kind: "create-availability" })} testID="admin-schedule-create-availability" /> : null}
    </View> : null}
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
    {article && (data || pdfPending) ? <DiktatPdfControls {...props} courseId={data?.productBundle?.courseId} authorized={data?.rows.flatMap((row) => row.pdf ? [row.pdf] : []) ?? []}
      target={pdfRow?.pdf} title={pdfRow?.title}
      closeConfirmation={() => setPdfRow(undefined)} refresh={retry} /> : null}
    {data && pattern === "/admin/notifications" ? <ResponsiveTable rows={data.rows} theme={theme}
      getRowKey={(row) => row.id} empty={<RecordsEmpty label="Belum ada riwayat notifikasi." />}
      columns={[
        { id: "title", label: "Notifikasi", weight: 3, renderCell: (row) => <NativeListRow title={row.title} subtitle={row.detail}
          theme={theme} layout="compact" primary={{ onPress: () => setSelected(row) }} /> },
        { id: "recipient", label: "Penerima", weight: 2, renderCell: (row) => row.subtitle ?? "Belum tersedia" },
        { id: "type", label: adminNotificationField.type, renderCell: (row) => row.fields?.find(field => field.label === adminNotificationField.type)?.value ?? "Belum tersedia" },
        { id: "read", label: adminNotificationField.read, renderCell: (row) => row.fields?.find(field => field.label === adminNotificationField.read)?.value ?? "Belum tersedia" },
        { id: "delivery", label: adminNotificationField.delivery, weight: 2, renderCell: (row) => {
          const delivery = row.fields?.find(field => field.label === adminNotificationField.delivery)?.value;
          const attempted = row.fields?.find(field => field.label === "Percobaan")?.value ?? "0";
          const succeeded = row.fields?.find(field => field.label === "Berhasil")?.value ?? "0";
          return delivery ? (attempted === "0" ? delivery : `${delivery} · ${succeeded}/${attempted}`) : "Belum tersedia";
        } },
      ]} /> : !data?.week ? data?.rows.map((row) => {
      type ActionId = "pdf" | "review-idea" | "edit" | "edit-pka-schedule" | "edit-group" | "group-members" | "revoke-token" | "user-status" | "user-roles"
        | "pka-pin" | "pka-archive" | "pka-delete" | "tutorial-qualifications";
      const actions: SharedUiAction<ActionId>[] = [];
      const scheduleTutor = scheduleTab === "tutors" ? scheduleTutorials?.tutors.find(tutor => tutor.id === row.id) : undefined;
      if (scheduleTutor && transport.command && !tutorialPending) actions.push({ id: "tutorial-qualifications", label: "Edit kualifikasi" });

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
        if (id === "tutorial-qualifications" && scheduleTutor) { showTutorial({ kind: "qualifications", tutor: scheduleTutor }); return; }

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
          subtitle={[row.subtitle, row.detail, row.pkaDelivery && pkaDeliveryLabels[row.pkaDelivery]].filter(Boolean).join(" · ")}
          primary={row.fields?.length ? { onPress: () => setSelected(row) } : undefined}
          actions={actions} onAction={onAction} />
      </View>;
    }) : null}
    {data && idea ? <IdeaReviewEditor key={idea.id} slug={idea.slug} importId={idea.importId} ideaId={idea.id} transport={transport} expectedRevision={data.ideaBundle?.checksum}
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
      saved={(delivery) => {
        setPkaScheduleDraft(undefined);
        setSuccess(delivery ? "Jadwal diperbarui. Pengiriman dalam antrean." : "Jadwal diperbarui.");
        retry();
      }} /> : null}
    {data && pkaLifecycle?.actorTransport === transport ? <PkaLifecycleDialog target={pkaLifecycle.target} transport={transport}
      recovery={recoveredPka?.target === pkaLifecycle.target ? recoveredPka : undefined}
      close={() => setPkaLifecycle(undefined)}
      reload={() => { setPkaLifecycle(undefined); setSelected(undefined); retry(); }}
      denied={() => { clearPkaLifecycle(transport); setPkaLifecycle(undefined); setSelected(undefined); invalidate("denied"); }}
      saved={(action, delivery) => {
        setPkaLifecycle(undefined);
        setSelected(undefined);
        if (action === "create-schedule" && filters.status === (delivery ? "past" : "upcoming")) filter("status", delivery ? "upcoming" : "past");
        if (action === "send-announcement" && filters.status === "archived") filter("status", "");
        setSuccess(delivery ? "Pengiriman dalam antrean." : action === "delete-schedule" ? "Jadwal dihapus."
          : action === "create-schedule" ? "Jadwal tersimpan." : "Pengumuman diperbarui.");
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
    {scheduleTutorials && tutorialTarget ? <AdminTutorialEditor target={tutorialTarget} data={scheduleTutorials} transport={transport}
      close={() => setTutorialEditor(undefined)}
      refresh={() => { setTutorialEditor(undefined); retry(); }}
      denied={() => { setTutorialEditor(undefined); invalidate("denied"); }}
      saved={(action) => {
        setTutorialEditor(undefined);
        setSuccess(action === "create-availability" ? "Ketersediaan tersimpan." : action === "delete-availability" ? "Ketersediaan dihapus."
          : action === "qualifications" ? "Kualifikasi tutor diperbarui." : action === "assign" ? "Sesi ditugaskan."
          : action === "move" ? "Sesi dipindahkan." : "Sesi dibatalkan.");
        retry();
      }} /> : null}
    {visibleSelection ? <CourseDialog title={tokenPage ? "Token pendaftaran" : visibleSelection.title} onClose={() => setSelected(undefined)}>
      {(pkaTab === "registrations" || pkaTab === "schedules") && <PkaBrowserLink key={visibleSelection.id} row={visibleSelection} transport={transport} />}
      {pkaTab === "registrations" && <RegistrationProof key={visibleSelection.id} row={visibleSelection} transport={transport} />}
      {visibleSelection.academicEvent && data?.scheduleCourses && transport.command ? <Action label="Kelola agenda" onPress={() => {
        setSelected(undefined); setEventDraft({ transport, row: visibleSelection });
      }} /> : null}
      {selectedTutorialSlot && transport.command && !tutorialPending
        ? <TutorialSlotActions slot={selectedTutorialSlot} activate={showTutorial} /> : null}
      {tokenPage ? <Text selectable style={{ ...nativeTypography.bodyRegular, color: palette.foreground, fontSize: 16, lineHeight: 24 }}>{visibleSelection.title}</Text> : null}
      {tokenPage ? <CopyActivationToken key={visibleSelection.id} value={visibleSelection.title} locale={transport.locale} /> : null}
      {visibleSelection.fields?.map((item) => <View key={item.label} style={layout.compact}>
        <Ink kind="strong">{item.label}</Ink><Ink>{item.value}</Ink>
      </View>)}
      {pattern === "/admin/groups" ? <StudyGroupTokens key={visibleSelection.id} id={visibleSelection.id} transport={transport}
        denied={() => { setSelected(undefined); invalidate("denied"); }} /> : null}
      {data && (tokenPage || pattern === "/admin/groups") ? <GroupDeletionControl
        key={JSON.stringify([tokenPage, visibleSelection.id])} transport={transport}
        target={{ kind: tokenPage ? "token" : "group", id: visibleSelection.id }} deleted={() => {
          setSelected(undefined);
          setSuccess(tokenPage ? "Token dan kelompok dihapus." : "Kelompok dihapus.");
          retry();
        }} /> : null}
    </CourseDialog> : null}
  </AdministrationPage>;
}

function TutorialSlotActions({ slot, activate }: {
  slot: NonNullable<Extract<LiveAdministrationRead, { type: "page" }>["scheduleTutorials"]>["slots"][number];
  activate(target: TutorialTarget): void;
}) {
  const { booking } = slot;
  if (booking && (booking.status === "scheduled" || booking.status === "rescheduled")) {
    return <View style={layout.row}>
      <Action label="Pindahkan sesi" onPress={() => activate({ kind: "move", slot, booking })} />
      <Action label="Batalkan sesi" variation="destructive" onPress={() => activate({ kind: "cancel", slot, booking })} />
    </View>;
  }
  if (booking) return null;
  return <View style={layout.row}>
    <Action label="Tugaskan sesi" onPress={() => activate({ kind: "assign", slot })} />
    {slot.deletable ? <Action label="Hapus ketersediaan" variation="destructive"
      onPress={() => activate({ kind: "delete-availability", slot })} /> : null}
  </View>;
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
