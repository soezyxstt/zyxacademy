import React from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { TryoutForm } from "@/components/course/tryout-form";
import { Toaster } from "@/components/ui/toast";
import studentCourse from "@/messages/id/studentCourse.json";
import ui from "@/messages/id/ui.json";

const fixture = (window as unknown as {
  tryoutFixture: {
    transport: boolean;
    timeLimitMinutes: number;
    submit: (answers: unknown) => Promise<void>;
  };
}).tryoutFixture;
const transport = fixture.transport ? { submit: fixture.submit, afterSubmitHref: "/custom-results" } : undefined;

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="id" timeZone="UTC" messages={{ studentCourse, ui }}>
    <main className="mx-auto max-w-5xl p-4">
      <TryoutForm courseId="fixture-course" transport={transport} exam={{
        id: "fixture-exam", courseId: "fixture-course", title: "Tryout matematika", type: "tryout", status: "published",
        settings: { timeLimitMinutes: fixture.timeLimitMinutes },
        questions: [
          { id: "q1", order: 1, type: "multiple_choice", prompt: "Pilih bilangan genap.", options: ["Dua", "Tiga"] },
          { id: "q2", order: 2, type: "essay", prompt: "Jelaskan langkah penyelesaian.", acceptsFile: !fixture.transport },
        ],
      }} />
    </main>
    <Toaster />
  </NextIntlClientProvider>,
);
