import { useState } from "react";
import { View } from "react-native";
import type {
  ModelSetting, MonitoringActions, MonitoringReader, OpsProposals,
} from "../../../../../packages/native-parity/operations/monitoring-contract";
import { ActionRow, Body, Control, Dialog, List, Options, ReadState, Section, Stats, styles, useMonitoringRead, useMonitoringUi } from "./ui";
import { useMonitoringAction } from "./mutation";

type ActionProps = { reader: MonitoringReader; actions?: MonitoringActions };

export function OpsMonitorScreen({ reader, actions, navigate }: ActionProps & { navigate: (href: string) => void }) {
  const view = useMonitoringRead(reader, { view: "ops" }, 60_000);
  const { t, date } = useMonitoringUi();
  const data = view.data;
  const links = [
    { label: t("Analitik web", "Web Analytics"), path: "/admin/ops/web-analytics", icon: "web-analytics" },
    { label: t("Analitik Zyra", "Zyra analytics"), path: "/admin/ops/analytics", icon: "ai-analytics" },
    { label: t("Penggunaan fitur", "Feature usage"), path: "/admin/ops/feature-usage", icon: "feature-usage" },
    { label: t("Aktivitas tutor", "Tutor activity"), path: "/admin/ops/tutor-activity", icon: "tutor-activity" },
  ];
  return <>
    <View style={styles.actions}><Control label={t("Muat ulang", "Reload")} busy={view.refreshing} onPress={view.reload} /></View>
    {view.error || view.loading ? <ReadState {...view} retry={view.reload} /> : data && <>
      <Body muted>{`${data.jobFailures24h || data.syncQueueDepth > 100 ? t("Menurun", "Degraded") : t("Sehat", "Healthy")} · ${date(data.checkedAt)}`}</Body>
      <Stats items={[
        { label: t("Kegagalan job (24 jam)", "Job failures (24 hours)"), value: data.jobFailures24h },
        { label: t("Antrean sinkronisasi vektor", "Vector sync queue"), value: data.syncQueueDepth },
      ]} />
      <Section title={t("Kesehatan job", "Job health")}>
        <List>
          {([
            [t("Rekomendasi harian", "Daily recommendations"), data.jobHealth.recommendationsLastAt],
            [t("Snapshot analitik kursus", "Course analytics snapshots"), data.jobHealth.snapshotsLastAt],
            [t("Jalur belajar", "Study paths"), data.jobHealth.pathsLastAt],
          ] as const).map(([label, lastAt]) => <ActionRow key={label} label={label} value={lastAt ? date(lastAt) : t("Belum berjalan", "Never run")} />)}
        </List>
      </Section>
    </>}
    <Section title={t("Akses cepat pemantauan", "Monitoring shortcuts")}>
      <List>{links.map(link => <ActionRow key={link.path} label={link.label} icon={link.icon} onPress={() => navigate(link.path)} />)}</List>
    </Section>
    <ZyraOpsSection reader={reader} />
    <ProposalsSection reader={reader} actions={actions} />
  </>;
}

function ZyraOpsSection({ reader }: { reader: MonitoringReader }) {
  const view = useMonitoringRead(reader, { view: "zyra" });
  const { t, n } = useMonitoringUi();
  const data = view.data;
  return <Section title={t("Operasional Zyra", "Zyra operations")}>
    <View style={styles.actions}><Control label={t("Muat ulang", "Reload")} busy={view.refreshing} onPress={view.reload} /></View>
    {view.loading || view.error ? <ReadState {...view} retry={view.reload} /> : data && <>
      <Section title={t("Peringatan", "Alerts")}>
        {data.alerts.length ? <List>{data.alerts.map(alert =>
          <ActionRow key={alert.dedupKey} label={alert.code} value={alert.severity}
            detail={[alert.rollbackFlag, alert.runbook].filter(Boolean).join(" · ")} />)}</List> :
          <Body muted>{t("Tidak ada peringatan aktif.", "No active alerts.")}</Body>}
      </Section>
      {!!data.stageOutcomes?.length && <Section title={t("Hasil generasi hari ini (WIB)", "Generation results today (WIB)")}>
        <List>{data.stageOutcomes.map(row => <ActionRow key={`${row.stage}:${row.model}`} label={`${row.stage} · ${row.model}`}
          detail={t(`${n(row.failed)} gagal dari ${n(row.total)} · p95 ${n(row.p95Ms)} ms`, `${n(row.failed)} failed of ${n(row.total)} · p95 ${n(row.p95Ms)} ms`)} />)}</List>
      </Section>}
      <Stats items={[
        { label: t("Berhasil setelah kegagalan provider", "Recovered after provider failure"), value: data.events.find(event => event.eventType === "provider_attempt" && event.resultCode === "PROVIDER_FALLBACK_SUCCESS")?.count ?? 0 },
        { label: t("Permintaan provider", "Provider requests"), value: data.ledger.committedProviderTurns },
        { label: t("Reservasi aktif", "Active reservations"), value: data.ledger.activeReservations },
        { label: t("Dihemat oleh cache", "Saved by cache"), value: data.ledger.cacheSavedTurns },
        { label: t("Kegagalan gambar", "Image failures"), value: data.image.failed },
      ]} />
      <Body small muted>{t("Penggunaan di luar Zyx tidak diketahui.", "Usage outside Zyx is unknown.")}</Body>
      <Body small muted>{t(`${data.projectSlots.length} slot proyek · ${data.traces.validationViolations} pelanggaran validasi`, `${data.projectSlots.length} project slots · ${data.traces.validationViolations} validation violations`)}</Body>
      <Section title={t("Kapasitas provider", "Provider capacity")}>
        {data.capacity.modelPools.length ? <List>{data.capacity.modelPools.map(pool =>
          <ActionRow key={pool.model} label={pool.model}
            detail={t(
              `Per proyek ${pool.configuredPerProjectRpd ?? "-"} · Batas ${pool.configuredUsableRpd ?? "-"} · Terpakai ${pool.zyxCommittedRequests} · Aktif ${pool.activeReservations} · Reservasi ${pool.safetyReserveRpd ?? "-"}`,
              `Per project ${pool.configuredPerProjectRpd ?? "-"} · Ceiling ${pool.configuredUsableRpd ?? "-"} · Used ${pool.zyxCommittedRequests} · Active ${pool.activeReservations} · Reserve ${pool.safetyReserveRpd ?? "-"}`)}
            value={pool.usableRemainingRpd === null ? "-" : n(pool.usableRemainingRpd)} />)}</List> :
          <Body muted>{t("Data kapasitas provider belum tersedia.", "Provider capacity data is unavailable.")}</Body>}
      </Section>
    </>}
  </Section>;
}

function ProposalsSection({ reader, actions }: ActionProps) {
  const view = useMonitoringRead(reader, { view: "proposals" });
  const mutation = useMonitoringAction();
  const [target, setTarget] = useState<{ proposal: OpsProposals["proposals"][number]; action: "review" | "confirm" }>();
  const { t } = useMonitoringUi();
  return <Section title={t("Proposal Zyra", "Zyra proposals")}>
    {actions?.createProposal && <View style={styles.actions}>
      <Control label={t("Buat proposal laporan", "Create report proposal")} busy={mutation.busy}
        onPress={() => { void mutation.run(actions.createProposal!, view.reload); }} />
    </View>}
    <ReadState error={mutation.error} />
    {view.error || view.loading ? <ReadState {...view} retry={view.reload} /> : view.data?.proposals.length ?
      <List>{view.data.proposals.map(proposal => {
        const action = proposal.status === "validated" ? "review" : proposal.status === "reviewed" ? "confirm" : null;
        return <ActionRow key={proposal.id} label={proposal.proposalType} value={proposal.status}
          detail={`${proposal.diffHash.slice(0, 12)} · v${proposal.preconditionVersion}`}
          onPress={actions?.transitionProposal && action ? () => setTarget({ proposal, action }) : undefined} />;
      })}</List> :
      <Body muted>{t("Belum ada proposal.", "No proposals yet.")}</Body>}
    {target && <Dialog title={target.action === "review" ? t("Tinjau proposal", "Review proposal") : t("Konfirmasi proposal", "Confirm proposal")}
      visible onClose={() => setTarget(undefined)}>
      <Body>{`${target.proposal.proposalType} · v${target.proposal.preconditionVersion}`}</Body>
      <Control primary label={t("Lanjutkan", "Continue")} busy={mutation.busy} onPress={() => {
        const { id, preconditionVersion } = target.proposal;
        void mutation.run(() => actions!.transitionProposal!({ id, preconditionVersion, action: target.action }), () => {
          setTarget(undefined);
          view.reload();
        });
      }} />
    </Dialog>}
  </Section>;
}

export function KeyDiagnosticsScreen({ reader }: { reader: MonitoringReader }) {
  const view = useMonitoringRead(reader, { view: "keys" }, 30_000);
  const { t, n, date } = useMonitoringUi();
  const data = view.data;
  const entries = data?.geminiKeys ?? [];
  const keys = [...new Set(entries.map(entry => entry.keyId))]
    .sort().map(id => ({ id, items: entries.filter(entry => entry.keyId === id) }))
    .map(group => ({ ...group, healthy: !group.items.some(item => item.circuitState === "OPEN") }))
    .sort((first, second) => Number(first.healthy) - Number(second.healthy));
  return <>
    <View style={styles.actions}><Control label={t("Muat ulang", "Reload")} busy={view.refreshing} onPress={view.reload} /></View>
    {view.error || view.loading ? <ReadState {...view} retry={view.reload} /> : data && <>
      <Body muted>{t(`Diperiksa ${date(data.checkedAt)} · ${n(Number(data.totalRequestsToday))} permintaan hari ini`,
        `Checked ${date(data.checkedAt)} · ${n(Number(data.totalRequestsToday))} requests today`)}</Body>
      {data.compatible?.map(profile => <Section key={profile.model} title={profile.model}>
        <List>{profile.keys.map((key, index) => <ActionRow key={`${key.label}:${index}`} label={key.label}
          value={key.cooldownUntil > Date.parse(data.checkedAt) ? t("Autentikasi ditolak", "Authentication rejected") : t("Siap digunakan", "Ready for dispatch")} />)}</List>
      </Section>)}
      {keys.map(({ id, items, healthy }) => <Section key={id} title={id}>
        <Body muted>{healthy ? t("Sehat", "Healthy") : t("Menurun", "Degraded")}</Body>
        <List>{items.map(item => <ActionRow key={item.modelId} label={item.modelId} value={item.circuitState}
          detail={[
            t(`${n(item.requestsToday)} permintaan hari ini`, `${n(item.requestsToday)} requests today`),
            t(`Berhasil/gagal: ${n(item.successes)}/${n(item.failures)}`, `Success/failure: ${n(item.successes)}/${n(item.failures)}`),
            t(`Aktif: ${n(item.activeRequestsCount)}`, `Active: ${n(item.activeRequestsCount)}`),
            item.cooldownRemainingMs ? t(`Jeda: ${n(item.cooldownRemainingMs / 1000)} dtk`, `Cooldown: ${n(item.cooldownRemainingMs / 1000)} s`) : null,
          ].filter(Boolean).join(" · ")} />)}</List>
      </Section>)}
      {!keys.length && !data.compatible?.length && <Body muted>{t("Belum ada diagnostik kunci.", "No key diagnostics yet.")}</Body>}
    </>}
  </>;
}

export function ModelsScreen({ reader, actions }: ActionProps) {
  const view = useMonitoringRead(reader, { view: "models" });
  const { t, date } = useMonitoringUi();
  const mutation = useMonitoringAction();
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<ModelSetting>();
  const [notice, setNotice] = useState(false);
  const choices = [
    { value: "all", label: t("Fitur", "Features") },
    { value: "zyra", label: "Zyra" },
    { value: "admin-ops-ai", label: "Ops AI" },
    { value: "embedding", label: "Embedding" },
  ];
  const models = (view.data ?? []).filter(item => filter === "all"
    || (filter === "zyra" ? item.feature.startsWith("zyra") : item.feature.includes(filter)));
  return <>
    {actions?.measureModelLatency && <View style={styles.actions}>
      <Control label={t("Uji latensi", "Measure latency")} busy={mutation.busy} onPress={async () => {
        setNotice(false);
        setNotice(await mutation.run(actions.measureModelLatency!, view.reload));
      }} />
    </View>}
    {notice && <View accessibilityLiveRegion="polite"><Body>{t("Pengukuran latensi dijadwalkan.", "Latency measurement scheduled.")}</Body></View>}
    <ReadState error={mutation.error} />
    <View style={styles.actions}>
      {choices.map(item => <Control key={item.value} label={item.label} selected={filter === item.value} onPress={() => setFilter(item.value)} />)}
    </View>
    {view.loading || view.error ? <ReadState {...view} retry={view.reload} /> : models.length ? <List>
      {models.map(model => <ActionRow key={model.feature} label={model.label}
        detail={model.models.map(value => model.modelLabels?.[value] ?? value).join(" · ")}
        value={model.isCustom && model.updatedAt ? date(model.updatedAt, true) : undefined}
        onPress={() => setEditing(model)} />)}
    </List> : <Body muted>{t("Belum ada konfigurasi model untuk filter ini.", "No model settings match this filter.")}</Body>}
    {editing && <ModelEditor key={editing.feature} model={editing} actions={actions}
      onClose={() => setEditing(undefined)} reload={() => { setEditing(undefined); view.reload(); }} />}
  </>;
}

function ModelEditor({ model, actions, onClose, reload }: {
  model: ModelSetting; actions?: MonitoringActions; onClose: () => void; reload: () => void;
}) {
  const { t } = useMonitoringUi();
  const [draft, setDraft] = useState<[string, string, string]>([...model.models]);
  const [confirm, setConfirm] = useState<"save" | "reset">();
  const mutation = useMonitoringAction();
  const conflict = (mutation.error as { status?: number } | undefined)?.status === 409;
  const busy = mutation.busy || conflict;
  const label = (index: number) => index === 0 ? t("Model utama", "Primary model") : t(`Cadangan ${index}`, `Fallback ${index}`);
  const name = (id: string) => model.modelLabels?.[id] ?? id;
  const policyInput = { feature: model.feature, expectedUpdatedAt: model.updatedAt };
  return <Dialog title={model.label} visible onClose={onClose}>
    <Body muted>{model.description}</Body>
    {([0, 1, 2] as const).map(index => actions?.saveModel
      ? <Options key={index} label={label(index)} value={draft[index]}
          items={[...new Set([draft[index], ...model.selectableModels])].filter(id => !draft.some((slot, other) => id === slot && other !== index))
            .map(value => ({ value, label: name(value) }))}
          onSelect={value => setDraft(previous => previous.map((id, position) => position === index ? value : id) as [string, string, string])} />
      : <ActionRow key={index} label={label(index)} detail={name(draft[index])} />)}
    <ReadState error={mutation.error}
      message={conflict ? t("Konfigurasi berubah. Muat versi terbaru.", "Settings changed. Reload the latest version.") : undefined}
      retry={conflict ? reload : undefined} />
    {confirm && <View accessibilityRole="alert" style={styles.section}>
      <Body>{confirm === "save" ? t("Simpan urutan model ini?", "Save this model order?") : t("Kembalikan model bawaan?", "Restore model defaults?")}</Body>
      <View style={styles.actions}>
        <Control primary label={t("Konfirmasi", "Confirm")} busy={mutation.busy} disabled={conflict} onPress={async () => {
          const action = confirm === "save" ? () => actions!.saveModel!({ ...policyInput, models: draft }) : () => actions!.resetModel!(policyInput);
          setConfirm(undefined);
          if (await mutation.run(action)) reload();
        }} />
        <Control label={t("Batal", "Cancel")} onPress={() => setConfirm(undefined)} />
      </View>
    </View>}
    {!confirm && <View style={styles.actions}>
      {actions?.saveModel && <Control primary label={t("Simpan", "Save")} onPress={() => setConfirm("save")}
        disabled={busy || draft.every((id, index) => id === model.models[index])} />}
      {actions?.resetModel && model.isCustom && <Control label={t("Kembalikan bawaan", "Restore defaults")}
        onPress={() => setConfirm("reset")} disabled={busy} />}
    </View>}
  </Dialog>;
}
