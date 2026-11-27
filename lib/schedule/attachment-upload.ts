import { storage } from "@/lib/storage";
import { buildScheduleAttachmentKey } from "@/lib/storage/keys";
import { scheduleFilePolicy } from "@/packages/native-parity/schedule/resources";

const contentTypes: Readonly<Record<string, string>> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export function scheduleUploadMime(file: Pick<File, "name" | "type" | "size">): string | null {
  const type = contentTypes[file.name.match(/\.[^.]*$/)?.[0].toLowerCase() ?? ""];
  const declared = file.type.toLowerCase();
  if (!type || (declared && declared !== type && !(declared === "image/jpg" && type === "image/jpeg")) ||
    file.size > scheduleFilePolicy.maxBytes) return null;
  return type;
}

export async function uploadScheduleAttachment(input: {
  bookingId: string; kind: "pre_session" | "post_session"; file: File; mime: string; userId: string; objectKey?: string; bytes?: Uint8Array;
}) {
  const key = input.objectKey ?? buildScheduleAttachmentKey({ bookingId: input.bookingId, type: input.kind, filename: input.file.name });
  const result = await storage.upload(input.bytes ?? input.file, input.file.name, input.mime, {
    key,
    metadata: { uploadedBy: input.userId, domain: input.kind === "pre_session" ? "schedule-materials" : "schedule-notes" },
  });
  return { key: result.key, url: storage.getUrl(result.key), size: result.size, type: input.mime };
}
