import { productV4SchemaDocuments } from "@/lib/authoring/mcp-contract-revision";
import { VISUAL_CAPABILITIES } from "@/lib/materials/visual-capabilities";

// These are input examples; the validator remains the authority for defaults and refinements.
const examples = {
  switches: {
    id: "switches", kind: "interactive_scene", label: "Dua saklar", description: "Dua saklar mengendalikan satu lampu.",
    viewBox: { x: 0, y: 0, width: 100, height: 50 },
    parameters: [
      { id: "a", label: "Saklar A", min: 0, max: 1, step: 1, initial: 0, control: "toggle", options: [{ value: 0, label: "Mati" }, { value: 1, label: "Hidup" }] },
      { id: "b", label: "Saklar B", min: 0, max: 1, step: 1, initial: 0, control: "toggle", options: [{ value: 0, label: "Mati" }, { value: 1, label: "Hidup" }] },
    ],
    shapes: [
      { type: "line", x1: 10, y1: 25, x2: 90, y2: 25 },
      { type: "circle", cx: 30, cy: 25, r: 7, action: { type: "cycle", parameter: "a" }, actionLabel: "Ubah saklar A" },
      { type: "circle", cx: 70, cy: 25, r: 7, action: { type: "cycle", parameter: "b" }, actionLabel: "Ubah saklar B" },
      { type: "text", x: 25, y: 12, text: "A" }, { type: "text", x: 65, y: 12, text: "B" },
      { type: "circle", cx: 30, cy: 25, r: 3, fill: true, visibleWhen: { left: "a", op: "eq", right: 1 } },
      { type: "circle", cx: 70, cy: 25, r: 3, fill: true, visibleWhen: { left: "b", op: "eq", right: 1 } },
      { type: "circle", cx: 90, cy: 25, r: 5 },
      { type: "circle", cx: 90, cy: 25, r: 3, fill: true, color: "primary", visibleWhen: { left: "a*b", op: "eq", right: 1 } },
    ],
    staticFallback: { type: "text", summary: "Dua saklar pada keadaan awal.", content: "A dan B mati, lampu tidak menyala." },
  },
  motion: {
    id: "rotating_arm", kind: "interactive_scene", label: "Batang berputar", description: "Ujung batang bergerak melingkar terhadap waktu.",
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    parameters: [{ id: "t", label: "Waktu", min: 0, max: 6, step: 0.1, initial: 0, unit: "s", control: "range" }],
    time: { parameter: "t", rate: 1 },
    shapes: [
      { type: "line", x1: 50, y1: 50, x2: "50+30*cos(t)", y2: "50+30*sin(t)" },
      { type: "circle", cx: "50+30*cos(t)", cy: "50+30*sin(t)", r: 3, fill: true },
    ],
    outputs: [{ label: "Koordinat x", value: "50+30*cos(t)" }],
    staticFallback: { type: "text", summary: "Batang pada waktu awal.", content: "Ujung batang berada di kanan pusat." },
  },
} as const;

export function interactiveVisualGuidance() {
  const visualSchema = productV4SchemaDocuments().find(document => document.name === "visual")!;
  const { body: _body, ...schemaDocument } = visualSchema;
  return {
    schemaDocument,
    schemaRetrieval: "GET the same-origin path and verify sha256 and bytes. JSON Schema is structural; run the relevant validator for semantic refinements.",
    capabilities: VISUAL_CAPABILITIES,
    interactiveDocument: {
      product: "For Product V4, place strict interactive_document metadata in article.visuals and reference it from an ordered visual_ref. Package visuals/<documentSha256>.html and visuals/<printSha256>.png, with manifest.visualAssets entries {path, sha256, bytes}; each unique asset appears once. HTML is reviewed, self-contained offline UTF-8 and print is a reviewed PNG of the declared default state. Translate or adapt visual skill output and independently review its science, behavior, rights and print correspondence. Never put source or base64 in metadata or Markdown.",
      assessment: "assessment.validate_quiz_draft, assessment.submit_quiz_draft and assessment.update_question accept an optional visualAssets array of {path, sha256, bytes, base64}. Use visuals/<sha256>.html and visuals/<sha256>.png, with exact bytes for every referenced asset. At most 8 specs and 16 MiB of unique assets; do not reuse any hash between prompt or options and explanation. Do not put source or base64 in question text.",
      example: "In a repository checkout, after workflow.get_contract and independent content review, fill the metadata.json shown in scripts/authoring/package-interactive-document.ts and run: bun scripts/authoring/package-interactive-document.ts reviewed.html reviewed.png metadata.json new-output-dir. payload.json contains articleVisual, orderedPart, manifestVisualAssets, questionFence and assessment visualAssets; visuals/ contains the matching Product files. Insert these into your own authored Article, manifest or question and run the relevant complete validation. The example does not make a Product ZIP or approve content.",
      limits: "Each HTML is at most 6 MiB; each decoded PNG file is at most 2 MiB; unique assets total at most 16 MiB. The complete Product ZIP also has a 32 MiB bound. These are format limits; MCP HTTP and provider request limits may be lower and have not been verified. Extract individual visuals and minimize embedded assets. PNG must decode successfully. Use only authorized reviewed documents and verify accessibility, scientific behavior and default-state correspondence separately.",
      runtime: "The host injects readiness after verified original HTML bytes; do not implement a privileged bridge. An opened visual retains its state when scrolled offscreen; pause playback while inactive or reduced motion is enabled. Accept messages only when event.source === parent: {type:'zyx:preferences',theme:'light'|'dark',reducedMotion:boolean,active:boolean} and {type:'zyx:visibility',active:false}. Send parent.postMessage({type:'zyx:resize',height},'*') after layout changes; initial metadata height is bounded to 240..1200 CSS pixels; finite runtime heights from 240 to 2400 CSS pixels are accepted at most every 100 ms, retaining the latest valid pending resize. Disconnect observers and stop timers on pagehide. The readiness timeout remains 15 seconds. No other host messages or network access are supported.",
      presentation: "Adapt the element to Zyx's semantic light and dark palette, 14 px controls, readable 16 px prose, visible keyboard focus and compact wrapping controls. Keep geometry, units, controls and linked values close together. Do not embed another application shell. Verify the actual narrow question-option container as well as 380 by 844 and 1536 by 864 viewports.",
      quality: "Use visual-teknik to author an appropriate model and view, including SVG, Canvas or 3D as required. Motion needs visible Play/Pause and one physical clock; supply the relevant isolated real-force and D'Alembert diagrams. Start paused, honor reduced motion and include keyboard equivalents, reset and meaningful invalid-state recovery. Test a new authored visual through this same contract; the fixtures are not a fixed model catalog.",
    },
    placement: "Put one JSON spec in a zyx-visual Markdown fence in prompt, option or explanation; for Article V4 put it in article.visuals and reference its id with an ordered visual_ref part. Interactive documents additionally require their separately bound asset envelope.",
    scene: {
      kind: "interactive_scene",
      fields: "id, kind, label, description, viewBox, parameters, shapes and staticFallback are required; interactive, time and outputs are optional. Fetch the visual schema for every exact field and primitive.",
      geometry: "Shapes are typed line, circle, rect, polygon, path or text, emitted as SVG by the application. A path starts with M and has at most 32 typed M, L, Q, C or Z commands; raw SVG import is not supported.",
      labels: "Text shapes support marked inline math through KaTeX in the interactive scene and initial-state Diktat output. Check the rendered label placement and clipping.",
      bindings: "Numeric coordinates, dimensions, visibility operands and outputs accept numbers or bounded expressions over parameter IDs. Expressions support +, -, *, /, ^, parentheses and abs, cos, exp, log, max, min, sin, sqrt, tan. They are not JavaScript.",
      interactions: "Parameters use range, toggle or select. Shape actions are cycle, set or drag and require actionLabel. A time object selects a range parameter and rate for playback; all geometry and outputs should derive from the same state.",
      limits: "At most 16 parameters, 100 shapes, 20 outputs, 32 polygon points and 256 expressions. The normalized JSON scene is limited to 131072 UTF-8 bytes; the Markdown fence input is separately limited to 131072 UTF-16 code units. Expressions have at most 180 characters, 48 nodes and depth 12. Check the live schema and validator for all bounds and refinements.",
      static: "Diktat visual_ref needs staticMarkdown; the application renders typed geometry at parameter initial values and derives or verifies the static snapshot pin.",
      safety: "Data only: no raw HTML, SVG markup, JavaScript, iframe, remote embed or executable code. Plain inert text is rendered as text and is not executed. Treat legacy standalone HTML as reference and translate its model into supported typed primitives and state; unsupported behavior needs a separate typed implementation.",
      assessment: "Prompt and option specs must not contain solution-only states, labels, explanations or hidden answers; keep them in the answer and explanation fields under the existing assessment access rules.",
      scientific: "The author owns assumptions, units, equations and model validation. Use visual-teknik for model and FBD guidance; typed geometry does not establish scientific correctness. The existing epsilon-delta renderer uses JSXGraph; Three is installed but does not add 3D support to this family.",
      examples,
    },
  };
}
