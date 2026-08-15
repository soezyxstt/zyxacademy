"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  AtSign,
  UploadCloud,
  ImageIcon,
  X,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { registerPkaAction } from "../daftar/actions";

const IG_HANDLE = "zyx_academy";
const IG_URL = `https://instagram.com/${IG_HANDLE}`;
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

export function PkaRegistrationForm({
  googleEmail,
  defaultName,
  useCentralEmailPreferences,
}: {
  googleEmail: string;
  defaultName: string;
  useCentralEmailPreferences: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(defaultName);
  const [faculty, setFaculty] = useState("");
  const [useGoogleEmail, setUseGoogleEmail] = useState(true);
  const [contactEmail, setContactEmail] = useState(googleEmail);
  const [instagram, setInstagram] = useState("");
  const [receiveAnnouncements, setReceiveAnnouncements] = useState(true);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const effectiveEmail = useCentralEmailPreferences || useGoogleEmail ? googleEmail : contactEmail;

  const handleFile = (file: File | null) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!file) {
      setProofFile(null);
      setPreviewUrl(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("File harus berupa gambar.");
      return;
    }
    if (file.size > MAX_PROOF_BYTES) {
      toast.error("Ukuran gambar maksimal 5 MB.");
      return;
    }
    setProofFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const clearFile = () => {
    handleFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!fullName.trim()) return toast.error("Nama lengkap wajib diisi.");
    if (!faculty.trim()) return toast.error("Fakultas wajib diisi.");
    if (!effectiveEmail.trim()) return toast.error("Email wajib diisi.");
    if (!instagram.trim()) return toast.error("Username Instagram wajib diisi.");
    if (!proofFile) return toast.error("Unggah screenshot bukti follow terlebih dahulu.");

    const fd = new FormData();
    fd.set("fullName", fullName.trim());
    fd.set("faculty", faculty.trim());
    fd.set("email", effectiveEmail.trim());
    fd.set("instagram", instagram.trim());
    if (receiveAnnouncements) fd.set("receiveAnnouncements", "on");
    fd.set("proof", proofFile);

    startTransition(async () => {
      const res = await registerPkaAction({}, fd);
      if (res.error) {
        toast.error("Pendaftaran gagal", { description: res.error });
        return;
      }
      toast.success("Pendaftaran berhasil. Selamat belajar!");
      router.push("/courses/tutorial-pka");
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-8">
      {/* Follow CTA */}
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
            <AtSign className="size-5" />
          </span>
          <div>
            <p className="text-body-base font-semibold text-foreground">
              Follow @{IG_HANDLE} di Instagram
            </p>
            <p className="text-body-sm text-muted-foreground">
              Syarat gabung. Screenshot buktinya dan unggah di formulir ini.
            </p>
          </div>
        </div>
        <a
          href={IG_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-border bg-background px-3 py-2 text-body-sm font-semibold text-foreground transition-colors duration-150 hover:bg-muted sm:self-auto"
        >
          Buka Instagram
          <ExternalLink className="size-3.5" />
        </a>
      </section>

      {/* Fields */}
      <div className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-1.5">
          <Label htmlFor="pka-fullname" className="text-body-sm font-medium text-foreground">
            Nama lengkap
          </Label>
          <Input
            id="pka-fullname"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Adi Haditya Nursyam"
            required
            className="rounded-md"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pka-faculty" className="text-body-sm font-medium text-foreground">
            Fakultas
          </Label>
          <Input
            id="pka-faculty"
            value={faculty}
            onChange={(e) => setFaculty(e.target.value)}
            placeholder="FTMD"
            required
            className="rounded-md"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pka-email" className="text-body-sm font-medium text-foreground">
            Email
          </Label>
          {useCentralEmailPreferences ? (
            <>
              <Input
                id="pka-email"
                type="email"
                value={googleEmail}
                disabled
                required
                className="rounded-md opacity-70"
              />
              <p className="pt-1 text-body-sm text-muted-foreground">
                Email dikirim ke akun Google yang digunakan untuk masuk.
              </p>
            </>
          ) : (
            <>
              <Input
                id="pka-email"
                type="email"
                value={effectiveEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                disabled={useGoogleEmail}
                placeholder="nama@email.com"
                required
                className={cn("rounded-md", useGoogleEmail && "opacity-70")}
              />
              <label className="flex items-center gap-2 pt-1 text-body-sm text-muted-foreground">
                <Checkbox
                  checked={useGoogleEmail}
                  onCheckedChange={(checked) => {
                    const enabled = checked === true;
                    setUseGoogleEmail(enabled);
                    if (enabled) setContactEmail(googleEmail);
                  }}
                />
                Gunakan email Google saya ({googleEmail})
              </label>
            </>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pka-instagram" className="text-body-sm font-medium text-foreground">
            Username Instagram
          </Label>
          <div className="flex items-center gap-0 rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
            <span className="pl-3 pr-1 text-body-base text-muted-foreground">@</span>
            <input
              id="pka-instagram"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value.replace(/^@+/, ""))}
              placeholder={IG_HANDLE}
              required
              className="h-9 w-full rounded-md bg-transparent pr-3 text-body-base outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Proof uploader */}
        <div className="space-y-1.5">
          <Label className="text-body-sm font-medium text-foreground">
            Screenshot bukti follow @{IG_HANDLE}
          </Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          {previewUrl ? (
            <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/20 p-3">
              <div className="relative size-20 shrink-0 overflow-hidden rounded-md border border-border">
                <Image src={previewUrl} alt="Pratinjau bukti follow" fill className="object-cover" unoptimized />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-body-sm font-medium text-status-success">
                  <CheckCircle2 className="size-4" />
                  Gambar siap diunggah
                </p>
                <p className="truncate text-body-sm text-muted-foreground">{proofFile?.name}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="size-8" onClick={clearFile}>
                <X className="size-4" />
                <span className="sr-only">Hapus gambar</span>
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center transition-colors duration-150 hover:border-brand-primary/60 hover:bg-muted/40"
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-background text-muted-foreground">
                <UploadCloud className="size-5" />
              </span>
              <span className="text-body-sm font-medium text-foreground">Klik untuk mengunggah</span>
              <span className="flex items-center gap-1 text-body-sm text-muted-foreground">
                <ImageIcon className="size-3.5" />
                JPG, PNG, atau WEBP. Maksimal 5 MB.
              </span>
            </button>
          )}
        </div>

        {!useCentralEmailPreferences ? (
          <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-4">
            <Checkbox
              checked={receiveAnnouncements}
              onCheckedChange={(v) => setReceiveAnnouncements(v === true)}
              className="mt-0.5"
            />
            <span className="text-body-sm">
              <span className="block font-medium text-foreground">Terima email pengumuman & jadwal</span>
              <span className="block text-muted-foreground">
                Kami kirim notifikasi setiap ada sesi live baru atau pengumuman penting. Bisa dimatikan.
              </span>
            </span>
          </label>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" isLoading={isPending} className="gap-2 rounded-lg">
          <ArrowRight className="size-4" />
          Gabung sekarang
        </Button>
      </div>
    </form>
  );
}
