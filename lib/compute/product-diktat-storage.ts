import type { StorageProvider } from "@/lib/storage";

const STORAGE_ERROR_CODES = new Set([
  "AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch",
  "NoSuchBucket", "CredentialsProviderError", "InvalidArgument",
  "InvalidRequest", "NotImplemented", "TimeoutError", "NetworkingError",
]);

/** Keep provider details in server diagnostics, never in publication evidence. */
export async function uploadProductDiktatPdf(input: {
  provider: StorageProvider;
  bytes: Uint8Array;
  filename: string;
  key: string;
  metadata: Record<string, string>;
}): Promise<void> {
  try {
    await input.provider.upload(input.bytes, input.filename, "application/pdf", {
      key: input.key,
      metadata: input.metadata,
    });
  } catch (cause) {
    const error = cause as { name?: unknown; $metadata?: { httpStatusCode?: unknown } } | null;
    const status = error?.$metadata?.httpStatusCode;
    console.error("[ProductDiktatPdf] Storage upload failed", {
      code: typeof error?.name === "string" && STORAGE_ERROR_CODES.has(error.name) ? error.name : "StorageUploadError",
      status: typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined,
      configured: {
        endpoint: Boolean(process.env.R2_ENDPOINT),
        bucket: Boolean(process.env.R2_BUCKET),
        accessKey: Boolean(process.env.R2_ACCESS_KEY_ID),
        secretKey: Boolean(process.env.R2_SECRET_ACCESS_KEY),
      },
    });
    throw new Error("PRODUCT_DIKTAT_STORAGE_UNAVAILABLE", { cause });
  }
}
