"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { Download, ExternalLink, Minus, Plus, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdminErrorState } from "@/components/admin/state-panels";
import { formatBytes, type MediaFile, type MediaKind } from "@/lib/media";

const KIND_LABELS: Record<MediaKind, string> = {
  image: "Gambar",
  video: "Video",
  audio: "Audio",
  pdf: "PDF",
  markdown: "Markdown",
  text: "Teks",
  other: "Berkas",
};

type DocumentViewerProps = {
  file: MediaFile | null;
  onClose: () => void;
};

type InlineToken =
  | { type: "text"; content: string }
  | { type: "code"; content: string }
  | { type: "bold"; content: string }
  | { type: "italic"; content: string }
  | { type: "link"; content: string; href: string };

const INLINE_RE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)]+\))/g;

function tokenizeInline(input: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((match = INLINE_RE.exec(input)) !== null) {
    if (match.index > last) {
      tokens.push({ type: "text", content: input.slice(last, match.index) });
    }
    if (match[1]) {
      tokens.push({ type: "code", content: match[1].slice(1, -1) });
    } else if (match[2]) {
      tokens.push({ type: "bold", content: match[2].slice(2, -2) });
    } else if (match[3]) {
      tokens.push({ type: "italic", content: match[3].slice(1, -1) });
    } else if (match[4]) {
      const inner = match[4];
      const close = inner.indexOf("](");
      const label = inner.slice(1, close);
      const href = inner.slice(close + 2, -1);
      tokens.push({ type: "link", content: label, href });
    }
    last = INLINE_RE.lastIndex;
  }
  if (last < input.length) {
    tokens.push({ type: "text", content: input.slice(last) });
  }
  return tokens;
}

function Inline({ text }: { text: string }) {
  const tokens = tokenizeInline(text);
  return (
    <>
      {tokens.map((token, i) => {
        switch (token.type) {
          case "code":
            return (
              <code key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono text-body-sm">
                {token.content}
              </code>
            );
          case "bold":
            return (
              <strong key={i} className="font-semibold">
                <Inline text={token.content} />
              </strong>
            );
          case "italic":
            return (
              <em key={i}>
                <Inline text={token.content} />
              </em>
            );
          case "link":
            return (
              <a
                key={i}
                href={token.href}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-2 hover:brightness-110"
              >
                <Inline text={token.content} />
              </a>
            );
          default:
            return <span key={i}>{token.content}</span>;
        }
      })}
    </>
  );
}

function Heading({ level, children }: { level: 1 | 2 | 3; children: ReactNode }) {
  if (level === 1) {
    return <h1 className="font-heading text-h5 mb-2 mt-3 font-bold text-foreground first:mt-0">{children}</h1>;
  }
  if (level === 2) {
    return <h2 className="font-heading text-body-base mb-2 mt-3 font-bold text-foreground first:mt-0">{children}</h2>;
  }
    return <h3 className="font-heading text-body-sm mb-1.5 mt-3 font-semibold text-foreground first:mt-0">{children}</h3>;
}

function MarkdownRenderer({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const push = (node: ReactNode) => {
    blocks.push(<div key={key++}>{node}</div>);
  };

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = line.trim().match(/^```(\w*)/);
    if (fence) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      push(
        <pre className="overflow-auto rounded-lg border border-border bg-muted p-3 font-mono text-body-sm">
          <code>{buf.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      push(<Heading level={level}>{heading[2]}</Heading>);
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      push(<hr className="my-4 border-t border-border" />);
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      push(
        <blockquote className="border-l-2 border-border bg-muted/40 py-2 pr-3 pl-4 text-body-sm text-muted-foreground">
          {buf.map((b, idx) => (
            <p key={idx} className={idx > 0 ? "mt-1.5" : ""}>
              <Inline text={b} />
            </p>
          ))}
        </blockquote>
      );
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unordered) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*[-*+]\s+(.+)$/);
        if (!m) break;
        items.push(m[1]);
        i += 1;
      }
      push(
        <ul className="list-disc space-y-1 py-1 pl-5 text-body-base">
          {items.map((item, idx) => (
            <li key={idx}>
              <Inline text={item} />
            </li>
          ))}
        </ul>
      );
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*\d+[.)]\s+(.+)$/);
        if (!m) break;
        items.push(m[1]);
        i += 1;
      }
      push(
        <ol className="list-decimal space-y-1 py-1 pl-5 text-body-base">
          {items.map((item, idx) => (
            <li key={idx}>
              <Inline text={item} />
            </li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraph: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3})\s/.test(lines[i]) &&
      !lines[i].trim().startsWith("```") &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i].trim())
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    push(
      <p className="py-1 text-body-base text-foreground">
        <Inline text={paragraph.join(" ")} />
      </p>
    );
  }

  return <div className="space-y-2">{blocks}</div>;
}

export function DocumentViewer({ file, onClose }: DocumentViewerProps) {
  const [text, setText] = useState<string | null>(null);
  const [textError, setTextError] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setText(null);
    setTextError(false);
    setShowRaw(false);
    setZoom(1);
    if (!file) return;
    if (file.kind === "markdown" || file.kind === "text") {
      fetch(file.url)
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then(setText)
        .catch(() => setTextError(true));
    }
  }, [file]);

  if (!file) return null;

  const renderBody = () => {
    if (file.kind === "image") {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Perkecil gambar"
              onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            >
              <Minus className="size-4" />
            </Button>
            <span className="w-12 text-center text-body-sm text-muted-foreground">{Math.round(zoom * 100)}%</span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Perbesar gambar"
              onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
            >
              <Plus className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => setZoom(1)}>
              <RefreshCw className="size-3.5" />
              Reset
            </Button>
            <a className="ml-auto" href={`${file.url}?download=1`}>
              <Button variant="outline" size="sm" className="rounded-lg">
                <Download className="size-3.5" />
                Unduh
              </Button>
            </a>
          </div>
          <div className="flex max-h-[60vh] items-start justify-center overflow-auto rounded-lg border border-border bg-muted p-2">
            <Image
              src={file.url}
              alt={file.name}
              width={1200}
              height={900}
              unoptimized
              className="h-auto w-auto max-w-full rounded-md bg-background"
              style={{ transform: `scale(${zoom})`, transformOrigin: "top center", transition: "transform 150ms ease-out" }}
            />
          </div>
        </div>
      );
    }

    if (file.kind === "video") {
      return (
        <div className="flex flex-col items-center gap-3">
          <video key={file.key} src={file.url} controls autoPlay className="max-h-[70vh] w-auto max-w-full rounded-lg border border-border bg-black" />
          <a href={`${file.url}?download=1`}>
            <Button variant="outline" size="sm" className="rounded-lg">
              <Download className="size-3.5" />
              Unduh
            </Button>
          </a>
        </div>
      );
    }

    if (file.kind === "audio") {
      return (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-muted p-6">
          <audio key={file.key} src={file.url} controls className="w-full max-w-xl" />
          <a href={`${file.url}?download=1`}>
            <Button variant="outline" size="sm" className="rounded-lg">
              <Download className="size-3.5" />
              Unduh
            </Button>
          </a>
        </div>
      );
    }

    if (file.kind === "pdf") {
      return (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-body-sm text-muted-foreground">Pratinjau PDF.</p>
            <a href={file.url} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="rounded-lg">
                <ExternalLink className="size-3.5" />
                Buka di tab baru
              </Button>
            </a>
          </div>
          <iframe key={file.key} src={file.url} title={file.name} className="h-[70vh] w-full rounded-lg border border-border bg-muted" />
        </div>
      );
    }

    if (file.kind === "markdown" || file.kind === "text") {
      if (textError) {
        return (
          <AdminErrorState message="Gagal memuat isi file" onRetry={() => {
            setTextError(false);
            setText(null);
            fetch(file.url)
              .then(async (res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.text();
              })
              .then(setText)
              .catch(() => setTextError(true));
          }} />
        );
      }
      if (text === null) {
        return <div className="h-40 animate-pulse rounded-lg bg-muted" />;
      }
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-body-sm text-muted-foreground">
              {file.kind === "markdown" ? "Pratinjau markdown" : "Isi teks"}
            </p>
            <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? "Lihat render" : "Lihat teks mentah"}
            </Button>
          </div>
          {showRaw || file.kind === "text" ? (
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-4 font-mono text-body-sm break-words">
              {text}
            </pre>
          ) : (
            <div className="max-h-[60vh] overflow-auto rounded-lg border border-border p-4">
              <MarkdownRenderer source={text} />
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-body-xs text-muted-foreground">Nama</dt>
              <dd className="text-body-sm break-all font-medium text-foreground">{file.name}</dd>
            </div>
            <div>
              <dt className="text-body-xs text-muted-foreground">Ukuran</dt>
              <dd className="text-body-sm font-medium text-foreground">{formatBytes(file.size)}</dd>
            </div>
            <div>
              <dt className="text-body-xs text-muted-foreground">Folder</dt>
              <dd className="text-body-sm font-medium text-foreground">{file.folderPath || "media/ (root)"}</dd>
            </div>
            <div>
              <dt className="text-body-xs text-muted-foreground">Tipe</dt>
              <dd className="text-body-sm font-medium text-foreground">{KIND_LABELS[file.kind]}</dd>
            </div>
          </dl>
          <a className="mt-5 inline-block" href={`${file.url}?download=1`}>
            <Button className="rounded-lg">
              <Download className="size-4" />
              Unduh berkas
            </Button>
          </a>
        </div>
        <iframe src={file.url} title={file.name} className="h-48 w-full rounded-lg border border-border bg-muted" />
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={(open) => {
      if (!open) onClose();
    }}>
      <DialogContent className="max-w-4xl rounded-xl border border-border p-6 shadow-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8 font-heading text-body-base font-bold text-foreground">
            <span className="min-w-0 truncate">{file.name}</span>
            <Badge variant="secondary" className="shrink-0">
              {KIND_LABELS[file.kind]}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[78vh] overflow-auto">{renderBody()}</div>
      </DialogContent>
    </Dialog>
  );
}
