"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/client";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  saveCourse,
  deleteCourse,
  setDemoCourse,
} from "@/app/(admin)/admin/(academic)/courses/actions";
import { allowedCategories } from "@/app/(admin)/admin/(academic)/courses/constants";
import {
  Settings,
  Trash2,
  Save,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  CircleAlert,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

type Course = {
  id: string;
  title: string;
  category: string;
  description?: string | null;
  isDemo?: boolean;
  demoEligibility?: {
    eligible: boolean;
    checks: Array<{
      key: "article" | "diktat" | "flashcards" | "quiz";
      label: string;
      ready: boolean;
      count: number;
    }>;
    issues: string[];
  } | null;
};

type Props = {
  course: Course;
};

export function SettingsTab({ course }: Props) {
  const t = useTranslations("adminAcademic");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Form State
  const [title, setTitle] = useState(course.title);
  const [category, setCategory] = useState(course.category);
  const [description, setDescription] = useState(course.description || "");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error(t("courseDetail.settings.errors.titleRequired"));
      return;
    }
    if (!category) {
      toast.error(t("courseDetail.settings.errors.categoryRequired"));
      return;
    }

    setLoading(true);
    const res = await saveCourse(
      course.id,
      title.trim(),
      category,
      description.trim() || null,
      false
    );
    setLoading(false);

    if (res.success) {
      toast.success(t("courseDetail.settings.success.saved"));
      router.refresh();
    } else {
      toast.error(t("courseDetail.settings.errors.save"));
    }
  };

  const handleDeleteConfirm = async () => {
    setLoading(true);
    const res = await deleteCourse(course.id);
    setLoading(false);
    setDeleteModalOpen(false);

    if (res.success) {
      toast.success(t("courseDetail.settings.success.deleted"));
      router.push("/admin/courses");
    } else {
      toast.error(t("courseDetail.settings.errors.delete"));
    }
  };

  const handleDemoToggle = async () => {
    setDemoLoading(true);
    const res = await setDemoCourse(course.id, !course.isDemo);
    setDemoLoading(false);

    if (res.success) {
      toast.success(course.isDemo ? t("courseDetail.settings.success.removedFromDemo") : t("courseDetail.settings.success.selectedForDemo"));
      router.refresh();
    } else {
      toast.error(t("courseDetail.settings.errors.demo"));
    }
  };

  return (
    <div className="space-y-4">
      {/* Edit Course Form */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
        <h3 className="font-heading text-body-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Settings className="size-4 text-brand-primary" />
          {t("courseDetail.settings.title")}
        </h3>

        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="course-settings-id" className="text-body-sm font-semibold text-foreground">{t("courseDetail.settings.permanentId")}</Label>
              <Input id="course-settings-id"
                value={course.id}
                disabled
                className="bg-muted text-muted-foreground font-mono rounded-lg h-9"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="course-settings-name" className="text-body-sm font-semibold text-foreground">{t("courseDetail.settings.courseName")}</Label>
              <Input id="course-settings-name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={loading}
                className="rounded-lg h-9"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="course-settings-category" className="text-body-sm font-semibold text-foreground">{t("courseDetail.settings.category")}</Label>
            <Select value={category} onValueChange={setCategory} disabled={loading}>
              <SelectTrigger id="course-settings-category" className="rounded-lg h-9">
              <SelectValue placeholder={t("courseDetail.settings.selectCategory")} />
              </SelectTrigger>
              <SelectContent>
                {allowedCategories.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-body-sm font-semibold text-foreground">{t("courseDetail.settings.description")}</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              placeholder={t("courseDetail.settings.descriptionPlaceholder")}
              className="rounded-lg text-body-sm"
            />
          </div>

          <div className="pt-1">
            <Button
              type="submit"
              size="sm"
              disabled={loading || !title.trim()}
              className="gap-1.5 rounded-lg font-semibold h-9"
            >
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t("courseDetail.settings.saving")}
                </>
              ) : (
                <>
                  <Save className="size-3.5" />
                  {t("courseDetail.settings.saveChanges")}
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Public demo selection */}
      <div className="rounded-xl border border-brand-primary/25 bg-brand-primary/5 p-4 shadow-2xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-2.5">
            <Eye className="mt-0.5 size-4 shrink-0 text-brand-primary" aria-hidden="true" />
            <div>
              <h3 className="font-heading text-body-sm font-semibold text-foreground">{t("courseDetail.settings.publicDemo")}</h3>
              <p className="mt-1 max-w-2xl text-body-xs leading-relaxed text-muted-foreground">
                {t("courseDetail.settings.publicDemoDescription")}
              </p>
            </div>
          </div>
          <Badge variant="outline" className={course.isDemo ? "border-brand-primary/40 text-brand-primary" : "text-muted-foreground"}>
            {course.isDemo ? t("courseDetail.settings.selected") : t("courseDetail.settings.notSelected")}
          </Badge>
        </div>

        {course.demoEligibility ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {course.demoEligibility.checks.map((check) => (
              <div key={check.key} className="flex items-start gap-2 border-b border-border/60 py-2">
                {check.ready ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-success" aria-hidden="true" />
                ) : (
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-status-error" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="text-body-xs font-semibold text-foreground">{check.label}</p>
                  <p className="mt-0.5 text-body-xs text-muted-foreground">{t("courseDetail.settings.availableCount", { count: check.count })}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {course.demoEligibility && !course.demoEligibility.eligible ? (
          <p className="mt-3 text-body-xs text-status-error">
            {t("courseDetail.settings.demoEligibilityHint")}
          </p>
        ) : null}

        <div className="mt-4">
          <Button
            type="button"
            size="sm"
            variant={course.isDemo ? "outline" : "default"}
            onClick={handleDemoToggle}
            disabled={loading || demoLoading || (!course.isDemo && !course.demoEligibility?.eligible)}
            isLoading={demoLoading}
            className="gap-1.5 rounded-lg"
          >
            <Eye className="size-3.5" aria-hidden="true" />
            {course.isDemo ? t("courseDetail.settings.removeFromDemo") : t("courseDetail.settings.makePublicDemo")}
          </Button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="font-heading text-body-sm font-bold text-destructive">
              {t("courseDetail.settings.dangerZone")}
            </h4>
            <p className="text-body-xs text-muted-foreground">
              {t("courseDetail.settings.dangerDescription")}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => setDeleteModalOpen(true)}
          disabled={loading}
          className="gap-1.5 rounded-lg h-8 font-semibold"
        >
          <Trash2 className="size-3.5" />
          {t("courseDetail.settings.deleteCourse")}
        </Button>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteModalOpen}
        onOpenChange={(open) => {
          if (!loading) setDeleteModalOpen(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("courseDetail.settings.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("courseDetail.settings.deleteDescription", { title: course.title, id: course.id })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" disabled={loading} className="rounded-lg">
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteConfirm}
              disabled={loading}
              isLoading={loading}
              className="rounded-lg"
            >
              {t("courseDetail.settings.confirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
