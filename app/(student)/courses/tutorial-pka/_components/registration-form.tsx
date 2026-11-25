"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/client";
import Image from "next/image";
import {
  AtSign,
  UploadCloud,
  X,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { registerPkaAction } from "../daftar/actions";

const IG_HANDLE = "zyx_academy";
const IG_URL = `https://instagram.com/${IG_HANDLE}`;
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

export function PkaRegistrationForm({
  googleEmail,
  defaultName,
}: {
  googleEmail: string;
  defaultName: string;
}) {
  const router = useRouter();
  const t = useTranslations("studentExtras.pka.registration");
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(defaultName);
  const [faculty, setFaculty] = useState("");
  const [instagram, setInstagram] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFile = (file: File | null) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!file) {
      setProofFile(null);
      setPreviewUrl(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error(t("fileImage"));
      return;
    }
    if (file.size > MAX_PROOF_BYTES) {
      toast.error(t("fileTooLarge"));
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

    if (!fullName.trim()) return toast.error(t("fullNameRequired"));
    if (!faculty.trim()) return toast.error(t("facultyRequired"));
    if (!googleEmail.trim()) return toast.error(t("emailRequired"));
    if (!instagram.trim()) return toast.error(t("instagramRequired"));
    if (!proofFile) return toast.error(t("proofRequired"));

    const fd = new FormData();
    fd.set("fullName", fullName.trim());
    fd.set("faculty", faculty.trim());
    fd.set("instagram", instagram.trim());
    fd.set("proof", proofFile);

    startTransition(async () => {
      const res = await registerPkaAction({}, fd);
      if (res.error) {
        toast.error(t("failed"));
        return;
      }
      toast.success(t("success"));
      router.push("/courses/tutorial-pka");
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-(--section-gap)">
      {/* Follow CTA */}
      <section className="flex flex-wrap items-start justify-between gap-(--compact-gap) border-y border-border/55 py-(--row-padding)">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-muted-foreground">
            <AtSign className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-body-base font-semibold text-foreground">
              {t("followTitle", { handle: IG_HANDLE })}
            </p>
            <p className="text-body-sm text-muted-foreground">
              {t("followDescription")}
            </p>
          </div>
        </div>
        <a
          href={IG_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-body-sm font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t("openInstagram")}
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </section>

      {/* Fields */}
      <div className="grid gap-(--related-gap) sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="pka-fullname" className="text-body-sm font-medium text-foreground">
            {t("fullName")}
          </Label>
          <Input
            id="pka-fullname"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t("fullNamePlaceholder")}
            required
            className="rounded-md"
          />
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="pka-faculty" className="text-body-sm font-medium text-foreground">
            {t("faculty")}
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

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="pka-email" className="text-body-sm font-medium text-foreground">
            {t("email")}
          </Label>
          <Input
            id="pka-email"
            type="email"
            value={googleEmail}
            disabled
            required
            className="rounded-md opacity-70"
          />
          <p className="text-body-xs text-muted-foreground">
            {t("emailHelp")}
          </p>
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="pka-instagram" className="text-body-sm font-medium text-foreground">
            {t("instagram")}
          </Label>
          <div className="flex items-center gap-0 rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
            <span className="pl-3 pr-1 text-body-base text-muted-foreground">@</span>
            <Input
              id="pka-instagram"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value.replace(/^@+/, ""))}
              placeholder={IG_HANDLE}
              required
              className="h-9 w-full rounded-md border-0 bg-transparent pr-3 text-body-sm shadow-none"
            />
          </div>
        </div>

        {/* Proof uploader */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="pka-proof" className="text-body-sm font-medium text-foreground">
            {t("proofLabel", { handle: IG_HANDLE })}
          </Label>
          <input
            ref={fileInputRef}
            id="pka-proof"
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          {previewUrl ? (
            <div className="flex items-center gap-3 border-y border-border/55 py-(--row-padding)">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-md border border-border">
                <Image src={previewUrl} alt={t("proofPreview")} fill className="object-cover" unoptimized />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-body-sm font-medium text-status-success">
                  <CheckCircle2 className="size-4" />
                  {t("proofReady")}
                </p>
                <p className="break-all text-body-sm text-muted-foreground">{proofFile?.name}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="size-8" onClick={clearFile}>
                <X className="size-4" />
                <span className="sr-only">{t("removeImage")}</span>
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="h-auto min-h-14 w-full border-dashed px-3 py-2 text-left whitespace-normal [&>span]:justify-start"
            >
              <UploadCloud className="size-5 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-body-sm font-medium text-foreground">{t("uploadPrompt")}</span>
                <span className="block text-body-xs text-muted-foreground">{t("uploadHint")}</span>
              </span>
            </Button>
          )}
        </div>

      </div>

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" isLoading={isPending} className="gap-2 rounded-lg">
          <ArrowRight className="size-4" />
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
