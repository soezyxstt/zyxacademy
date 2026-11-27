import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  FolderTree,
  KeyRound,
  Layers,
  Lock,
  MessageSquareText,
  NotebookPen,
  Radio,
  ShieldCheck,
  Users,
  Video,
} from "lucide-react";
import type { DocDiagramId, DocLocale } from "@/lib/docs/types";
import { getTutorDocDiagram } from "@/packages/academic/docs/tutor/diagrams";

function DiagramFrame({
  caption,
  children,
}: {
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="my-5 overflow-hidden rounded-lg border border-border bg-muted/25">
      <div className="p-4 sm:p-5">{children}</div>
      <figcaption className="border-t border-border/70 bg-muted/35 px-4 py-2 text-body-xs text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}

export function DocDiagram({ id, locale }: { id: DocDiagramId; locale: DocLocale }) {
  const isEn = locale === "en";
  const tutorDiagram = getTutorDocDiagram(id, locale);

  switch (id) {
    case "course-hierarchy":
      return (
        <DiagramFrame
          caption={
            isEn
              ? "Course hierarchy: one stable ID anchors ordered syllabus chapters and all linked learning assets."
              : "Hierarki mata kuliah: satu ID stabil menampung urutan bab silabus dan seluruh materi terkait."
          }
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
              <BookOpen className="size-4 text-brand-primary shrink-0" aria-hidden />
              <span className="text-body-sm font-semibold text-foreground">Kalkulus IA</span>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-body-2xs text-muted-foreground">
                id: ma1101
              </code>
              <span className="ml-auto font-mono text-body-2xs text-muted-foreground">
                /admin/courses/ma1101
              </span>
            </div>
            <div className="ml-4 border-l border-border pl-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/80 bg-background px-3 py-2">
                <FolderTree className="size-3.5 text-muted-foreground shrink-0" aria-hidden />
                <span className="text-body-xs font-semibold text-foreground">
                  {isEn ? "Chapter 1: Limits & Continuity" : "Bab 1: Limit & Kekontinuan"}
                </span>
                <span className="text-body-2xs text-muted-foreground">
                  {isEn ? "(order #1)" : "(urutan #1)"}
                </span>
              </div>
              <div className="ml-4 flex flex-wrap gap-2 border-l border-border/70 pl-3 pt-0.5">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-body-xs text-foreground">
                  <FileText className="size-3.5 text-brand-primary" aria-hidden />
                  {isEn ? "PDF documents" : "Dokumen PDF"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-body-xs text-foreground">
                  <Video className="size-3.5 text-brand-primary" aria-hidden />
                  {isEn ? "Video playlists" : "Playlist video"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-body-xs text-foreground">
                  <NotebookPen className="size-3.5 text-brand-primary" aria-hidden />
                  {isEn ? "Chapter quizzes" : "Kuis bab"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-body-xs text-foreground">
                  <Layers className="size-3.5 text-brand-primary" aria-hidden />
                  {isEn ? "Ideas & Diktat" : "Idea & Diktat"}
                </span>
              </div>
            </div>
          </div>
        </DiagramFrame>
      );

    case "filename-anatomy": {
      const segments = [
        { token: "ma1101", label: isEn ? "Course ID" : "Kode MK", accent: "border-brand-primary/50 bg-brand-primary/10 text-foreground" },
        { token: "bab01", label: isEn ? "Chapter (2 digits)" : "Bab (2 digit)", accent: "border-border bg-background text-foreground" },
        { token: "materi", label: isEn ? "Category" : "Kategori", accent: "border-zx-accent/50 bg-zx-accent/10 text-foreground" },
        { token: "limit-kontinu", label: isEn ? "Topic slug" : "Deskripsi topik", accent: "border-border bg-background text-foreground" },
        { token: "slide", label: isEn ? "Role (opt)" : "Role (opsional)", accent: "border-border bg-background text-muted-foreground" },
        { token: "2025-sem1", label: isEn ? "Year & term" : "Tahun-semester", accent: "border-border bg-background text-foreground" },
      ];
      return (
        <DiagramFrame
          caption={
            isEn
              ? "Filename anatomy: separate segments with underscores (_) and words inside a segment with hyphens (-). Omit the chapter segment for UTS, UAS, or UP."
              : "Anatomi nama berkas: pisahkan segmen dengan garis bawah (_) dan kata dalam satu segmen dengan tanda hubung (-). Hilangkan segmen bab untuk UTS, UAS, atau UP."
          }
        >
          <div className="flex flex-wrap items-start gap-2">
            {segments.map((seg, idx) => (
              <div key={seg.token} className="flex items-center gap-1.5">
                <div className="space-y-1">
                  <div className={`rounded-md border px-2 py-1 font-mono text-body-xs font-medium ${seg.accent}`}>
                    {seg.token}
                  </div>
                  <p className="text-center text-body-2xs text-muted-foreground">{seg.label}</p>
                </div>
                {idx < segments.length - 1 ? (
                  <span className="pb-5 font-mono text-body-xs text-muted-foreground">_</span>
                ) : (
                  <span className="pb-5 font-mono text-body-xs text-muted-foreground">.pdf</span>
                )}
              </div>
            ))}
          </div>
        </DiagramFrame>
      );
    }

    case "upload-duplicate-flow": {
      const steps = [
        {
          icon: FileText,
          title: isEn ? "1. Queue PDFs" : "1. Antrekan PDF",
          desc: isEn ? "Up to 200 files, 50 MiB each" : "Hingga 200 berkas, 50 MiB/berkas",
        },
        {
          icon: ShieldCheck,
          title: isEn ? "2. Checksum scan" : "2. Cek checksum",
          desc: isEn ? "Detects exact matches in course" : "Deteksi duplikat pada mata kuliah",
        },
        {
          icon: FileCheck2,
          title: isEn ? "3. Resolve & upload" : "3. Pilih aksi & unggah",
          desc: isEn ? "Skip, Keep both, or Overwrite" : "Lewati, Simpan keduanya, atau Timpa",
        },
      ];
      return (
        <DiagramFrame
          caption={
            isEn
              ? "Bulk upload pipeline: auto-parsed metadata and checksum alerts are reviewed before saving."
              : "Alur unggah massal: metadata hasil baca otomatis dan peringatan checksum ditinjau sebelum disimpan."
          }
        >
          <div className="grid gap-2.5 sm:grid-cols-3">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="rounded-md border border-border bg-background p-3 space-y-1">
                  <div className="flex items-center gap-2 text-foreground">
                    <Icon className="size-4 text-brand-primary shrink-0" aria-hidden />
                    <span className="text-body-xs font-semibold">{step.title}</span>
                  </div>
                  <p className="text-body-2xs text-muted-foreground">{step.desc}</p>
                </div>
              );
            })}
          </div>
        </DiagramFrame>
      );
    }

    case "mcp-authoring-pipeline": {
      const stages = [
        {
          title: "Source Pack",
          status: isEn ? "Ingested" : "Tersimpan",
          desc: isEn ? "Faithful PDF transcription" : "Transkripsi setia dari PDF",
        },
        {
          title: "Idea Bundle",
          status: isEn ? "Admin publish" : "Terbit oleh admin",
          desc: isEn ? "Traceable concept map" : "Peta konsep terlacak",
        },
        {
          title: "Product Bundle",
          status: isEn ? "Verify + publish" : "Verifikasi + terbit",
          desc: isEn ? "Article & A4 Diktat (V4)" : "Artikel & Diktat A4 (V4)",
        },
      ];
      return (
        <DiagramFrame
          caption={
            isEn
              ? "MCP authoring pipeline: each stage requires validated output from the previous stage; publishing always happens in Zyx Admin."
              : "Alur authoring MCP: tiap tahap membutuhkan hasil valid dari tahap sebelumnya; publikasi akhir selalu dilakukan di Zyx Admin."
          }
        >
          <div className="grid gap-2.5 sm:grid-cols-3">
            {stages.map((stage, idx) => (
              <div key={stage.title} className="relative rounded-md border border-border bg-background p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body-xs font-semibold text-foreground">{stage.title}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-body-2xs font-medium text-muted-foreground">
                    {stage.status}
                  </span>
                </div>
                <p className="text-body-2xs text-muted-foreground">{stage.desc}</p>
                {idx < stages.length - 1 && (
                  <ArrowRight
                    className="hidden sm:block absolute -right-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground z-10"
                    aria-hidden
                  />
                )}
              </div>
            ))}
          </div>
        </DiagramFrame>
      );
    }

    case "assessment-workflows":
      return (
        <DiagramFrame
          caption={
            isEn
              ? "Assessment workflows: original questions land in draft for review; historical reference imports publish immediately and cannot be edited."
              : "Perbandingan workflow asesmen: soal original masuk ke draf untuk ditinjau; referensi historis langsung berstatus published dan permanen."
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border bg-background p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-body-xs font-semibold text-foreground">
                  {isEn ? "Original Zyx questions" : "Soal original Zyx"}
                </span>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-body-2xs text-muted-foreground">
                  quiz_bank
                </code>
              </div>
              <p className="text-body-xs text-muted-foreground">
                {isEn
                  ? "Draft -> Validate -> Save as draft -> Review & publish in Zyx Admin."
                  : "Draf -> Validasi -> Simpan draf -> Tinjau & terbitkan di Zyx Admin."}
              </p>
            </div>
            <div className="rounded-md border border-status-error/40 bg-background p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-body-xs font-semibold text-foreground">
                  {isEn ? "Historical reference" : "Referensi historis"}
                </span>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-body-2xs text-muted-foreground">
                  reference_question_ingest
                </code>
              </div>
              <p className="text-body-xs text-muted-foreground">
                {isEn
                  ? "Verbatim PDF -> Validate -> Submit publishes immediately (immutable)."
                  : "Teks sumber utuh -> Validasi -> Submit langsung terbit (permanen)."}
              </p>
            </div>
          </div>
        </DiagramFrame>
      );

    case "token-group-flow": {
      const nodes = [
        { icon: KeyRound, label: isEn ? "Admin issues token" : "Admin buat token", sub: "Zyx-XXXX-cap-courses" },
        { icon: Users, label: isEn ? "Student redeems" : "Murid aktivasi", sub: isEn ? "Joins linked group" : "Masuk kelompok" },
        { icon: CheckCircle2, label: isEn ? "Access unlocked" : "Akses aktif", sub: isEn ? "Courses + weekly quota" : "Mata kuliah + kuota" },
      ];
      return (
        <DiagramFrame
          caption={
            isEn
              ? "Token lifecycle: revoking or deleting a token also removes its linked study group."
              : "Siklus token aktivasi: menghapus token di panel admin juga menghapus kelompok yang terhubung."
          }
        >
          <div className="grid gap-2.5 sm:grid-cols-3">
            {nodes.map((node) => {
              const Icon = node.icon;
              return (
                <div key={node.label} className="rounded-md border border-border bg-background p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-brand-primary shrink-0" aria-hidden />
                    <span className="text-body-xs font-semibold text-foreground">{node.label}</span>
                  </div>
                  <p className="font-mono text-body-2xs text-muted-foreground">{node.sub}</p>
                </div>
              );
            })}
          </div>
        </DiagramFrame>
      );
    }

    case "tutorial-schedule-lifecycle": {
      if (!tutorDiagram) return null;
      const stages = tutorDiagram.rows;
      return (
        <DiagramFrame
          caption={tutorDiagram.caption}
        >
          <div className="grid gap-2.5 sm:grid-cols-3">
            {stages.map((stage) => (
              <div key={stage.title} className="rounded-md border border-border bg-background p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5 text-brand-primary shrink-0" aria-hidden />
                  <span className="text-body-xs font-semibold text-foreground">{stage.title}</span>
                </div>
                <p className="text-body-2xs text-muted-foreground">{stage.note}</p>
              </div>
            ))}
          </div>
        </DiagramFrame>
      );
    }

    case "meet-access-modes":
      return (
        <DiagramFrame
          caption={
            isEn
              ? "Meet Studio access modes: slugs share the /f/{slug} namespace with Form Studio."
              : "Mode akses Meet Studio: slug berbagi ruang nama /f/{slug} dengan Form Studio."
          }
        >
          <div className="grid gap-2.5 sm:grid-cols-3">
            <div className="rounded-md border border-border bg-background p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-foreground">
                <Video className="size-3.5 text-brand-primary" aria-hidden />
                <span className="text-body-xs font-semibold">Open</span>
              </div>
              <p className="text-body-2xs text-muted-foreground">
                {isEn ? "Anyone with the link can join." : "Siapa saja dengan tautan dapat bergabung."}
              </p>
            </div>
            <div className="rounded-md border border-border bg-background p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-foreground">
                <ShieldCheck className="size-3.5 text-brand-primary" aria-hidden />
                <span className="text-body-xs font-semibold">Trusted</span>
              </div>
              <p className="text-body-2xs text-muted-foreground">
                {isEn ? "Selected roles/courses join without knocking." : "Peran atau mata kuliah terpilih masuk tanpa mengetuk."}
              </p>
            </div>
            <div className="rounded-md border border-border bg-background p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-foreground">
                <Lock className="size-3.5 text-brand-primary" aria-hidden />
                <span className="text-body-xs font-semibold">Restricted</span>
              </div>
              <p className="text-body-2xs text-muted-foreground">
                {isEn ? "Only explicitly invited members may enter." : "Hanya anggota yang ditambahkan yang dapat masuk."}
              </p>
            </div>
          </div>
        </DiagramFrame>
      );

    case "quiz-vs-tryout":
    case "tutor-grading-flow":
      if (!tutorDiagram) return null;
      return (
        <DiagramFrame
          caption={tutorDiagram.caption}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border bg-background p-3.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <NotebookPen className="size-4 text-brand-primary" aria-hidden />
                <span className="text-body-xs font-semibold text-foreground">
                  {tutorDiagram.rows[0].title}
                </span>
              </div>
              <p className="text-body-2xs text-muted-foreground">
                {tutorDiagram.rows[0].note}
              </p>
            </div>
            <div className="rounded-md border border-border bg-background p-3.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="size-4 text-brand-primary" aria-hidden />
                <span className="text-body-xs font-semibold text-foreground">
                  {tutorDiagram.rows[1].title}
                </span>
              </div>
              <p className="text-body-2xs text-muted-foreground">
                {tutorDiagram.rows[1].note}
              </p>
            </div>
          </div>
        </DiagramFrame>
      );

    case "tutor-workspace-map": {
      if (!tutorDiagram) return null;
      const [schedule, discussion] = tutorDiagram.rows[0].note.split(" · ");
      const [content, assessment] = tutorDiagram.rows[1].note.split(" · ");
      return (
        <DiagramFrame
          caption={
            isEn
              ? "Tutor workspace map: switch between cross-course operations and individual course tools from the left sidebar."
              : "Peta ruang kerja tutor: berpindah antara operasional lintas kelas dan alat khusus per mata kuliah dari sidebar kiri."
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border bg-background p-3.5 space-y-2">
              <p className="text-body-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                {tutorDiagram.rows[0].title}
              </p>
              <div className="space-y-1.5 text-body-xs text-foreground">
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-3.5 text-brand-primary" aria-hidden />
                  <span>{schedule}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MessageSquareText className="size-3.5 text-brand-primary" aria-hidden />
                  <span>{discussion}</span>
                </div>
              </div>
            </div>
            <div className="rounded-md border border-border bg-background p-3.5 space-y-2">
              <p className="text-body-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                {tutorDiagram.rows[1].title}
              </p>
              <div className="space-y-1.5 text-body-xs text-foreground">
                <div className="flex items-center gap-2">
                  <FileText className="size-3.5 text-brand-primary" aria-hidden />
                  <span>{content}</span>
                </div>
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="size-3.5 text-brand-primary" aria-hidden />
                  <span>{assessment}</span>
                </div>
              </div>
            </div>
          </div>
        </DiagramFrame>
      );
    }

    case "tutor-live-quiz-flow": {
      if (!tutorDiagram) return null;
      const stages = tutorDiagram.rows;
      return (
        <DiagramFrame
          caption={tutorDiagram.caption}
        >
          <div className="grid gap-2.5 sm:grid-cols-3">
            {stages.map((stage) => (
              <div key={stage.title} className="rounded-md border border-border bg-background p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Radio className="size-3.5 text-brand-primary shrink-0" aria-hidden />
                  <span className="text-body-xs font-semibold text-foreground">{stage.title}</span>
                </div>
                <p className="text-body-2xs text-muted-foreground">{stage.note}</p>
              </div>
            ))}
          </div>
        </DiagramFrame>
      );
    }
  }
}
