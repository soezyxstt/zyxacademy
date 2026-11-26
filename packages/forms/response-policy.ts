type FormResponseSettings = {
  acceptingResponses?: boolean;
  openAt?: string;
  closeAt?: string;
  closedMessage?: string;
  requireLogin?: boolean;
  collectEmail?: "none" | "input" | "verified";
};

type Respondent = { email: string; emailVerified: boolean };

export type FormClosure =
  | { kind: "closed"; message?: string }
  | { kind: "scheduled"; opensAt: string }
  | { kind: "ended"; endedAt: string; message?: string };

// Older builders persisted the placeholder in the author's locale.
const legacyDefaults = {
  closedMessage: ["Formulir ini telah ditutup dan tidak lagi menerima tanggapan.", "This form is closed and no longer accepts responses."],
  customSuccessMessage: ["Jawaban Anda telah berhasil disimpan.", "Your response was saved successfully."],
};

export function customFormMessage(field: keyof typeof legacyDefaults, value?: string) {
  return value && !legacyDefaults[field].includes(value) ? value : "";
}

export function getFormClosure(settings: FormResponseSettings): FormClosure | null {
  const now = Date.now();
  if (settings.acceptingResponses === false) return { kind: "closed", message: customFormMessage("closedMessage", settings.closedMessage) };
  if (settings.openAt && now < Date.parse(settings.openAt)) return { kind: "scheduled", opensAt: settings.openAt };
  if (settings.closeAt && now > Date.parse(settings.closeAt)) return { kind: "ended", endedAt: settings.closeAt, message: customFormMessage("closedMessage", settings.closedMessage) };
  return null;
}

export function describeFormClosure(closure: FormClosure): string {
  if (closure.kind === "scheduled") return `Formulir belum dibuka. Jadwal pembukaan: ${new Date(closure.opensAt).toLocaleString("id-ID")}`;
  if (closure.message) return closure.message;
  if (closure.kind === "ended") return `Formulir telah ditutup pada ${new Date(closure.endedAt).toLocaleString("id-ID")}`;
  return "Formulir ini telah ditutup dan tidak lagi menerima tanggapan.";
}

export function getFormClosedReason(settings: FormResponseSettings): string | null {
  const closure = getFormClosure(settings);
  return closure ? describeFormClosure(closure) : null;
}

export function getFormRespondentError(settings: FormResponseSettings, user?: Respondent) {
  if ((settings.requireLogin || settings.collectEmail === "verified") && !user) {
    return { status: 401, message: "Anda harus login ke akun Zyx untuk mengisi formulir ini." };
  }
  if (settings.collectEmail === "verified" && (!user?.emailVerified || !user.email.trim())) {
    return { status: 403, message: "Verifikasi alamat email akun Zyx Anda sebelum mengisi formulir ini." };
  }
  return null;
}
