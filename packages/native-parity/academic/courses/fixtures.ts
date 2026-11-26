import { PREMIUM_PRICING, type CoursePricing } from "../../../academic/course-pricing";
import type { AdminChapter, AdminCourse } from "./model";

export type CourseDocument = {
  id: string;
  chapterId: string | null;
  title: string;
  type: "Artikel" | "Diktat" | "Soal UTS" | "Soal UAS" | "Lainnya";
  status: "draft" | "published";
  body: string;
};

export type CourseQuestion = {
  id: string;
  chapterId: string;
  origin: "Zyx" | "Referensi";
  difficulty: "Mudah" | "Sedang" | "Sulit";
  prompt: string;
  options: readonly string[];
  answer: number;
  explanation: string;
};

export type CourseAttempt = {
  id: string;
  name: string;
  participantId: string;
  quizId: string;
  score: number | null;
  duration: number;
  date: string;
};

export type CourseQuiz = {
  id: string;
  title: string;
  category: "Bab" | "Harian" | "Mingguan" | "Premium" | "Simulasi";
  status: "published" | "draft";
  questionStats: readonly { questionId: string; options: readonly number[] }[];
  insights: string | null;
};

export type CourseVideo = { id: string; title: string; url: string; duration: string };
export type CoursePlaylist = { id: string; title: string; videos: readonly CourseVideo[] };
export type Flashcard = { id: string; front: string; back: string };
export type FlashcardSet = {
  id: string;
  title: string;
  chapterId: string;
  status: "draft" | "published";
  cards: readonly Flashcard[];
};

export type CourseFixture = {
  course: AdminCourse;
  revision: number;
  canonicalOnly?: boolean;
  pricing: CoursePricing;
  isDemo: boolean;
  chapters: readonly AdminChapter[];
  documents: readonly CourseDocument[];
  questions: readonly CourseQuestion[];
  quizzes: readonly CourseQuiz[];
  attempts: readonly CourseAttempt[];
  playlists: readonly CoursePlaylist[];
  flashcards: readonly FlashcardSet[];
};

export const biologyCourse = { id: "academic-course-1", slug: "biologi-dasar", title: "Biologi Dasar" };
export const physicsCourse = { id: "academic-course-2", slug: "fisika-dasar", title: "Fisika Dasar" };
export const chemistryCourse = { id: "academic-course-3", slug: "kimia-dasar", title: "Kimia Dasar" };

export function emptyCourseFixture(course: AdminCourse): CourseFixture {
  return {
    course, revision: 1, pricing: PREMIUM_PRICING, isDemo: false,
    chapters: [], documents: [], questions: [], quizzes: [], attempts: [], playlists: [], flashcards: [],
  };
}

export function summarizeCourse(data: CourseFixture): CourseFixture {
  const { chapters, documents, questions, quizzes } = data;
  return {
    ...data,
    course: { ...data.course, chapterCount: chapters.length, materialCount: documents.length, quizCount: quizzes.length },
    chapters: chapters.map((chapter, orderIndex) => ({
      ...chapter,
      orderIndex,
      materialCount: documents.filter((document) => document.chapterId === chapter.id).length,
      questionCount: questions.filter((question) => question.chapterId === chapter.id).length,
    })),
  };
}

const cellChapter = "academic-chapter-1";
const geneticsChapter = "academic-chapter-2";
const organelleQuestion = "academic-question-1";
const membraneQuestion = "academic-question-2";

const biology = summarizeCourse({
  ...emptyCourseFixture({
    ...biologyCourse, category: "Biologi", description: "Struktur sel dan pewarisan sifat.",
    chapterCount: 0, materialCount: 0, quizCount: 0,
  }),
  chapters: [
    { id: cellChapter, title: "Struktur sel", description: "Fungsi organel dan membran sel.", orderIndex: 0, materialCount: 0, questionCount: 0 },
    { id: geneticsChapter, title: "Genetika dasar", description: null, orderIndex: 1, materialCount: 0, questionCount: 0 },
  ],
  documents: [
    {
      id: "academic-document-1",
      chapterId: cellChapter,
      title: "Sel dan organel",
      type: "Artikel",
      status: "published",
      body: "Sel adalah unit dasar kehidupan. Pada sel eukariotik, inti menyimpan sebagian besar materi genetik. Mitokondria membantu sel menghasilkan ATP lewat respirasi seluler.",
    },
    {
      id: "academic-document-2",
      chapterId: geneticsChapter,
      title: "Pewarisan sifat Mendel",
      type: "Diktat",
      status: "published",
      body: "Persilangan monohibrid melacak pewarisan satu sifat. Pada persilangan Aa × Aa dengan dominansi penuh, rasio genotipe keturunannya ialah 1 AA : 2 Aa : 1 aa.",
    },
    {
      id: "academic-document-3",
      chapterId: null,
      title: "Latihan UTS Biologi Dasar",
      type: "Soal UTS",
      status: "draft",
      body: "Jelaskan peran membran sel dalam mengatur perpindahan zat melintasi batas sel.",
    },
  ],
  questions: [
    {
      id: organelleQuestion, chapterId: cellChapter, origin: "Zyx", difficulty: "Mudah",
      prompt: "Organel mana yang menyediakan sebagian besar ATP pada sel eukariotik aerob?",
      options: ["Mitokondria", "Aparatus Golgi", "Inti sel"], answer: 0,
      explanation: "Mitokondria menghasilkan ATP melalui fosforilasi oksidatif.",
    },
    {
      id: membraneQuestion, chapterId: cellChapter, origin: "Referensi", difficulty: "Sedang",
      prompt: "Komponen apa yang membentuk lapisan ganda membran sel?",
      options: ["Fosfolipid", "Pati", "Selulosa"], answer: 0,
      explanation: "Fosfolipid tersusun menjadi dua lapisan dengan ekor hidrofobik menghadap ke dalam.",
    },
  ],
  quizzes: [
    { id: "academic-quiz-1", title: "Kuis struktur sel", category: "Bab", status: "published",
      questionStats: [{ questionId: organelleQuestion, options: [2, 1, 0] }, { questionId: membraneQuestion, options: [1, 2, 0] }], insights: null },
    { id: "academic-quiz-2", title: "Latihan genetika", category: "Mingguan", status: "draft", questionStats: [], insights: null },
    { id: "academic-quiz-simulation", title: "Simulasi biologi dasar", category: "Simulasi", status: "published", questionStats: [], insights: null },
  ],
  attempts: [
    { id: "academic-course-attempt-1", name: "Ayunda Pratama", participantId: "academic-course-participant-1", quizId: "academic-quiz-1", score: 100, duration: 305, date: "2026-11-20" },
    { id: "academic-course-attempt-2", name: "Rama Setiawan", participantId: "academic-course-participant-2", quizId: "academic-quiz-1", score: 50, duration: 280, date: "2026-11-21" },
    { id: "academic-course-attempt-3", name: "Salma Wijaya", participantId: "academic-course-participant-3", quizId: "academic-quiz-1", score: 0, duration: 422, date: "2026-11-21" },
    { id: "academic-course-attempt-4", name: "Rama Setiawan", participantId: "academic-course-participant-2", quizId: "academic-quiz-1", score: null, duration: 0, date: "2026-11-22" },
  ],
  flashcards: [
    { id: "academic-flashcard-set-1", title: "Organel sel", chapterId: cellChapter, status: "published", cards: [
      { id: "academic-flashcard-1", front: "Apa fungsi mitokondria?", back: "Menghasilkan sebagian besar ATP melalui respirasi seluler." },
      { id: "academic-flashcard-2", front: "Apa fungsi ribosom?", back: "Merakit asam amino menjadi protein." },
    ] },
  ],
  playlists: [
    { id: "academic-playlist-1", title: "Struktur dan fungsi sel", videos: [
      { id: "academic-video-1", title: "Pengantar struktur sel", url: "https://www.youtube.com/watch?v=8IlzKri08kk", duration: "5 mnt" },
    ] },
  ],
});

const physics = emptyCourseFixture({
  ...physicsCourse, category: "Fisika", description: "Gerak, gaya, dan energi.",
  chapterCount: 0, materialCount: 0, quizCount: 0,
});

const chemistry = {
  ...emptyCourseFixture({
    ...chemistryCourse, category: "Umum", description: null,
    chapterCount: 0, materialCount: 0, quizCount: 0,
  }),
  canonicalOnly: true,
};

export const courseFixtures: readonly CourseFixture[] = [biology, physics, chemistry];
