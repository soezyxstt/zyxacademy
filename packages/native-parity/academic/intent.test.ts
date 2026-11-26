import assert from "node:assert/strict";
import test from "node:test";
import { redirectSystemPath } from "../../../apps/mobile-native/app/+native-intent";
import { academicIntentPath } from "../../../apps/mobile-native/routing/academic-intent";
import { academicCases } from "./cases";

test("every academic fixture link preserves its nested path and evidence identity", () => {
  for (const [index, item] of academicCases.entries()) {
    const query = item.href.slice(item.href.indexOf("?")) + `&evidence=${index + 1}`;
    const result = redirectSystemPath({ path: `zyx-native-parity://academic${query}`, initial: true });
    assert.equal(result, `/academic${query}`);
    const params = new URL(result, "https://fixture.invalid").searchParams;
    assert.equal(params.get("path"), item.path);
    assert.equal(params.get("evidence"), String(index + 1));
  }
});

test("a live deep link retains encoded delimiters inside the protected destination", () => {
  const path = "/admin/users?search=Adi%20%26%20Dewi&status=active";
  const query = "?path=" + encodeURIComponent(path);
  for (const route of ["internal/academic", "/internal/academic", "internal/academic/"]) {
    const result = redirectSystemPath({ path: `zyx-native-parity://${route}${query}`, initial: false });
    assert.equal(result, "/internal/academic" + query);
    assert.equal(new URL(result, "https://fixture.invalid").searchParams.get("path"), path);
  }
});

test("authentication, consent, foreign and malformed URLs stay with their existing handlers", () => {
  for (const input of [
    "zyx-native-parity://auth/native-finish#code=00&state=ab",
    "zyx-native-parity://mcp/authorize?client_id=sample",
    "https://example.org/academic?path=%2Ftutor",
    "zyx-native-parity://other/academic?path=%2Ftutor",
    "zyx-native-parity://academic:8080?path=%2Ftutor",
    "zyx-native-parity://user@academic?path=%2Ftutor",
    "zyx-native-parity://internal/other/../academic?path=%2Ftutor",
    "zyx-native-parity://academic?path=%E0%A4",
    "zyx-native-parity://academic?path=/tutor#fragment",
    "/academic?path=%2Ftutor",
  ]) assert.equal(academicIntentPath(input), null, input);
});
