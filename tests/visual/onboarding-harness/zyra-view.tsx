import { createPortal } from "react-dom";
import { MessageSquareText, X } from "lucide-react";
import { ZyraChatComposer, ZyraChatHeader, ZyraChatHistory } from "@/components/course/zyra-chat-frame";
import { TutorAssistantLabel, TutorAssistantSurface } from "@/components/course/tutor-message-frame";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/client";
import { fixtureCourse } from "./config";

/** The production trigger/provider is real; only remote conversation content is omitted. */
export function TutorDrawerView({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const t = useTranslations("studentCourse");
  const ui = useTranslations("ui");
  if (!isOpen) return null;
  return createPortal(<aside role="dialog" aria-label="Zyra" className="fixed inset-0 z-50 flex flex-col border-l border-border bg-background shadow-xl md:inset-y-0 md:left-auto md:w-[440px]">
    <ZyraChatHeader>
      <div className="flex min-w-0 items-center gap-2"><MessageSquareText className="size-4 shrink-0" /><div className="min-w-0"><p className="text-body-sm font-semibold">Zyra</p><p className="truncate text-body-xs text-muted-foreground">{fixtureCourse.title}</p></div></div>
      <Button type="button" variant="ghost" size="icon-lg" data-tour="zyra-close" onClick={onClose} aria-label={ui("close")}><X className="size-4" /></Button>
    </ZyraChatHeader>
    <ZyraChatHistory aria-label="Zyra"><TutorAssistantLabel /><TutorAssistantSurface><p className="text-body-sm leading-relaxed">{t("tutorDrawer.welcome")}</p></TutorAssistantSurface></ZyraChatHistory>
    <ZyraChatComposer><div className="min-h-16 p-3 text-body-sm text-muted-foreground">{t("tutorDrawer.inputPlaceholder")}</div></ZyraChatComposer>
  </aside>, document.body);
}
