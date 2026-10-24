"use client";

import { useState } from "react";
import { LocaleProvider, useAppLocale } from "@/components/providers/locale-provider";
import { LanguageMenu } from "@/components/language-menu";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { Locale } from "@/lib/i18n/locale";
import type { MessageCatalog } from "@/lib/i18n/catalogs";
import { QuizPlayer } from "@/components/course/quiz-player";
import { TutorProvider } from "@/components/course/tutor-drawer";
import { FileUploadField } from "@/components/ui/file-upload-field";

export function BilingualSwitchFixture({
  locale,
  messages,
  mockPersistence = true,
  mode,
}: {
  locale: Locale;
  messages: Record<string, MessageCatalog>;
  mockPersistence?: boolean;
  mode?: string | string[];
}) {
  return (
    <LocaleProvider
      initialLocale={locale}
      initialMessages={messages}
      persistLocale={mockPersistence ? async () => ({ success: true }) : undefined}
    >
      {mode === "quiz" ? <QuizStateFixture /> : <FixtureContent />}
    </LocaleProvider>
  );
}

function QuizStateFixture() {
  const { locale } = useAppLocale();
  const [uploadedNames, setUploadedNames] = useState<string[]>([]);

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <h1 className="font-heading text-h5" data-testid="locale-heading">
        {locale === "en" ? "Quiz state fixture" : "Fixture status kuis"}
      </h1>
      <LanguageMenu />
      <article className="h-36 overflow-y-auto rounded-md border border-border p-4" data-testid="reader-scroll">
        <p>Fixture reading text stays in its authored language.</p>
        <div className="h-96" />
        <p>End of fixture reading text.</p>
      </article>
      <section className="rounded-lg border border-border p-4">
        <FileUploadField
          id="fixture-file-upload"
          label={locale === "en" ? "Fixture files" : "Berkas fixture"}
          accept={[".pdf"]}
          multiple
          onChange={(files) => setUploadedNames(files.map((file) => file.name))}
        />
        <output data-testid="fixture-uploaded-files" className="sr-only">{uploadedNames.join(",")}</output>
      </section>
      <TutorProvider>
        <QuizPlayer
          courseId="bilingual-fixture-course"
          attemptId="bilingual-fixture-attempt"
          redirectBasePath="/visual-fixtures/bilingual"
          exam={{
            id: "bilingual-fixture-quiz",
            title: "Bilingual quiz state fixture",
            settings: { timeLimitSeconds: 1800 },
            questions: [
              {
                id: "choice-question",
                order: 1,
                type: "multiple_choice",
                prompt: "Fixture question: choose the second answer.",
                options: ["Choice A", "Choice B"],
              },
              {
                id: "essay-question",
                order: 2,
                type: "essay",
                prompt: "Fixture question: attach a document.",
                options: [],
              },
            ],
          }}
        />
      </TutorProvider>
    </main>
  );
}

function FixtureContent() {
  const t = useTranslations("core");
  const { locale } = useAppLocale();
  const [draft, setDraft] = useState("");
  const [answer, setAnswer] = useState("");

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="font-heading text-h5" data-testid="locale-heading">
        {locale === "en" ? "Bilingual state fixture" : "Uji perpindahan bahasa"}
      </h1>
      <LanguageMenu />
      <nav className="flex gap-3 text-body-xs">
        <Link href="/visual-fixtures/bilingual?locale=id" scroll={false}>Indonesia route</Link>
        <Link href="/visual-fixtures/bilingual?locale=en" scroll={false}>English route</Link>
      </nav>
      <label className="block space-y-2 text-body-sm">
        <span>{locale === "en" ? "Draft" : "Draf"}</span>
        <input
          data-testid="draft-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3"
        />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-body-sm">{locale === "en" ? "Quiz answer" : "Jawaban kuis"}</legend>
        <label className="flex items-center gap-2 text-body-sm">
          <input type="radio" name="answer" value="a" checked={answer === "a"} onChange={() => setAnswer("a")} />
          {locale === "en" ? "Option A" : "Pilihan A"}
        </label>
        <label className="flex items-center gap-2 text-body-sm">
          <input type="radio" name="answer" value="b" checked={answer === "b"} onChange={() => setAnswer("b")} />
          {locale === "en" ? "Option B" : "Pilihan B"}
        </label>
      </fieldset>
      <div className="h-36 overflow-y-auto rounded-md border border-border p-4" data-testid="reader-scroll">
        <p>{locale === "en" ? "Reader content" : "Isi bacaan"}</p>
        <div className="h-96" />
        <p>{locale === "en" ? "End of reader" : "Akhir bacaan"}</p>
      </div>
      <p className="text-body-xs text-muted-foreground">{t("language.label")}</p>
      <output data-testid="quiz-answer" className="sr-only">{answer}</output>
    </main>
  );
}
