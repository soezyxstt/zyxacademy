import { expect, test, spyOn } from "bun:test";
import type { StorageProvider } from "@/lib/storage";
import { uploadProductDiktatPdf } from "@/lib/compute/product-diktat-storage";

test("uploads the PDF with its explicit key and revision metadata", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const metadata = { importId: "import-1", productId: "diktat-1", rendererVersion: "v1" };
  const key = "overhaul/import-1/diktat-pdf/diktat.pdf";
  let received: unknown[] = [];
  const provider = { upload: async (...args: unknown[]) => {
    received = args;
    return { key, url: key, size: bytes.byteLength };
  } } as unknown as StorageProvider;
  await uploadProductDiktatPdf({ provider, bytes, filename: "diktat.pdf", key, metadata });
  expect(received).toEqual([bytes, "diktat.pdf", "application/pdf", { key, metadata }]);
});

test("retains the storage cause and emits only safe diagnostic fields", async () => {
  const cause = Object.assign(new Error("secret credential and signed URL"), {
    name: "AccessDenied", $metadata: { httpStatusCode: 403 },
  });
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    const provider = { upload: async () => { throw cause; } } as unknown as StorageProvider;
    const failure = await uploadProductDiktatPdf({
      provider, bytes: new Uint8Array([1]), filename: "diktat.pdf",
      key: "overhaul/import-1/diktat-pdf/diktat.pdf", metadata: {},
    }).catch((error: Error) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("PRODUCT_DIKTAT_STORAGE_UNAVAILABLE");
    expect((failure as Error).cause).toBe(cause);
    const diagnostic = log.mock.calls[0][1];
    expect(diagnostic).toMatchObject({ code: "AccessDenied", status: 403 });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret credential");
  } finally { log.mockRestore(); }
});

test("does not log arbitrary provider error names or messages", async () => {
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    const provider = { upload: async () => { throw { name: "private-token", message: "private-token", $metadata: { httpStatusCode: "private-token" } }; } } as unknown as StorageProvider;
    await expect(uploadProductDiktatPdf({
      provider, bytes: new Uint8Array([1]), filename: "diktat.pdf",
      key: "overhaul/import-1/diktat-pdf/diktat.pdf", metadata: {},
    })).rejects.toThrow("PRODUCT_DIKTAT_STORAGE_UNAVAILABLE");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-token");
    expect(log.mock.calls[0][1]).toMatchObject({ code: "StorageUploadError" });
  } finally { log.mockRestore(); }
});
