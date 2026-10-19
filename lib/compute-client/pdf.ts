export type ComputePdfPage = {
  pageNumber: number;
  text: string;
  imageBase64: string;
  width: number;
  height: number;
};

export type SourceFilePage = {
  pageNumber: number;
  text: string;
  png: Uint8Array;
  width: number;
  height: number;
};

export async function requestPdfPagesFromCompute(params: {
  storageKey: string;
  pages: number[];
}): Promise<{ totalPages: number; pages: SourceFilePage[]; size?: number | null; checksum?: string | null }> {
  const computeUrl = process.env.COMPUTE_SERVICE_URL;
  const secret = process.env.COMPUTE_SERVICE_SECRET;

  if (!computeUrl) {
    throw new Error("COMPUTE_SERVICE_URL_UNCONFIGURED");
  }

  const response = await fetch(`${computeUrl.replace(/\/$/, "")}/internal/pdf/pages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`COMPUTE_PDF_PAGES_FAILED_${response.status}:${errorText}`);
  }

  const data = (await response.json()) as {
    totalPages: number;
    pages: ComputePdfPage[];
    size?: number | null;
    byteLength?: number | null;
    checksum?: string | null;
  };

  return {
    totalPages: data.totalPages,
    size: typeof data.size === "number" && data.size > 0
      ? data.size
      : typeof data.byteLength === "number" && data.byteLength > 0
        ? data.byteLength
        : null,
    checksum: typeof data.checksum === "string" ? data.checksum : null,
    pages: data.pages.map((p) => ({
      pageNumber: p.pageNumber,
      text: p.text,
      png: new Uint8Array(Buffer.from(p.imageBase64, "base64")),
      width: p.width,
      height: p.height,
    })),
  };
}
