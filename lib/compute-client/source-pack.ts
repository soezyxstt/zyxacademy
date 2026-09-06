export async function resolveSourcePackOnCompute(params: {
  filename: string;
  contentBase64: string;
  directOriginals?: Array<{ documentId: string; contentBase64: string }>;
  storedOriginals?: Array<{ documentId: string; storageKey: string; checksum: string }>;
  boundScope?: { courseId: string; chapterId: string };
}): Promise<any> {
  const computeUrl = process.env.COMPUTE_SERVICE_URL;
  const secret = process.env.COMPUTE_SERVICE_SECRET;

  if (!computeUrl) {
    throw new Error("COMPUTE_SERVICE_URL_UNCONFIGURED");
  }

  const response = await fetch(`${computeUrl.replace(/\/$/, "")}/internal/authoring/source-pack/resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`COMPUTE_SOURCE_PACK_RESOLVE_FAILED_${response.status}:${errorText}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || "SOURCE_PACK_COMPUTE_FAILED");
  }

  return data.result;
}
