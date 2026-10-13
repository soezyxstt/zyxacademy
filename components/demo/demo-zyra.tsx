import { MessageCircle, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DemoAuthCta } from "./demo-shell";

const messages = [
  { role: "Kamu", text: "Apa yang perlu saya pahami dulu?" },
  { role: "Zyra", text: "Mulai dari Artikel bab pertama, lalu cek pemahaman lewat Kuis." },
  { role: "Kamu", text: "Bisa bertanya lebih banyak?" },
  { role: "Zyra", text: "Masuk dengan Google untuk bertanya ke Zyra dan menyimpan progres belajarmu." },
] as const;

export function DemoZyra({ nextPath }: { nextPath: string }) {
  return (
    <div className="mx-auto max-w-2xl">
      <Card variant="solid" className="p-5 sm:p-8">
        <div className="flex items-start gap-3 border-b border-border pb-5">
          <MessageCircle className="mt-1 size-5 shrink-0 text-brand-primary" aria-hidden="true" />
          <div>
            <h2 className="font-heading text-h5 font-bold text-foreground">Teman belajar yang memberi arah</h2>
          </div>
        </div>

        <div className="mt-8 space-y-3" aria-label="Contoh percakapan Zyra">
          {messages.map((message, index) => {
            const fromZyra = message.role === "Zyra";
            return (
              <div key={`${message.role}-${index}`} className={fromZyra ? "flex items-start gap-2" : "flex justify-end"}>
                {fromZyra ? <Sparkles className="mt-2 size-4 shrink-0 text-brand-primary" aria-hidden="true" /> : null}
                <div
                  className={fromZyra
                    ? "max-w-[88%] rounded-xl rounded-tl-sm bg-muted px-3 py-2.5 text-body-sm leading-relaxed text-foreground"
                    : "max-w-[88%] rounded-xl rounded-tr-sm bg-brand-primary px-3 py-2.5 text-body-sm leading-relaxed text-brand-primary-foreground"}
                >
                  {message.text}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="mt-5 flex flex-col gap-3 rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-body-base font-bold text-foreground">Coba Zyra di akunmu</h2>
          <p className="mt-1 text-body-xs text-muted-foreground">Paket Free memberi satu pertanyaan per hari.</p>
        </div>
        <DemoAuthCta nextPath={nextPath} />
      </div>
    </div>
  );
}
