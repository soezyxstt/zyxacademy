"use client";

import { useState } from "react";
import Link from "next/link";
import { Edit, Eye, MoreHorizontal, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShareBlock } from "@/components/blog/share-widget";
import { useTranslations } from "@/lib/i18n/client";

type Props = {
  articleId: string;
  slug: string;
  title: string;
  summary: string;
  labels: {
    actions: string;
    edit: string;
    view: string;
    share: string;
  };
};

export function BlogRowActions({ articleId, slug, title, summary, labels }: Props) {
  const [shareOpen, setShareOpen] = useState(false);
  const tMarketing = useTranslations("marketing");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={labels.actions}
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem asChild>
            <Link href={`/admin/blog/${articleId}/edit`}>
              <Edit className="size-4 text-muted-foreground" />
              <span>{labels.edit}</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/blog/${slug}`} target="_blank">
              <Eye className="size-4 text-muted-foreground" />
              <span>{labels.view}</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setShareOpen(true)}>
            <Share2 className="size-4 text-muted-foreground" />
            <span>{labels.share}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tMarketing("blog.shareDialogTitle")}</DialogTitle>
            <DialogDescription>{tMarketing("blog.shareDialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="pt-2">
            <ShareBlock slug={slug} title={title} description={summary} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
