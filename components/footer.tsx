import Link from "next/link";
import { FaTiktok, FaInstagram } from "react-icons/fa6";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import { env } from "@/lib/env";

const socialClass = cn(
  "interactive inline-flex size-10 items-center justify-center rounded-full border border-border",
  "text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/60 hover:text-foreground",
);

export function Footer() {
  return (
    <footer role="contentinfo" className="border-t border-border bg-background">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 py-10 md:grid-cols-12 md:gap-8 md:py-12 lg:gap-14">
          <div className="md:col-span-5 lg:col-span-6">
            <Link href="/" aria-label="Beranda Zyx Academy" className="inline-flex">
              <Logo className="[--logo-height:1.75rem] md:[--logo-height:2rem]" />
            </Link>
            <p className="mt-4 max-w-md text-body-sm leading-relaxed text-muted-foreground">
              Zyx Academy membantu mahasiswa S1 ITB tahun pertama dan kedua (TPB dan jurusan) menguasai materi dengan modul selaras kampus,
              latihan terarah, dan tutorial bersama tutor ITB.
            </p>
            <p className="mt-2 text-body-xs font-semibold text-[var(--zx-accent)] tracking-wide">
              Built by ITB students. Belajar dengan arah yang lebih jelas.
            </p>
          </div>

          <nav className="md:col-span-3" aria-label="Tautan perusahaan">
            <h3 className="font-heading text-body-sm font-semibold tracking-tight text-foreground">Perusahaan</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <Link href="/about" className="interactive text-body-sm text-muted-foreground transition-colors hover:text-foreground">
                  Tentang kami
                </Link>
              </li>
              <li>
                <Link href="/plans" className="interactive text-body-sm text-muted-foreground transition-colors hover:text-foreground">
                  Paket layanan
                </Link>
              </li>
              <li>
                <Link href="/testimonial" className="interactive text-body-sm text-muted-foreground transition-colors hover:text-foreground">
                  Testimoni
                </Link>
              </li>
            </ul>
          </nav>

          <nav className="md:col-span-4 lg:col-span-3" aria-label="Legal">
            <h3 className="font-heading text-body-sm font-semibold tracking-tight text-foreground">Legal</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <Link href="#" className="interactive text-body-sm text-muted-foreground transition-colors hover:text-foreground">
                  Kebijakan privasi
                </Link>
              </li>
              <li>
                <Link href="#" className="interactive text-body-sm text-muted-foreground transition-colors hover:text-foreground">
                  Syarat layanan
                </Link>
              </li>
            </ul>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              {env.NEXT_PUBLIC_BRAND_INSTAGRAM && (
                <Link
                  href={env.NEXT_PUBLIC_BRAND_INSTAGRAM}
                  className={socialClass}
                  aria-label="Zyx Academy di Instagram"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FaInstagram className="size-4.5" aria-hidden />
                </Link>
              )}
              {env.NEXT_PUBLIC_BRAND_TIKTOK && (
                <Link
                  href={env.NEXT_PUBLIC_BRAND_TIKTOK}
                  className={socialClass}
                  aria-label="Zyx Academy di TikTok"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FaTiktok className="size-4.5" aria-hidden />
                </Link>
              )}
            </div>
          </nav>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-border py-6 sm:flex-row sm:py-5">
          <p className="text-center text-body-sm text-muted-foreground sm:text-left">
            © {new Date().getFullYear()} Zyx Academy. Hak cipta dilindungi undang-undang.
          </p>
        </div>
      </div>
    </footer>
  );
}
