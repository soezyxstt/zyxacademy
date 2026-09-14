import Link from "next/link";
import { BookOpen, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageOrnaments } from "@/components/ui/page-ornaments";

export function DemoEmptyState() {
  return (
    <div className="relative isolate overflow-hidden">
      <PageOrnaments variant="about" />
      <div className="relative z-10 mx-auto flex min-h-[min(62vh,560px)] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
        <BookOpen className="size-10 text-muted-foreground/60" aria-hidden="true" />
        <h1 className="mt-4 font-heading text-h5 font-bold text-foreground">Demo belum tersedia</h1>
        <p className="mt-2 max-w-md text-body-base text-muted-foreground">
          Tim Zyx sedang menyiapkan materi demo. Kamu tetap bisa melihat paket dan membuat akun kapan saja.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild className="gap-1.5 rounded-lg">
            <Link href="/sign-up">
              Buat akun gratis
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="rounded-lg">
            <Link href="/plans">Lihat paket</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
