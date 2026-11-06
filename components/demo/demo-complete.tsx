"use client";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/client";
import { useDemoSession } from "./demo-session";
export function DemoComplete({ id }: { id: string }) {
  const { overlay, record, ready } = useDemoSession();
  const t = useTranslations("marketing");
  const done = overlay.events.some((event) => event.kind === "article" && event.id === id);
  return <Button className="mt-5" disabled={!ready || done} onClick={() => record("article", id)}>{t(done ? "demo.session.completed" : "demo.session.markComplete")}</Button>;
}
