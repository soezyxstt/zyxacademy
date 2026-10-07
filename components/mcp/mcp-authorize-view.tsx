"use client";

import { useTransition } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  AlertTriangle,
  ArrowRightLeft,
  BookOpen,
  UploadCloud,
  ClipboardCheck,
  Archive,
  Check,
  Lock,
  User,
  Globe,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { submitMcpAuthorization } from "@/app/mcp/authorize/actions";

interface ScopeInfo {
  key: string;
  title: string;
  description: string;
  icon: typeof BookOpen;
}

const SCOPE_DETAILS: Record<string, ScopeInfo> = {
  "authoring:read": {
    key: "authoring:read",
    title: "Baca silabus dan katalog ide",
    description: "Melihat struktur mata kuliah, ide pembelajaran terbitan, dan katalog bank soal.",
    icon: BookOpen,
  },
  "authoring:stage": {
    key: "authoring:stage",
    title: "Unggah draf materi dan soal",
    description: "Membuat dan mengunggah Idea Bundle baru, draf artikel terstruktur, diktat, dan soal kuis.",
    icon: UploadCloud,
  },
  "authoring:review": {
    key: "authoring:review",
    title: "Ajukan ulasan pedagogis",
    description: "Melakukan evaluasi 8 kriteria mutu pembelajaran dan mencatat keputusan telaah draf.",
    icon: ClipboardCheck,
  },
  "authoring:withdraw": {
    key: "authoring:withdraw",
    title: "Kelola siklus draf materi",
    description: "Menarik kembali atau mengarsipkan bundle materi yang belum dipublikasikan.",
    icon: Archive,
  },
};

export interface McpAuthorizeViewProps {
  client: {
    clientId: string;
    clientName: string;
    redirectUri: string;
  };
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  isAdmin: boolean;
  scopes: string[];
  searchParams: {
    clientId: string;
    redirectUri: string;
    scope: string;
    state?: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    resource?: string;
  };
  currentPathWithSearch: string;
}

export function McpAuthorizeView({
  client,
  user,
  isAdmin,
  scopes,
  searchParams,
  currentPathWithSearch,
}: McpAuthorizeViewProps) {
  const [isPending, startTransition] = useTransition();

  const redirectHostname = (() => {
    try {
      return new URL(client.redirectUri).host;
    } catch {
      return client.redirectUri;
    }
  })();

  const clientInitials = client.clientName
    ? client.clientName
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "MC";

  const cancelUrl = (() => {
    try {
      const url = new URL(client.redirectUri);
      url.searchParams.set("error", "access_denied");
      if (searchParams.state) url.searchParams.set("state", searchParams.state);
      return url.toString();
    } catch {
      return client.redirectUri;
    }
  })();

  return (
    <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
      {/* Connected Header Bridge */}
      <div className="flex flex-col items-center text-center">
        <div className="flex items-center justify-center gap-3 sm:gap-4 w-full max-w-xs mb-5">
          {/* Client App Avatar */}
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-xs">
              <span className="font-heading text-h5 font-bold tracking-tight">
                {clientInitials}
              </span>
            </div>
            <span className="text-body-xs font-semibold text-foreground max-w-[80px] truncate">
              {client.clientName}
            </span>
          </div>

          {/* Connection Bridge */}
          <div className="flex flex-1 items-center justify-center relative px-2">
            <div className="h-px w-full bg-border" />
            <div className="absolute flex size-8 items-center justify-center rounded-full border border-border bg-background shadow-xs text-muted-foreground">
              <ArrowRightLeft className="size-3.5" />
            </div>
          </div>

          {/* Zyx Emblem */}
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-foreground text-background shadow-xs">
              <span className="font-heading text-h5 font-black tracking-tight">
                Zyx
              </span>
            </div>
            <span className="text-body-xs font-semibold text-foreground">
              Zyx Academy
            </span>
          </div>
        </div>

        <h1 className="font-heading text-h5 font-bold text-foreground">
          Otorisasi {client.clientName}
        </h1>
        <p className="mt-1.5 text-body-sm text-muted-foreground max-w-md">
          Aplikasi meminta izin untuk mengakses workspace authoring Zyx Academy Anda.
        </p>
      </div>

      {/* Account Info Pill */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3 sm:p-3.5">
        <div className="flex items-center gap-3 min-w-0">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt={user.name ?? user.email}
              width={36}
              height={36}
              className="size-9 rounded-full border border-border object-cover shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex size-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shrink-0">
              <User className="size-4" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-body-sm font-semibold text-foreground truncate">
                {user.name || user.email.split("@")[0]}
              </p>
              {isAdmin ? (
                <Badge variant="default" className="text-body-2xs font-medium">
                  Admin
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-body-2xs font-medium text-muted-foreground">
                  Bukan admin
                </Badge>
              )}
            </div>
            <p className="text-body-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>

        <Link
          href={`/sign-in?next=${encodeURIComponent(currentPathWithSearch)}`}
          className="text-body-xs font-medium text-primary hover:underline shrink-0"
        >
          Ganti akun
        </Link>
      </div>

      {/* Non-Admin Block Warning */}
      {!isAdmin ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-status-error shrink-0 mt-0.5" />
              <div>
                <h2 className="text-body-sm font-semibold text-foreground">
                  Akses administrator diperlukan
                </h2>
                <p className="mt-1 text-body-xs text-muted-foreground leading-relaxed">
                  MCP Server authoring mengelola kurikulum dan draf konten, sehingga hanya dapat diakses oleh akun dengan peran administrator. Akun Anda saat ini ({user.email}) tidak memiliki peran admin.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <Button asChild className="h-10 w-full sm:flex-1">
              <Link href={`/sign-in?next=${encodeURIComponent(currentPathWithSearch)}`}>
                Masuk dengan akun admin
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-10 w-full sm:flex-1">
              <a href={cancelUrl}>
                Batalkan dan kembali
              </a>
            </Button>
          </div>
        </div>
      ) : (
        /* Admin Interactive Consent Flow */
        <div className="mt-6 space-y-5">
          {/* Permissions / Scopes list */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-body-sm font-semibold text-foreground">
                Izin yang diminta
              </h2>
              <span className="text-body-xs text-muted-foreground font-mono">
                {scopes.length} cakupan
              </span>
            </div>

            <div className="rounded-xl border border-border divide-y divide-border/60 bg-background/50 overflow-hidden">
              {scopes.map((scope) => {
                const detail = SCOPE_DETAILS[scope] ?? {
                  key: scope,
                  title: scope,
                  description: "Akses ke sumber daya MCP authoring yang ditentukan.",
                  icon: Lock,
                };
                const IconComponent = detail.icon;

                return (
                  <div key={scope} className="flex items-start gap-3 p-3.5">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
                      <IconComponent className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-body-sm font-medium text-foreground">
                          {detail.title}
                        </p>
                        <code className="text-body-2xs font-mono rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                          {detail.key}
                        </code>
                      </div>
                      <p className="mt-0.5 text-body-xs text-muted-foreground leading-normal">
                        {detail.description}
                      </p>
                    </div>
                    <Check className="size-4 text-status-success shrink-0 mt-1" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Security Guarantee Box (Spotify/GitHub style transparency) */}
          <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5">
            <div className="flex items-center gap-2 text-body-xs font-semibold text-foreground mb-2">
              <ShieldCheck className="size-4 text-status-success" />
              <span>Jaminan keamanan Zyx</span>
            </div>
            <ul className="space-y-1.5 text-body-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="size-1 rounded-full bg-muted-foreground shrink-0" />
                <span>Tidak dapat mengakses kata sandi atau data autentikasi Google Anda</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="size-1 rounded-full bg-muted-foreground shrink-0" />
                <span>Tidak dapat melihat informasi pribadi, nilai, atau aktivitas murid</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="size-1 rounded-full bg-muted-foreground shrink-0" />
                <span>Hanya beroperasi di dalam batasan alat authoring yang diizinkan</span>
              </li>
            </ul>
          </div>

          {/* Host & Target metadata */}
          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-body-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 truncate">
              <Globe className="size-3.5 shrink-0" />
              <span className="truncate">Tujuan: <span className="font-mono text-foreground">{redirectHostname}</span></span>
            </div>
            <span className="shrink-0 text-body-2xs font-medium">Sesi 30 hari</span>
          </div>

          {/* Actions Form */}
          <form
            action={(formData) => {
              startTransition(async () => {
                await submitMcpAuthorization(formData);
              });
            }}
            className="space-y-2.5 pt-2"
          >
            <input type="hidden" name="client_id" value={searchParams.clientId} />
            <input type="hidden" name="redirect_uri" value={searchParams.redirectUri} />
            <input type="hidden" name="scope" value={searchParams.scope} />
            <input type="hidden" name="state" value={searchParams.state ?? ""} />
            <input type="hidden" name="code_challenge" value={searchParams.codeChallenge} />
            <input type="hidden" name="code_challenge_method" value={searchParams.codeChallengeMethod} />
            <input type="hidden" name="resource" value={searchParams.resource ?? ""} />

            <Button
              type="submit"
              name="decision"
              value="approve"
              disabled={isPending}
              className="h-11 w-full gap-2 text-body-sm font-semibold shadow-xs"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Mengotorisasi...
                </>
              ) : (
                <>
                  <Lock className="size-4" />
                  Izinkan {client.clientName}
                </>
              )}
            </Button>

            <Button
              type="submit"
              name="decision"
              value="deny"
              variant="outline"
              disabled={isPending}
              className="h-10 w-full gap-2 text-body-sm text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
              Batalkan
            </Button>
          </form>

          {/* Footnote */}
          <p className="text-center text-body-2xs text-muted-foreground leading-normal">
            Anda dapat mencabut izin integrasi ini kapan saja melalui dashboard admin Zyx.
          </p>
        </div>
      )}
    </div>
  );
}
