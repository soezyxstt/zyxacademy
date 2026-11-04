import { MessageCircle } from "lucide-react";
import { TutorAssistantLabel, TutorStudentMessage } from "@/components/course/tutor-message-frame";
import { Card } from "@/components/ui/card";
import { DemoAuthCta } from "./demo-shell";
import { getTranslations } from "@/lib/i18n/server";

export async function DemoZyra({ nextPath }: { nextPath: string }) {
  const t = await getTranslations("marketing");
  const messages = [
    { role: t("demo.zyra.student"), text: t("demo.zyra.prompt") },
    { role: "Zyra", text: t("demo.zyra.reply") },
    { role: t("demo.zyra.student"), text: t("demo.zyra.followup") },
    { role: "Zyra", text: t("demo.zyra.signInReply") },
  ];
  return (
    <div className="mx-auto max-w-2xl">
      <Card variant="solid" className="p-5 sm:p-8">
        <div className="flex items-start gap-3 border-b border-border pb-5">
          <MessageCircle className="mt-1 size-5 shrink-0 text-brand-primary" aria-hidden="true" />
          <div>
            <h2 className="font-heading text-h5 font-bold text-foreground">{t("demo.zyra.title")}</h2>
          </div>
        </div>

        <div className="mt-8 space-y-3" aria-label={t("demo.zyra.conversationLabel")}>
          {messages.map((message, index) => {
            const fromZyra = message.role === "Zyra";
            return fromZyra ? (
              <div key={index} className="space-y-2"><TutorAssistantLabel /><p className="text-body-sm leading-relaxed">{message.text}</p></div>
            ) : <TutorStudentMessage key={index}>{message.text}</TutorStudentMessage>;

          })}
        </div>
      </Card>

      <div className="mt-5 flex flex-col gap-3 rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-body-base font-bold text-foreground">{t("demo.zyra.ctaTitle")}</h2>
          <p className="mt-1 text-body-xs text-muted-foreground">{t("demo.zyra.ctaDescription")}</p>
        </div>
        <DemoAuthCta nextPath={nextPath} />
      </div>
    </div>
  );
}
