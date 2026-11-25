import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ViewportSwitch } from "@/components/navigation/viewport-switch";

describe("ViewportSwitch", () => {
  test("renders fallback during SSR when viewport mode is unknown", () => {
    const html = renderToStaticMarkup(
      <ViewportSwitch
        desktop={<div data-view="desktop">Desktop View</div>}
        mobile={<div data-view="mobile">Mobile View</div>}
        fallback={<div data-view="fallback">Loading Layout</div>}
      />
    );

    expect(html).toContain('data-view="fallback"');
    expect(html).not.toContain("Desktop View");
    expect(html).not.toContain("Mobile View");
  });

  test("renders only desktop branch when initialHint is desktop", () => {
    let desktopCalls = 0;
    let mobileCalls = 0;

    const html = renderToStaticMarkup(
      <ViewportSwitch
        initialHint="desktop"
        desktop={() => {
          desktopCalls += 1;
          return <section data-view="desktop">Desktop Tree</section>;
        }}
        mobile={() => {
          mobileCalls += 1;
          return <section data-view="mobile">Mobile Tree</section>;
        }}
      />
    );

    expect(html).toContain("Desktop Tree");
    expect(html).not.toContain("Mobile Tree");
    expect(desktopCalls).toBe(1);
    expect(mobileCalls).toBe(0);
  });

  test("renders only mobile branch when initialHint is mobile", () => {
    let desktopCalls = 0;
    let mobileCalls = 0;

    const html = renderToStaticMarkup(
      <ViewportSwitch
        initialHint="mobile"
        desktop={() => {
          desktopCalls += 1;
          return <section data-view="desktop">Desktop Tree</section>;
        }}
        mobile={() => {
          mobileCalls += 1;
          return <section data-view="mobile">Mobile Tree</section>;
        }}
      />
    );

    expect(html).toContain("Mobile Tree");
    expect(html).not.toContain("Desktop Tree");
    expect(desktopCalls).toBe(0);
    expect(mobileCalls).toBe(1);
  });
});
