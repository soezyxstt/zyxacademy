export type OpsAiPresetCategory = "ask" | "action";

export type OpsAiPresetIcon =
  | "compass"
  | "layout"
  | "analytics"
  | "user-check"
  | "book-check"
  | "key"
  | "layers"
  | "form"
  | "article"
  | "calendar";

export interface OpsAiPreset {
  id: string;
  label: string;
  prompt: string;
  category: OpsAiPresetCategory;
  icon: OpsAiPresetIcon;
  /** Prefer read-only "ask" mode or action-ready "edit" mode when clicked. */
  recommendedMode?: "ask" | "edit";
}

export interface DynamicOpsPresetsInput {
  pathname?: string | null;
  mode: "ask" | "edit";
  hasMessages?: boolean;
}

export interface DynamicOpsPresetsResult {
  pageLabel: string;
  routeKey: string;
  entitySlug?: string;
  presets: OpsAiPreset[];
}

export const CAPABILITY_OVERVIEW_PRESET: OpsAiPreset = {
  id: "capabilities",
  label: "Apa saja yang bisa dibantu Ops AI?",
  prompt: "Apa saja yang bisa dibantu Zyx Ops AI di halaman admin?",
  category: "ask",
  icon: "compass",
  recommendedMode: "ask",
};

interface ParsedAdminRoute {
  routeKey: string;
  pageLabel: string;
  entitySlug?: string;
}

function normalizePathname(pathname?: string | null): string {
  if (!pathname) return "/admin";
  const withoutQuery = pathname.split(/[?#]/)[0] || "/admin";
  const trimmed = withoutQuery.replace(/\/+$/, "");
  return trimmed || "/admin";
}

function formatSlugLabel(slug: string): string {
  return decodeURIComponent(slug)
    .replace(/[-_]+/g, " ")
    .trim();
}

export function parseAdminRoute(pathname?: string | null): ParsedAdminRoute {
  const path = normalizePathname(pathname);

  const courseMaterialsMatch = path.match(/^\/admin\/courses\/([^/]+)\/materials(?:\/|$)/);
  if (courseMaterialsMatch) {
    const slug = decodeURIComponent(courseMaterialsMatch[1]);
    return {
      routeKey: "course-materials",
      pageLabel: `Materi ${formatSlugLabel(slug)}`,
      entitySlug: slug,
    };
  }

  const courseQuizzesMatch = path.match(/^\/admin\/courses\/([^/]+)\/quizzes(?:\/|$)/);
  if (courseQuizzesMatch) {
    const slug = decodeURIComponent(courseQuizzesMatch[1]);
    return {
      routeKey: "course-quizzes",
      pageLabel: `Kuis ${formatSlugLabel(slug)}`,
      entitySlug: slug,
    };
  }

  const courseDetailMatch = path.match(/^\/admin\/courses\/([^/]+)(?:\/|$)/);
  if (courseDetailMatch && courseDetailMatch[1] !== "new") {
    const slug = decodeURIComponent(courseDetailMatch[1]);
    return {
      routeKey: "course-detail",
      pageLabel: `Mata Kuliah ${formatSlugLabel(slug)}`,
      entitySlug: slug,
    };
  }

  if (path === "/admin/courses" || path.startsWith("/admin/courses/")) {
    return { routeKey: "courses", pageLabel: "Mata Kuliah" };
  }

  if (path === "/admin/forms" || path.startsWith("/admin/forms/")) {
    return { routeKey: "forms", pageLabel: "Formulir" };
  }

  if (path === "/admin/users" || path.startsWith("/admin/users/")) {
    return { routeKey: "users", pageLabel: "Pengguna" };
  }

  if (path === "/admin/tokens" || path.startsWith("/admin/tokens/")) {
    return { routeKey: "tokens", pageLabel: "Token Aktivasi" };
  }

  if (path === "/admin/groups" || path.startsWith("/admin/groups/")) {
    return { routeKey: "groups", pageLabel: "Kelompok Belajar" };
  }

  if (path === "/admin/schedules" || path.startsWith("/admin/schedules/")) {
    return { routeKey: "schedules", pageLabel: "Jadwal" };
  }

  if (path === "/admin/blog" || path.startsWith("/admin/blog/")) {
    return { routeKey: "blog", pageLabel: "Blog" };
  }

  if (path === "/admin/analytics" || path.startsWith("/admin/analytics/")) {
    return { routeKey: "analytics", pageLabel: "Analitik" };
  }

  if (path === "/admin/ops/tutor-activity" || path.startsWith("/admin/ops/tutor-activity/")) {
    return { routeKey: "ops-tutor-activity", pageLabel: "Aktivitas Tutor" };
  }

  if (path === "/admin/ops/ai-analytics" || path.startsWith("/admin/ops/ai-analytics/")) {
    return { routeKey: "ops-ai-analytics", pageLabel: "Analitik AI" };
  }

  if (path === "/admin/ops" || path.startsWith("/admin/ops/")) {
    return { routeKey: "ops", pageLabel: "Operasional" };
  }

  return { routeKey: "dashboard", pageLabel: "Dashboard Admin" };
}

function buildRoutePresets(
  parsed: ParsedAdminRoute,
  mode: "ask" | "edit"
): OpsAiPreset[] {
  const slug = parsed.entitySlug;
  const slugLabel = slug ? formatSlugLabel(slug) : "";

  switch (parsed.routeKey) {
    case "course-materials":
      if (mode === "ask") {
        return [
          {
            id: `cm-ask-audit-${slug}`,
            label: `Audit materi dan bab ${slugLabel}`,
            prompt: `Audit kelengkapan materi, diktat, video, dan pemetaan bab pada mata kuliah '${slug}'.`,
            category: "ask",
            icon: "book-check",
            recommendedMode: "ask",
          },
          {
            id: `cm-ask-unassigned-${slug}`,
            label: "Cek berkas belum masuk bab",
            prompt: `Daftar berkas materi pada mata kuliah '${slug}' yang belum memiliki bab atau metadata lengkap.`,
            category: "ask",
            icon: "layers",
            recommendedMode: "ask",
          },
          {
            id: `cm-ask-rag-${slug}`,
            label: "Cek status sinkronisasi RAG",
            prompt: `Periksa status job sinkronisasi materi dan indeks RAG terbaru untuk mata kuliah '${slug}'.`,
            category: "ask",
            icon: "analytics",
            recommendedMode: "ask",
          },
          {
            id: `cm-ask-page-${slug}`,
            label: "Jelaskan alur kelola materi",
            prompt: "Jelaskan alur pengelolaan berkas materi, kategori, dan sinkronisasi di halaman ini.",
            category: "ask",
            icon: "layout",
            recommendedMode: "ask",
          },
        ];
      }
      return [
        {
          id: `cm-edit-metadata-${slug}`,
          label: `Rapikan metadata materi ${slugLabel}`,
          prompt: `Periksa berkas materi pada mata kuliah '${slug}' lalu siapkan pembaruan metadata untuk berkas yang judul, kategori, atau babnya belum rapi.`,
          category: "action",
          icon: "layers",
          recommendedMode: "edit",
        },
        {
          id: `cm-edit-chapters-${slug}`,
          label: `Tambah bab baru di ${slugLabel}`,
          prompt: `Cek daftar bab mata kuliah '${slug}' saat ini lalu siapkan proposal penambahan bab lanjutan sesuai struktur kurikulum.`,
          category: "action",
          icon: "book-check",
          recommendedMode: "edit",
        },
        {
          id: `cm-edit-audit-${slug}`,
          label: `Audit kelengkapan ${slugLabel}`,
          prompt: `Audit kelengkapan bab, materi, dan soal pada mata kuliah '${slug}' lalu rekomendasikan perbaikan prioritas.`,
          category: "ask",
          icon: "analytics",
          recommendedMode: "ask",
        },
        {
          id: `cm-edit-authoring-${slug}`,
          label: "Siapkan alur authoring materi",
          prompt: `Periksa playbook authoring Zyx dan siapkan langkah pembuatan materi terstruktur untuk mata kuliah '${slug}'.`,
          category: "action",
          icon: "article",
          recommendedMode: "edit",
        },
      ];

    case "course-quizzes":
      if (mode === "ask") {
        return [
          {
            id: `cq-ask-list-${slug}`,
            label: `Ringkas daftar kuis ${slugLabel}`,
            prompt: `Tampilkan daftar kuis pada mata kuliah '${slug}' beserta jumlah soal dan status publikasinya.`,
            category: "ask",
            icon: "book-check",
            recommendedMode: "ask",
          },
          {
            id: `cq-ask-audit-${slug}`,
            label: "Cek cakupan soal per bab",
            prompt: `Audit kelengkapan kuis dan distribusi soal per bab pada mata kuliah '${slug}'.`,
            category: "ask",
            icon: "analytics",
            recommendedMode: "ask",
          },
          {
            id: `cq-ask-jobs-${slug}`,
            label: "Cek status job generasi soal",
            prompt: `Periksa status job latar belakang terkait generasi soal atau sinkronisasi kuis untuk mata kuliah '${slug}'.`,
            category: "ask",
            icon: "layers",
            recommendedMode: "ask",
          },
          {
            id: `cq-ask-sop-${slug}`,
            label: "Cek aturan publikasi kuis",
            prompt: "Jelaskan SOP dan aturan publikasi kuis serta bank soal di panel admin Zyx.",
            category: "ask",
            icon: "layout",
            recommendedMode: "ask",
          },
        ];
      }
      return [
        {
          id: `cq-edit-review-${slug}`,
          label: `Siapkan pembaruan kuis ${slugLabel}`,
          prompt: `Periksa daftar kuis pada mata kuliah '${slug}' dan cek operasi kuis yang tersedia untuk menyiapkan pembaruan status atau pengaturan kuis.`,
          category: "action",
          icon: "book-check",
          recommendedMode: "edit",
        },
        {
          id: `cq-edit-chapters-${slug}`,
          label: "Tambah bab untuk bank soal",
          prompt: `Cek daftar bab mata kuliah '${slug}' lalu siapkan proposal penambahan bab baru yang belum ada.`,
          category: "action",
          icon: "layers",
          recommendedMode: "edit",
        },
        {
          id: `cq-edit-audit-${slug}`,
          label: "Audit kesiapan kuis per bab",
          prompt: `Audit kelengkapan bab, materi, dan kuis pada mata kuliah '${slug}' untuk mencari bab yang belum punya soal.`,
          category: "ask",
          icon: "analytics",
          recommendedMode: "ask",
        },
      ];

    case "course-detail":
      if (mode === "ask") {
        return [
          {
            id: `cd-ask-audit-${slug}`,
            label: `Audit kelengkapan ${slugLabel}`,
            prompt: `Audit kelengkapan bab, materi, dan soal pada mata kuliah '${slug}'.`,
            category: "ask",
            icon: "book-check",
            recommendedMode: "ask",
          },
          {
            id: `cd-ask-quizzes-${slug}`,
            label: `Daftar kuis ${slugLabel}`,
            prompt: `Tampilkan daftar kuis yang ada di mata kuliah '${slug}' beserta statusnya.`,
            category: "ask",
            icon: "layers",
            recommendedMode: "ask",
          },
          {
            id: `cd-ask-jobs-${slug}`,
            label: "Cek status job mata kuliah ini",
            prompt: `Periksa status job latar belakang terbaru yang berkaitan dengan mata kuliah '${slug}'.`,
            category: "ask",
            icon: "analytics",
            recommendedMode: "ask",
          },
          {
            id: `cd-ask-page-${slug}`,
            label: "Jelaskan fitur halaman mata kuliah",
            prompt: "Jelaskan fitur dan tab pengelolaan pada halaman detail mata kuliah ini.",
            category: "ask",
            icon: "layout",
            recommendedMode: "ask",
          },
        ];
      }
      return [
        {
          id: `cd-edit-chapters-${slug}`,
          label: `Tambah bab baru di ${slugLabel}`,
          prompt: `Periksa bab yang sudah ada pada mata kuliah '${slug}' lalu siapkan proposal penambahan bab baru.`,
          category: "action",
          icon: "layers",
          recommendedMode: "edit",
        },
        {
          id: `cd-edit-materials-${slug}`,
          label: `Rapikan metadata materi ${slugLabel}`,
          prompt: `Cek daftar berkas materi pada mata kuliah '${slug}' dan siapkan pembaruan metadata untuk berkas yang belum lengkap.`,
          category: "action",
          icon: "book-check",
          recommendedMode: "edit",
        },
        {
          id: `cd-edit-token-${slug}`,
          label: `Buat token untuk ${slugLabel}`,
          prompt: `Siapkan proposal pembuatan token aktivasi kelompok baru yang mencakup mata kuliah '${slug}'.`,
          category: "action",
          icon: "key",
          recommendedMode: "edit",
        },
        {
          id: `cd-edit-audit-${slug}`,
          label: `Audit kelengkapan ${slugLabel}`,
          prompt: `Audit kelengkapan bab, materi, dan soal pada mata kuliah '${slug}'.`,
          category: "ask",
          icon: "analytics",
          recommendedMode: "ask",
        },
      ];

    case "courses":
      if (mode === "ask") {
        return [
          {
            id: "courses-ask-summary",
            label: "Ringkas semua mata kuliah aktif",
            prompt: "Tampilkan ringkasan daftar mata kuliah aktif beserta status kelengkapan dasarnya.",
            category: "ask",
            icon: "book-check",
            recommendedMode: "ask",
          },
          {
            id: "courses-ask-gaps",
            label: "Cari mata kuliah belum lengkap",
            prompt: "Identifikasi mata kuliah yang bab, materi, atau bank soalnya masih minim.",
            category: "ask",
            icon: "analytics",
            recommendedMode: "ask",
          },
          {
            id: "courses-ask-jobs",
            label: "Cek job ingest dan sinkronisasi",
            prompt: "Periksa status job latar belakang terbaru terkait ingest materi atau kuis.",
            category: "ask",
            icon: "layers",
            recommendedMode: "ask",
          },
          {
            id: "courses-ask-page",
            label: "Jelaskan fitur halaman mata kuliah",
            prompt: "Jelaskan fitur dan fungsi halaman daftar mata kuliah di panel admin Zyx.",
            category: "ask",
            icon: "layout",
            recommendedMode: "ask",
          },
        ];
      }
      return [
        {
          id: "courses-edit-create",
          label: "Buat mata kuliah baru",
          prompt: "Periksa operasi pembuatan mata kuliah lalu bantu saya menyiapkan draf pembuatan mata kuliah baru.",
          category: "action",
          icon: "book-check",
          recommendedMode: "edit",
        },
        {
          id: "courses-edit-chapters",
          label: "Tambah daftar bab secara massal",
          prompt: "Tampilkan daftar mata kuliah aktif lalu siapkan proposal penambahan bab secara massal.",
          category: "action",
          icon: "layers",
          recommendedMode: "edit",
        },
        {
          id: "courses-edit-token",
          label: "Buat token aktivasi mata kuliah",
          prompt: "Tampilkan mata kuliah aktif lalu siapkan proposal pembuatan token aktivasi kelompok baru.",
          category: "action",
          icon: "key",
          recommendedMode: "edit",
        },
        {
          id: "courses-edit-audit",
          label: "Audit kesiapan mata kuliah aktif",
          prompt: "Ringkas status kelengkapan mata kuliah aktif dan rekomendasikan mana yang perlu dilengkapi dulu.",
          category: "ask",
          icon: "analytics",
          recommendedMode: "ask",
        },
      ];

    case "forms":
      if (mode === "ask") {
        return [
          {
            id: "forms-ask-list",
            label: "Daftar formulir aktif dan respons",
            prompt: "Tampilkan daftar formulir yang ada beserta status publikasi dan ringkasan jumlah responsnya.",
            category: "ask",
            icon: "form",
            recommendedMode: "ask",
          },
          {
            id: "forms-ask-presets",
            label: "Cek daftar preset formulir",
            prompt: "Tampilkan daftar preset formulir yang tersedia saat ini di Zyx.",
            category: "ask",
            icon: "layers",
            recommendedMode: "ask",
          },
          {
            id: "forms-ask-recent",
            label: "Ringkas respons formulir terbaru",
            prompt: "Periksa formulir yang paling baru menerima respons lalu ringkas isian terbarunya.",
            category: "ask",
            icon: "analytics",
            recommendedMode: "ask",
          },
          {
            id: "forms-ask-sop",
            label: "Jelaskan alur kerja formulir",
            prompt: "Jelaskan fitur formulir, preset, dan cara publikasi formulir di panel admin Zyx.",
            category: "ask",
            icon: "layout",
            recommendedMode: "ask",
          },
        ];
      }
      return [
        {
          id: "forms-edit-create",
          label: "Buat formulir pendaftaran baru",
          prompt: "Periksa skema operasi formulir lalu siapkan proposal pembuatan formulir pendaftaran baru.",
          category: "action",
          icon: "form",
          recommendedMode: "edit",
        },
        {
          id: "forms-edit-preset",
          label: "Buat atau perbarui preset formulir",
          prompt: "Tampilkan preset formulir yang ada lalu bantu siapkan pembuatan atau pembaruan preset formulir.",
          category: "action",
          icon: "layers",
          recommendedMode: "edit",
        },
        {
          id: "forms-edit-publish",
          label: "Cek draf formulir siap terbit",
          prompt: "Daftar formulir yang masih berstatus draf lalu siapkan langkah untuk meninjau atau menerbitkannya.",
          category: "action",
          icon: "article",
          recommendedMode: "edit",
        },
        {
          id: "forms-edit-summary",
          label: "Ringkas respons formulir aktif",
          prompt: "Tampilkan daftar formulir aktif dan ringkas respons terbarunya.",
          category: "ask",
          icon: "analytics",
          recommendedMode: "ask",
        },
      ];

    case "users":
      if (mode === "ask") {
        return [
          {
            id: "users-ask-pending",
            label: "Cek siswa status pending atau bermasalah",
            prompt: "Cek siswa dengan status pending, belum terverifikasi, atau kendala akses terbaru.",
            category: "ask",
            icon: "user-check",
            recommendedMode: "ask",
          },
          {
            id: "users-ask-summary",
            label: "Ringkas jumlah pengguna per peran",
            prompt: "Tampilkan ringkasan jumlah pengguna aktif berdasarkan peran admin, tutor, dan siswa.",
            category: "ask",
            icon: "analytics",
            recommendedMode: "ask",
          },
          {
            id: "users-ask-recent",
            label: "Daftar pendaftar terbaru",
            prompt: "Tampilkan daftar pengguna yang paling baru mendaftar beserta status enrollment-nya.",
            category: "ask",
            icon: "layers",
            recommendedMode: "ask",
          },
          {
            id: "users-ask-sop",
            label: "Jelaskan alur diagnosa akses siswa",
            prompt: "Jelaskan SOP penanganan kendala akses, enrollment, dan peran pengguna di Zyx.",
            category: "ask",
            icon: "layout",
            recommendedMode: "ask",
          },
        ];
      }
      return [
        {
          id: "users-edit-pending",
          label: "Tinjau siswa pending untuk ditindaklanjuti",
          prompt: "Cek siswa dengan status pending atau enrollment bermasalah terbaru lalu sarankan aksi perbaikan yang tersedia.",
          category: "action",
          icon: "user-check",
          recommendedMode: "edit",
        },
        {
          id: "users-edit-token",
          label: "Buat token aktivasi untuk siswa",
          prompt: "Cek mata kuliah aktif lalu siapkan proposal pembuatan token aktivasi pendaftaran baru.",
          category: "action",
          icon: "key",
          recommendedMode: "edit",
        },
        {
          id: "users-edit-group",
          label: "Cek kelompok belajar berkapasitas sisa",
          prompt: "Tampilkan kelompok belajar yang masih punya sisa kuota untuk penempatan siswa.",
          category: "action",
          icon: "layers",
          recommendedMode: "edit",
        },
        {
          id: "users-edit-summary",
          label: "Ringkas statistik pengguna aktif",
          prompt: "Tampilkan ringkasan data pengguna per peran dan status sistem saat ini.",
          category: "ask",
          icon: "analytics",
          recommendedMode: "ask",
        },
      ];

    case "tokens":
      if (mode === "ask") {
        return [
          {
            id: "tokens-ask-quota",
            label: "Cek sisa kuota token aktif",
            prompt: "Tampilkan daftar token aktivasi aktif beserta kapasitas, pemakaian, dan sisa kuotanya.",
            category: "ask",
            icon: "key",
            recommendedMode: "ask",
          },
          {
            id: "tokens-ask-low",
            label: "Cari token hampir habis",
            prompt: "Periksa token aktivasi yang sisa kuotanya tinggal sedikit atau sudah penuh.",
            category: "ask",
            icon: "analytics",
            recommendedMode: "ask",
          },
          {
            id: "tokens-ask-sop",
            label: "Jelaskan format dan aturan token Zyx",
            prompt: "Jelaskan format prefix token Zyx, kapasitas kuota, dan aturan aktivasi siswa.",
            category: "ask",
            icon: "layout",
            recommendedMode: "ask",
          },
        ];
      }
      return [
        {
          id: "tokens-edit-create",
          label: "Buat token aktivasi kelompok baru",
          prompt: "Tampilkan daftar mata kuliah aktif lalu siapkan proposal pembuatan token aktivasi kelompok baru.",
          category: "action",
          icon: "key",
          recommendedMode: "edit",
        },
        {
          id: "tokens-edit-audit",
          label: "Cek token hampir habis untuk ditambah",
          prompt: "Periksa daftar token aktivasi yang sisa kuotanya hampir habis agar bisa disiapkan penggantinya.",
          category: "ask",
          icon: "analytics",
          recommendedMode: "ask",
        },
        {
          id: "tokens-edit-groups",
          label: "Sinkronkan dengan kuota kelompok",
          prompt: "Periksa daftar kelompok belajar aktif untuk memastikan kesesuaian kuota dengan token aktivasi.",
          category: "action",
          icon: "layers",
          recommendedMode: "edit",
        },
      ];

    case "groups":
      if (mode === "ask") {
        return [
          {
            id: "groups-ask-list",
            label: "Ringkas kelompok belajar dan kuota",
            prompt: "Tampilkan daftar kelompok belajar aktif beserta jumlah anggota dan kapasitasnya.",
            category: "ask",
            icon: "layers",
            recommendedMode: "ask",
          },
          {
            id: "groups-ask-capacity",
            label: "Cek kelompok penuh atau kosong",
            prompt: "Identifikasi kelompok belajar yang sudah mencapai kapasitas penuh atau masih kosong.",
            category: "ask",
            icon: "analytics",
            recommendedMode: "ask",
          },
          {
            id: "groups-ask-sop",
            label: "Jelaskan pengelolaan kelompok belajar",
            prompt: "Jelaskan alur pengelolaan kelompok belajar, kuota, dan penugasan tutor di Zyx.",
            category: "ask",
            icon: "layout",
            recommendedMode: "ask",
          },
        ];
      }
      return [
        {
          id: "groups-edit-create",
          label: "Buat kelompok belajar baru",
          prompt: "Periksa operasi kelompok belajar lalu siapkan proposal pembuatan kelompok belajar baru.",
          category: "action",
          icon: "layers",
          recommendedMode: "edit",
        },
        {
          id: "groups-edit-quota",
          label: "Tinjau kelompok yang perlu tambah kuota",
          prompt: "Cek kelompok belajar yang hampir penuh lalu siapkan opsi penyesuaian kuota.",
          category: "action",
          icon: "user-check",
          recommendedMode: "edit",
        },
        {
          id: "groups-edit-schedule",
          label: "Cek jadwal terkait kelompok belajar",
          prompt: "Tampilkan jadwal sesi tutorial terdekat yang terhubung dengan kelompok belajar aktif.",
          category: "ask",
          icon: "calendar",
          recommendedMode: "ask",
        },
      ];

    case "schedules":
      if (mode === "ask") {
        return [
          {
            id: "schedules-ask-upcoming",
            label: "Cek jadwal sesi terdekat",
            prompt: "Tampilkan daftar jadwal sesi tutorial terdekat beserta tutor dan kelompoknya.",
            category: "ask",
            icon: "calendar",
            recommendedMode: "ask",
          },
          {
            id: "schedules-ask-conflicts",
            label: "Periksa potensi bentrok jadwal",
            prompt: "Periksa jadwal sesi aktif untuk mendeteksi potensi waktu bentrok atau sesi tanpa tautan.",
            category: "ask",
            icon: "analytics",
            recommendedMode: "ask",
          },
          {
            id: "schedules-ask-sop",
            label: "Jelaskan fitur halaman jadwal",
            prompt: "Jelaskan fitur pengelolaan jadwal tutorial dan tautan sesi di panel admin Zyx.",
            category: "ask",
            icon: "layout",
            recommendedMode: "ask",
          },
        ];
      }
      return [
        {
          id: "schedules-edit-create",
          label: "Buat jadwal sesi tutorial baru",
          prompt: "Periksa operasi jadwal lalu siapkan proposal pembuatan jadwal sesi tutorial baru.",
          category: "action",
          icon: "calendar",
          recommendedMode: "edit",
        },
        {
          id: "schedules-edit-shortlink",
          label: "Buat shortlink untuk sesi tutorial",
          prompt: "Periksa operasi shortlink lalu siapkan proposal pembuatan tautan pendek baru untuk sesi.",
          category: "action",
          icon: "layers",
          recommendedMode: "edit",
        },
        {
          id: "schedules-edit-upcoming",
          label: "Tinjau jadwal terdekat",
          prompt: "Tampilkan jadwal sesi tutorial terdekat yang mungkin perlu diperbarui.",
          category: "ask",
          icon: "analytics",
          recommendedMode: "ask",
        },
      ];

    case "blog":
      if (mode === "ask") {
        return [
          {
            id: "blog-ask-list",
            label: "Daftar artikel dan draf blog",
            prompt: "Tampilkan daftar artikel blog terbaru beserta status publikasi dan drafnya.",
            category: "ask",
            icon: "article",
            recommendedMode: "ask",
          },
          {
            id: "blog-ask-drafts",
            label: "Cek draf artikel belum terbit",
            prompt: "Daftar artikel blog yang masih berstatus draf dan perlu ditinjau.",
            category: "ask",
            icon: "layers",
            recommendedMode: "ask",
          },
          {
            id: "blog-ask-sop",
            label: "Jelaskan pedoman penulisan blog Zyx",
            prompt: "Jelaskan struktur metadata dan alur publikasi artikel blog di panel admin Zyx.",
            category: "ask",
            icon: "layout",
            recommendedMode: "ask",
          },
        ];
      }
      return [
        {
          id: "blog-edit-create",
          label: "Buat draf artikel blog baru",
          prompt: "Periksa skema operasi blog lalu siapkan proposal pembuatan draf artikel blog baru.",
          category: "action",
          icon: "article",
          recommendedMode: "edit",
        },
        {
          id: "blog-edit-update",
          label: "Tinjau draf blog untuk disunting",
          prompt: "Tampilkan daftar draf artikel blog yang tersedia agar saya bisa memilih mana yang perlu diperbarui.",
          category: "action",
          icon: "layers",
          recommendedMode: "edit",
        },
        {
          id: "blog-edit-shortlink",
          label: "Buat shortlink promosi artikel",
          prompt: "Periksa operasi shortlink lalu bantu siapkan tautan pendek untuk artikel blog terbaru.",
          category: "action",
          icon: "compass",
          recommendedMode: "edit",
        },
      ];

    case "analytics":
      if (mode === "ask") {
        return [
          {
            id: "analytics-ask-overview",
            label: "Ringkas metrik pengguna dan mata kuliah",
            prompt: "Tampilkan ringkasan analitik pengguna, enrollment, dan performa mata kuliah saat ini.",
            category: "ask",
            icon: "analytics",
            recommendedMode: "ask",
          },
          {
            id: "analytics-ask-jobs",
            label: "Cek status job dan feature flags",
            prompt: "Periksa status job latar belakang terbaru dan daftar feature flags yang sedang aktif.",
            category: "ask",
            icon: "layers",
            recommendedMode: "ask",
          },
          {
            id: "analytics-ask-courses",
            label: "Cek mata kuliah perlu perhatian",
            prompt: "Identifikasi mata kuliah dengan kelengkapan konten rendah atau anomali aktivitas.",
            category: "ask",
            icon: "book-check",
            recommendedMode: "ask",
          },
        ];
      }
      return [
        {
          id: "analytics-edit-overview",
          label: "Ringkas metrik lalu sarankan tindak lanjut",
          prompt: "Tampilkan ringkasan analitik pengguna dan mata kuliah lalu sarankan aksi operasional prioritas.",
          category: "ask",
          icon: "analytics",
          recommendedMode: "ask",
        },
        {
          id: "analytics-edit-token",
          label: "Buat token aktivasi kelompok",
          prompt: "Cek mata kuliah aktif lalu siapkan proposal pembuatan token aktivasi kelompok baru.",
          category: "action",
          icon: "key",
          recommendedMode: "edit",
        },
        {
          id: "analytics-edit-form",
          label: "Buat formulir survei atau pendaftaran",
          prompt: "Periksa operasi formulir lalu siapkan proposal pembuatan formulir baru.",
          category: "action",
          icon: "form",
          recommendedMode: "edit",
        },
      ];

    case "ops-tutor-activity":
      if (mode === "ask") {
        return [
          {
            id: "ota-ask-24h",
            label: "Ringkas aktivitas mutasi tutor 24 jam terakhir",
            prompt: "Ringkas aktivitas mutasi tutor dalam 24 jam terakhir beserta mata kuliah dan jenis perubahannya.",
            category: "ask",
            icon: "analytics",
            recommendedMode: "ask",
          },
          {
            id: "ota-ask-risky",
            label: "Cek penghapusan atau perubahan besar tutor",
            prompt: "Periksa log aktivitas tutor terbaru untuk mendeteksi aksi penghapusan atau perubahan kurikulum besar.",
            category: "ask",
            icon: "user-check",
            recommendedMode: "ask",
          },
          {
            id: "ota-ask-sop",
            label: "Jelaskan jejak audit aktivitas tutor",
            prompt: "Jelaskan jenis aksi tutor yang dicatat dan cara meninjau detail perubahan di halaman Aktivitas Tutor.",
            category: "ask",
            icon: "layout",
            recommendedMode: "ask",
          },
        ];
      }
      return [
        {
          id: "ota-edit-24h",
          label: "Ringkas aktivitas mutasi tutor 24 jam terakhir",
          prompt: "Ringkas aktivitas mutasi tutor dalam 24 jam terakhir dan tandai perubahan yang perlu ditinjau admin.",
          category: "ask",
          icon: "analytics",
          recommendedMode: "ask",
        },
        {
          id: "ota-edit-audit-course",
          label: "Audit mata kuliah yang baru diubah tutor",
          prompt: "Cek aktivitas tutor terbaru lalu audit kelengkapan mata kuliah yang paling baru mengalami perubahan.",
          category: "ask",
          icon: "book-check",
          recommendedMode: "ask",
        },
        {
          id: "ota-edit-ops-status",
          label: "Cek status job setelah perubahan tutor",
          prompt: "Periksa status job latar belakang terbaru setelah perubahan materi atau kuis oleh tutor.",
          category: "action",
          icon: "layers",
          recommendedMode: "edit",
        },
      ];

    case "ops-ai-analytics":
      if (mode === "ask") {
        return [
          {
            id: "oaa-ask-summary",
            label: "Ringkas status layanan dan job AI",
            prompt: "Periksa status job AI latar belakang terbaru, feature flags AI aktif, dan ringkasan sistem.",
            category: "ask",
            icon: "analytics",
            recommendedMode: "ask",
          },
          {
            id: "oaa-ask-errors",
            label: "Cek job AI gagal atau tertunda",
            prompt: "Periksa apakah ada job latar belakang terkait AI atau ingest yang gagal atau tertunda saat ini.",
            category: "ask",
            icon: "layers",
            recommendedMode: "ask",
          },
          {
            id: "oaa-ask-sop",
            label: "Jelaskan telemetri AI Gateway Zyx",
            prompt: "Jelaskan cara kerja analitik AI Gateway dan pemantauan penggunaan model di Zyx.",
            category: "ask",
            icon: "layout",
            recommendedMode: "ask",
          },
        ];
      }
      return [
        {
          id: "oaa-edit-jobs",
          label: "Cek job AI gagal untuk tindak lanjut",
          prompt: "Periksa job latar belakang AI atau ingest yang gagal terbaru lalu rekomendasikan langkah pemulihannya.",
          category: "ask",
          icon: "analytics",
          recommendedMode: "ask",
        },
        {
          id: "oaa-edit-flags",
          label: "Periksa feature flags operasional AI",
          prompt: "Tampilkan daftar feature flags operasional yang aktif saat ini dan jelaskan dampaknya.",
          category: "ask",
          icon: "layers",
          recommendedMode: "ask",
        },
        {
          id: "oaa-edit-audit",
          label: "Cek kesehatan sistem admin",
          prompt: "Tampilkan ringkasan data pengguna, mata kuliah, feature flags, dan status job aktif.",
          category: "ask",
          icon: "compass",
          recommendedMode: "ask",
        },
      ];

    case "ops":
      if (mode === "ask") {
        return [
          {
            id: "ops-ask-status",
            label: "Cek status job dan feature flags aktif",
            prompt: "Periksa status job latar belakang terbaru dan daftar feature flags yang sedang aktif.",
            category: "ask",
            icon: "analytics",
            recommendedMode: "ask",
          },
          {
            id: "ops-ask-tutor",
            label: "Ringkas aktivitas mutasi tutor 24 jam terakhir",
            prompt: "Ringkas aktivitas mutasi tutor dalam 24 jam terakhir.",
            category: "ask",
            icon: "user-check",
            recommendedMode: "ask",
          },
          {
            id: "ops-ask-system",
            label: "Cek ringkasan data dan kesehatan sistem",
            prompt: "Tampilkan ringkasan data pengguna, mata kuliah, feature flags, dan status job aktif.",
            category: "ask",
            icon: "layers",
            recommendedMode: "ask",
          },
          {
            id: "ops-ask-runbook",
            label: "Cek runbook operasional Zyx",
            prompt: "Cari dan ringkas prosedur operasional penting dari dokumentasi runbook Zyx.",
            category: "ask",
            icon: "layout",
            recommendedMode: "ask",
          },
        ];
      }
      return [
        {
          id: "ops-edit-status",
          label: "Cek job bermasalah dan langkah pemulihan",
          prompt: "Periksa status job latar belakang terbaru dan rekomendasikan langkah pemulihan bila ada yang gagal.",
          category: "ask",
          icon: "analytics",
          recommendedMode: "ask",
        },
        {
          id: "ops-edit-token",
          label: "Buat token aktivasi kelompok baru",
          prompt: "Tampilkan mata kuliah aktif lalu siapkan proposal pembuatan token aktivasi kelompok baru.",
          category: "action",
          icon: "key",
          recommendedMode: "edit",
        },
        {
          id: "ops-edit-form",
          label: "Buat formulir operasional baru",
          prompt: "Periksa skema operasi formulir lalu siapkan proposal pembuatan formulir baru.",
          category: "action",
          icon: "form",
          recommendedMode: "edit",
        },
        {
          id: "ops-edit-schedule",
          label: "Kelola jadwal atau shortlink",
          prompt: "Tampilkan jadwal sesi terdekat lalu bantu siapkan jadwal baru atau shortlink operasional.",
          category: "action",
          icon: "calendar",
          recommendedMode: "edit",
        },
      ];

    case "dashboard":
    default:
      if (mode === "ask") {
        return [
          {
            id: "dash-ask-overview",
            label: "Cek ringkasan data dan status sistem",
            prompt: "Tampilkan ringkasan data pengguna, mata kuliah, feature flags, dan status job aktif.",
            category: "ask",
            icon: "analytics",
            recommendedMode: "ask",
          },
          {
            id: "dash-ask-pending-users",
            label: "Cek siswa status pending terbaru",
            prompt: "Cek siswa dengan status pending atau kendala akses terbaru.",
            category: "ask",
            icon: "user-check",
            recommendedMode: "ask",
          },
          {
            id: "dash-ask-tutor-activity",
            label: "Ringkas aktivitas mutasi tutor 24 jam terakhir",
            prompt: "Ringkas aktivitas mutasi tutor dalam 24 jam terakhir.",
            category: "ask",
            icon: "book-check",
            recommendedMode: "ask",
          },
          {
            id: "dash-ask-page",
            label: "Jelaskan fitur halaman ini",
            prompt: "Jelaskan fitur dan fungsi halaman admin yang sedang saya buka saat ini.",
            category: "ask",
            icon: "layout",
            recommendedMode: "ask",
          },
        ];
      }
      return [
        {
          id: "dash-edit-token",
          label: "Buat token aktivasi kelompok",
          prompt: "Tampilkan mata kuliah aktif lalu siapkan proposal pembuatan token aktivasi kelompok baru.",
          category: "action",
          icon: "key",
          recommendedMode: "edit",
        },
        {
          id: "dash-edit-form",
          label: "Buat formulir pendaftaran baru",
          prompt: "Periksa skema operasi formulir lalu siapkan proposal pembuatan formulir pendaftaran baru.",
          category: "action",
          icon: "form",
          recommendedMode: "edit",
        },
        {
          id: "dash-edit-chapters",
          label: "Tambah bab baru pada mata kuliah",
          prompt: "Tampilkan daftar mata kuliah aktif lalu siapkan proposal penambahan bab baru.",
          category: "action",
          icon: "layers",
          recommendedMode: "edit",
        },
        {
          id: "dash-edit-blog",
          label: "Buat draf artikel blog baru",
          prompt: "Periksa skema operasi blog lalu siapkan proposal pembuatan draf artikel blog baru.",
          category: "action",
          icon: "article",
          recommendedMode: "edit",
        },
        {
          id: "dash-edit-overview",
          label: "Cek ringkasan data dan status sistem",
          prompt: "Tampilkan ringkasan data pengguna, mata kuliah, feature flags, dan status job aktif.",
          category: "ask",
          icon: "analytics",
          recommendedMode: "ask",
        },
      ];
  }
}

/**
 * Deterministically resolves 3 to 6 relevant presets tailored to the active
 * admin route/entity and chat mode (`ask` vs `edit`).
 */
export function resolveDynamicOpsPresets({
  pathname,
  mode,
  hasMessages = false,
}: DynamicOpsPresetsInput): DynamicOpsPresetsResult {
  const parsed = parseAdminRoute(pathname);
  const rawPresets = buildRoutePresets(parsed, mode);

  // When already mid-conversation, omit generic "Jelaskan fitur halaman ini"
  // if we still have at least 3 concrete route presets.
  const filtered =
    hasMessages && rawPresets.length > 3
      ? rawPresets.filter((item) => item.icon !== "layout")
      : rawPresets;

  return {
    pageLabel: parsed.pageLabel,
    routeKey: parsed.routeKey,
    ...(parsed.entitySlug ? { entitySlug: parsed.entitySlug } : {}),
    presets: filtered.slice(0, 6),
  };
}

/**
 * Default dashboard preset set combining ask and action entries.
 * Retained for compatibility with callers expecting a flat preset list.
 */
export const OPS_AI_PRESETS: OpsAiPreset[] = [
  ...resolveDynamicOpsPresets({ pathname: "/admin", mode: "ask" }).presets,
  ...resolveDynamicOpsPresets({ pathname: "/admin", mode: "edit" }).presets.filter(
    (p) => p.category === "action"
  ),
];

export function getAdminRouteContext(pathname?: string | null): {
  pageLabel: string;
  routePreset: OpsAiPreset | null;
} {
  const resolved = resolveDynamicOpsPresets({ pathname, mode: "edit" });
  return {
    pageLabel: resolved.pageLabel,
    routePreset: resolved.routeKey === "dashboard" ? null : (resolved.presets[0] ?? null),
  };
}
