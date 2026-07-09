import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const bucket = process.env.R2_BUCKET || "zyx";
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  try {
    const { key: keyParts } = await params;
    const key = Array.isArray(keyParts) ? keyParts.join("/") : keyParts;
    
    if (!key) {
      return new Response("Missing file key", { status: 400 });
    }

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const s3Res = await s3.send(command);

    if (!s3Res.Body) {
      return new Response("File not found", { status: 404 });
    }

    // Convert S3 body stream to Response (with Edge/Serverless compatibility conversion)
    const stream = s3Res.Body as any;
    let webStream = stream;
    if (stream && typeof stream.on === "function" && typeof stream.read === "function") {
      const { Readable } = require("stream");
      webStream = Readable.toWeb(stream);
    }
    
    const headers = new Headers();
    if (s3Res.ContentType) {
      headers.set("Content-Type", s3Res.ContentType);
    } else {
      headers.set("Content-Type", "application/octet-stream");
    }
    
    if (s3Res.ContentLength) {
      headers.set("Content-Length", s3Res.ContentLength.toString());
    }
    
    // Enable browser caching for 1 hour to reduce R2 egress operations
    headers.set("Cache-Control", "public, max-age=3600");

    // Extract clean filename (remove UUID prefix)
    let filename = key;
    const uuidMatch = key.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i);
    if (uuidMatch) {
      filename = key.substring(uuidMatch[0].length);
    }

    const urlObj = new URL(req.url);
    const isDownload = urlObj.searchParams.get("download") === "1" || urlObj.searchParams.get("download") === "true";
    
    headers.set(
      "Content-Disposition",
      `${isDownload ? "attachment" : "inline"}; filename="${filename.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );

    return new Response(webStream, {
      headers,
    });
  } catch (err: any) {
    if (err.name === "NoSuchKey") {
      return new Response("File not found", { status: 404 });
    }
    console.error("Storage proxy route error:", err);
    return new Response(err.message || "Internal server error", { status: 500 });
  }
}
