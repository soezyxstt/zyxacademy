import { describe, expect, test } from "bun:test";
import { FORMS_PREVIEW_URI, FORMS_SUMMARY_URI, FORMS_UI_MIME, formsUiHtml, formsUiMeta, registerFormsUi } from "../../lib/admin-mcp/forms-ui";

describe("forms MCP app resources", () => {
  test("registers isolated resources and matching tool metadata", async () => {
    const resources: any[] = [];
    registerFormsUi({ registerResource: (...args: any[]) => resources.push(args) } as any);
    expect(resources.map(x => x[1])).toEqual([FORMS_PREVIEW_URI, FORMS_SUMMARY_URI]);
    for (const [name, uri, config, read] of resources) {
      expect(name).toBeTruthy();
      expect(formsUiMeta(uri)).toEqual({ ui: { resourceUri: uri } });
      expect(config.mimeType).toBe(FORMS_UI_MIME);
      expect((await read()).contents[0]).toMatchObject({ uri, mimeType: FORMS_UI_MIME, _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } } });
    }
  });
  test("resource has a closed network policy and does not interpolate tool data as HTML", () => {
    expect(formsUiHtml).toContain("default-src 'none'");
    expect(formsUiHtml).toContain("form-action 'none'");
    expect(formsUiHtml).not.toContain("innerHTML");
    expect(formsUiHtml).not.toContain("fetch(");
    expect(formsUiHtml).toContain("textContent");
  });
});
