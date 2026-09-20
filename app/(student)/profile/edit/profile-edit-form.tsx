"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GraduationCap, Mail, ShieldCheck, AlertCircle } from "lucide-react";
import { updateStudentProfileAction, type StudentProfileActionState } from "@/app/(student)/profile/actions";
import { ITB_FACULTIES, getMajorsForFaculty, generateEntryYears } from "@/lib/student/itb-academic-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SelectField } from "@/components/ui/select-field";
import { toast } from "@/components/ui/toast";

const INITIAL_STATE: StudentProfileActionState = {
  success: false,
  message: "",
  submittedAt: 0,
};

interface ProfileEditFormProps {
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
export function ProfileEditForm({ user }: ProfileEditFormProps) {
  const router = useRouter();
  const [selectedFaculty, setSelectedFaculty] = useState(user.faculty || "");
  const [selectedMajor, setSelectedMajor] = useState(user.major || "");
  const [selectedEntryYear, setSelectedEntryYear] = useState<string>(
    user.entryYear ? String(user.entryYear) : ""
  );

  const [state, formAction, isPending] = useActionState(updateStudentProfileAction, INITIAL_STATE);

  const availableMajors = selectedFaculty ? getMajorsForFaculty(selectedFaculty) : [];
  const entryYears = generateEntryYears();

  const handleFacultyChange = (newFaculty: string) => {
    setSelectedFaculty(newFaculty);
    setSelectedMajor("");
  };

  useEffect(() => {
    if (!state.submittedAt) return;
    if (state.success) {
      toast.success(state.message);
      router.push("/profile");
    } else {
      toast.error(state.message);
    }
  }, [state, router]);

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
    <Card className="max-w-2xl border-border bg-card shadow-xs">
      <CardHeader className="border-b border-border pb-5">
        <div className="flex items-center justify-between">
          <CardTitle className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
            <GraduationCap className="size-5 text-brand-primary shrink-0" />
            Informasi Akademis ITB
          </CardTitle>
          <Badge variant="secondary" className="border-brand-primary/20 bg-brand-primary/10 text-brand-primary uppercase tracking-wider text-body-2xs font-semibold">
            Mahasiswa ITB
          </Badge>
        </div>
        <CardDescription className="text-body-xs text-muted-foreground mt-1">
          Data ini digunakan untuk menyesuaikan rekomendasi materi dan kelas dengan kurikulum Anda.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-6">
        {/* Google Identity Info Box */}
        <div className="mb-6 rounded-xl border border-border bg-muted/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-body-sm">
          <div>
            <p className="font-semibold text-foreground">{user.name}</p>
            <p className="text-body-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Mail className="size-3.5" />
              {user.email}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-body-xs font-semibold text-status-success shrink-0">
            <ShieldCheck className="size-4" />
            Akun Google terverifikasi
          </span>
        </div>

        {state.message && !state.success && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-status-error/30 bg-status-error/10 p-3 text-body-xs font-medium text-status-error">
            <AlertCircle className="size-4 shrink-0" />
            <span>{state.message}</span>
          </div>
        )}

        <form action={formAction} className="space-y-5">
          {/* Fakultas */}
          <SelectField
            id="faculty"
            name="faculty"
            label="Fakultas atau sekolah ITB"
            placeholder="Pilih fakultas atau sekolah..."
            options={facultyOptions}
            value={selectedFaculty}
            onValueChange={handleFacultyChange}
            required
          />

          {/* Jurusan / Program Studi */}
          <SelectField
            id="major"
            name="major"
            label="Jurusan atau program studi"
            description="Pilih opsi TPB jika belum penjurusan"
            placeholder={selectedFaculty ? "Pilih jurusan atau program studi..." : "Pilih fakultas terlebih dahulu..."}
            options={majorOptions}
            value={selectedMajor}
            onValueChange={setSelectedMajor}
            disabled={!selectedFaculty}
            required
          />

          {/* Tahun Masuk */}
          <SelectField
            id="entryYear"
            name="entryYear"
            label="Tahun masuk ITB (Angkatan)"
            description="Bagi mahasiswa tingkat pertama (TPB), kurikulum dan rekomendasi kelas otomatis memprioritaskan mata kuliah dasar TPB seperti Matematika, Fisika, Kimia, dan Berpikir Komputasional."
            placeholder="Pilih tahun masuk..."
            options={entryYearOptions}
            value={selectedEntryYear}
            onValueChange={setSelectedEntryYear}
            required
          />

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              asChild
              className="text-body-sm font-semibold"
            >
              <Link href="/profile">
                Batal
              </Link>
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isPending}
              className="text-body-sm font-semibold bg-brand-primary hover:bg-primary-hover text-white"
            >
              {isPending ? "Menyimpan..." : "Simpan profil"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
