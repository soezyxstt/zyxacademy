"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useTranslations } from "@/lib/i18n/client";
import {
  createVideoPlaylistAction,
  updateVideoPlaylistAction,
  type VideoPlaylistItem,
} from "@/app/actions/video-actions";

type PlaylistDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  playlist?: VideoPlaylistItem | null;
  onSuccess?: (newPlaylistId?: string) => void;
};

/**
 * Modal dialog for creating and editing video playlists.
 */
export function PlaylistDialog({
  open,
  onOpenChange,
  courseId,
  playlist,
  onSuccess,
}: PlaylistDialogProps) {
  const t = useTranslations("studentCourse");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const isEditing = Boolean(playlist);

  useEffect(() => {
    if (playlist) {
      setTitle(playlist.title);
      setDescription(playlist.description || "");
    } else {
      setTitle("");
      setDescription("");
    }
  }, [playlist, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      toast.error(t("courseVideos.playlistTitleRequired"));
      return;
    }

    setLoading(true);
    try {
      if (playlist) {
        const res = await updateVideoPlaylistAction(
          playlist.id,
          cleanTitle,
          description.trim() || null
        );
        if (res.success) {
          toast.success(t("courseVideos.playlistUpdated"));
          onOpenChange(false);
          onSuccess?.(playlist.id);
        } else {
          toast.error(t("courseVideos.playlistUpdateFailed"));
        }
      } else {
        const res = await createVideoPlaylistAction(
          courseId,
          cleanTitle,
          description.trim() || null
        );
        if (res.success) {
          toast.success(t("courseVideos.playlistCreated"));
          onOpenChange(false);
          onSuccess?.(res.playlistId);
        } else {
          toast.error(t("courseVideos.playlistCreateFailed"));
        }
      }
    } catch {
      toast.error(t("courseVideos.playlistProcessError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (nextOpen || !loading) onOpenChange(nextOpen); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-body-base font-bold">
            {isEditing ? t("courseVideos.editPlaylist") : t("courseVideos.newPlaylist")}
          </DialogTitle>
          <DialogDescription className="text-body-xs text-muted-foreground">
            {t("courseVideos.playlistDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="playlist-title" className="text-body-sm font-semibold">
              {t("courseVideos.playlistTitle")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="playlist-title"
              placeholder={t("courseVideos.playlistTitlePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-body-sm"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="playlist-desc" className="text-body-sm font-semibold">
              {t("courseVideos.description")} <span className="text-body-xs text-muted-foreground font-normal">({t("courseVideos.optional")})</span>
            </Label>
            <Textarea
              id="playlist-desc"
              placeholder={t("courseVideos.playlistDescriptionPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="text-body-sm min-h-[80px]"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="text-body-sm"
            >
              {t("courseVideos.cancel")}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className="text-body-sm bg-brand-primary text-primary-foreground hover:bg-brand-primary/90"
            >
              {loading ? t("courseVideos.saving") : isEditing ? t("courseVideos.saveChanges") : t("courseVideos.createPlaylist")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
