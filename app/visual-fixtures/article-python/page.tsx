import { notFound } from "next/navigation";
import { ArticleCodingProvider } from "@/components/coding/article-coding";
import { ArticleParts } from "@/components/course/article-parts";

const codingContext = { courseId: "coding-course", articleId: "article-python-fixture", articleVersion: 1, enabled: true };
const firstCode = 'nama = input("Nama: ")\nprint("Halo,", nama)';

export default async function ArticlePythonFixture({ searchParams }: { searchParams: Promise<{ free?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const browserOnly = (await searchParams).free === "1";
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 text-body-base text-foreground">
      <h1 className="font-heading text-h5">Contoh Python dalam artikel</h1>
      <ArticleCodingProvider value={{ ...codingContext, browserOnly }}>
        <section aria-label="Artikel mahasiswa">
          <ArticleParts parts={[
            { id: "first", kind: "markdown", markdown: `Ubah nama, lalu jalankan kode.\n\n\`\`\`python\n${firstCode}\n\`\`\`` },
            { id: "second", kind: "markdown", markdown: "Contoh kedua.\n\n```Python\nprint(2 + 3)\n```" },
            { id: "javascript", kind: "markdown", markdown: "```javascript\nconsole.log('tetap statis')\n```" },
          ]} />
        </section>
      </ArticleCodingProvider>
      <section aria-label="Pratinjau admin">
        <h2 className="font-heading text-body-base font-bold">Pratinjau admin</h2>
        <ArticleCodingProvider value={{ ...codingContext, enabled: false }}>
          <ArticleParts parts={[{ id: "admin", kind: "markdown", markdown: `\`\`\`python\n${firstCode}\n\`\`\`` }]} />
        </ArticleCodingProvider>
      </section>
    </main>
  );
}
