import { useEffect, useState, useContext } from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import {
  administrationReadPath, type LiveAdministrationRead, type LiveRow,
} from "../../../../../packages/native-parity/academic/administration/live";
import { matchAdministrationRoute, type AdministrationPattern } from "../../../../../packages/native-parity/academic/administration/routes";
import { NativeListRow, NativeStatusPanel } from "../../shared-ui";
import { PkaAnnouncementEditor } from "./pka-edit";
import { DiktatPdfControls, readDiktatScope } from "./diktat-controls";
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
  useEffect(() => {
    const controller = new AbortController();
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
  return {
    state: result?.transport === transport && result.path === path ? result.state : { status: "loading" } as const,
    retry: () => bump((current) => current + 1),
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
  const searchEnabled = pattern === "/admin/users" || pattern === "/admin/groups" || pattern === "/admin/tokens"
    || pattern === "/admin/tutorial-pka/registrations";
  const [search, setSearch] = useState(query.search ?? "");
  const [filters, setFilters] = useState({ ...query });
  const [selected, setSelected] = useState<LiveRow>();
  const [pdfRow, setPdfRow] = useState<LiveRow>();
  const [pkaDraft, setPkaDraft] = useState<{ actorTransport: AcademicTransport; row: LiveRow }>();
  const [success, setSuccess] = useState(false);
  const announcement = pkaDraft?.actorTransport === transport ? pkaDraft.row : undefined;
  const theme = useContext(CourseTheme);
  const palette = useCourseColors();
  const { width, fontScale } = useWindowDimensions();
  const article = pattern === "/admin/courses/[slug]/review/product/[bundleId]";
  const pdfPending = article && readDiktatScope(query, params.bundleId);
  const { state, retry } = useRead(transport, administrationReadPath(pattern, params, filters));
  const target = state.status === "ready" && state.data.type === "redirect" ? state.data.target : undefined;
  useEffect(() => { if (target) replace(target); }, [target, replace]);
  const page = Math.max(1, Number(filters.page) || 1);
  const week = Number(filters.week) || 0;
  const data = state.status === "ready" && state.data.type === "page" ? state.data : undefined;
  const pkaTab = pkaTabs.find(({ id }) => pattern.endsWith(`/tutorial-pka/${id}`))?.id;
  const scheduleTab = scheduleTabs.find((item) => item.id === filters.tab)?.id ?? "calendar";
  function filter(name: string, value: string) {
    setSelected(undefined);
    setSuccess(false);
    setFilters((previous) => ({ ...previous, [name]: value, ...(name === "page" ? {} : { page: "1" }) }));
  }
  const filtered = Boolean(filters.search || filters.status || filters.role);
  return <AdministrationPage title={title} back={back}>
    {pkaTab ? <Tabs options={pkaTabs} selected={pkaTab} onSelect={(id) => navigate(`/admin/tutorial-pka/${id}`)} /> : null}
    {pattern === "/admin/notifications" ? <Ink kind="heading">Riwayat notifikasi</Ink> : null}
    {searchEnabled ? <View style={layout.row}>
      <View style={layout.flex}><SearchBox label="Cari" value={search} onChange={setSearch} /></View>
      <Action label="Cari" onPress={() => filter("search", search.trim())} />
    </View> : null}
    {pattern === "/admin/users" ? <View style={layout.row}>
      <Picker label="Peran" options={usersRole} selected={filters.role ?? ""} onSelect={(id) => filter("role", id)} />
      <Picker label="Status" options={usersStatus} selected={filters.status ?? ""} onSelect={(id) => filter("status", id)} />
    </View> : null}
    {pattern === "/admin/groups" ? <View style={layout.row}>
      <Picker label="Status" options={groupsStatus} selected={filters.status ?? ""} onSelect={(id) => filter("status", id)} />
    </View> : null}
    {pattern === "/admin/tutorial-pka/announcements" ? <View style={layout.row}>
      <Action selected={filters.status !== "archived"} label="Aktif" onPress={() => filter("status", "")} />
      <Action selected={filters.status === "archived"} label="Arsip" onPress={() => filter("status", "archived")} />
    </View> : null}
    {pattern === "/admin/tutorial-pka/schedules" ? <View style={layout.row}>
      <Picker label="Periode" options={[{ id: "", label: "Semua sesi" }, { id: "upcoming", label: "Akan datang" }, { id: "past", label: "Riwayat" }]}
        selected={filters.status ?? ""} onSelect={(value) => filter("status", value)} />
    </View> : null}
    {pattern === "/admin/schedules" ? <>
      <Tabs options={scheduleTabs} selected={scheduleTab} onSelect={(id) => filter("tab", id)} />
      <View style={layout.row}>
        <Action label="Minggu sebelumnya" onPress={() => filter("week", String(week - 1))} disabled={week <= -520} />
        <Action label="Hari ini" onPress={() => filter("week", "0")} />
        <Action label="Minggu berikutnya" onPress={() => filter("week", String(week + 1))} disabled={week >= 520} />
      </View>
    </> : null}
    {state.status === "loading" ? <PendingCourses /> : null}
    {state.status === "denied" ? <NativeStatusPanel title="Akses admin diperlukan." message="Masuk kembali jika sesi berakhir." tone="error" theme={theme} /> : null}
    {state.status === "missing" ? <CourseStatus label="Halaman atau data tidak ditemukan." error /> : null}
    {state.status === "error" ? <NativeStatusPanel title="Data administrasi gagal dimuat." tone="error" theme={theme} action={{ id: "retry", label: "Coba lagi" }} onAction={retry} /> : null}
    {target ? <CourseStatus label="Membuka halaman tujuan…" /> : null}
    {success ? <View accessibilityLiveRegion="polite"><Ink>Pengumuman diperbarui.</Ink></View> : null}
    {data?.summary?.length ? <Metrics values={data.summary} /> : null}
    {data?.rows.length === 0 ? <RecordsEmpty label={emptyMessages[pattern] ?? "Belum ada item."} filtered={filtered} /> : null}
    {article && (data || pdfPending) ? <DiktatPdfControls {...props} authorized={data?.rows.flatMap((row) => row.pdf ? [row.pdf] : []) ?? []}
      target={pdfRow?.pdf} title={pdfRow?.title}
      closeConfirmation={() => setPdfRow(undefined)} refresh={retry} /> : null}
    {data?.rows.map((row) => <View key={row.id} style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.border }}>
      <NativeListRow theme={theme} layout={width >= 768 * fontScale ? "wide" : "compact"} title={row.title}
        subtitle={[row.subtitle, row.detail].filter(Boolean).join(" · ")}
        primary={row.fields?.length ? { onPress: () => setSelected(row) } : undefined}
        actions={row.pdf && transport.command && !pdfPending ? [{ id: "pdf", label: "Minta PDF" }] :
          row.announcementEdit && transport.command ? [{ id: "edit", label: "Edit pengumuman" }] : undefined}
        onAction={(id) => {
          if (id === "pdf") setPdfRow(row);
          else { setSuccess(false); setPkaDraft({ actorTransport: transport, row }); }
        }} />
    </View>)}
    {data && (page > 1 || data.nextPage) ? <View style={layout.row}>
      <Action label="Sebelumnya" onPress={() => filter("page", String(page - 1))} disabled={page <= 1} />
      <Ink kind="meta">{`Halaman ${page}`}</Ink>
      <Action label="Berikutnya" onPress={() => filter("page", String(page + 1))} disabled={!data.nextPage} />
    </View> : null}
    {announcement?.announcementEdit ? <PkaAnnouncementEditor id={announcement.id} initial={announcement.announcementEdit}
      transport={transport} cancel={() => { setPkaDraft(undefined); retry(); }}
      saved={() => { setPkaDraft(undefined); setSuccess(true); retry(); }} /> : null}
    {selected ? <CourseDialog title={selected.title} onClose={() => setSelected(undefined)}>
      {selected.fields?.map((item) => <View key={item.label} style={layout.compact}>
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
