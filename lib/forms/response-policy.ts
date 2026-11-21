type FormResponseSettings = {
  acceptingResponses?: boolean;
  openAt?: string;
  closeAt?: string;
  closedMessage?: string;
  requireLogin?: boolean;
  collectEmail?: "none" | "input" | "verified";
};

type Respondent = { email: string; emailVerified: boolean };

export function getFormClosedReason(settings: FormResponseSettings): string | null {
  const now = new Date();
  if (settings.acceptingResponses === false) {
    return settings.closedMessage || "Formulir ini telah ditutup dan tidak lagi menerima tanggapan.";
  }
  if (settings.openAt && now < new Date(settings.openAt)) {
    return `Formulir belum dibuka. Jadwal pembukaan: ${new Date(settings.openAt).toLocaleString("id-ID")}`;
  }
  if (settings.closeAt && now > new Date(settings.closeAt)) {
    return settings.closedMessage || `Formulir telah ditutup pada ${new Date(settings.closeAt).toLocaleString("id-ID")}`;
  }
  return null;
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
