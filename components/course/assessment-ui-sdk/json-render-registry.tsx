"use client";

import React, { createContext, useContext, type ReactNode } from "react";
import { defineRegistry } from "@json-render/react";
import {
  assessmentJsonRenderCatalog,
  type AssessmentUiCalloutTone,
  type AssessmentUiCollapsibleVariant,
  type AssessmentUiImageAspect,
  type AssessmentUiLayout,
  type AssessmentUiVisualKind,
} from "@/lib/assessment-ui-sdk";
import { cn } from "@/lib/utils";
import {
  AssessmentCalloutView,
  AssessmentCollapsibleView,
  AssessmentFormulaCardView,
  AssessmentGraphView,
  AssessmentImageView,
  AssessmentInteractiveVisualView,
  AssessmentMarkdownView,
  AssessmentScene3dView,
  AssessmentStepItemView,
  AssessmentStepsContainerView,
} from "./block-primitives";

export interface AssessmentRenderContextValue {
  isCompact: boolean;
  renderBlockAfter?: (blockId: string) => ReactNode;
}

export const AssessmentRenderContext = createContext<AssessmentRenderContextValue>({
  isCompact: false,
});

function useAssessmentRenderContext(): AssessmentRenderContextValue {
  return useContext(AssessmentRenderContext);
}

function BlockAnchor({
  blockId,
  blockType,
  children,
}: {
  blockId?: string;
  blockType: string;
  children: ReactNode;
}) {
  const { renderBlockAfter } = useAssessmentRenderContext();
  if (!blockId) {
    return <div className="min-w-0">{children}</div>;
  }
  return (
    <div
      data-assessment-block-id={blockId}
      data-assessment-block-type={blockType}
      className="min-w-0"
    >
      {children}
      {renderBlockAfter ? renderBlockAfter(blockId) : null}
    </div>
  );
}

const defined = defineRegistry(assessmentJsonRenderCatalog, {
  components: {
    Stack: ({ props, children }: { props: { layout?: AssessmentUiLayout }; children?: ReactNode }) => {
      const parent = useAssessmentRenderContext();
      const compact = props.layout ? props.layout === "compact" : parent.isCompact;
      return (
        <AssessmentRenderContext.Provider
          value={{ isCompact: compact, renderBlockAfter: parent.renderBlockAfter }}
        >
          <div className={cn(compact ? "space-y-3" : "space-y-4")}>{children}</div>
        </AssessmentRenderContext.Provider>
      );
    },
    Markdown: ({ props }: { props: { blockId?: string; content: string } }) => {
      const { isCompact } = useAssessmentRenderContext();
      return (
        <BlockAnchor blockId={props.blockId} blockType="markdown">
          <AssessmentMarkdownView content={props.content} isCompact={isCompact} />
        </BlockAnchor>
      );
    },
    FormulaCard: ({ props }: { props: { blockId?: string; title?: string; latex: string; note?: string } }) => (
      <BlockAnchor blockId={props.blockId} blockType="formula_card">
        <AssessmentFormulaCardView
          title={props.title}
          latex={props.latex}
          note={props.note}
        />
      </BlockAnchor>
    ),
    Callout: ({ props }: { props: { blockId?: string; tone: AssessmentUiCalloutTone; title?: string; content: string } }) => {
      const { isCompact } = useAssessmentRenderContext();
      return (
        <BlockAnchor blockId={props.blockId} blockType="callout">
          <AssessmentCalloutView
            tone={props.tone}
            title={props.title}
            content={props.content}
            isCompact={isCompact}
          />
        </BlockAnchor>
      );
    },
    CollapsibleSection: ({
      props,
      children,
    }: {
      props: { blockId?: string; title: string; defaultOpen?: boolean; variant?: AssessmentUiCollapsibleVariant };
      children?: ReactNode;
    }) => {
      const { isCompact } = useAssessmentRenderContext();
      return (
        <BlockAnchor blockId={props.blockId} blockType="collapsible">
          <AssessmentCollapsibleView
            title={props.title}
            defaultOpen={props.defaultOpen}
            variant={props.variant}
            isCompact={isCompact}
          >
            {children}
          </AssessmentCollapsibleView>
        </BlockAnchor>
      );
    },
    Steps: ({
      props,
      children,
    }: {
      props: { blockId?: string; title?: string; collapsible?: boolean; defaultOpenStepId?: string };
      children?: ReactNode;
    }) => (
      <BlockAnchor blockId={props.blockId} blockType="steps">
        <AssessmentStepsContainerView
          title={props.title}
          collapsible={props.collapsible}
          defaultOpenStepId={props.defaultOpenStepId}
        >
          {children}
        </AssessmentStepsContainerView>
      </BlockAnchor>
    ),
    StepItem: ({
      props,
      children,
    }: {
      props: { stepId?: string; index: number; title: string; summary?: string; collapsible?: boolean };
      children?: ReactNode;
    }) => {
      const { isCompact, renderBlockAfter } = useAssessmentRenderContext();
      return (
        <AssessmentStepItemView
          stepId={props.stepId ?? `step-${props.index + 1}`}
          index={props.index}
          title={props.title}
          summary={props.summary}
          collapsible={props.collapsible}
          isCompact={isCompact}
          renderBlockAfter={renderBlockAfter}
        >
          {children}
        </AssessmentStepItemView>
      );
    },
    Image: ({
      props,
    }: {
      props: { blockId?: string; src: string; alt: string; caption?: string; aspect?: AssessmentUiImageAspect };
    }) => (
      <BlockAnchor blockId={props.blockId} blockType="image">
        <AssessmentImageView
          src={props.src}
          alt={props.alt}
          caption={props.caption}
          aspect={props.aspect}
        />
      </BlockAnchor>
    ),
    Graph: ({ props }: { props: { blockId?: string; title?: string; caption?: string; spec: Record<string, unknown> } }) => (
      <BlockAnchor blockId={props.blockId} blockType="graph">
        <AssessmentGraphView
          title={props.title}
          caption={props.caption}
          spec={props.spec}
        />
      </BlockAnchor>
    ),
    Scene3D: ({ props }: { props: { blockId?: string; title?: string; caption?: string; spec: Record<string, unknown> } }) => (
      <BlockAnchor blockId={props.blockId} blockType="scene_3d">
        <AssessmentScene3dView
          title={props.title}
          caption={props.caption}
          spec={props.spec}
        />
      </BlockAnchor>
    ),
    InteractiveVisual: ({
      props,
    }: {
      props: {
        blockId?: string;
        title?: string;
        caption?: string;
        kind: AssessmentUiVisualKind;
        spec: Record<string, unknown>;
      };
    }) => {
      const { isCompact } = useAssessmentRenderContext();
      return (
        <BlockAnchor blockId={props.blockId} blockType="interactive_visual">
          <AssessmentInteractiveVisualView
            title={props.title}
            caption={props.caption}
            kind={props.kind}
            spec={props.spec}
            isCompact={isCompact}
          />
        </BlockAnchor>
      );
    },
  } as Record<string, React.ComponentType<any>>,
});

export const assessmentJsonRenderRegistry = defined.registry;
