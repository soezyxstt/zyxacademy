import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/ui/reveal";
import { ApplicationPage } from "@/components/application-page";

type ShellPageProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function ShellPage({ title, children, className }: ShellPageProps) {
  return (
    <ApplicationPage className={cn("relative pb-8", className)}>
      <Reveal>
        <PageHeader title={title} />
      </Reveal>
      <Reveal className="mt-5 md:mt-6">
        <div>{children}</div>
      </Reveal>
    </ApplicationPage>
  );
}
