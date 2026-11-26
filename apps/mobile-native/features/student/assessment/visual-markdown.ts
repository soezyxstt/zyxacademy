import { splitMarkdownPreview } from "../../../../../packages/native-parity/operations/admin-markdown-preview";
import { previewMedia } from "../../../../../packages/native-parity/operations/admin-markdown-media";
import { inlineAssessmentRaster, publicAssessmentRasterUrl } from "../../../device/assessment-raster";
import { parseEmbeddedVisual } from "../../../../../lib/materials/embedded-visuals";

export function assessmentVideo(raw: string, origin: string) {
  const media = previewMedia(raw, origin, "course");
  return media?.kind === "video" || media?.kind === "youtube" ? media.url : null;
}

export function assessmentMedia(raw: string, origin: string) {
  const media = previewMedia(raw, origin, "course", true);
  if (media?.kind === "storage-image") return media;
  if (media?.kind === "image") {
    if (media.uri.startsWith("data:image/")) return inlineAssessmentRaster(media.uri) ? media : null;
    const url = publicAssessmentRasterUrl(media.uri, origin);
    if (url) return { kind: "public-image" as const, url };
  }
  return null;
}

export function assessmentMarkdownBlocks(source: string) {
  if (!source.includes("```") && !source.includes("~~~") && !source.includes(":::")) return [{ type: "markdown", source } as const];
  return splitMarkdownPreview(source);
}

export function assessmentChoiceText(source: string, unavailable: string, graph: string, diagram: string) {
  return assessmentMarkdownBlocks(source).map(block => {
    switch (block.type) {
      case "function-widget": return graph;
      case "diagram": return block.title || diagram;
      case "visual": return block.visual.title || graph;
      case "embedded-visual": {
        const parsed = parseEmbeddedVisual(block.content);
        return parsed?.label ?? unavailable;
      }
      case "media": return block.media.caption || unavailable;
      case "markdown":
      case "code": return block.source;
    }
  }).join("\n\n");
}
