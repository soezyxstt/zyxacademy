import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessageStreamWriter,
} from "ai";
import {
  OPS_AI_POLICY_BOUNDS,
  OPS_AI_TOOL_SECURITY_REGISTRY,
  validateOpsAiWorkStep,
  validateOpsAiErrorData,
  validateOpsAiCitation,
  validateOpsAiProposal,
  type OpsAiWorkStep,
  type OpsAiErrorData,
  type OpsAiErrorCode,
  type OpsAiStepType,
  type OpsAiCitation,
  type OpsAiActionProposalV2,
} from "./contracts";
import {
  assertProvenanceIntegrity,
  verifyInlineCitations,
  OPS_AI_CITATION_OFFICIAL_LABEL,
} from "./citations";
import {
  executeOpsAiTool,
  searchAdminKnowledge,
  type OpsAiToolContext,
} from "./runtime-tools";
import { searchDocs } from "./rag-store";
import {
  streamOpsAiModel,
  type OpsAiModelGenerateStreamOptions,
  type OpsAiModelStreamChunk,
  type OpsAiModelToolDeclaration,
  type OpsAiModelMessage,
} from "./model-factory";
import { type OpsAiChatRequest } from "./types";
import { randomUUID } from "node:crypto";

// ============================================================================
// 1. Types & Options
// ============================================================================

export interface ExecuteOpsAiRuntimeOptions {
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  context?: OpsAiChatRequest["context"];
  modelId?: string;
  toolContext?: OpsAiToolContext;
  abortSignal?: AbortSignal;
  maxToolSteps?: number;
  maxConsecutiveToolCalls?: number;
  runId?: string;
  customModelStream?: (
    options: OpsAiModelGenerateStreamOptions
  ) => AsyncIterable<OpsAiModelStreamChunk>;
}

// ============================================================================
// 2. System Prompt Builder
// ============================================================================

export function buildOpsAiSystemPrompt(context?: OpsAiChatRequest["context"]): string {
  const mode = context?.mode ?? "ask";
  const modeInstruction =
    mode === "edit"
      ? `\nMODE AKTIF: MODE EDIT / AKSI OPERASIONAL.\nFokus utama Anda adalah membantu administrator melakukan aksi operasional atau perubahan data secara terarah. Sebelum mengeksekusi mutasi data, buatkan Action Proposal terstruktur yang merangkum aksi yang akan dilakukan, dan mintalah konfirmasi dari administrator dengan quick-actions.`
      : `\nMODE AKTIF: MODE TANYA / KONSULTASI OPERASIONAL.\nFokus utama Anda adalah menjawab pertanyaan, menganalisis status sistem, dan menerangkan SOP atau fitur teknis Zyx. Bila menjawab pertanyaan seputar fitur, SOP, skema, atau konfigurasi Zyx, panggil tool 'retrieve_admin_knowledge' terlebih dahulu agar sumber referensi resmi dapat tercantum pada jawaban.`;

  return `Anda adalah Zyx Ops AI, asisten teknis dan operasional untuk panel administrator Zyx Academy.
Tugas Anda adalah membantu administrator memahami fitur sistem, skema basis data, arsitektur, prosedur runbook operasional, menavigasi admin panel, serta mengeksekusi operasi administrasi secara langsung dan otonom tanpa perlu pengisian form manual oleh manusia.

ATURAN DAN PEDOMAN UTAMA:
1. Nama brand adalah Zyx (bukan ZYX).
2. Gaya bahasa: Singkat, lugas, profesional, kalimat dalam sentence-case bahasa Indonesia.
3. JANGAN PERNAH menggunakan em-dash (—) atau en-dash (–). Gunakan koma, titik dua, atau titik.
4. Jangan menambahkan tanda seru berlebih atau kalimat basa-basi.
5. Berikan jawaban berbasis data nyata dan dokumentasi yang diverifikasi.
6. Bila memerlukan informasi dokumentasi, skema tabel, metrik sistem, navigasi halaman, data pengguna, kuis, jadwal, kelompok belajar, atau form, gunakan native tool calling yang tersedia. JANGAN membuat format teks buatan sendiri seperti markdown tool_call.
7. Setiap pertanyaan mengenai konfigurasi, SOP, fitur, alur kerja, atau arsitektur Zyx WAJIB memanggil tool 'retrieve_admin_knowledge' untuk menyertakan referensi resmi.

RESOLUSI ENTITAS OTOMATIS (PRINSIP UTAMA INTERAKSI MANUSIA):
8. Administrator adalah manusia dan TIDAK MENGHAFAL ID teknis, slug, atau UUID (seperti 'mat-i', 'kalk-1', dsb.).
9. JANGAN PERNAH meminta administrator menyebutkan, mencari, atau mengonfirmasi ID teknis entitas! Meminta ID adalah kesalahan fatal.
10. Bila administrator menyebutkan nama, judul, atau kata kunci entitas (misal: mata kuliah "Matematika I", bab "Turunan" atau "Limit", kuis, pengguna, form, dsb.):
    - Anda WAJIB PROAKTIF memanggil tool pencarian/pendaftaran terlebih dahulu (misal: 'list_courses', 'list_chapters', 'list_quizzes', 'search_users', dsb.) untuk menemukan entitas tersebut di balik layar.
    - KASUS 1: Hasil pencarian UNIK (tepat 1 entitas cocok):
      Langsung gunakan ID tersebut secara mandiri! Jangan tanyakan "apakah ID-nya X?". Langsung sajikan proposal aksi (Action Proposal) yang mencantumkan nama dan detail entitas tersebut, lalu tanyakan konfirmasi proposal.
    - KASUS 2: Hasil pencarian AMBIGU (lebih dari 1 entitas cocok):
      Sajikan daftar pilihan secara singkat dan tanyakan entitas mana yang dimaksud administrator. Wajib sertakan blok quick-actions agar administrator dapat memilih dengan satu kali klik.
    - KASUS 3: Hasil pencarian KOSONG (0 entitas cocok):
      Jelaskan dengan sopan bahwa entitas tidak ditemukan dan tawarkan alternatif (misal membuat mata kuliah baru).

PROPOSAL AKSI DAN EKSEKUSI:
11. Ketika menyusun proposal aksi (seperti membuat bab materi baru, membuat kuis, mereset kuis siswa, dsb.):
    - Tampilkan ringkasan Action Proposal dengan jelas (Nama aksi, target, detail atribut).
    - Akhiri dengan pertanyaan konfirmasi: "Apakah Anda ingin melanjutkan dengan proposal ini?"
    - Wajib sertakan blok quick-actions:
      \`\`\`quick-actions
      ["Ya", "Tidak"]
      \`\`\`
12. Bila administrator menjawab "Ya", "Lanjutkan", "Setuju", atau memilih tombol konfirmasi:
    - Segera eksekusi tool mutasi yang bersangkutan (misal: 'batch_create_chapters', 'create_course', 'create_quiz', 'reset_quiz_attempt', dsb.) dengan parameter yang telah disetujui tanpa menunda lagi.
13. Bila administrator menjawab "Tidak", "Batal":
    - Konfirmasikan bahwa proposal dibatalkan dan tanyakan bantuan selanjutnya.

BANTUAN OPERASIONAL SEHARI-HARI (DAY-TO-DAY OPERATIONS):
14. Dukungan Kendala Siswa (Student Support & Access):
    - Bila administrator menanyakan masalah akses murid (misal: "siswa tidak bisa buka materi", "cek status akun X", "apakah murid Y sudah masuk kelompok?"), segera panggil tool 'diagnose_student_access' dengan nama atau email murid tersebut.
    - Sajikan hasil diagnosa yang mencakup status akun, kelompok belajar, sisa kuota/token, dan histori pengerjaan kuis.
15. Pemulihan Sesi Kuis Siswa (Quiz Attempt Reset):
    - Bila siswa mengalami kendala teknis saat kuis (misal: jaringan terputus, sesi macet) dan admin ingin mereset, temukan attemptId terkait via diagnosa atau daftar kuis, lalu ajukan Action Proposal untuk tool 'reset_quiz_attempt' dengan alasan yang jelas sebelum mengeksekusinya.
16. Audit Kesiapan Kurikulum (Course Completeness Audit):
    - Bila administrator menanyakan kesiapan atau kelengkapan kurikulum mata kuliah (misal: "apakah Kalkulus I sudah lengkap?", "cek bab mana yang belum ada soal/materi"), panggil tool 'audit_course_completeness' untuk memberikan rincian bab yang belum memiliki berkas materi atau bank soal.

FORMAT TOMBOL INTERAKTIF (QUICK ACTIONS):
17. Setiap kali Anda mengajukan konfirmasi (Ya/Tidak) atau memberikan opsi pilihan (disambiguasi nama):
    Wajib sertakan blok opsi interaktif di baris paling akhir respons Anda dengan format:
    \`\`\`quick-actions
    ["Opsi 1", "Opsi 2"]
    \`\`\`
    Contoh:
    \`\`\`quick-actions
    ["Ya", "Tidak"]
    \`\`\`
    atau untuk pilihan:
    \`\`\`quick-actions
    ["Matematika I", "Kalkulus Lanjut"]
    \`\`\`
${modeInstruction}

KONTEKS HALAMAN SAAT INI:
- Rute aktif: ${context?.currentPath || "/admin"}
- Query params: ${JSON.stringify(context?.queryParams || {})}
- Entitas aktif: ${JSON.stringify(context?.activeEntity || null)}`;
}

// ============================================================================
// 3. Tool Declarations for Model
// ============================================================================

export const DEFAULT_OPS_AI_TOOLS: OpsAiModelToolDeclaration[] = [
  // ─── 0. Baseline Tools ───────────────────────────────────────────────────────
  {
    name: "retrieve_admin_knowledge",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.retrieve_admin_knowledge.description,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Kata kunci atau topik pencarian dokumentasi teknis dan SOP Zyx",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "inspect_schema",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.inspect_schema.description,
    parameters: {
      type: "object",
      properties: {
        tableName: {
          type: "string",
          description: "Nama tabel database spesifik (opsional, contoh: user, enrollment_tokens)",
        },
      },
    },
  },
  {
    name: "get_system_metrics",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.get_system_metrics.description,
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "navigate_admin",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.navigate_admin.description,
    parameters: {
      type: "object",
      properties: {
        destination: {
          type: "string",
          description: "Nama fitur atau halaman admin yang dituju",
        },
      },
      required: ["destination"],
    },
  },
  {
    name: "search_users",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.search_users.description,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Nama atau email pengguna yang dicari",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "propose_create_token",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.propose_create_token.description,
    parameters: {
      type: "object",
      properties: {
        courseIds: {
          type: "string",
          description: "Daftar ID mata kuliah dipisah koma (misal: kalkulus-1, fisika-dasar)",
        },
        capacity: {
          type: "string",
          description: "Kapasitas kuota anggota kelompok (angka 1 sampai 5)",
        },
        packageType: {
          type: "string",
          description: "Tipe paket (opsional, default: reguler_15)",
        },
      },
      required: ["courseIds", "capacity"],
    },
  },

  // ─── 1. Academic & Curriculum ────────────────────────────────────────────────
  {
    name: "list_courses",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.list_courses.description,
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Kata kunci nama atau ID mata kuliah" },
        category: { type: "string", description: "Filter kategori mata kuliah" },
      },
    },
  },
  {
    name: "list_chapters",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.list_chapters.description,
    parameters: {
      type: "object",
      properties: {
        courseId: { type: "string", description: "Filter berdasarkan ID mata kuliah (opsional)" },
        search: { type: "string", description: "Kata kunci nama atau judul bab materi" },
      },
    },
  },
  {
    name: "create_course",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.create_course.description,
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Slug unik huruf kecil dan strip (misal: 'fisika-dasar-1')" },
        title: { type: "string", description: "Nama lengkap mata kuliah" },
        category: { type: "string", description: "Kategori mata kuliah (misal: Matematika, Fisika, Umum)" },
        description: { type: "string", description: "Deskripsi mata kuliah" },
      },
      required: ["id", "title", "category"],
    },
  },
  {
    name: "update_course",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.update_course.description,
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID mata kuliah yang diubah" },
        title: { type: "string", description: "Nama baru mata kuliah" },
        category: { type: "string", description: "Kategori baru" },
        description: { type: "string", description: "Deskripsi baru" },
      },
      required: ["id"],
    },
  },
  {
    name: "batch_create_chapters",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.batch_create_chapters.description,
    parameters: {
      type: "object",
      properties: {
        courseId: { type: "string", description: "ID mata kuliah" },
        chapters: {
          type: "array",
          description: "Daftar bab yang dibuat",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Judul bab" },
              orderIndex: { type: "number", description: "Nomor urut bab" },
              description: { type: "string", description: "Deskripsi bab" },
            },
            required: ["title"],
          },
        },
      },
      required: ["courseId", "chapters"],
    },
  },
  {
    name: "update_chapter",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.update_chapter.description,
    parameters: {
      type: "object",
      properties: {
        chapterId: { type: "string", description: "ID bab yang diubah" },
        title: { type: "string", description: "Judul baru bab" },
        orderIndex: { type: "number", description: "Nomor urut baru" },
      },
      required: ["chapterId"],
    },
  },
  {
    name: "list_materials",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.list_materials.description,
    parameters: {
      type: "object",
      properties: {
        courseId: { type: "string", description: "ID mata kuliah" },
        chapterId: { type: "string", description: "ID bab (opsional)" },
      },
      required: ["courseId"],
    },
  },
  {
    name: "audit_course_completeness",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.audit_course_completeness.description,
    parameters: {
      type: "object",
      properties: {
        courseId: { type: "string", description: "ID mata kuliah yang ingin diaudit" },
      },
      required: ["courseId"],
    },
  },

  // ─── 2. Assessment & Questions ─────────────────────────────────────────────
  {
    name: "list_quizzes",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.list_quizzes.description,
    parameters: {
      type: "object",
      properties: {
        courseId: { type: "string", description: "Filter ID mata kuliah" },
        status: { type: "string", description: "Status kuis (draft / published)" },
        search: { type: "string", description: "Pencarian judul kuis" },
      },
    },
  },
  {
    name: "create_quiz",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.create_quiz.description,
    parameters: {
      type: "object",
      properties: {
        courseId: { type: "string", description: "ID mata kuliah" },
        title: { type: "string", description: "Judul kuis" },
        durationMinutes: { type: "number", description: "Durasi pengerjaan dalam menit" },
        category: { type: "string", description: "Kategori kuis: daily, weekly, chapter, simulation" },
        questionIds: {
          type: "array",
          items: { type: "string" },
          description: "Daftar ID soal dari bank soal",
        },
      },
      required: ["courseId", "title"],
    },
  },
  {
    name: "update_quiz",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.update_quiz.description,
    parameters: {
      type: "object",
      properties: {
        quizId: { type: "string", description: "ID kuis" },
        patch: {
          type: "object",
          properties: {
            title: { type: "string", description: "Judul baru" },
            durationMinutes: { type: "number", description: "Durasi baru (menit)" },
            status: { type: "string", description: "Status: draft atau published" },
          },
        },
      },
      required: ["quizId", "patch"],
    },
  },
  {
    name: "list_questions",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.list_questions.description,
    parameters: {
      type: "object",
      properties: {
        courseId: { type: "string", description: "Filter ID mata kuliah" },
        difficulty: { type: "string", description: "Tingkat kesulitan: easy, medium, hard" },
        reviewStatus: { type: "string", description: "Status kurasi: published, reviewed, generated" },
        search: { type: "string", description: "Pencarian teks soal" },
      },
    },
  },
  {
    name: "create_question",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.create_question.description,
    parameters: {
      type: "object",
      properties: {
        courseId: { type: "string", description: "ID mata kuliah" },
        prompt: { type: "string", description: "Teks soal (mendukung LaTeX)" },
        options: {
          type: "array",
          items: { type: "string" },
          description: "Pilihan jawaban (minimal 2 opsi)",
        },
        correctAnswer: { type: "string", description: "Kunci jawaban benar" },
        difficulty: { type: "string", description: "easy, medium, atau hard" },
        explanation: { type: "string", description: "Pembahasan soal" },
      },
      required: ["courseId", "prompt", "options", "correctAnswer"],
    },
  },
  {
    name: "publish_question",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.publish_question.description,
    parameters: {
      type: "object",
      properties: {
        questionId: { type: "string", description: "ID soal yang ingin dipublikasikan" },
      },
      required: ["questionId"],
    },
  },
  {
    name: "get_quiz_insights",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.get_quiz_insights.description,
    parameters: {
      type: "object",
      properties: {
        quizId: { type: "string", description: "ID kuis" },
      },
      required: ["quizId"],
    },
  },
  {
    name: "reset_quiz_attempt",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.reset_quiz_attempt.description,
    parameters: {
      type: "object",
      properties: {
        attemptId: { type: "string", description: "ID percobaan kuis yang ingin direset" },
        userId: { type: "string", description: "ID pengguna / murid" },
        quizId: { type: "string", description: "ID kuis" },
        reason: { type: "string", description: "Alasan reset percobaan kuis" },
      },
      required: ["reason"],
    },
  },

  // ─── 3. Schedules & Meet ───────────────────────────────────────────────────
  {
    name: "list_schedules",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.list_schedules.description,
    parameters: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Tanggal mulai (YYYY-MM-DD)" },
        endDate: { type: "string", description: "Tanggal akhir (YYYY-MM-DD)" },
        courseId: { type: "string", description: "Filter ID mata kuliah" },
        status: { type: "string", description: "Filter status sesi (scheduled, cancelled, completed)" },
      },
    },
  },
  {
    name: "create_meet_session",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.create_meet_session.description,
    parameters: {
      type: "object",
      properties: {
        tutorId: { type: "string", description: "ID tutor yang ditugaskan" },
        courseId: { type: "string", description: "ID mata kuliah" },
        dateIso: { type: "string", description: "Tanggal sesi (YYYY-MM-DD)" },
        timeSlot: { type: "string", description: "Waktu sesi (misal: '09:00 - 10:30')" },
        groupId: { type: "string", description: "ID kelompok belajar (opsional)" },
        topic: { type: "string", description: "Topik diskusi sesi tutorial" },
      },
      required: ["tutorId", "courseId", "dateIso", "timeSlot"],
    },
  },
  {
    name: "reschedule_or_cancel_meet",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.reschedule_or_cancel_meet.description,
    parameters: {
      type: "object",
      properties: {
        bookingId: { type: "string", description: "ID sesi booking" },
        action: { type: "string", description: "'reschedule' atau 'cancel'" },
        newDateIso: { type: "string", description: "Tanggal baru bila reschedule" },
        newTimeSlot: { type: "string", description: "Waktu baru bila reschedule" },
        reason: { type: "string", description: "Alasan perubahan/pembatalan" },
      },
      required: ["bookingId", "action"],
    },
  },
  {
    name: "list_tutor_availability",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.list_tutor_availability.description,
    parameters: {
      type: "object",
      properties: {
        tutorId: { type: "string", description: "ID tutor (opsional)" },
      },
    },
  },

  // ─── 4. Study Groups & Tokens ──────────────────────────────────────────────
  {
    name: "list_study_groups",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.list_study_groups.description,
    parameters: {
      type: "object",
      properties: {
        courseId: { type: "string", description: "Filter ID mata kuliah" },
        search: { type: "string", description: "Pencarian nama kelompok" },
        hasTutor: { type: "boolean", description: "Filter kelompok yang memiliki tutor" },
      },
    },
  },
  {
    name: "create_study_group",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.create_study_group.description,
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nama kelompok belajar" },
        courseIds: {
          type: "array",
          items: { type: "string" },
          description: "Daftar ID mata kuliah",
        },
        capacity: { type: "number", description: "Kapasitas kuota anggota (1-5)" },
      },
      required: ["name", "courseIds"],
    },
  },
  {
    name: "assign_tutor_to_group",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.assign_tutor_to_group.description,
    parameters: {
      type: "object",
      properties: {
        groupId: { type: "string", description: "ID kelompok belajar" },
        tutorId: { type: "string", description: "ID tutor pendamping" },
      },
      required: ["groupId", "tutorId"],
    },
  },
  {
    name: "create_enrollment_token",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.create_enrollment_token.description,
    parameters: {
      type: "object",
      properties: {
        courseIds: {
          type: "array",
          items: { type: "string" },
          description: "Daftar ID mata kuliah",
        },
        capacity: { type: "number", description: "Kapasitas kuota anggota (1 sampai 5 orang)" },
        packageType: { type: "string", description: "Tipe paket (opsional, default: reguler_15)" },
      },
      required: ["courseIds", "capacity"],
    },
  },
  {
    name: "list_enrollment_tokens",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.list_enrollment_tokens.description,
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "Status token: active, exhausted, atau expired" },
      },
    },
  },
  {
    name: "diagnose_student_access",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.diagnose_student_access.description,
    parameters: {
      type: "object",
      properties: {
        userIdentifier: { type: "string", description: "Nama, email, atau ID pengguna murid yang ingin didiagnosa" },
        courseId: { type: "string", description: "ID mata kuliah untuk evaluasi akses khusus (opsional)" },
      },
      required: ["userIdentifier"],
    },
  },

  // ─── 5. Users, Notifications & Operations ──────────────────────────────────
  {
    name: "update_user_role",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.update_user_role.description,
    parameters: {
      type: "object",
      properties: {
        userId: { type: "string", description: "ID pengguna" },
        roles: {
          type: "array",
          items: { type: "string" },
          description: "Daftar peran baru (admin, tutor, murid)",
        },
      },
      required: ["userId", "roles"],
    },
  },
  {
    name: "toggle_user_status",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.toggle_user_status.description,
    parameters: {
      type: "object",
      properties: {
        userId: { type: "string", description: "ID pengguna" },
        status: { type: "string", description: "Status akun: 'active' atau 'suspended'" },
        reason: { type: "string", description: "Alasan perubahan status" },
      },
      required: ["userId", "status"],
    },
  },
  {
    name: "send_broadcast_notification",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.send_broadcast_notification.description,
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Judul notifikasi" },
        body: { type: "string", description: "Isi pesan notifikasi" },
        target: { type: "string", description: "Target penerima: 'all', 'course', atau 'group'" },
        targetId: { type: "string", description: "ID spesifik jika target course atau group" },
        link: { type: "string", description: "Tautan URL ketika notifikasi diklik" },
      },
      required: ["title", "body"],
    },
  },
  {
    name: "list_pka_registrations",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.list_pka_registrations.description,
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Pencarian nama atau email pendaftar PKA" },
      },
    },
  },
  {
    name: "create_pka_announcement",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.create_pka_announcement.description,
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Judul pengumuman PKA" },
        content: { type: "string", description: "Isi pengumuman" },
        isPinned: { type: "boolean", description: "Sematkan pengumuman di atas" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "create_pka_schedule",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.create_pka_schedule.description,
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Judul kegiatan PKA" },
        sessionAt: { type: "string", description: "Waktu sesi (YYYY-MM-DD HH:mm atau format ISO)" },
        meetLink: { type: "string", description: "Link Google Meet sesi PKA" },
      },
      required: ["title", "sessionAt"],
    },
  },
  {
    name: "list_forms",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.list_forms.description,
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", description: "Filter kategori form" },
        search: { type: "string", description: "Pencarian nama form" },
      },
    },
  },
  {
    name: "create_or_update_form",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.create_or_update_form.description,
    parameters: {
      type: "object",
      properties: {
        formId: { type: "string", description: "ID form jika mengedit form lama" },
        slug: { type: "string", description: "Slug URL form (/f/[slug])" },
        title: { type: "string", description: "Judul formulir" },
        category: { type: "string", description: "survey, quiz, feedback, registration" },
        description: { type: "string", description: "Keterangan formulir" },
      },
      required: ["slug", "title"],
    },
  },
  {
    name: "get_form_responses_summary",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.get_form_responses_summary.description,
    parameters: {
      type: "object",
      properties: {
        formId: { type: "string", description: "ID formulir" },
      },
      required: ["formId"],
    },
  },
  {
    name: "list_blog_articles",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.list_blog_articles.description,
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "Status artikel: published atau draft" },
        search: { type: "string", description: "Pencarian judul artikel" },
      },
    },
  },
  {
    name: "create_blog_article",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.create_blog_article.description,
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Judul artikel blog" },
        content: { type: "string", description: "Konten teks artikel (format Markdown)" },
        category: { type: "string", description: "tips_kuliah, pojok_kampus, fakta_seru, kegiatan_zyx" },
        status: { type: "string", description: "draft atau published" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "publish_blog_article",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.publish_blog_article.description,
    parameters: {
      type: "object",
      properties: {
        articleId: { type: "string", description: "ID artikel blog" },
        publish: { type: "boolean", description: "true untuk publikasikan, false untuk draf" },
      },
      required: ["articleId", "publish"],
    },
  },
  {
    name: "get_feature_flags",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.get_feature_flags.description,
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "set_feature_flag",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.set_feature_flag.description,
    parameters: {
      type: "object",
      properties: {
        flagKey: { type: "string", description: "Kunci feature flag (misal: 'FEATURE_PKA')" },
        enabled: { type: "boolean", description: "Status aktif (true) atau mati (false)" },
        reason: { type: "string", description: "Alasan perubahan status" },
      },
      required: ["flagKey", "enabled"],
    },
  },
  {
    name: "create_short_link",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.create_short_link.description,
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Slug kustom (/s/[slug])" },
        url: { type: "string", description: "URL target lengkap" },
        title: { type: "string", description: "Keterangan short link" },
      },
      required: ["slug", "url"],
    },
  },
  {
    name: "trigger_ai_job",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.trigger_ai_job.description,
    parameters: {
      type: "object",
      properties: {
        jobType: { type: "string", description: "generate_questions, sync_rag, extract_ko" },
        courseId: { type: "string", description: "ID mata kuliah" },
      },
      required: ["jobType", "courseId"],
    },
  },
];

// ============================================================================
// 4. Runtime Stream Orchestrator
// ============================================================================

/**
 * Creates an incremental UI Message Stream for Ops AI v2 adhering to
 * bounded multi-step loops, work-step lifecycle tracking, and strict security bounds.
 */
export function createOpsAiRuntimeStream(
  options: ExecuteOpsAiRuntimeOptions
): ReadableStream {
  const {
    messages,
    context,
    modelId,
    toolContext,
    abortSignal,
    maxToolSteps = OPS_AI_POLICY_BOUNDS.maxToolSteps,
    maxConsecutiveToolCalls = OPS_AI_POLICY_BOUNDS.maxConsecutiveToolCalls,
    runId = `run-${randomUUID()}`,
    customModelStream,
  } = options;

  return createUIMessageStream({
    execute: async ({ writer }) => {
      let stepIndexCounter = 0;
      const currentStep: { value: OpsAiWorkStep | null } = { value: null };

      // Helper to emit validated work-step parts
      const emitWorkStep = (step: OpsAiWorkStep) => {
        const validation = validateOpsAiWorkStep(step);
        if (!validation.valid) {
          console.warn("[OpsAi WorkStep Validation Error]:", validation.errors);
        }
        currentStep.value = step;
        writer.write({
          type: "data-work-step",
          id: `step-${step.stepId}-${step.status}`,
          data: step,
        } as any);
      };

      // Helper to emit validated error parts
      const emitError = (
        code: OpsAiErrorCode,
        message: string,
        retryable: boolean,
        stepId?: string,
        details?: Record<string, unknown>
      ) => {
        const errorData: OpsAiErrorData = {
          code,
          message,
          retryable,
          runId,
          stepId,
          timestamp: Date.now(),
          details,
        };
        const validation = validateOpsAiErrorData(errorData);
        if (!validation.valid) {
          console.warn("[OpsAi ErrorData Validation Error]:", validation.errors);
        }
        writer.write({
          type: "data-error",
          id: `err-${Date.now()}`,
          data: errorData,
        } as any);
      };

      // Handle abort event
      const onAbort = () => {
        if (currentStep.value && currentStep.value.status !== "completed" && currentStep.value.status !== "failed") {
          const now = Date.now();
          emitWorkStep({
            ...currentStep.value,
            status: "cancelled",
            finishedAt: now,
            durationMs: Math.max(0, now - currentStep.value.startedAt),
            retryable: false,
            error: "Permintaan dibatalkan oleh pengguna atau timeout.",
          });
        }
        emitError("REQUEST_CANCELLED", "Permintaan telah dibatalkan.", false, currentStep.value?.stepId);
      };

      if (abortSignal) {
        if (abortSignal.aborted) {
          onAbort();
          return;
        }
        abortSignal.addEventListener("abort", onAbort, { once: true });
      }

      try {
        // ----------------------------------------------------------------------
        // Step 1: Input Bounds & Policy Validation
        // ----------------------------------------------------------------------
        if (!messages || messages.length === 0) {
          emitError("INVALID_REQUEST", "Daftar pesan tidak boleh kosong.", false);
          return;
        }

        if (messages.length > OPS_AI_POLICY_BOUNDS.maxMessagesHistory) {
          emitError(
            "CONTEXT_TOO_LARGE",
            `Jumlah riwayat pesan (${messages.length}) melampaui batas maksimum (${OPS_AI_POLICY_BOUNDS.maxMessagesHistory}).`,
            false
          );
          return;
        }

        let totalPromptChars = 0;
        for (const msg of messages) {
          if (msg.content.length > OPS_AI_POLICY_BOUNDS.maxMessageCharLength) {
            emitError(
              "CONTEXT_TOO_LARGE",
              `Panjang pesan individual melampaui batas maksimum (${OPS_AI_POLICY_BOUNDS.maxMessageCharLength} karakter).`,
              false
            );
            return;
          }
          totalPromptChars += msg.content.length;
        }

        if (totalPromptChars > OPS_AI_POLICY_BOUNDS.maxTotalPromptChars) {
          emitError(
            "CONTEXT_TOO_LARGE",
            `Total karakter prompt (${totalPromptChars}) melampaui batas maksimum (${OPS_AI_POLICY_BOUNDS.maxTotalPromptChars}).`,
            false
          );
          return;
        }

        // ----------------------------------------------------------------------
        // Step 2: Initial Reasoning & Planning Step
        // ----------------------------------------------------------------------
        const initialStepId = `step-${stepIndexCounter++}`;
        const initialStepStart = Date.now();

        emitWorkStep({
          stepId: initialStepId,
          runId,
          stepIndex: 0,
          stepType: "reasoning",
          status: "queued",
          title: "Analisis konteks permintaan admin",
          startedAt: initialStepStart,
        });

        emitWorkStep({
          stepId: initialStepId,
          runId,
          stepIndex: 0,
          stepType: "reasoning",
          status: "running",
          title: "Analisis konteks permintaan admin",
          startedAt: initialStepStart,
        });

        let systemPrompt = buildOpsAiSystemPrompt(context);

        const allRunCitations: OpsAiCitation[] = [];
        const knownSourceIds = new Set<string>();
        const knownStepIds = new Set<string>();
        const knownToolCallIds = new Set<string>();

        // ----------------------------------------------------------------------
        // Automatic Knowledge Grounding & Citation Emission
        // ----------------------------------------------------------------------
        const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
        const lastUserQuery = lastUserMsg?.content || "";

        if (lastUserQuery.trim().length > 0) {
          try {
            let initialDocs: Array<{
              title: string;
              filePath: string;
              section?: string;
              snippet: string;
              score?: number;
            }> = [];

            try {
              const vectorResults = await searchAdminKnowledge({
                query: lastUserQuery,
                callerRole: toolContext?.callerRole ?? "admin",
                vectorProvider: toolContext?.vectorProvider,
                embeddingAdapter: toolContext?.embeddingAdapter,
              });
              if (vectorResults?.results && vectorResults.results.length > 0) {
                initialDocs = vectorResults.results;
              }
            } catch {
              // Vectorize may not be available in local environment
            }

            if (initialDocs.length === 0) {
              const localDocs = await searchDocs(lastUserQuery, 3);
              initialDocs = localDocs;
            }

            if (initialDocs.length > 0) {
              systemPrompt +=
                `\n\nDOKUMEN REFERENSI TERKAIT DARI BASIS PENGETAHUAN ZYX (Gunakan untuk menjawab secara akurat dan panggil tool 'retrieve_admin_knowledge' bila ingin merujuk resmi):\n` +
                initialDocs
                  .map(
                    (d) =>
                      `--- Dokumen: ${d.title} (${d.filePath}${d.section ? ` › ${d.section}` : ""})\n${d.snippet}`
                  )
                  .join("\n\n");
            }
          } catch (err) {
            console.warn("[OpsAi Knowledge Grounding Warn]:", err);
          }
        }

        // Transition initial step to completed
        const initialStepFinish = Date.now();
        emitWorkStep({
          stepId: initialStepId,
          runId,
          stepIndex: 0,
          stepType: "reasoning",
          status: "completed",
          title: "Analisis konteks permintaan admin",
          startedAt: initialStepStart,
          finishedAt: initialStepFinish,
          durationMs: initialStepFinish - initialStepStart,
        });

        // ----------------------------------------------------------------------
        // Step 3: Bounded Multi-Step Tool Execution Loop
        // ----------------------------------------------------------------------
        const conversationMessages: OpsAiModelMessage[] = messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          content: m.content,
        }));
        let lastGeneratedText = "";

        let toolStepCount = 0;
        let consecutiveToolCalls = 0;
        const streamFn = customModelStream ?? streamOpsAiModel;

        while (toolStepCount < maxToolSteps) {
          if (abortSignal?.aborted) return;
          lastGeneratedText = "";

          // Call model stream with retries for provider resilience
          let modelStreamChunks: OpsAiModelStreamChunk[] = [];
          let providerAttempt = 0;
          let lastProviderError: Error | null = null;
          const maxRetries = OPS_AI_POLICY_BOUNDS.maxRetryAttempts;

          while (providerAttempt <= maxRetries) {
            if (abortSignal?.aborted) return;
            try {
              modelStreamChunks = [];
              const stream = streamFn({
                systemPrompt,
                messages: conversationMessages,
                tools: DEFAULT_OPS_AI_TOOLS,
                modelId,
                signal: abortSignal,
              });

              for await (const chunk of stream) {
                if (abortSignal?.aborted) return;
                modelStreamChunks.push(chunk);

                // Incremental text streaming to client
                if (chunk.type === "text-delta" && chunk.textDelta) {
                  lastGeneratedText += chunk.textDelta;
                  writer.write({
                    type: "text-delta",
                    textDelta: chunk.textDelta,
                  } as any);
                }
              }

              lastProviderError = null;
              break; // Stream succeeded
            } catch (err) {
              lastProviderError = err instanceof Error ? err : new Error(String(err));
              providerAttempt++;
              if (providerAttempt <= maxRetries) {
                const backoffMs = Math.min(
                  OPS_AI_POLICY_BOUNDS.retryInitialDelayMs * Math.pow(2, providerAttempt - 1),
                  OPS_AI_POLICY_BOUNDS.retryMaxDelayMs
                );
                await new Promise((resolve) => setTimeout(resolve, backoffMs));
              }
            }
          }

          if (lastProviderError) {
            const isRateLimit =
              lastProviderError.message.includes("429") ||
              lastProviderError.message.includes("quota") ||
              lastProviderError.message.includes("RESOURCE_EXHAUSTED");
            const errorCode: OpsAiErrorCode = isRateLimit ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE";
            emitError(errorCode, lastProviderError.message, true, currentStep.value?.stepId);
            return;
          }

          // Extract tool calls from model stream
          const toolCalls = modelStreamChunks
            .filter((c) => c.type === "tool-call" && c.toolCall)
            .map((c) => c.toolCall!);

          // If no tool calls, synthesis is complete
          if (toolCalls.length === 0) {
            const finalStepId = `step-${stepIndexCounter++}`;
            const finalStart = Date.now();
            knownStepIds.add(finalStepId);

            // Inline citation verification on final text
            if (lastGeneratedText) {
              const verification = verifyInlineCitations({
                text: lastGeneratedText,
                availableCitations: allRunCitations,
                runId,
                knownStepIds,
                knownToolCallIds,
              });

              // If forged markers exist, emit invalid citation records to flag them in the trace
              if (verification.forgedMarkers.length > 0) {
                for (const forged of verification.forgedMarkers) {
                  const forgedCitation: OpsAiCitation = {
                    id: `cite-forged-${runId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    sourceId: forged.rawReference,
                    source: "semantic-rag",
                    availability: "invalid",
                    runId,
                    stepId: finalStepId,
                    title: `Sitasi Palsu/Tidak Ditemukan: ${forged.rawReference}`,
                    snippet: `Marker inline '${forged.marker}' (${forged.reason}) tidak ditemukan pada sumber yang diberikan kepada model pada run '${runId}'.`,
                    timestamp: Date.now(),
                  };
                  writer.write({
                    type: "data-citation",
                    id: `cite-${forgedCitation.id}`,
                    data: forgedCitation,
                  } as any);
                }
              }
            }

            emitWorkStep({
              stepId: finalStepId,
              runId,
              stepIndex: stepIndexCounter - 1,
              stepType: "synthesis",
              status: "completed",
              title: "Sintesis jawaban akhir",
              detail: allRunCitations.length > 0
                ? `Jawaban disintesis berdasarkan ${allRunCitations.length} ${OPS_AI_CITATION_OFFICIAL_LABEL.toLowerCase()}.`
                : undefined,
              startedAt: finalStart,
              finishedAt: Date.now(),
              durationMs: Date.now() - finalStart,
            });
            break;
          }

          // Check consecutive tool call bound
          if (consecutiveToolCalls >= maxConsecutiveToolCalls) {
            writer.write({
              type: "text-delta",
              textDelta: "\n\nBatas panggilan tool berturut-turut tercapai.",
            } as any);
            break;
          }

          const stepModelFunctionCalls: Array<Record<string, unknown>> = [];
          const stepUserFunctionResponses: Array<Record<string, unknown>> = [];

          // Execute requested tool calls sequentially
          for (const tc of toolCalls) {
            if (abortSignal?.aborted) return;
            if (toolStepCount >= maxToolSteps) break;

            toolStepCount++;
            consecutiveToolCalls++;

            const currentStepId = `step-${stepIndexCounter++}`;
            const currentStepStart = Date.now();
            const isRetrieval = tc.name === "retrieve_admin_knowledge";
            const stepType: OpsAiStepType = isRetrieval ? "retrieval" : "tool_call";
            let stepTitle = `Eksekusi tool: ${tc.name}`;
            if (isRetrieval) {
              stepTitle = `Pencarian pengetahuan admin: '${(tc.args.query as string) || ""}'`;
            } else if (tc.name === "propose_create_token") {
              stepTitle = `Penyiapan proposal pembuatan token pendaftaran`;
            } else if (OPS_AI_TOOL_SECURITY_REGISTRY[tc.name]?.allowsMutation) {
              stepTitle = `Eksekusi aksi: ${tc.name}`;
            } else {
              stepTitle = `Eksekusi tool read-only: ${tc.name}`;
            }

            // Emit queued
            emitWorkStep({
              stepId: currentStepId,
              runId,
              stepIndex: stepIndexCounter - 1,
              stepType,
              status: "queued",
              title: stepTitle,
              toolName: tc.name,
              toolCallId: tc.id,
              startedAt: currentStepStart,
            });

            // Emit running
            emitWorkStep({
              stepId: currentStepId,
              runId,
              stepIndex: stepIndexCounter - 1,
              stepType,
              status: "running",
              title: stepTitle,
              toolName: tc.name,
              toolCallId: tc.id,
              startedAt: currentStepStart,
            });

            // Write tool-call part to stream
            writer.write({
              type: "tool-call",
              toolCallId: tc.id,
              toolName: tc.name,
              input: tc.args,
            } as any);

            // Execute tool with security & authorization checks
            let toolOutput: {
              summary: string;
              data?: unknown;
              citations?: OpsAiCitation[];
              proposal?: OpsAiActionProposalV2;
            };
            try {
              const stepToolContext: OpsAiToolContext = {
                ...toolContext,
                runId,
                stepId: currentStepId,
                toolCallId: tc.id,
              };

              toolOutput = await executeOpsAiTool(tc.name, tc.args, stepToolContext);

              // ----------------------------------------------------------------
              // Emit Citations & Enforce Provenance Isolation
              // ----------------------------------------------------------------
              if (toolOutput.citations && toolOutput.citations.length > 0) {
                for (const citation of toolOutput.citations) {
                  // Enforce provenance integrity: non-retrieval tools cannot emit semantic-rag
                  assertProvenanceIntegrity(tc.name, citation.source);

                  // Validate citation schema
                  const validation = validateOpsAiCitation(citation);
                  const validCitation = validation.valid
                    ? citation
                    : { ...citation, availability: "invalid" as const };

                  allRunCitations.push(validCitation);
                  knownSourceIds.add(validCitation.sourceId);
                  knownStepIds.add(currentStepId);
                  knownToolCallIds.add(tc.id);

                  // Emit data-citation part into UI message stream
                  writer.write({
                    type: "data-citation",
                    id: `cite-${validCitation.id}`,
                    data: validCitation,
                  } as any);
                }
              }

              // ----------------------------------------------------------------
              // Emit Proposal Parts if tool produced an action proposal
              // ----------------------------------------------------------------
              if (toolOutput.proposal) {
                const proposalValidation = validateOpsAiProposal(toolOutput.proposal);
                if (!proposalValidation.valid) {
                  console.warn("[OpsAi Proposal Validation Error]:", proposalValidation.errors);
                }
                writer.write({
                  type: "data-proposal",
                  id: `prop-${toolOutput.proposal.id}`,
                  data: toolOutput.proposal,
                } as any);
              }

              const currentStepFinish = Date.now();
              emitWorkStep({
                stepId: currentStepId,
                runId,
                stepIndex: stepIndexCounter - 1,
                stepType,
                status: "completed",
                title: stepTitle,
                detail: toolOutput.summary,
                toolName: tc.name,
                toolCallId: tc.id,
                startedAt: currentStepStart,
                finishedAt: currentStepFinish,
                durationMs: currentStepFinish - currentStepStart,
              });

              // Write tool-result part to stream
              writer.write({
                type: "tool-result",
                toolCallId: tc.id,
                toolName: tc.name,
                output: toolOutput,
              } as any);

              // Accumulate functionCall and functionResponse for Gemini multi-turn protocol
              stepModelFunctionCalls.push({
                functionCall: {
                  name: tc.name,
                  args: tc.args,
                },
              });

              stepUserFunctionResponses.push({
                functionResponse: {
                  name: tc.name,
                  response: {
                    output: toolOutput,
                  },
                },
              });
            } catch (toolError) {
              const err = toolError instanceof Error ? toolError : new Error(String(toolError));
              const currentStepFinish = Date.now();

              emitWorkStep({
                stepId: currentStepId,
                runId,
                stepIndex: stepIndexCounter - 1,
                stepType,
                status: "failed",
                title: stepTitle,
                detail: `Tool ${tc.name} gagal dijalankan.`,
                toolName: tc.name,
                toolCallId: tc.id,
                startedAt: currentStepStart,
                finishedAt: currentStepFinish,
                durationMs: currentStepFinish - currentStepStart,
                retryable: false,
                error: err.message,
              });

              writer.write({
                type: "tool-result",
                toolCallId: tc.id,
                toolName: tc.name,
                output: { error: err.message },
              } as any);

              stepModelFunctionCalls.push({
                functionCall: {
                  name: tc.name,
                  args: tc.args,
                },
              });

              stepUserFunctionResponses.push({
                functionResponse: {
                  name: tc.name,
                  response: {
                    error: err.message,
                  },
                },
              });
            }
          }

          // Append functionCall (model turn) and functionResponse (user turn) to conversation
          if (stepModelFunctionCalls.length > 0) {
            conversationMessages.push({
              role: "model",
              parts: stepModelFunctionCalls,
            });
            conversationMessages.push({
              role: "user",
              parts: stepUserFunctionResponses,
            });
          }
        }

        // If loop terminated by reaching max tool steps, report notice
        if (toolStepCount >= maxToolSteps) {
          writer.write({
            type: "text-delta",
            textDelta: "\n\nBatas maksimum langkah penelusuran tercapai.",
          } as any);
        }
      } catch (fatalError) {
        const err = fatalError instanceof Error ? fatalError : new Error(String(fatalError));
        emitError("INTERNAL_ERROR", `Terjadi kesalahan internal: ${err.message}`, false, currentStep.value?.stepId);
      } finally {
        if (abortSignal) {
          abortSignal.removeEventListener("abort", onAbort);
        }
      }
    },
  });
}

/**
 * Creates an HTTP SSE Response streaming the Ops AI runtime output.
 */
export function createOpsAiRuntimeResponse(
  options: ExecuteOpsAiRuntimeOptions
): Response {
  const stream = createOpsAiRuntimeStream(options);
  return createUIMessageStreamResponse({ stream });
}
