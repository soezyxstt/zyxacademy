import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Compass } from "lucide-react";
import { checkEnrollment } from "@/app/(student)/dashboard/actions";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { studentCardClass } from "@/components/course/course-surfaces";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata, pageTitle } from "@/lib/site";
import { getCourse } from "@/lib/course-utils";
import { StudyPathTimeline } from "@/components/course/study-path-timeline";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);
  return createMetadata({
    title: course ? `Alur Belajar ${course.title}` : "Alur Belajar",
    description: course?.description ?? "Rencana alur belajar personal terstruktur.",
    path: `/courses/${id}/path`,
  });
}


export default async function CoursePathPage({ params }: Props) {
  const { id } = await params;
  const course = await getCourse(id);
  if (!course) notFound();

  const isEnrolled = await checkEnrollment(id);

  if (!isEnrolled) {
    return (
      <CoursePageShell
        title={`Alur Belajar: ${course.title}`}

        icon={Compass}
      >
        <Reveal>
          <div className={studentCardClass("mx-auto max-w-xl text-center py-12")}>
            <h3 className="font-heading text-body-base font-bold text-foreground">Alur Belajar Terkunci</h3>
            <p className="mt-2 text-body-sm text-muted-foreground leading-relaxed">
              Anda perlu mendaftar kelas ini untuk melihat alur belajar personal Anda. Aktifkan kelas menggunakan token pendaftaran di bawah ini.
            </p>
            <div className="mt-6 flex justify-center">
              <EnrollmentForm className="w-full max-w-sm" />
            </div>
          </div>
        </Reveal>
      </CoursePageShell>
    );
  }

  return (
    <CoursePageShell
      title={`Alur Belajar: ${course.title}`}

      icon={Compass}
    >
      <StudyPathTimeline courseId={id} />
    </CoursePageShell>
  );
}
