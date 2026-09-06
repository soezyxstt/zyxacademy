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
}): Promise<{ totalPages: number; pages: SourceFilePage[] }> {
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
  };

  return {
    totalPages: data.totalPages,
    pages: data.pages.map((p) => ({
      pageNumber: p.pageNumber,
      text: p.text,
      png: new Uint8Array(Buffer.from(p.imageBase64, "base64")),
      width: p.width,
      height: p.height,
    })),
  };
}
