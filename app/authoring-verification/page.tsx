"use client";

import { useEffect, useState } from "react";
import { MathText } from "@/components/course/math-text";
import { ArticleParts } from "@/components/course/article-parts";
import { ProductLearningVisual } from "@/components/course/product-learning-visual";
import { verificationPreviewSchema, type VerificationPreview } from "@/lib/materials/verification-preview";

export default function AuthoringVerificationPage() {
  const [preview, setPreview] = useState<VerificationPreview | null>(null);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const parsed = verificationPreviewSchema.safeParse(event.data);
      if (parsed.success) setPreview(parsed.data);
    };
    window.addEventListener("message", receive);
    document.documentElement.dataset.verificationRuntime = process.env.NEXT_PUBLIC_V4_WEB_RUNTIME ?? "";
    document.documentElement.dataset.verificationReady = "true";
    return () => window.removeEventListener("message", receive);
  }, []);
  if (!preview) return <main data-verification-empty />;
  const selected = preview.visualId ? preview.visuals.find((visual) => visual.id === preview.visualId) : null;
  return <main data-verification-loaded className="mx-auto max-w-3xl space-y-6 p-4">
    {selected ? <ProductLearningVisual spec={selected} engine="jsxgraph" /> : <>
      <h1 className="font-heading text-h5"><MathText className="normal-case">{preview.title}</MathText></h1>
      {preview.sections.map((section) => <section key={section.id} data-verification-section={section.id} className="space-y-5">
        <h2 className="font-heading text-body-base font-bold"><MathText className="normal-case">{section.title}</MathText></h2>
        {section.blocks.map((block) => <div key={block.id} data-verification-block={block.id}><ArticleParts parts={block.parts} visuals={preview.visuals} /></div>)}
      </section>)}
    </>}
  </main>;
}
