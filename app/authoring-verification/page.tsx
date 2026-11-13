"use client";

import { useEffect, useState } from "react";
import { MathText } from "@/components/course/math-text";
import { ArticleParts } from "@/components/course/article-parts";
import { ProductLearningVisual } from "@/components/course/product-learning-visual";
import { InteractiveDocumentVisual } from "@/components/course/interactive-document-visual";
import { InteractiveDocumentArticle, InteractiveDocumentArticleLocation } from "@/components/course/interactive-document-context";
import { ProductFormativeCheck } from "@/components/course/product-learning-blocks";
import { FormativeCheckEndpointProvider } from "@/components/course/formative-check-endpoint-context";
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
  return <main data-verification-loaded className="mx-auto w-full min-w-0 max-w-3xl space-y-6 p-4">
    {preview.formative && preview.documentScope ? <InteractiveDocumentArticle value={{ courseId: "verification", articleId: "verification", articleVersion: 1, draftId: preview.documentScope, draftChecksum: preview.documentScope }}>
      <InteractiveDocumentArticleLocation sectionId={preview.formative.sectionId} blockId={preview.formative.blockId}>
        <FormativeCheckEndpointProvider endpointBase={`/api/admin/bundles/product/${preview.documentScope}/formative-check`}>
          <ProductFormativeCheck content="" contentNode={<ArticleParts parts={preview.formative.parts} visuals={[]} />} formativeCheck={preview.formative.check} locator={{ articleId: "verification", articleVersion: 1, sectionId: preview.formative.sectionId, blockId: preview.formative.blockId }} />
        </FormativeCheckEndpointProvider>
      </InteractiveDocumentArticleLocation>
    </InteractiveDocumentArticle> : selected ? selected.kind === "interactive_document" && preview.documentScope
      ? <InteractiveDocumentVisual spec={selected} assetUrl={`/__zyx-verification-document/${preview.documentScope}/${encodeURIComponent(selected.id)}/${selected.documentSha256}`} />
      : <ProductLearningVisual spec={selected} engine="jsxgraph" /> : <>
      <h1 className="font-heading text-h5"><MathText className="normal-case">{preview.title}</MathText></h1>
      <InteractiveDocumentArticle value={preview.documentScope ? { courseId: "verification", articleId: "verification", articleVersion: 1, draftId: preview.documentScope, draftChecksum: preview.documentScope } : null}>
      {preview.sections.map((section) => <section key={section.id} data-verification-section={section.id} className="space-y-5">
        <h2 className="font-heading text-body-base font-bold"><MathText className="normal-case">{section.title}</MathText></h2>
        {section.blocks.map((block) => <div key={block.id} data-verification-block={block.id}><InteractiveDocumentArticleLocation sectionId={section.id} blockId={block.id}><ArticleParts parts={block.parts} visuals={preview.visuals} /></InteractiveDocumentArticleLocation></div>)}
      </section>)}
      </InteractiveDocumentArticle>
    </>}
  </main>;
}
