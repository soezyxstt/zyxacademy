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
import { CoursePricingFields, pricingFields, pricingFromFields } from "@/components/admin/course-pricing-fields";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import type { CoursePricing } from "@/lib/student/course-pricing";
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

type Course = {
  id: string;
  title: string;
  category: string;
  description?: string | null;
  pricing?: CoursePricing;
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
  const [pricing, setPricing] = useState(() => pricingFields(course.pricing));
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

    let parsedPricing: CoursePricing;
    try { parsedPricing = pricingFromFields(pricing); } catch { toast.error("Pastikan waktu mulai dan akhir WIB valid, dan waktu akhir setelah waktu mulai."); return; }
    setLoading(true);
    const res = await saveCourse(
      course.id,
      title.trim(),
      category,
      description.trim() || null,
      false,
      parsedPricing
    );
    setLoading(false);

    if (res.success) {
      toast.success(t("courseDetail.settings.success.saved"));
      router.refresh();
    } else {
      toast.error(res.error || t("courseDetail.settings.errors.save"));
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
    <div className="max-w-4xl space-y-(--section-gap)">
      {/* Edit Course Form */}
      <section className="border-b border-border/60 pb-(--section-gap)">
        <h2 className="mb-(--compact-gap) flex items-center gap-2 font-heading text-body-base font-bold text-foreground">
          <Settings className="size-4 text-muted-foreground" aria-hidden />
          {t("courseDetail.settings.title")}
        </h2>

        <form onSubmit={handleSave} className="space-y-(--compact-gap)">
          <div className="grid gap-(--compact-gap) sm:grid-cols-2">
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
              <SelectTrigger id="course-settings-category" className="h-9 bg-muted/35">
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

          <CoursePricingFields id="settings" value={pricing} onChange={setPricing} disabled={loading} />
          <div className="space-y-1">
            <Label htmlFor="course-settings-description" className="text-body-sm font-semibold text-foreground">{t("courseDetail.settings.description")}</Label>
            <Textarea
              id="course-settings-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              placeholder={t("courseDetail.settings.descriptionPlaceholder")}
              className="rounded-lg text-body-sm"
            />
          </div>

          <div className="flex justify-end">
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
      </section>

      {/* Public demo selection */}
      <section className="space-y-(--compact-gap) border-b border-border/60 pb-(--section-gap)">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <Eye className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <h2 className="font-heading text-body-base font-bold text-foreground">{t("courseDetail.settings.publicDemo")}</h2>
              <p className="mt-1 max-w-2xl text-body-xs leading-relaxed text-muted-foreground">
                {t("courseDetail.settings.publicDemoDescription")}
              </p>
            </div>
          </div>
          <Badge variant="secondary" className={course.isDemo ? "text-status-success" : "text-muted-foreground"}>
            {course.isDemo ? t("courseDetail.settings.selected") : t("courseDetail.settings.notSelected")}
          </Badge>
        </div>

        {course.demoEligibility ? (
          <div className="grid gap-x-(--related-gap) sm:grid-cols-2">
            {course.demoEligibility.checks.map((check) => (
              <div key={check.key} className="flex items-start gap-2 border-b border-border/60 py-2">
                {check.ready ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-success" aria-hidden="true" />
                ) : (
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-status-error" aria-hidden="true" />
                )}
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-2">
                  <p className="text-body-sm font-medium text-foreground">{check.label}</p>
                  <p className="text-body-xs tabular-nums text-muted-foreground">{t("courseDetail.settings.availableCount", { count: check.count })}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {course.demoEligibility && !course.demoEligibility.eligible ? (
          <p className="text-body-xs text-status-error">
            {t("courseDetail.settings.demoEligibilityHint")}
          </p>
        ) : null}

        <div className="flex justify-end">
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
      </section>

      {/* Danger Zone */}
      <section className="flex flex-wrap items-start justify-between gap-(--compact-gap)">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h2 className="font-heading text-body-base font-bold text-destructive">
              {t("courseDetail.settings.dangerZone")}
            </h2>
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
          className="ml-auto"
        >
          <Trash2 className="size-3.5" />
          {t("courseDetail.settings.deleteCourse")}
        </Button>
      </section>

      {/* Delete Confirmation Dialog */}
      <AdminConfirmDialog
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title={t("courseDetail.settings.deleteTitle")}
        description={t("courseDetail.settings.deleteDescription", { title: course.title, id: course.id })}
        cancelLabel={t("common.cancel")}
        confirmLabel={t("courseDetail.settings.confirmDelete")}
        onConfirm={handleDeleteConfirm}
        loading={loading}
      />
    </div>
  );
}
