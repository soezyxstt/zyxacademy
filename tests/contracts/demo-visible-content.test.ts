import { expect, mock, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

let pathname = "/en/demo/courses";
let reducedMotion = false;

mock.module("next/navigation", () => ({
  usePathname: () => pathname,
}));
mock.module("../../components/appearance-preferences", () => ({
  useAppReducedMotion: () => reducedMotion,
}));

const { Reveal } = await import("../../components/ui/reveal");

test("demo content bypasses scroll reveal without waiting for hydration", () => {
  const html = renderToStaticMarkup(createElement(Reveal, { children: "Demo Content" }));
  expect(html).toContain("Demo Content");
  expect(html).not.toContain("data-scroll-reveal");
  expect(html).not.toContain("opacity-0");
});

test("marketing content uses scroll reveal only when motion is enabled", () => {
  pathname = "/about";
  expect(renderToStaticMarkup(createElement(Reveal, { children: "About" }))).toContain("data-scroll-reveal");

  reducedMotion = true;
  expect(renderToStaticMarkup(createElement(Reveal, { children: "About" }))).not.toContain("data-scroll-reveal");
});
