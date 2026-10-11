"use client";

import { useState } from "react";
import { VideoPlayerModal } from "@/components/course/video/video-player-modal";
import { Button } from "@/components/ui/button";
import type { VideoItem, VideoPlaylistItem } from "@/app/actions/video-actions";

const sampleVideos: VideoItem[] = [
  {
    id: "vid-1",
    courseId: "ma1101",
    playlistId: "pl-uts-2023",
    chapterId: "ch-1",
    chapterTitle: "Sistem Bilangan Real",
    title: "Bagian A - Soal 1 s.d. 5",
    description: "Pembahasan detail soal pilihan ganda dan isian singkat Bagian A UTS Matematika IA tahun 2023. Membahas konsep titik tengah, jarak dua titik, dan ketidaksamaan.",
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    duration: 1533,
    fileSize: 45000000,
    orderIndex: 0,
    uploadedBy: "system",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "vid-2",
    courseId: "ma1101",
    playlistId: "pl-uts-2023",
    chapterId: "ch-1",
    chapterTitle: "Sistem Bilangan Real",
    title: "Bagian B - Soal Esai 1 & 2",
    description: "Pembahasan soal esai pembuktian limit dan kontinuitas dengan epsilon-delta.",
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    duration: 1845,
    fileSize: 52000000,
    orderIndex: 1,
    uploadedBy: "system",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "vid-3",
    courseId: "ma1101",
    playlistId: "pl-uts-2023",
    chapterId: "ch-2",
    chapterTitle: "Turunan dan Aplikasinya",
    title: "Bagian C - Soal Lanjutan & Aplikasi Ekstrim",
    description: "Membahas aplikasi turunan dalam optimasi geometri dan laju yang berkaitan.",
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    duration: 1210,
    fileSize: 38000000,
    orderIndex: 2,
    uploadedBy: "system",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const samplePlaylist: VideoPlaylistItem = {
  id: "pl-uts-2023",
  courseId: "ma1101",
  title: "Pembahasan Soal UTS 2023",
  description: "Arsip lengkap pembahasan video UTS Matematika IA",
  orderIndex: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  videos: sampleVideos,
};

import { AdminVideoDialog } from "@/components/course/video/admin-video-dialog";

const sampleChapters = [
  { id: "ch-1", title: "Sistem Bilangan Real", orderIndex: 0 },
  { id: "ch-2", title: "Turunan dan Aplikasinya", orderIndex: 1 },
];

const sampleR2Video: VideoItem = {
  id: "vid-r2-sample",
  courseId: "ma1101",
  playlistId: "pl-uts-2023",
  chapterId: "ch-1",
  chapterTitle: "Sistem Bilangan Real",
  title: "Rekaman Kuliah Bab 1",
  description: "Materi pengenalan bilangan riil yang diunggah ke penyimpanan Cloudflare R2.",
  videoUrl: "/api/storage/file/courses/ma1101/videos/sample.mp4",
  thumbnailUrl: null,
  videoKey: "courses/ma1101/videos/sample.mp4",
  thumbnailKey: null,
  duration: 1200,
  fileSize: 45000000,
  orderIndex: 3,
  uploadedBy: "admin",
  createdAt: new Date(),
  updatedAt: new Date(),
};

export default function VideoPlayerVisualFixture() {
  const [playerOpen, setPlayerOpen] = useState(true);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<VideoItem | null>(null);
  const [currentVideo, setCurrentVideo] = useState<VideoItem>(sampleVideos[0]);

  return (
    <div
      data-fixture-ready="true"
      className="min-h-screen bg-background p-6 font-sans flex flex-col items-center justify-center gap-4"
    >
      <div className="flex flex-wrap gap-2">
        <Button
          data-testid="btn-open-player"
          onClick={() => {
            setAdminDialogOpen(false);
            setPlayerOpen(true);
          }}
          className="rounded-lg"
        >
          Buka Video Player Modal
        </Button>
        <Button
          data-testid="btn-open-admin-add"
          variant="outline"
          onClick={() => {
            setPlayerOpen(false);
            setEditingVideo(null);
            setAdminDialogOpen(true);
          }}
          className="rounded-lg"
        >
          Buka Dialog Tambah Video
        </Button>
        <Button
          data-testid="btn-open-admin-r2"
          variant="secondary"
          onClick={() => {
            setPlayerOpen(false);
            setEditingVideo(sampleR2Video);
            setAdminDialogOpen(true);
          }}
          className="rounded-lg"
        >
          Buka Dialog Edit Berkas R2
        </Button>
      </div>

      <VideoPlayerModal
        video={currentVideo}
        playlist={samplePlaylist}
        open={playerOpen}
        onOpenChange={setPlayerOpen}
        onSelectVideo={(v) => setCurrentVideo(v)}
      />

      <AdminVideoDialog
        open={adminDialogOpen}
        onOpenChange={setAdminDialogOpen}
        courseId="ma1101"
        playlists={[samplePlaylist]}
        chapters={sampleChapters}
        video={editingVideo}
        defaultPlaylistId={samplePlaylist.id}
      />
    </div>
  );
}
