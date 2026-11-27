"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/admin/status-badges";
import type { QuestionIdeaLink } from "@/lib/question-authoring-contract";
import { cn } from "@/lib/utils";
import { hasValidIdeaWeights, ideaWeightTotal, rebalanceIdeaLinks } from "@/packages/native-parity/operations/evaluation-idea-links";

type AuthoringIdea = { id: string; code: string; statement: string };

export function IdeaAssignmentFields({
  idPrefix,
  open,
  courseId,
  chapterId,
  links,
  onChange,
  readIdeas,
}: {
  idPrefix: string;
  open: boolean;
  courseId: string;
  chapterId: string;
  links: QuestionIdeaLink[];
  onChange: (links: QuestionIdeaLink[]) => void;
  readIdeas: (courseId: string, chapterId: string) => Promise<AuthoringIdea[]>;
}) {
  const t = useTranslations("adminEval.questionBank");
  const common = useTranslations("core.error");
  const [expanded, setExpanded] = useState(links.length > 0);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ courseId: string; chapterId: string; status: "loading" | "ready" | "error"; ideas: AuthoringIdea[] } | null>(null);

  useEffect(() => {
    if (!open || !expanded || !courseId) return;
    let current = true;
    setResult({ courseId, chapterId, status: "loading", ideas: [] });
    readIdeas(courseId, chapterId).then(
      (ideas) => { if (current) setResult({ courseId, chapterId, status: "ready", ideas }); },
      () => { if (current) setResult({ courseId, chapterId, status: "error", ideas: [] }); },
    );
    return () => { current = false; };
  }, [open, expanded, courseId, chapterId, retry, readIdeas]);

  const scoped = result?.courseId === courseId && result.chapterId === chapterId ? result : null;
  const loading = Boolean(open && expanded && courseId && (!scoped || scoped.status === "loading"));
  const ideas = scoped?.status === "ready" ? scoped.ideas : [];
  const selected = new Map(links.map((link) => [link.ideaId, link]));
  const totalWeight = ideaWeightTotal(links);
  const valid = hasValidIdeaWeights(links);

  return (
    <section className="space-y-3 border-t border-border pt-4" aria-labelledby={`${idPrefix}-idea-heading`}>
      <Collapsible open={expanded} onOpenChange={setExpanded} className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 id={`${idPrefix}-idea-heading`} className="text-body-sm font-semibold text-foreground">{t("ideaConnection")}</h3>
            <StatusBadge tone="muted" subtle>{t("optional")}</StatusBadge>
          </div>
          <p className="mt-1 text-body-xs text-muted-foreground">
            {links.length > 0 ? t("ideaConnectedCount", { count: links.length }) : t("ideaCanBeUnlinked")}
          </p>
        </div>
        <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="group h-8 gap-2 text-body-xs"
          aria-controls={`${idPrefix}-idea-options`}
        >
          {expanded ? t("close") : t("manageIdeas")}
          <ChevronDown className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </Button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent id={`${idPrefix}-idea-options`}>
        <div className="space-y-3" aria-busy={loading}>
          {links.length > 0 ? (
            <p className={cn("text-body-xs font-semibold", valid ? "text-status-success" : "text-status-warning")}>
              {t("totalWeight")}: {Math.round(totalWeight * 100)}%. {valid ? t("readyToSave") : t("weightMustBe100")}
            </p>
          ) : null}
          {loading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label={t("manageIdeas")} />
          ) : scoped?.status === "error" ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-body-xs text-muted-foreground">
              {t("connectionError")}
              <Button type="button" variant="outline" size="sm" onClick={() => setRetry((n) => n + 1)}>{common("retry")}</Button>
            </div>
          ) : ideas.length === 0 ? (
            <p className="text-body-xs text-muted-foreground">
              {t("noPublishedIdeas")}
            </p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {ideas.map((idea) => {
            const link = selected.get(idea.id);
            return (
              <div key={idea.id} className={cn("rounded-lg border p-3 transition-colors", link ? "border-brand-primary/40 bg-brand-primary/5" : "border-border bg-background/40")}>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={`${idPrefix}-idea-${idea.id}`}
                    checked={Boolean(link)}
                    onCheckedChange={(checked) => onChange(rebalanceIdeaLinks(links, idea.id, checked === true))}
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <label htmlFor={`${idPrefix}-idea-${idea.id}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block text-body-xs font-semibold text-foreground">{idea.code}</span>
                    <span className="mt-1 block line-clamp-2 text-body-xs leading-relaxed text-muted-foreground">{idea.statement}</span>
                  </label>
                </div>
                {link ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 pl-7">
                    <div className="space-y-1">
                      <label htmlFor={`${idPrefix}-weight-${idea.id}`} className="text-body-xs font-medium text-muted-foreground">{t("weightLabel")}</label>
                      <Input
                        id={`${idPrefix}-weight-${idea.id}`}
                        type="number"
                        min="0.01"
                        max="1"
                        step="0.01"
                        value={String(link.weight)}
                        onChange={(event) => {
                          const weight = Number(event.target.value);
                          onChange(links.map((item) => item.ideaId === idea.id ? { ...item, weight } : item));
                        }}
                        className="h-8 bg-background text-body-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor={`${idPrefix}-role-${idea.id}`} className="text-body-xs font-medium text-muted-foreground">{t("roleLabel")}</label>
                      <Select value={link.role} onValueChange={(role) => onChange(links.map((item) => item.ideaId === idea.id ? { ...item, role: role as QuestionIdeaLink["role"] } : item))}>
                        <SelectTrigger id={`${idPrefix}-role-${idea.id}`} className="h-8 text-body-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="primary">{t("rolePrimary")}</SelectItem>
                          <SelectItem value="supporting">{t("roleSupporting")}</SelectItem>
                          <SelectItem value="required">{t("roleRequired")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
            </div>
          )}
        </div>
      </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
