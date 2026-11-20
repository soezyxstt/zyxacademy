"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, AlertCircle } from "lucide-react";
import { updateStudentProfileAction, type StudentProfileActionState } from "@/app/(student)/profile/actions";
import { ITB_FACULTIES, getMajorsForFaculty, generateEntryYears } from "@/lib/student/itb-academic-data";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { toast } from "@/components/ui/toast";
import { useTranslations } from "@/lib/i18n/client";

import { useStudentExperience } from "@/components/student-experience-provider";
import { validateAcademicProfile } from "@/lib/student/academic-profile";

const INITIAL_STATE: StudentProfileActionState = {
  success: false,
  message: "",
  errorCode: undefined,
  submittedAt: 0,
};

interface ProfileEditFormProps {
  stayOnPage?: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    faculty?: string | null;
    major?: string | null;
    entryYear?: number | null;
  };
}

/**
 * Interactive form component for editing student ITB academic profile details.
 * Reactively cascades available major options when a faculty is chosen.
 */
export function ProfileEditForm({ user, stayOnPage = false }: ProfileEditFormProps) {
  const t = useTranslations("student");
  const experience = useStudentExperience();
  const href = (path: string) => experience.href?.(path) ?? path;
  const router = useRouter();
  const [selectedFaculty, setSelectedFaculty] = useState(user.faculty || "");
  const [selectedMajor, setSelectedMajor] = useState(user.major || "");
  const [selectedEntryYear, setSelectedEntryYear] = useState<string>(
    user.entryYear ? String(user.entryYear) : ""
  );

  const [state, formAction, isPending] = useActionState(async (previous: StudentProfileActionState, form: FormData) => {
    if (experience.mode !== "demo") return updateStudentProfileAction(previous, form);
    const validated = validateAcademicProfile({ faculty: String(form.get("faculty") ?? ""), major: String(form.get("major") ?? ""), entryYear: String(form.get("entryYear") ?? "") });
    if (validated.errorCode) return { success: false, message: "Periksa profil akademis.", errorCode: validated.errorCode, submittedAt: Date.now() };
    try { localStorage.setItem(`zyx-demo-profile:${experience.baseline.map(row => row.revision).join(":")}`, JSON.stringify(validated.profile)); } catch { return { success: false, message: "Penyimpanan browser tidak tersedia.", submittedAt: Date.now() }; }
    return { success: true, message: "", submittedAt: Date.now() };
  }, INITIAL_STATE);
  const shownSubmission = useRef(0);

  const availableMajors = selectedFaculty ? getMajorsForFaculty(selectedFaculty) : [];
  const entryYears = generateEntryYears();

  const handleFacultyChange = (newFaculty: string) => {
    setSelectedFaculty(newFaculty);
    setSelectedMajor("");
  };

  useEffect(() => {
    if (!state.submittedAt || shownSubmission.current === state.submittedAt) return;
    shownSubmission.current = state.submittedAt;
    if (state.success) {
      toast.success(t("profile.saved"));
      if (!stayOnPage) router.push(experience.href?.("/profile") ?? "/profile");
    } else {
      toast.error(t("profile.saveFailed"));
    }
  }, [state, router, t, experience, stayOnPage]);

  const facultyOptions = ITB_FACULTIES.map((f) => ({
    value: f.code,
    label: `${f.code} - ${f.name}`,
  }));

  const majorOptions = availableMajors.map((m) => ({
    value: m,
    label: m,
  }));

  const entryYearOptions = entryYears.map((year) => ({
    value: String(year),
    label: String(year),
  }));

  return (
    <section aria-labelledby="academic-profile-title">
      <header className="space-y-1 border-b border-border/40 pb-3">
        <h2 id="academic-profile-title" className="font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("profile.academicInfo")}
        </h2>
        <p className="text-body-xs text-muted-foreground">
          {t("profile.recommendationDescription")}
        </p>
      </header>

      <div className="pt-4">
        <div className="mb-4 border-b border-border/30 pb-3 text-body-sm">
          <div>
            <p className="font-medium text-foreground">{user.name}</p>
            <p className="text-body-xs text-muted-foreground flex items-center gap-1.5 mt-0.5 break-all">
              <Mail className="size-3.5" />
              {user.email}
            </p>
          </div>
        </div>

        {state.message && !state.success && (
          <div role="alert" className="mb-6 flex items-center gap-2 rounded-xl border border-status-error/30 bg-status-error/10 p-3 text-body-xs font-medium text-status-error">
            <AlertCircle className="size-4 shrink-0" />
            <span>{state.errorCode ? t(`profile.errors.${state.errorCode}`) : t("profile.saveFailed")}</span>
          </div>
        )}

        <form onSubmit={event => {
          event.preventDefault();
          // React's automatic form reset also resets Radix selects after failed saves.
          const form = new FormData(event.currentTarget);
          startTransition(() => formAction(form));
        }} className="space-y-(--related-gap)">
          <div className="grid min-w-0 grid-cols-1 gap-(--related-gap) md:grid-cols-2 [&_button[role=combobox]]:h-auto [&_button[role=combobox]]:min-h-10 [&_button[role=combobox]>span]:text-left [&_button[role=combobox]>span]:whitespace-normal [&_button[role=combobox]>span]:break-words">
          <SelectField
            id="faculty"
            name="faculty"
            label={t("profile.facultyLabel")}
            placeholder={t("profile.facultyPlaceholder")}
            options={facultyOptions}
            contentClassName="max-w-[var(--radix-popper-available-width)]"
            value={selectedFaculty}
            onValueChange={handleFacultyChange}
            disabled={isPending}
            required
          />

          {/* Jurusan / Program Studi */}
          <SelectField
            id="major"
            name="major"
            label={t("profile.majorLabel")}
            description={t("profile.majorDescription")}
            placeholder={selectedFaculty ? t("profile.majorPlaceholder") : t("profile.selectFacultyFirst")}
            options={majorOptions}
            contentClassName="max-w-[var(--radix-popper-available-width)]"
            value={selectedMajor}
            onValueChange={setSelectedMajor}
            disabled={isPending || !selectedFaculty}
            required
          />

          {/* Tahun Masuk */}
          <SelectField
            id="entryYear"
            name="entryYear"
            label={t("profile.entryYearLabel")}
            description={t("profile.entryYearDescription")}
            placeholder={t("profile.entryYearPlaceholder")}
            options={entryYearOptions}
            value={selectedEntryYear}
            onValueChange={setSelectedEntryYear}
            disabled={isPending}
            required
          />
          </div>

          {/* Form Actions */}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-border/30">
            <Button
              type="button"
              variant="outline"
              size="sm"
              asChild
              className="text-body-sm font-semibold"
            >
              <Link href={href("/profile")}>
                {t("profile.cancel")}
              </Link>
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isPending}
              className="text-body-sm font-semibold bg-brand-primary hover:bg-primary-hover text-primary-foreground"
            >
              {isPending ? t("profile.saving") : t("profile.save")}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
