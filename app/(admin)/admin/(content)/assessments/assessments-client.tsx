"use client";

import { useState, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchBar } from "@/components/ui/search-bar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { uploadAdminPdfFile } from "@/lib/storage/admin-upload-client";
import { RotateCcw } from "lucide-react";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import {
  Plus,
  FileText,
  Loader2,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
} from "lucide-react";

interface Source {
  id: string;
  title: string;
  courseId: string;
  origin: "uploaded" | "generated";
  category: "tutorial" | "quiz" | "uts" | "uas" | "tryout";
  year: number;
  semester: number | null;
  ingestionStatus: "pending" | "processing" | "completed" | "failed";
  createdAt: string;
  questionCount: number;
  chapterCount: number;
}

interface Course {
  id: string;
  title: string;
}

interface Props {
  sources: Source[];
  courses: Course[];
  courseMap: Record<string, string>;
}

export function AssessmentsClient({ sources, courses, courseMap }: Props) {
  const t = useTranslations("adminEval.assessments");
  const locale = useLocale();
  const router = useRouter();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Deletion states
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/assessments/${deletingId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success(t("deleteSucceeded"));
        setIsDeleteDialogOpen(false);
        setDeletingId(null);
        router.refresh();
      } else {
        toast.error(t("deleteFailed"));
      }
    } catch {
      toast.error(t("networkError"));
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter states
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterCourse, setFilterCourse] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Form states
  const [form, setForm] = useState({
    courseId: "",
    title: "",
    rawText: "",
    pdfKey: "",
  });

  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfUploadState, setPdfUploadState] = useState<"idle" | "uploading" | "done" | "error">("idle");

  const hasFilters = Boolean(searchQuery || filterCourse !== "all" || filterCategory !== "all" || filterStatus !== "all");

  function resetFilters() {
    setSearchQuery("");
    setFilterCourse("all");
    setFilterCategory("all");
    setFilterStatus("all");
  }

  // Filtered sources
  const filteredSources = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return sources.filter((source) => {
      const matchSearch = !needle || source.title.toLowerCase().includes(needle);
      const matchCourse = filterCourse === "all" || source.courseId === filterCourse;
      const matchCategory = filterCategory === "all" || source.category === filterCategory;
      const matchStatus = filterStatus === "all" || source.ingestionStatus === filterStatus;
      return matchSearch && matchCourse && matchCategory && matchStatus;
    });
  }, [sources, searchQuery, filterCourse, filterCategory, filterStatus]);

  // Handle PDF upload
  const handlePdfFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPdfFileName(file.name);
    setPdfUploadState("uploading");

    try {
      const data = await uploadAdminPdfFile(file, { courseId: form.courseId });
      setForm((prev) => ({ ...prev, pdfKey: data.key }));
      setPdfUploadState("done");
      toast.success(t("pdfUploaded"));
    } catch (error: any) {
      console.error(error);
      setPdfUploadState("error");
      toast.error(t("pdfUploadFailed"));
    }
  };

  // Handle Ingest Submit
  const handleIngestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.courseId || !form.title || !form.rawText) {
      toast.error(t("requiredFields"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/material-instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: form.courseId,
          title: form.title,
          sourceType: "markdown",
          rawText: form.rawText,
          summary: "Assessment historical source file uploaded.",
          learningObjectives: [],
          keywords: [],
          chapterIds: [],
          type: "assessment",
          pdfKey: form.pdfKey || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(t("saveFailed"));
        return;
      }

      toast.success(t("uploadSucceeded"));
      setShowUploadModal(false);
      // Reset form
      setForm({ courseId: "", title: "", rawText: "", pdfKey: "" });
      setPdfFileName(null);
      setPdfUploadState("idle");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error(t("networkError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar
          size="sm"
          placeholder={t("search")}
          value={searchQuery}
          onSearch={setSearchQuery}
          onClear={() => setSearchQuery("")}
          containerClassName="flex-1 min-w-[140px]"
        />

        <Select value={filterCourse} onValueChange={setFilterCourse}>
          <SelectTrigger className="w-[140px] sm:w-[160px] h-9 text-body-sm rounded-lg shrink-0">
            <SelectValue placeholder={t("allCourses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allCourses")}</SelectItem>
            {courses.map((course) => (
              <SelectItem key={course.id} value={course.id}>
                {course.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[110px] sm:w-[130px] h-9 text-body-sm rounded-lg shrink-0">
            <SelectValue placeholder={t("allCategories")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allCategories")}</SelectItem>
            <SelectItem value="uts">{t("category.uts")}</SelectItem>
            <SelectItem value="uas">{t("category.uas")}</SelectItem>
            <SelectItem value="quiz">{t("category.quiz")}</SelectItem>
            <SelectItem value="tutorial">{t("category.tutorial")}</SelectItem>
            <SelectItem value="tryout">{t("category.tryout")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[110px] sm:w-[130px] h-9 text-body-sm rounded-lg shrink-0">
            <SelectValue placeholder={t("allStatuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStatuses")}</SelectItem>
            <SelectItem value="pending">{t("status.pending")}</SelectItem>
            <SelectItem value="processing">{t("status.processing")}</SelectItem>
            <SelectItem value="completed">{t("status.completed")}</SelectItem>
            <SelectItem value="failed">{t("status.failed")}</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  aria-label={t("reset")}
                  className="size-9 p-0 rounded-lg shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("reset")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setShowUploadModal(true)}
                size="sm"
                aria-label={t("uploadAssessment")}
                className="size-9 p-0 rounded-lg shrink-0 bg-brand-primary text-primary-foreground hover:bg-brand-primary/95 shadow-2xs"
              >
                <Plus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("uploadAssessment")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Table Surface */}
      <AdminTable>
        <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <AdminTableHead>
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-body-sm">{t("examTitle")}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-body-sm">{t("course")}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-body-sm">{t("categoryLabel")}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-body-sm">{t("yearSemester")}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-body-sm">{t("ingestionStatus")}</th>
              <th className="px-4 py-3 font-medium text-muted-foreground text-body-sm text-center">{t("questions")}</th>
              <th className="px-4 py-3 font-medium text-muted-foreground text-body-sm text-center">{t("chapters")}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-body-sm">{t("date")}</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </AdminTableHead>
          <tbody>
            {filteredSources.length === 0 ? (
              <tr>
                <td colSpan={9} className="h-32 text-center text-body-sm text-muted-foreground px-4 py-3">
                  {t("empty")}
                </td>
              </tr>
            ) : (
              filteredSources.map((source) => (
                <tr key={source.id} className="group border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors duration-150">
                  <td className="font-medium text-foreground px-4 py-3 align-middle">
                    <Link
                      href={`/admin/assessments/${source.id}`}
                      className="hover:underline flex items-center gap-2"
                    >
                      <FileText size={16} className="text-muted-foreground" />
                      {source.title}
                    </Link>
                  </td>
                  <td className="text-body-sm text-muted-foreground px-4 py-3 align-middle">
                    {courseMap[source.courseId] || t("unknownCourse")}
                  </td>
                  <td className="text-body-sm px-4 py-3 align-middle">
                    <Badge variant="outline" className="uppercase text-[10px] font-semibold tracking-wider">
                      {t(`category.${source.category}`)}
                    </Badge>
                  </td>
                  <td className="text-body-sm text-muted-foreground px-4 py-3 align-middle">
                    {source.year} {source.semester ? t("semester", { number: source.semester }) : ""}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-center gap-2">
                      {source.ingestionStatus === "completed" && (
                        <Badge className="bg-status-success/10 text-status-success hover:bg-status-success/20 flex items-center gap-1 border-0">
                          <CheckCircle2 size={12} />
                          {t("status.completed")}
                        </Badge>
                      )}
                      {source.ingestionStatus === "processing" && (
                        <Badge className="bg-status-warning/10 text-status-warning hover:bg-status-warning/20 flex items-center gap-1 border-0">
                          <Clock className="animate-spin" size={12} />
                          {t("status.processing")}
                        </Badge>
                      )}
                      {source.ingestionStatus === "pending" && (
                        <Badge className="bg-muted text-muted-foreground flex items-center gap-1 border-0">
                          <Clock size={12} />
                          {t("status.pending")}
                        </Badge>
                      )}
                      {source.ingestionStatus === "failed" && (
                        <Badge className="bg-status-error/10 text-status-error hover:bg-status-error/20 flex items-center gap-1 border-0">
                          <XCircle size={12} />
                          {t("status.failed")}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="text-center font-semibold text-body-sm px-4 py-3 align-middle">
                    {source.questionCount}
                  </td>
                  <td className="text-center font-semibold text-body-sm px-4 py-3 align-middle">
                    {source.chapterCount}
                  </td>
                  <td className="text-body-sm text-muted-foreground px-4 py-3 align-middle">
                    {new Date(source.createdAt).toLocaleDateString(locale, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 align-middle text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/admin/assessments/${source.id}`} className="text-muted-foreground hover:text-foreground inline-block">
                        <ExternalLink size={16} />
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-status-error hover:bg-status-error/10 cursor-pointer"
                        onClick={() => {
                          setDeletingId(source.id);
                          setIsDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </AdminTable>

      {/* Upload/Add Modal */}
      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base">{t("uploadTitle")}</DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              {t("uploadDescription")}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleIngestSubmit} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-body-sm font-medium text-foreground">{t("targetCourse")}</label>
                <Select
                  value={form.courseId}
                  onValueChange={(val) => setForm((prev) => ({ ...prev, courseId: val }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectCourse")} />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((course) => (
                      <SelectItem key={course.id} value={course.id}>
                        {course.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-body-sm font-medium text-foreground">{t("documentTitle")}</label>
                <Input
                  required
                  placeholder={t("documentTitlePlaceholder")}
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-body-sm font-medium text-foreground flex items-center justify-between">
                <span>{t("originalPdfOptional")}</span>
                {pdfFileName && <span className="text-body-xs text-status-success">{pdfFileName}</span>}
              </label>
              <div className="flex gap-2 items-center">
                <Input
                  type="file"
                  accept=".pdf"
                  onChange={handlePdfFileChange}
                  className="file:bg-muted file:text-foreground file:border-0 file:rounded-md file:px-2 file:py-1 cursor-pointer"
                />
                {pdfUploadState === "uploading" && <Loader2 size={16} className="animate-spin text-status-warning" />}
                {pdfUploadState === "done" && <CheckCircle2 size={16} className="text-status-success" />}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-body-sm font-medium text-foreground">
                {t("markdownContent")}
              </label>
              <textarea
                required
                rows={10}
                placeholder="---&#10;category: uts&#10;year: 2023&#10;semester: 1&#10;chapters:&#10;  - Bab 1: Limit Fungsi&#10;---&#10;&#10;## Question 1&#10;..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-body-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.rawText}
                onChange={(e) => setForm((prev) => ({ ...prev, rawText: e.target.value }))}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowUploadModal(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" isLoading={submitting} disabled={pdfUploadState === "uploading"}>
                {t("processIngestion")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Confirmation Deletion Dialog */}
      <AdminConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          setIsDeleteDialogOpen(open);
          if (!open) setDeletingId(null);
        }}
        title={t("deleteTitle")}
        description={t("deleteDescription")}
        confirmLabel={t("confirmDelete")}
        loading={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
