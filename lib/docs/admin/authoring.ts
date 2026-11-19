import type { BilingualDocEntry } from "../types";

export const adminAuthoringDocs: BilingualDocEntry[] = [
  {
    slug: "mcp-lingkungan-dan-handoff",
    id: {
      category: "Authoring dan MCP",
      title: "Memberi tugas kepada agen melalui MCP",
      summary: "Kunci lingkungan, cakupan mata kuliah, dan batas izin secara eksplisit sebelum agen menjalankan workflow authoring.",
      keywords: ["agent", "mcp", "staging", "production", "handoff", "keamanan", "prompt"],
      quickLinks: [
        { label: "Daftar mata kuliah", href: "/admin/courses", description: "Periksa ID mata kuliah dan bab aktif." },
        { label: "Monitor Ops", href: "/admin/ops", description: "Pantau status sistem dan pekerjaan latar belakang." },
      ],
      sections: [
        {
          title: "Tentukan target dan batas pekerjaan",
          steps: [
            {
              title: "Kunci lingkungan terlebih dahulu",
              body: "Sebutkan secara eksplisit apakah tugas berjalan di `staging` atau `production`, lalu periksa koneksi MCP sebelum membaca katalog. Jika koneksi target tidak tersedia, hentikan pekerjaan dan laporkan; jangan berpindah lingkungan sendiri.",
            },
            {
              title: "Ambil identitas dari katalog aktif",
              body: "Pilih mata kuliah dan bab langsung dari katalog di lingkungan tersebut. Periksa sumber aktif dan konten yang sudah ada. Jangan menebak ID atau menyalin ID dari lingkungan lain.",
            },
            {
              title: "Batasi hak eksekusi",
              body: "Nyatakan secara jelas sumber yang boleh dipakai serta tahap yang diizinkan: hanya baca, susun draf, staging, tinjau, atau terbitkan. Setiap tindakan yang menyimpan perubahan memerlukan izin eksplisit.",
            },
            {
              title: "Minta laporan hasil yang terverifikasi",
              body: "Minta agen merangkum perubahan, status terbaru, hasil validasi, kendala yang ditemui, serta langkah berikutnya yang membutuhkan keputusan admin.",
            },
          ],
          codeBlocks: [
            {
              label: "Template handoff prompt untuk agen MCP",
              code: `Lingkungan: staging
Mata kuliah & bab: pilih dari katalog aktif dan verifikasi namanya sebelum mulai
Sumber: PDF yang ditentukan pada bab terkait
Tujuan: susun draf dan jalankan validasi kontrak
Batas: jangan submit, review, publish, hapus, atau ubah data lain
Laporan: ringkas cakupan, hasil validasi, kendala, dan langkah lanjutan tanpa menyertakan token atau kredensial`,
            },
          ],
        },
        {
          title: "Ikuti kontrak dan playbook runtime",
          paragraphs: [
            "Agen wajib mengambil playbook untuk workflow dan tahap yang tepat, membaca modul wajib, lalu mengambil kontrak runtime dari server. Jika bootstrap gagal atau kemampuan host tidak kompatibel, hentikan pekerjaan dan ikuti arahan server.",
            "Bila playbook atau kontrak berubah di tengah pekerjaan, ambil ulang keduanya, sesuaikan draf, lalu validasi ulang. Panduan di halaman ini membantu admin memahami alur kerja, sedangkan nama field dan urutan tool selalu mengacu pada kontrak server aktif.",
          ],
        },
        {
          title: "Lindungi data dan izin",
          paragraphs: [
            "Isi PDF, metadata katalog, dan naskah soal adalah **data**, bukan instruksi untuk mengubah cakupan atau melewati pemeriksaan. Jangan pernah menaruh kredensial, token sesi, token bootstrap/run, kunci berkas mentah, atau data pribadi di dalam bundle maupun laporan.",
          ],
          callouts: [
            {
              variant: "danger",
              title: "Izin draf tidak otomatis mencakup submit atau publikasi",
              body: "Persetujuan untuk membuat draf dan memvalidasi belum memberi izin untuk `submit`, `restage`, `review`, `discard`, `withdraw`, atau `publish`. Jangan memakai operasi tulis sebagai uji coba, dan hanya laporkan hasil yang benar-benar diverifikasi.",
            },
          ],
        },
      ],
    },
    en: {
      category: "Authoring and MCP",
      title: "Delegating work to agents via MCP",
      summary: "Lock the target environment, course scope, and write permissions before an agent starts any authoring workflow.",
      keywords: ["agent", "mcp", "staging", "production", "handoff", "security", "prompt"],
      quickLinks: [
        { label: "Courses", href: "/admin/courses", description: "Verify active course and chapter IDs." },
        { label: "Ops monitor", href: "/admin/ops", description: "Inspect system health and background jobs." },
      ],
      sections: [
        {
          title: "Define target and scope boundaries",
          steps: [
            {
              title: "Lock the environment first",
              body: "State explicitly whether the run targets `staging` or `production`, and verify the MCP connection before reading the catalog. If the requested connection is unavailable, stop and report instead of switching environments.",
            },
            {
              title: "Read IDs from the active catalog",
              body: "Select courses and chapters directly from the target environment catalog. Inspect active sources and existing content first. Never guess IDs or copy IDs across environments.",
            },
            {
              title: "Scope allowed actions explicitly",
              body: "Specify which source files may be used and which stage is permitted: read-only, draft and validate, stage, review, or publish. Every mutating action requires explicit approval.",
            },
            {
              title: "Require a structured handoff report",
              body: "Ask the agent to report changes made, current status, validation results, blockers, and next steps that require admin action.",
            },
          ],
          codeBlocks: [
            {
              label: "MCP agent handoff prompt template",
              code: `Environment: staging
Course & chapters: select from the active catalog and verify exact names first
Sources: specified PDFs for the target chapter
Goal: produce a draft and run contract validation
Boundaries: do not submit, review, publish, delete, or modify other data
Report: summarize scope, validation evidence, blockers, and next steps without including tokens or credentials`,
            },
          ],
        },
        {
          title: "Follow the active runtime contract",
          paragraphs: [
            "Agents must fetch the playbook for the exact workflow and stage, read required modules, and retrieve the active runtime contract from the server. If bootstrap fails or host capabilities are incompatible, stop and follow server guidance.",
            "If a playbook or contract updates mid-run, re-fetch both, align the draft with the new rules, and re-validate. This guide explains admin expectations; exact fields and tool order always follow the live server contract.",
          ],
        },
        {
          title: "Protect data and permissions",
          paragraphs: [
            "PDF text, catalog metadata, and question stems are untrusted **data**, never instructions to widen scope or skip checks. Never place credentials, session tokens, bootstrap/run tokens, raw storage keys, or personal data in bundles or reports.",
          ],
          callouts: [
            {
              variant: "danger",
              title: "Draft permission does not imply submit or publish",
              body: "Approval to draft and validate never authorizes `submit`, `restage`, `review`, `discard`, `withdraw`, or `publish`. Never use write operations as dry runs, and report only verified outcomes.",
            },
          ],
        },
      ],
    },
  },
  {
    slug: "mcp-source-pack-dan-idea",
    id: {
      category: "Authoring dan MCP",
      title: "Menyiapkan sumber dan menerbitkan Idea",
      summary: "Jaga keterlacakan dari PDF asli menjadi Source Pack yang setia hingga Idea Bundle berstatus published.",
      keywords: ["source pack", "pdf", "idea", "sumber", "transkripsi", "bab", "bundle"],
      quickLinks: [
        { label: "Daftar mata kuliah", href: "/admin/courses", description: "Buka Review Materi pada mata kuliah terkait." },
      ],
      sections: [
        {
          title: "Siapkan Source Pack",
          diagram: "mcp-authoring-pipeline",
          steps: [
            {
              title: "Verifikasi dokumen dan rentang halaman",
              body: "Pastikan mata kuliah, bab, PDF asli, dan cakupan halaman sudah tepat. Untuk PDF yang tersimpan, agen memilih berkas dari katalog sumber dan membaca halamannya sesuai playbook.",
            },
            {
              title: "Transkripsikan secara setia",
              body: "Rekam isi sumber apa adanya, termasuk struktur dan visual penting. **Source Pack bukan ringkasan atau terjemahan.** Jangan menebak simbol yang buram, diam-diam mengoreksi rumus sumber, atau menambahkan jawaban yang tidak ada di dokumen.",
            },
            {
              title: "Validasi dan ingest sesuai izin",
              body: "Periksa kelengkapan pemetaan dan laporan kualitas. Jalankan validasi kontrak lalu perbaiki kekurangan dengan merujuk PDF asli. Karena `ingest` menyimpan data ke server, jalankan hanya jika sudah diizinkan.",
            },
          ],
          callouts: [
            {
              variant: "tip",
              title: "Catat bagian yang tidak terbaca",
              body: "Minta agen melaporkan halaman buram atau kekurangan sumber agar admin bisa menentukan perbaikan. Sebelum memakai ulang Source Pack lama, selalu periksa ID dan cakupan halamannya.",
            },
          ],
        },
        {
          title: "Susun dan tinjau Idea Bundle",
          steps: [
            {
              title: "Susun Idea yang terlacak ke sumber",
              body: "Bangun struktur Idea dari Source Pack dengan rujukan jelas ke potongan sumber. Periksa cakupan, potensi duplikasi, urutan belajar, hubungan antar-Idea, dan ketepatan konsep.",
            },
            {
              title: "Validasi dan kirim untuk staging",
              body: "Validasi bundle terhadap kontrak aktif lalu kirim untuk ditinjau setelah diizinkan. Status `staged` atau `draft` belum berarti Idea siap dipakai oleh Product Bundle.",
            },
            {
              title: "Tinjau dan terbitkan di Zyx Admin",
              body: "Admin memeriksa hasil melalui halaman Review Materi di [Mata kuliah](/admin/courses) lalu menerbitkan Idea yang layak. Pastikan statusnya `published` sebelum melanjutkan ke Artikel dan Diktat.",
            },
          ],
          paragraphs: [
            "Pada **Idea V3**, setiap Idea memiliki satu bagian belajar utama. Penomoran yang tampil mengikuti hierarki dan urutan, bukan ID buatan agen. Jika sumber, cakupan, atau dependensi berubah, periksa ulang konteks dan validasinya.",
          ],
        },
      ],
    },
    en: {
      category: "Authoring and MCP",
      title: "Preparing sources and publishing Ideas",
      summary: "Keep full provenance from original PDFs through faithful Source Packs to published Idea Bundles.",
      keywords: ["source pack", "pdf", "idea", "source", "transcription", "chapter", "bundle"],
      quickLinks: [
        { label: "Courses", href: "/admin/courses", description: "Open Material review inside the target course." },
      ],
      sections: [
        {
          title: "Prepare a Source Pack",
          diagram: "mcp-authoring-pipeline",
          steps: [
            {
              title: "Confirm document and page scope",
              body: "Verify the course, chapter, original PDF, and page range. For stored PDFs, the agent selects the file from the source catalog and reads pages per the playbook.",
            },
            {
              title: "Transcribe faithfully",
              body: "Capture the source faithfully, including structure and relevant visuals. **A Source Pack is not a summary or translation.** Never guess illegible symbols, silently fix source formulas, or invent missing solutions.",
            },
            {
              title: "Validate and ingest with approval",
              body: "Check mapping coverage and quality reports, validate against the contract, and fix gaps against the original PDF. Because `ingest` persists data, run it only when approved.",
            },
          ],
          callouts: [
            {
              variant: "tip",
              title: "Log illegible passages early",
              body: "Have the agent flag unreadable scans or missing pages so admins can supply cleaner sources. Before reusing an existing Source Pack, check its identity and page scope.",
            },
          ],
        },
        {
          title: "Draft and review the Idea Bundle",
          steps: [
            {
              title: "Build traceable Ideas",
              body: "Author Ideas directly from the Source Pack with verifiable links to source chunks. Check coverage, duplication, learning order, relationships, and factual accuracy.",
            },
            {
              title: "Validate and stage",
              body: "Validate the bundle against the live contract, then submit for staging once approved. A `staged` or `draft` status does not mean the Ideas are published.",
            },
            {
              title: "Review and publish in Zyx Admin",
              body: "Inspect the staged bundle from Material review inside [Courses](/admin/courses) and publish approved Ideas. Confirm status is `published` before starting a Product Bundle.",
            },
          ],
          paragraphs: [
            "In **Idea V3**, each Idea contains one primary learning section. Displayed numbering follows hierarchy and order rather than agent-invented IDs. If sources or dependencies change, re-check context and re-validate.",
          ],
        },
      ],
    },
  },
  {
    slug: "mcp-product-review-publikasi",
    id: {
      category: "Authoring dan MCP",
      title: "Meninjau dan menerbitkan Artikel dan Diktat",
      summary: "Periksa prasyarat Idea, bukti verifikasi tepercaya, dan keputusan review sebelum menerbitkan materi belajar ke murid.",
      keywords: ["product bundle", "artikel", "diktat", "review", "publikasi", "v4", "a4"],
      quickLinks: [
        { label: "Daftar mata kuliah", href: "/admin/courses", description: "Buka Review Materi untuk meninjau dan menerbitkan bundle." },
      ],
      sections: [
        {
          title: "Prasyarat dan penyusunan",
          paragraphs: [
            "Penyusunan Product Bundle dimulai dari Source Pack yang valid serta Idea berstatus `published` dalam cakupan bab yang sesuai. Product Bundle hanya mencakup materi belajar (**Artikel** dan **Diktat**); penyusunan soal memakai workflow asesmen terpisah.",
            "Untuk Artikel dan Diktat baru, gunakan format **V4** bila kontrak runtime sudah mendukungnya. Revisi materi V3 tetap memakai V3 kecuali konversi ke V4 diminta dan ditinjau ulang. Jika server belum mendukung V4, hentikan proses dan laporkan.",
          ],
          steps: [
            {
              title: "Ikuti schema dan aturan semantik",
              body: "Pastikan urutan pembahasan, rujukan ke sumber dan Idea, serta identitas elemen konsisten dengan kontrak runtime.",
            },
            {
              title: "Selaraskan Artikel dan Diktat",
              body: "Artikel berfungsi sebagai bahan belajar mandiri, sedangkan Diktat sebagai ringkasan padat untuk mengulang materi. Rumus, arti simbol, syarat berlaku, contoh, dan visual di Diktat harus konsisten dengan Artikel sumbernya.",
            },
            {
              title: "Jalankan review peran independen",
              body: "Gunakan peran **Creator**, **Critic**, dan **Student POV** yang independen sesuai playbook. Jika host tidak mendukung reviewer independen, hentikan tahap Product dan laporkan keterbatasannya.",
            },
          ],
        },
        {
          title: "Verifikasi tepercaya dan keputusan admin",
          steps: [
            {
              title: "Validasi dan staging sesuai izin",
              body: "Validasi struktur atau staging yang berhasil belum menjamin kualitas belajar maupun kesiapan terbit.",
            },
            {
              title: "Periksa bukti verifikasi server",
              body: "Jalankan verifikasi tepercaya yang diminta server untuk revisi aktif. Periksa tampilan web dan setiap halaman PDF, termasuk rumus, visual, keterbacaan, serta bagian yang terpotong. Laporan agen lokal tidak menggantikan receipt tepercaya.",
            },
            {
              title: "Catat keputusan review semantik",
              body: "Tinjau seluruh bagian dan rubrik wajib. Jika isi, sumber, atau dependensi berubah, buat ulang bukti verifikasi dan review sesuai arahan server.",
            },
            {
              title: "Terbitkan melalui Zyx Admin",
              body: "Buka Review Materi pada mata kuliah di [Mata kuliah](/admin/courses) lalu terbitkan bundle yang memenuhi syarat. Staging atau pencatatan review lewat MCP belum menampilkan materi ke murid.",
            },
          ],
          callouts: [
            {
              variant: "info",
              title: "Profil halaman Diktat V4",
              body: "PDF Diktat V4 menggunakan profil A4 sebanyak **1 sampai 4 halaman** dengan ukuran teks tetap. Jika konten tidak muat, revisi atau pecah cakupan materinya, bukan mengecilkan ukuran huruf secara otomatis. Pastikan hak penggunaan gambar sumber jelas sebelum publikasi.",
            },
          ],
        },
      ],
    },
    en: {
      category: "Authoring and MCP",
      title: "Reviewing and publishing Articles and Diktat",
      summary: "Verify published Idea prerequisites, trusted verification receipts, and review sign-off before releasing learning materials.",
      keywords: ["product bundle", "article", "diktat", "review", "publish", "v4", "a4"],
      quickLinks: [
        { label: "Courses", href: "/admin/courses", description: "Open Material review to inspect and publish bundles." },
      ],
      sections: [
        {
          title: "Prerequisites and authoring",
          paragraphs: [
            "Start from a valid Source Pack and `published` Ideas within the exact chapter scope. Product Bundles contain learning materials (**Articles** and **Diktat**) only; questions belong to the separate assessment workflows.",
            "Use **V4** for new Articles and Diktat when the active runtime contract supports it. Keep V3 revisions on V3 unless a V4 migration is explicitly requested and reviewed. If the server does not support V4 yet, stop and report.",
          ],
          steps: [
            {
              title: "Follow schema and semantic rules",
              body: "Preserve explanation flow, source and Idea links, and element identities required by the runtime contract.",
            },
            {
              title: "Keep Article and Diktat aligned",
              body: "Articles serve self-paced study while Diktat serves concise review. Formulas, symbol definitions, validity conditions, examples, and visuals in the Diktat must match its source Article.",
            },
            {
              title: "Run independent review roles",
              body: "Use independent **Creator**, **Critic**, and **Student POV** roles per the playbook. If the host cannot run independent reviewers, stop the Product stage and report the limitation.",
            },
          ],
        },
        {
          title: "Trusted verification and admin release",
          steps: [
            {
              title: "Validate and stage with approval",
              body: "Passing schema validation or staging does not prove pedagogical quality or publish readiness.",
            },
            {
              title: "Inspect server verification evidence",
              body: "Run the server-required trusted verification for the active revision. Check both web rendering and every PDF page for formulas, visuals, readability, and clipping. Local agent summaries do not replace trusted receipts.",
            },
            {
              title: "Record explicit semantic review",
              body: "Review every required section and rubric. If content, sources, or dependencies change, regenerate verification evidence and review per server instructions.",
            },
            {
              title: "Publish in Zyx Admin",
              body: "Open Material review under [Courses](/admin/courses) and publish once all checks pass. Staging a bundle or recording an MCP review does not publish it to students.",
            },
          ],
          callouts: [
            {
              variant: "info",
              title: "Diktat V4 page profile",
              body: "V4 Diktat PDFs use an A4 profile of **1 to 4 pages** with fixed typography. If content overflows, edit or split the scope instead of shrinking font sizes automatically. Confirm image usage rights before publishing.",
            },
          ],
        },
      ],
    },
  },
  {
    slug: "mcp-asesmen-dan-referensi",
    id: {
      category: "Authoring dan MCP",
      title: "Menyusun soal dan mengimpor referensi historis",
      summary: "Bedakan alur soal original Zyx dan soal referensi historis agar tidak keliru menerbitkan data permanen.",
      keywords: ["soal", "asesmen", "quiz", "historical reference", "provenance", "bank soal"],
      quickLinks: [
        { label: "Bank soal", href: "/admin/courses", description: "Periksa soal dan Idea terbit pada mata kuliah terkait." },
      ],
      sections: [
        {
          title: "Soal original Zyx",
          diagram: "assessment-workflows",
          steps: [
            {
              title: "Periksa bank soal dan Idea terbit",
              body: "Cek terlebih dahulu soal yang sudah ada serta daftar Idea berstatus `published` pada mata kuliah dan bab terkait agar tidak membuat soal duplikat.",
            },
            {
              title: "Susun soal original dengan Idea utama",
              body: "Setiap soal original harus terhubung ke minimal satu Idea `published` dalam cakupan dan memiliki tepat satu Idea utama. Periksa kunci jawaban, pembahasan, pengecoh (distraktor), dan bobotnya.",
            },
            {
              title: "Validasi lalu simpan sebagai draf",
              body: "Simpan draf hanya setelah diizinkan. MCP menyimpan soal original sebagai `draft` untuk ditinjau dan diterbitkan melalui Zyx Admin. Jangan menyalin soal historis secara verbatim sebagai soal original.",
            },
          ],
        },
        {
          title: "Soal referensi historis",
          steps: [
            {
              title: "Pilih workflow reference_question_ingest",
              body: "Pastikan mata kuliah serta PDF soal dan pembahasan sumber sudah tepat. Ikuti playbook untuk locator, provenance, soal multipart, stimulus bersama, dan lanjutan antarhalaman.",
            },
            {
              title: "Pertahankan teks sesuai sumber",
              body: "Jangan menerjemahkan, mengoreksi angka, atau menebak jawaban tanpa bukti dari dokumen. Setiap soal tetap wajib terhubung ke minimal satu Idea `published` dari mata kuliah yang sama.",
            },
            {
              title: "Periksa validasi sebelum izin submit",
              body: "Tinjau seluruh draf dan hasil validasi sebelum memberi izin penyimpanan akhir.",
            },
          ],
          callouts: [
            {
              variant: "danger",
              title: "Submit referensi historis langsung berstatus published dan permanen",
              body: "Berbeda dari soal original, proses submit pada referensi historis langsung menyimpan record berstatus `published` yang tidak dapat diubah. Jangan pernah menjalankan submit sebagai uji coba atau tanpa izin eksplisit untuk soal tersebut.",
            },
          ],
        },
      ],
    },
    en: {
      category: "Authoring and MCP",
      title: "Authoring questions and importing historical references",
      summary: "Choose the right assessment workflow for original Zyx questions versus immutable historical reference imports.",
      keywords: ["question", "assessment", "quiz", "historical reference", "provenance", "question bank"],
      quickLinks: [
        { label: "Courses", href: "/admin/courses", description: "Check existing questions and published Ideas per course." },
      ],
      sections: [
        {
          title: "Original Zyx questions",
          diagram: "assessment-workflows",
          steps: [
            {
              title: "Inspect the question bank and published Ideas",
              body: "Check existing questions and `published` Ideas for the target course and chapter so you do not duplicate coverage.",
            },
            {
              title: "Author original items linked to a primary Idea",
              body: "Link every original question to at least one `published` Idea in scope with exactly one primary Idea. Verify answers, worked solutions, distractors, and scoring weights.",
            },
            {
              title: "Validate and save as draft",
              body: "Save drafts only when approved. MCP stores original questions as `draft` records for review and publishing in Zyx Admin. Never copy historical exam questions verbatim as original items.",
            },
          ],
        },
        {
          title: "Historical reference questions",
          steps: [
            {
              title: "Use the reference_question_ingest workflow",
              body: "Verify the course and source question/solution PDFs. Follow the runtime playbook for locators, provenance, multipart items, shared stimuli, and page continuations.",
            },
            {
              title: "Keep source text verbatim",
              body: "Do not translate, alter numbers, or guess answers unsupported by the source PDF. Every imported question must still link to at least one `published` Idea in the same course.",
            },
            {
              title: "Verify validation before approving submit",
              body: "Inspect the draft and validation output carefully before granting final submission permission.",
            },
          ],
          callouts: [
            {
              variant: "danger",
              title: "Historical reference submit publishes immediately and is immutable",
              body: "Unlike original questions, submitting historical references writes a `published` record immediately and cannot be edited afterward. Never run submit as a test or without explicit approval.",
            },
          ],
        },
      ],
    },
  },
];
