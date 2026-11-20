import { describe, it, expect, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let mockPathname: string | null = "/dashboard";
let mockReducedMotion = false;

mock.module("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

mock.module("../../components/appearance-preferences", () => ({
  useAppReducedMotion: () => mockReducedMotion,
}));
const { PageTransition } = await import("../../components/ui/page-transition");

describe("PageTransition SSR Visibility", () => {
  it("renders student surfaces with immediate visibility (no initial opacity 0 in server HTML)", () => {
    mockPathname = "/courses/web-dev";
    mockReducedMotion = false;

    const html = renderToStaticMarkup(
      React.createElement(PageTransition, null, React.createElement("h1", null, "Course Content"))
    );

    expect(html).toContain("Course Content");
    expect(html).not.toMatch(/opacity:\s*0/i);
  });

  it("preserves initial opacity 0 animation for marketing surfaces", () => {
    mockPathname = "/";
    mockReducedMotion = false;

    const html = renderToStaticMarkup(
      React.createElement(PageTransition, null, React.createElement("h1", null, "Marketing Title"))
    );

    expect(html).toContain("Marketing Title");
    expect(html).toMatch(/opacity:\s*0/i);
  });

  it("skips the marketing entrance when reduced motion is active", () => {
    mockPathname = "/";
    mockReducedMotion = true;

    const html = renderToStaticMarkup(
      React.createElement(PageTransition, null, React.createElement("h1", null, "Marketing Title"))
    );

    expect(html).toContain("Marketing Title");
    expect(html).not.toMatch(/opacity:\s*0/i);
  });
});
