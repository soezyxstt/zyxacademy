import en from "../../../../messages/en/publicForms.json";
import id from "../../../../messages/id/publicForms.json";
import type { FieldIssue, FormLocale } from "./model";
import type { FormClosure } from "../../../../packages/forms/response-policy";

const nativeCopy = {
  id: {
    progress: "Kemajuan pengisian formulir", retry: "Coba lagi", openWeb: "Buka di browser", meeting: "Gabung Google Meet", opening: "Membuka…",
    browserFailed: "Browser gagal dibuka. Coba lagi.", saved: "Terima kasih", support: "Lanjutkan di browser untuk mengisi formulir ini.",
    verifiedEmail: "Verifikasi email akun Zyx Anda sebelum mengirim jawaban.", alreadySent: "Formulir ini hanya menerima satu jawaban per akun. Jawaban Anda sudah tercatat.",
    denied: "Formulir belum menerima jawaban Anda. Periksa status formulir.", checkStatus: "Periksa status",
    uncertain: "Status pengiriman belum diketahui. Jawaban mungkin sudah diterima. Periksa sebelum mengisi kembali.",
    required: "Wajib", date: "Masukkan tanggal yang valid.", time: "Masukkan waktu yang valid.",
    year: "Tahun", month: "Bulan", day: "Tanggal", hour: "Jam", minute: "Menit",
    dateFormat: "Tanggal, bulan, dan tahun", timeFormat: "Jam dan menit, format 24 jam",
    fileFailed: "Berkas belum berhasil diunggah. Pilih kembali untuk mencoba lagi.", fileWrongType: "Pilih jenis berkas yang diizinkan.",
    fileTooLarge: "Ukuran berkas melebihi batas unggahan di sini.",
    largerUpload: "Gunakan browser untuk berkas hingga {maximum} MB. Sesi dan draf di browser dapat berbeda.",
    sessionChecking: "Memeriksa sesi akun…", sessionUnavailable: "Sesi akun tidak dapat diverifikasi.",
    uploading: "Mengunggah berkas…", fileUploadLogin: "Masuk untuk mengunggah berkas.", maxSize: "Maksimal", removeFile: "Hapus berkas",
    mediaFailed: "Gambar tidak dapat dimuat.", clear: "Hapus jawaban", optional: "Opsional",
  },
  en: {
    progress: "Form progress", retry: "Try again", openWeb: "Open in browser", meeting: "Join Google Meet", opening: "Opening…",
    browserFailed: "Could not open the browser. Try again.", saved: "Thank you", support: "Continue in your browser to fill out this form.",
    verifiedEmail: "Verify your Zyx account email before submitting a response.", alreadySent: "This form accepts one response per account. Your response is already on record.",
    denied: "The form could not accept your response. Check the form status.", checkStatus: "Check status",
    uncertain: "Submission status is unknown. Your response may have been received. Check before filling out the form again.",
    required: "Required", date: "Enter a valid date.", time: "Enter a valid time.",
    year: "Year", month: "Month", day: "Day", hour: "Hour", minute: "Minute",
    dateFormat: "Day, month, and year", timeFormat: "Hours and minutes in 24-hour time",
    fileFailed: "Upload failed. Choose the file again to retry.", fileWrongType: "Choose an allowed file type.",
    fileTooLarge: "The file exceeds the upload limit here.",
    largerUpload: "Use the browser for files up to {maximum} MB. Your browser session and draft may differ.",
    sessionChecking: "Checking your account session…", sessionUnavailable: "Could not verify your account session.",
    uploading: "Uploading file…", fileUploadLogin: "Sign in to upload a file.", maxSize: "Maximum", removeFile: "Remove file",
    mediaFailed: "Could not load the image.", clear: "Clear answer", optional: "Optional",
  },
};

export function publicFormCopy(locale: FormLocale) {
  return { ...({ id, en }[locale].publicForm), ...nativeCopy[locale] };
}

export function fieldIssueMessage(locale: FormLocale, issue: FieldIssue) {
  const copy = publicFormCopy(locale);
  return { required: copy.required, other: copy.otherRequired, date: copy.date, time: copy.time }[issue];
}

export function formClosureMessage(locale: FormLocale, closure: FormClosure | null) {
  const copy = publicFormCopy(locale);
  const date = (instant: string) => new Intl.DateTimeFormat(locale, {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta",
  }).format(new Date(instant));
  if (closure?.kind === "scheduled") return copy.opensAt.replace("{date}", date(closure.opensAt));
  if (closure?.message) return closure.message;
  if (closure?.kind === "ended") return copy.endedAt.replace("{date}", date(closure.endedAt));
  return copy.closedDescription;
}
