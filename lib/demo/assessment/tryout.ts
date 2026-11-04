import type { TryoutPresentationExam } from "@/components/course/tryout-form";

/** Authored study-skills questions, independent of any course or paid assessment. */
export function syntheticTryout(courseId: string, locale: string): TryoutPresentationExam {
  const en = locale === "en";
  return {
    id: "synthetic-study-skills-v1", courseId,
    title: en ? "Practice tryout" : "Tryout latihan", type: "tryout", status: "published",
    settings: { timeLimitMinutes: 15 },
    questions: [
      { id: "synthetic-plan", order: 0, type: "multiple_choice", prompt: en ? "What is a useful first step when preparing for an exam?" : "Apa langkah awal yang membantu saat menyiapkan ujian?", options: en ? ["Make a study plan", "Skip the course outline", "Avoid practice"] : ["Membuat rencana belajar", "Melewati rangkuman materi", "Menghindari latihan"] },
      { id: "synthetic-review", order: 1, type: "multiple_choices", prompt: en ? "Which activities can help you review? Choose all that apply." : "Kegiatan mana yang dapat membantu mengulang materi? Pilih semua yang sesuai.", options: en ? ["Recall key ideas", "Review mistakes", "Ignore difficult topics"] : ["Mengingat kembali ide utama", "Meninjau kesalahan", "Mengabaikan topik sulit"] },
      { id: "synthetic-reflection", order: 2, type: "short_answer", prompt: en ? "Name one topic you would review again." : "Sebutkan satu topik yang ingin kamu ulangi." },
    ],
  };
}

/** Call from the demo session reset handler so an unmounted tryout is reset too. */
export function clearDemoTryoutCompletions(courseId: string): void {
  if (typeof window === "undefined") return;
  const prefix = `zyx-demo-tryout:1:${encodeURIComponent(courseId)}:`;
  try {
    const keys: string[] = [];
    for (let index = 0; index < sessionStorage.length; index++) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) sessionStorage.removeItem(key);
  } catch { /* Storage may be unavailable. */ }
}
