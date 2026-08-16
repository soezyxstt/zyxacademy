import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMuridDashboardReadModel } from "@/lib/murid/read-model";

export default async function MuridHomePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in?next=%2Fmurid");
  const model = await getMuridDashboardReadModel(session.user.id);

  return (
    <main className="min-h-screen bg-background px-6 py-12 text-foreground">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="border-b border-border pb-6">
          <p className="text-body-sm text-muted-foreground">Ruang belajar murid</p>
          <h1 className="mt-2 font-heading text-h2">Belajar berbasis Idea</h1>
          <p className="mt-3 max-w-2xl text-body-base text-muted-foreground">
            Materi, produk, dan mastery ditampilkan dari read model canonical. Riwayat Tutorial PKA tetap memakai snapshot yang tersimpan.
          </p>
        </header>
        <section aria-labelledby="murid-courses" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 id="murid-courses" className="font-heading text-h4">Mata kuliah</h2>
            <Link className="rounded-lg border border-border px-3 py-2 text-body-sm transition-colors duration-150 hover:bg-muted" href="/dashboard">
              Buka dashboard lama
            </Link>
          </div>
          {model.courses.length === 0 ? (
            <p className="text-body-sm text-muted-foreground">Belum ada mata kuliah aktif.</p>
          ) : (
            <div className="divide-y divide-border border-y border-border">
              {model.courses.map((course) => (
                <article key={course.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div>
                    <h3 className="font-heading text-h6">{course.title}</h3>
                    <p className="mt-1 text-body-sm text-muted-foreground">
                      {course.ideas.length} Idea, {course.products.articles.length} artikel, {course.products.publishedQuestionCount} soal terbit
                    </p>
                  </div>
                  <Link className="rounded-lg bg-primary px-3 py-2 text-body-sm text-primary-foreground transition-colors duration-150 hover:bg-primary/90" href={`/courses/${course.id}/material`}>
                    Buka materi
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
