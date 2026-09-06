import { PageTransition } from "@/components/ui/page-transition";

type SiteMainProps = {
  children: React.ReactNode;
};

export function SiteMain({ children }: SiteMainProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex-1 outline-none pt-14 md:pt-16"
    >
      <PageTransition>{children}</PageTransition>
    </main>
  );
}
