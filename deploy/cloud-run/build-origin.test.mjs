import assert from "node:assert/strict";
import test from "node:test";
import { buildOrigin } from "./build-origin.mjs";

test("image builds cannot cross the production and staging origin boundary", () => {
  assert.equal(buildOrigin("https://www.zyxacademy.com", "production").hostname, "www.zyxacademy.com");
  assert.equal(buildOrigin("https://staging.zyxacademy.com").hostname, "staging.zyxacademy.com");
  for (const [origin, environment] of [
    ["https://www.zyxacademy.com", "staging"], ["https://staging.zyxacademy.com", "production"],
    ["https://www.zyxacademy.com/path", "production"], ["https://www.zyxacademy.com/", "production"],
    ["https://www.zyxacademy.com@evil.invalid", "production"], ["https://evil.invalid", "production"],
    ["https://www.zyxacademy.com", "unknown"],
  ]) assert.throws(() => buildOrigin(origin, environment));
});
