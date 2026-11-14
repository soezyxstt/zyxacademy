import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpPrincipal } from "@/lib/authoring/mcp-auth";
import { mcpEnvironmentIdentity } from "@/lib/authoring/mcp-environment";
import { storage } from "@/lib/storage";
import { assertSafeKey, isMediaKey, leafFilename } from "@/lib/storage/keys";
import { isFolderMarkerKey, kindFromKey, mimeFromKey } from "@/lib/media";
import { adminToolkit } from "./toolkit";
import { AdminMcpError } from "./mutations";

/** Resolve only existing public Media Library objects, never private storage keys. */
export function registerMediaTools(server: McpServer, principal: McpPrincipal) {
  const { read } = adminToolkit(server, principal);
  read("media.get", "media:read", z.object({ key: z.string().min(1).max(1024) }), "Resolve an existing Media Library key to its application-served public URL for blog thumbnails or authored content. No signed URL or private object access is granted.", async ({ key }) => {
    const segments = key.split("/");
    try { assertSafeKey(key); } catch { throw new AdminMcpError("INVALID_MEDIA_PATH"); }
    if (!isMediaKey(key) || !key.startsWith("media/") || key.endsWith("/") || isFolderMarkerKey(key)
      || segments.some(segment => !segment || segment === ".") || /[%?#\u0000-\u001f\u007f]/.test(key)) throw new AdminMcpError("INVALID_MEDIA_PATH");
    if (!await storage.exists(key)) throw new AdminMcpError("NOT_FOUND");
    const publicPath = `/api/storage/file/${segments.map(encodeURIComponent).join("/")}`;
    const kind = kindFromKey(key);
    return {
      key, name: leafFilename(key), kind, inferredMimeType: mimeFromKey(key),
      publicPath, publicUrl: new URL(publicPath, mcpEnvironmentIdentity().origin).href,
      thumbnailCandidate: kind === "image", byteContentVerified: false,
      nextActions: kind === "image" ? ["blog.validate", "blog.update"] : [],
    };
  });
}
