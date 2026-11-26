import Link from "next/link";
import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MeetingUnavailable({ title, description, home }: { title: string; description: string; home: string }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center px-(--page-gutter) py-(--section-gap)">
      <div className="space-y-(--compact-gap) text-center">
        <Video className="mx-auto size-5 text-muted-foreground" aria-hidden />
        <h1 className="font-heading text-h5 font-bold text-foreground">{title}</h1>
        <p className="text-body-sm text-muted-foreground">{description}</p>
        <Button asChild>
          <Link href="/">{home}</Link>
        </Button>
      </div>
    </main>
  );
}
