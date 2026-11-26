import { useState } from "react";
import { View } from "react-native";
import { CUSTOM_DEFAULT_MEETINGS, CUSTOM_MEETING_STEP, CUSTOM_MIN_MEETINGS, DEFAULT_COURSES, DEFAULT_PERSONS, formatPlanPrice, getCustomPlanPriceQuote, getTutorFeeQuote } from "../../../../../lib/pricing-calculations";
import { ManagementFailure, type PricingData, type PricingDiscounts, type Voucher } from "../../../../../packages/native-parity/operations/management-contract";
import { Action, Choices, Confirm, Copy, Feedback, Field, Item, LoadState, Screen, Section, Sections, formatTimestamp, styles, useAction, useManagement, useRead, type Confirmation } from "./ui";

const tabs = [["student-pricing", "Harga paket murid"], ["tutor-fee", "Fee tutor"], ["vouchers", "Kelola voucher"], ["discounts", "Diskon komponen"]] as const;
const emptyVoucher = { code: "", discountPercent: "10", maxQuota: "10", expiresAt: "", description: "" };
const integer = (value: string) => /^\d+$/.test(value.trim()) && Number(value) > 0 && Number.isSafeInteger(Number(value)) ? Number(value) : null;

export function Pricing({ initialTab }: { initialTab?: string }) {
  const read = useRead("pricing", undefined);
  const [tab, setTab] = useState<typeof tabs[number][0]>(tabs.find(([key]) => key === initialTab)?.[0] ?? "student-pricing");
  return <Screen title="Paket dan harga">
    <Sections values={tabs} current={tab} onChange={setTab} />
    <LoadState {...read} retry={read.reload} />
    {read.data && (tab === "student-pricing" || tab === "tutor-fee") && <Calculator key={tab} role={tab === "student-pricing" ? "student" : "tutor"} data={read.data} />}
    {read.data && tab === "vouchers" && <Vouchers vouchers={read.data.vouchers} reload={read.reload} />}
    {read.data && tab === "discounts" && <Discounts value={read.data.discounts} reload={read.reload} />}
  </Screen>;
}

function Calculator({ role, data }: { role: "student" | "tutor"; data: PricingData }) {
  const [values, setValues] = useState({ meetings: String(CUSTOM_DEFAULT_MEETINGS), courses: String(DEFAULT_COURSES), persons: String(DEFAULT_PERSONS), custom: "" });
  const [voucherCode, setVoucherCode] = useState("");
  const edit = (key: keyof typeof values, value: string) => setValues({ ...values, [key]: value });
  const meetings = integer(values.meetings);
  const courses = integer(values.courses);
  const persons = integer(values.persons);
  const custom = values.custom.trim() ? integer(values.custom) : undefined;
  const now = new Date(data.now);
  const activeVouchers = data.vouchers.filter(item => item.isActive && item.usedCount < item.maxQuota && Date.parse(item.expiresAt) > now.getTime());
  const voucher = activeVouchers.find(item => item.code === voucherCode);
  const baseValid = meetings !== null && courses !== null && persons !== null;
  const validStudent = meetings !== null && meetings >= CUSTOM_MIN_MEETINGS && meetings % CUSTOM_MEETING_STEP === 0;
  const studentQuote = role === "student" && baseValid && validStudent ? getCustomPlanPriceQuote(meetings, persons, courses, voucher?.discountPercent, data.discounts, now) : undefined;
  const tutorQuote = role === "tutor" && baseValid && custom !== null ? getTutorFeeQuote(meetings, persons, courses, custom, data.discounts, now) : undefined;
  return <>
    <Section title={role === "student" ? "Konfigurasi paket kustom" : "Konfigurasi fee tutor"}>
      {role === "tutor" && <Choices values={[5, 10, 15, 30].map(value => [String(value), String(value)] as const)} current={values.meetings} onChange={next => edit("meetings", next)} />}
      <Field label="Pertemuan" keyboardType="number-pad" value={values.meetings} onChangeText={next => edit("meetings", next)} />
      {role === "student" && <Copy muted>Masukkan kelipatan 5, minimal 5 pertemuan.</Copy>}
      <Field label="Mata kuliah" keyboardType="number-pad" value={values.courses} onChangeText={next => edit("courses", next)} />
      <Field label="Jumlah anggota" keyboardType="number-pad" value={values.persons} onChangeText={next => edit("persons", next)} />
      {role === "tutor" ? <Field label="Harga paket kustom (opsional)" keyboardType="number-pad" value={values.custom} onChangeText={next => edit("custom", next)} /> : <>
        <Copy strong>Voucher</Copy><Choices values={[["", "Tanpa voucher"], ...activeVouchers.map(item => [item.code, item.code] as const)]} current={voucherCode} onChange={setVoucherCode} />
      </>}
    </Section>
    {!studentQuote && !tutorQuote && <Copy status="error">Periksa jumlah pertemuan, mata kuliah, anggota, atau harga yang dimasukkan.</Copy>}
    {studentQuote && <Section title="Estimasi harga paket">
      <Item title="Harga reguler" meta={formatPlanPrice(studentQuote.beforeDiscount)} />
      <Item title="Harga paket" meta={formatPlanPrice(studentQuote.afterDiscount)} />
      {studentQuote.voucherDiscountAmount !== undefined && <Item title="Diskon voucher" meta={formatPlanPrice(studentQuote.voucherDiscountAmount)} />}
      <Item title="Total per orang" meta={formatPlanPrice(studentQuote.finalPricePerPerson ?? studentQuote.afterDiscountPerPerson)} />
      <Item title="Total paket" meta={formatPlanPrice(studentQuote.finalPrice ?? studentQuote.afterDiscount)} />
    </Section>}
    {tutorQuote && <Section title="Estimasi fee tutor">
      <Item title="Biaya platform" meta={formatPlanPrice(tutorQuote.platformCost)} />
      {([["Harga saat ini", tutorQuote.introductory], ["Harga reguler", tutorQuote.regular], ["Harga paket kustom", tutorQuote.custom]] as const).map(([label, quote]) => quote && <Section key={label} title={label}>
        <Item title="Fee per sesi" meta={formatPlanPrice(quote.tutorFeePerMeeting)} />
        <Item title="Total paket" meta={formatPlanPrice(quote.packagePrice)} />
        <Item title="Alokasi tutorial" meta={formatPlanPrice(quote.tutorialPool)} />
        <Item title="Bagian tutor" meta={formatPlanPrice(quote.tutorFeeTotal)} />
        <Item title="Bagian pengelola" meta={formatPlanPrice(quote.managementFeeTotal)} />
      </Section>)}
    </Section>}
  </>;
}

function Vouchers({ vouchers, reload }: { vouchers: Voucher[]; reload: () => void }) {
  const { locale } = useManagement();
  const action = useAction();
  const [value, setValue] = useState<typeof emptyVoucher | null>(null);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const update = (key: keyof typeof emptyVoucher, next: string) => { if (value) setValue({ ...value, [key]: next }); };
  function submit() {
    if (!value) return;
    const { code, discountPercent, maxQuota, expiresAt, description } = value;
    const percent = integer(discountPercent);
    const quota = integer(maxQuota);
    const date = new Date(expiresAt);
    if (!code.trim() || percent === null || percent > 100 || quota === null || !Number.isFinite(date.getTime())) return action.setError(new ManagementFailure("invalid", "Periksa kode, diskon, kuota dan tanggal voucher."));
    void action.run({ type: "voucher.create", voucher: { code: code.trim().toUpperCase(), discountPercent: percent, maxQuota: quota, expiresAt: date.toISOString(), description } }, () => { setValue(null); reload(); });
  }
  return <>
    <View style={styles.row}><Action variant="default" onPress={() => setValue(emptyVoucher)}>Buat voucher</Action></View>
    <Feedback {...action} />
    {value && <Section title="Buat voucher">
      <Field label="Kode voucher" value={value.code} onChangeText={next => update("code", next)} autoCapitalize="characters" />
      <Field label="Diskon (%)" value={value.discountPercent} onChangeText={next => update("discountPercent", next)} keyboardType="number-pad" />
      <Field label="Kuota" value={value.maxQuota} onChangeText={next => update("maxQuota", next)} keyboardType="number-pad" />
      <Field label="Kedaluwarsa" value={value.expiresAt} onChangeText={next => update("expiresAt", next)} placeholder="2026-12-31T23:59:59+07:00" autoCapitalize="none" />
      <Field label="Deskripsi" value={value.description} onChangeText={next => update("description", next)} multiline />
      <View style={styles.row}><Action onPress={() => setValue(null)}>Batal</Action><Action variant="default" busy={action.busy} onPress={submit}>Simpan voucher</Action></View>
    </Section>}
    <Section title="Daftar voucher">
      {!vouchers.length && <Copy muted>Belum ada voucher.</Copy>}
      {vouchers.map(voucher => <Item key={voucher.id} title={voucher.code} meta={`${voucher.discountPercent}% · ${voucher.usedCount}/${voucher.maxQuota} · ${voucher.isActive ? "Aktif" : "Nonaktif"} · ${formatTimestamp(voucher.expiresAt, locale)}`} actions={<>
        <Action disabled={action.busy} onPress={() => action.run({ type: "voucher.toggle", id: voucher.id, isActive: !voucher.isActive }, reload)}>{voucher.isActive ? "Nonaktifkan" : "Aktifkan"}</Action>
        <Action variant="destructive" disabled={action.busy} onPress={() => setConfirm({ title: "Hapus voucher?", description: `Kode ${voucher.code} akan dihapus.`, label: "Hapus", danger: true, run: () => void action.run({ type: "voucher.delete", id: voucher.id }, reload, "Voucher dihapus.") })}>Hapus</Action>
      </>} />)}
    </Section>
    <Confirm value={confirm} onClose={() => setConfirm(null)} />
  </>;
}

function Discounts({ value, reload }: { value: PricingDiscounts; reload: () => void }) {
  const action = useAction();
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [discounts, setDiscounts] = useState(() => ({ platform: { ...value.platform, percent: String(value.platform.percent) }, tutorial: { ...value.tutorial, percent: String(value.tutorial.percent) } }));
  function submit() {
    const invalid = Object.values(discounts).some(item => !/^\d+$/.test(item.percent) || Number(item.percent) > 100 || !item.startsOn || !item.endsOn || item.startsOn > item.endsOn);
    if (invalid) return action.setError(new ManagementFailure("invalid", "Periksa persentase dan periode diskon."));
    setConfirm({ title: "Simpan diskon komponen?", description: "Perubahan memengaruhi harga publik selama periode yang dipilih.", label: "Simpan diskon", run: () => action.run({ type: "pricing.discounts", discounts: { platform: { ...discounts.platform, percent: Number(discounts.platform.percent) }, tutorial: { ...discounts.tutorial, percent: Number(discounts.tutorial.percent) } } }, reload) });
  }
  return <>
    <Feedback {...action} />
    {(["platform", "tutorial"] as const).map(component => <Section key={component} title={component === "platform" ? "Platform" : "Tutorial"}>
      {([["percent", "Diskon (%)"], ["startsOn", "Tanggal mulai"], ["endsOn", "Tanggal akhir"]] as const).map(([key, label]) => <Field key={key} label={label} value={discounts[component][key]} keyboardType={key === "percent" ? "number-pad" : "default"} onChangeText={next => setDiscounts({ ...discounts, [component]: { ...discounts[component], [key]: next } })} />)}
    </Section>)}
    <View style={styles.row}><Action variant="default" busy={action.busy} onPress={submit}>Simpan diskon</Action></View>
    <Confirm value={confirm} onClose={() => setConfirm(null)} />
  </>;
}
