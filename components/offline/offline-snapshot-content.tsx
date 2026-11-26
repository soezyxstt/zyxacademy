"use client";

import { useEffect, useRef } from "react";
import type { NativeOfflineSnapshot } from "@/lib/offline/reading-cache";

/** Native snapshots originate from the shared renderer; keep stored markup inert too. */
export function OfflineSnapshotContent({ snapshot }: { snapshot: NativeOfflineSnapshot }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const fragment = document.createDocumentFragment();
    for (const section of snapshot.sections) {
      const wrapper = document.createElement("section");
      wrapper.className = "space-y-3 border-t border-border/60 pt-6 first:border-0 first:pt-0";
      if (section.slug) wrapper.dataset.sectionSlug = section.slug;
      const heading = document.createElement("h2"); heading.className = "font-heading text-body-base font-semibold"; heading.textContent = section.heading; wrapper.append(heading);
      const template = document.createElement("template"); template.innerHTML = section.bodyHtml ?? "";
      template.content.querySelectorAll("script,iframe,object,embed,style,link,meta,base,form,use,animate,set,foreignObject,video,audio").forEach(el => el.remove());
      for (const el of template.content.querySelectorAll("*")) for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase(); const value = attr.value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
        if (name.startsWith("on") || ["srcdoc", "formaction", "srcset"].includes(name) || (name === "style" && /url\s*\(|expression\s*\(|@import/i.test(value))) el.removeAttribute(attr.name);
        if (["src", "href", "xlink:href"].includes(name)) {
          const allowed = el.tagName === "IMG" && name === "src" ? /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/i.test(value) : /^(https?:\/\/|#)/i.test(value);
          if (!allowed) el.removeAttribute(attr.name);
        }
      }
      if (section.bodyHtml) wrapper.append(template.content); else { const body = document.createElement("p"); body.textContent = section.body; wrapper.append(body); }
      fragment.append(wrapper);
    }
    host.current.replaceChildren(fragment);
  }, [snapshot]);
  return <div ref={host} className="prose prose-sm max-w-none space-y-(--reading-section-gap) dark:prose-invert" />;
}
