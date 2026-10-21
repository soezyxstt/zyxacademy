import { productV4SchemaDocuments } from "@/lib/authoring/mcp-contract-revision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public validator definitions only. Never include run, source, identity or verification data.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const documents = productV4SchemaDocuments();
  const name = params.get("schema");
  const headers = { "Cache-Control": "no-store" };
  if (name === null) return Response.json({
    schemaVersion: "product-bundle.v4",
    documents: documents.map(({ body: _body, ...document }) => document),
    validation: "Structural schemas from the running validators. V4 semantic rules and publication gates remain authoritative in workflow.get_contract and authoring.validate_product_bundle.",
  }, { headers });
  const document = documents.find((item) => item.name === name);
  if (!document) return Response.json({ error: "SCHEMA_NOT_FOUND" }, { status: 404, headers });
  const expected = params.get("sha256");
  if (expected !== null && expected !== document.sha256) {
    return Response.json({ error: "SCHEMA_REVISION_CHANGED", remediation: "Refresh workflow.get_playbook and workflow.get_contract." }, { status: 409, headers });
  }
  return new Response(document.body, { headers: {
    ...headers, "Content-Type": "application/schema+json; charset=utf-8", ETag: `"${document.sha256}"`,
  } });
}
