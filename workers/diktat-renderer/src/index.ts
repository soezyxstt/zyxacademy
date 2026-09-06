export interface BrowserPdfOptions {
  format?: string;
  printBackground?: boolean;
  scale?: number;
  margin?: {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
  };
}

export interface BrowserRun {
  quickAction(
    action: "pdf",
    options: {
      html?: string;
      pdfOptions?: BrowserPdfOptions;
    }
  ): Promise<Response>;
}

export interface Env {
  BROWSER: BrowserRun;
  SHARED_SECRET: string;
}

const DEFAULT_MARGIN = {
  top: "15mm",
  bottom: "15mm",
  left: "15mm",
  right: "15mm",
} as const;

const PRINT_PROFILES = {
  "legacy-a4": {
    format: "a4",
    printBackground: true,
    scale: 1,
    margin: DEFAULT_MARGIN,
  },
  "a4-self-study-2-page-v1": {
    format: "a4",
    printBackground: true,
    scale: 1,
    margin: DEFAULT_MARGIN,
  },
} as const;

type KnownProfile = keyof typeof PRINT_PROFILES;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return Response.json({ ok: true });
    }

    if (url.pathname !== "/render" || request.method !== "POST") {
      return new Response("Not found", { status: 404 });
    }

    const auth = request.headers.get("Authorization");
    if (!auth || auth !== `Bearer ${env.SHARED_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    let payload: { html?: unknown; printProfile?: unknown };
    try {
      payload = await request.json();
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }

    const { html, printProfile } = payload;
    if (!html || typeof html !== "string") {
      return new Response("Missing html", { status: 400 });
    }

    const profileKey =
      typeof printProfile === "string" && printProfile in PRINT_PROFILES
        ? (printProfile as KnownProfile)
        : "legacy-a4";
    const pdfOptions = PRINT_PROFILES[profileKey];

    try {
      const response = await env.BROWSER.quickAction("pdf", {
        html,
        pdfOptions,
      });

      const browserMsUsed = response.headers.get("X-Browser-Ms-Used");
      console.log(
        JSON.stringify({
          event: "diktat_pdf_rendered",
          browserMsUsed,
          printProfile: profileKey,
          status: response.status,
        })
      );

      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "PDF generation failed";
      console.error("[diktat-renderer] Error generating PDF:", err);
      return Response.json({ error: message }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
