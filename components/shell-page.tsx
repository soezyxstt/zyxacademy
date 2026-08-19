import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/ui/reveal";

type ShellPageProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function ShellPage({ title, children, className }: ShellPageProps) {
  return (
    <div className={cn("relative pb-8", className)}>
      <div className="marketing-container pt-6 md:pt-8">
        <Reveal>
          <PageHeader title={title} />
        </Reveal>
        <Reveal className="mt-5 md:mt-6">
          <div>{children}</div>
        </Reveal>
      </div>
    </div>
  );
}
