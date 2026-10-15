"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { FormattedDate } from "@/components/ui/formatted-date";
import { toast } from "@/components/ui/toast";
import { markPkaAnnouncementReadAction } from "../actions";

interface AnnouncementCardProps {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  isPinned: boolean;
}

export function AnnouncementCard({ id, title, body, createdAt, isPinned }: AnnouncementCardProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleMarkAsRead = () => {
    startTransition(async () => {
      const res = await markPkaAnnouncementReadAction(id);
      if (res.error) {
        toast.error("Gagal menandai telah dibaca", { description: res.error });
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="relative p-4 group">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 pr-8">
        <div className="flex items-center gap-2">
          {isPinned && <Pin className="size-4 text-brand-primary fill-brand-primary/20" aria-label="Pinned" />}
          <h3 className="font-heading text-body-base font-bold text-foreground">
            {title}
          </h3>
        </div>
        <span className="text-body-xs text-muted-foreground">
          <FormattedDate date={createdAt} options={{ dateStyle: "long", timeStyle: "short" }} />
        </span>
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <MarkdownRenderer content={body} />
      </div>

      {!isPinned && (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleMarkAsRead}
          disabled={isPending}
          className="absolute top-3 right-3 size-8 rounded-md text-muted-foreground hover:text-foreground"
          title="Tandai sudah dibaca"
          aria-label="Tandai sudah dibaca"
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
