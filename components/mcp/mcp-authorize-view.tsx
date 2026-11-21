"use client";

import { ADMIN_MCP_SCOPE_DESCRIPTIONS } from "@/lib/admin-mcp/registry";

import { useState, useTransition } from "react";
import { useTranslations } from "@/lib/i18n/client";
import Link from "next/link";
import {
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  Lock,
  Globe,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { submitMcpAuthorization } from "@/app/mcp/authorize/actions";

interface ScopeInfo {
  titleKey: string;
  descriptionKey: string;
}

const SCOPE_DETAILS: Record<string, ScopeInfo> = {
  "authoring:read": {
    titleKey: "readTitle",
    descriptionKey: "readDescription",
  },
  "authoring:stage": {
    titleKey: "stageTitle",
    descriptionKey: "stageDescription",
  },
  "authoring:review": {
    titleKey: "reviewTitle",
    descriptionKey: "reviewDescription",
  },
  "authoring:publish": {
    titleKey: "publishTitle",
    descriptionKey: "publishDescription",
  },
  "authoring:withdraw": {
    titleKey: "withdrawTitle",
    descriptionKey: "withdrawDescription",
  },
};

export interface McpAuthorizeViewProps {
  client: {
    clientId: string;
    clientName: string;
    redirectUri: string;
  };
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  isAdmin: boolean;
  scopes: string[];
  defaultScopes: string[];
  searchParams: {
    clientId: string;
    redirectUri: string;
    scope: string;
    state?: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    resource?: string;
  };
  currentPathWithSearch: string;
}

export function McpAuthorizeView({
  client,
  user,
  isAdmin,
  scopes,
  defaultScopes,
  searchParams,
  currentPathWithSearch,
}: McpAuthorizeViewProps) {
  const t = useTranslations("consent.authorize");
  const [isPending, startTransition] = useTransition();
  const [selectedScopes, setSelectedScopes] = useState(defaultScopes);

  const requestsAdminAccess = scopes.some(scope => scope in ADMIN_MCP_SCOPE_DESCRIPTIONS);

  const redirectHostname = (() => {
    try {
      return new URL(client.redirectUri).host;
    } catch {
      return client.redirectUri;
    }
  })();

  const domains: Record<string, string[]> = {
    authoring: ["authoring"],
    academic: ["courses", "chapters", "materials", "videos"],
    content: ["blog", "forms", "media", "shortlinks", "links"],
    access: ["users", "groups", "access"],
    coordination: ["meet", "schedules", "notifications"],
    system: ["analytics", "jobs", "settings"],
  };
  const groups = new Map<string, string[]>();
  for (const scope of scopes) {
    const domain = scope.split(":")[0];
    const key = Object.keys(domains).find(key => domains[key].includes(domain)) ?? "other";
    const members = groups.get(key) ?? [];
    members.push(scope);
    groups.set(key, members);
  }

  const cancelUrl = (() => {
    try {
      const url = new URL(client.redirectUri);
      url.searchParams.set("error", "access_denied");
      if (searchParams.state) url.searchParams.set("state", searchParams.state);
      return url.toString();
    } catch {
      return client.redirectUri;
    }
  })();

  return (
    <div className="w-full max-w-xl">
      <div>
        <h1 className="font-heading text-h5 font-bold text-foreground">
          {t("title", { client: client.clientName })}
        </h1>
      </div>

      {/* Account Info Pill */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-body-sm font-semibold text-foreground truncate">
                {user.name || user.email.split("@")[0]}
              </p>
              {isAdmin ? (
                <Badge variant="default" className="text-body-2xs font-medium">
                  {t("admin")}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-body-2xs font-medium text-muted-foreground">
                  {t("notAdmin")}
                </Badge>
              )}
            </div>
            <p className="text-body-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>

        <Link
          href={`/sign-in?next=${encodeURIComponent(currentPathWithSearch)}`}
          className="text-body-xs font-medium text-primary hover:underline shrink-0"
        >
          {t("switchAccount")}
        </Link>
      </div>

      {/* Non-Admin Block Warning */}
      {!isAdmin ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-status-error shrink-0 mt-0.5" />
              <div>
                <h2 className="text-body-sm font-semibold text-foreground">
                  {t("adminRequired")}
                </h2>
                <p className="mt-1 text-body-xs text-muted-foreground leading-relaxed">
                  {t("adminRequiredDescription", { email: user.email })}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <Button asChild className="h-10 w-full sm:flex-1">
              <Link href={`/sign-in?next=${encodeURIComponent(currentPathWithSearch)}`}>
                {t("signInAdmin")}
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-10 w-full sm:flex-1">
              <a href={cancelUrl}>
                {t("cancelReturn")}
              </a>
            </Button>
          </div>
        </div>
      ) : (
        /* Admin Interactive Consent Flow */
        <div className="mt-4 space-y-3">
          {/* Permissions / Scopes list */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-body-sm font-semibold text-foreground">
                {t("permissions")}
              </h2>
              <span className="text-body-xs text-muted-foreground font-mono">
                {t("permissionCount", { selected: selectedScopes.length, total: scopes.length })}
              </span>
            </div>

            <div className="divide-y divide-border border-y border-border">
              {Array.from(groups, ([group, members]) => {
                const count = members.filter(scope => selectedScopes.includes(scope)).length;
                const name = t(`groups.${group}`);
                return <Collapsible key={group} defaultOpen={groups.size === 1}>
                  <div className="flex items-center gap-3 py-1">
                    <Checkbox
                      aria-label={t("selectGroup", { group: name })}
                      checked={count === members.length || (count > 0 && "indeterminate")}
                      disabled={isPending}
                      onCheckedChange={checked => setSelectedScopes(current => checked === true
                        ? [...new Set([...current, ...members])]
                        : current.filter(scope => !members.includes(scope)))}
                    />
                    <CollapsibleTrigger asChild>
                      <Button type="button" variant="ghost" className="group min-h-9 flex-1 justify-between whitespace-normal text-body-sm">
                        {name}
                        <span className="flex items-center gap-2 text-body-xs text-muted-foreground">
                          {count}/{members.length}
                          <ChevronDown className="size-4 group-data-[state=open]:rotate-180" />
                        </span>
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent className="pl-4">
                    {members.map((scope) => {
                      const detail = SCOPE_DETAILS[scope] ?? {
                        titleKey: "unknownScopeTitle",
                        descriptionKey: "unknownScopeDescription",
                      };

                      const adminDescription = ADMIN_MCP_SCOPE_DESCRIPTIONS[scope as keyof typeof ADMIN_MCP_SCOPE_DESCRIPTIONS];
                      const labelKey = `adminScopes.${scope.replaceAll(":", "_")}`;
                      const title = adminDescription && t.has(labelKey) ? t(labelKey) : adminDescription ?? t(detail.titleKey);

                      return (
                        <label key={scope} htmlFor={`scope-${scope}`} className="flex cursor-pointer items-start gap-3 py-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-body-sm font-medium text-foreground">
                                {title}
                              </p>
                            </div>
                            {!adminDescription && <p className="mt-0.5 text-body-xs text-muted-foreground leading-normal">
                              {t(detail.descriptionKey)}
                            </p>}
                          </div>
                          <Checkbox
                            id={`scope-${scope}`}
                            aria-label={title}
                            checked={selectedScopes.includes(scope)}
                            disabled={isPending}
                            onCheckedChange={(checked) => setSelectedScopes((current) =>
                              checked === true ? [...current, scope] : current.filter((item) => item !== scope)
                            )}
                            className="mt-1"
                          />
                        </label>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>;
              })}
            </div>
          </div>

          {requestsAdminAccess && (selectedScopes.some(scope => ["forms:responses:read", "forms:responses:export", "users:pii:read"].includes(scope))) && (
            <p className="text-body-xs text-muted-foreground">{t("adminData")}</p>
          )}
          <details className="border-b border-border pb-2">
            <summary className="cursor-pointer text-body-sm font-medium">
              <ShieldCheck className="mr-2 inline size-4 text-status-success" />
              <span>{t("security")}</span>
            </summary>
            <ul className="space-y-1.5 text-body-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="size-1 rounded-full bg-muted-foreground shrink-0" />
                <span>{t("noPasswords")}</span>
              </li>
              {!requestsAdminAccess && <li className="text-body-xs">{t("noStudentData")}</li>}
              <li className="flex items-center gap-2">
                <span className="size-1 rounded-full bg-muted-foreground shrink-0" />
                <span>{t("scopeBoundary")}</span>
              </li>
            </ul>
          </details>

          {/* Host & Target metadata */}
          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-body-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 min-w-0">
              <Globe className="size-3.5 shrink-0" />
              <span className="break-all">{t("target")}: <span className="font-mono text-foreground">{redirectHostname}</span></span>
            </div>
            <span className="shrink-0 text-body-2xs font-medium">{t("sessionDuration")}</span>
          </div>

          {/* Actions Form */}
          <form
            action={(formData) => {
              startTransition(async () => {
                await submitMcpAuthorization(formData);
              });
            }}
            className="grid gap-2 sm:grid-cols-2"
          >
            <input type="hidden" name="client_id" value={searchParams.clientId} />
            <input type="hidden" name="redirect_uri" value={searchParams.redirectUri} />
            <input type="hidden" name="scope" value={searchParams.scope} />
            {selectedScopes.map((scope) => (
              <input key={scope} type="hidden" name="selected_scope" value={scope} />
            ))}
            <input type="hidden" name="state" value={searchParams.state ?? ""} />
            <input type="hidden" name="code_challenge" value={searchParams.codeChallenge} />
            <input type="hidden" name="code_challenge_method" value={searchParams.codeChallengeMethod} />
            <input type="hidden" name="resource" value={searchParams.resource ?? ""} />

            <Button
              type="submit"
              name="decision"
              value="approve"
              disabled={isPending || selectedScopes.length === 0}
              className="h-10 w-full gap-2 text-body-sm"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("authorizing")}
                </>
              ) : (
                <>
                  <Lock className="size-4" />
                  {t("allow", { client: client.clientName })}
                </>
              )}
            </Button>

            {selectedScopes.length === 0 && (
              <p role="status" className="order-last text-body-xs text-destructive sm:col-span-2">{t("selectScope")}</p>
            )}

            <Button
              type="submit"
              name="decision"
              value="deny"
              variant="outline"
              disabled={isPending}
              className="h-10 w-full gap-2 text-body-sm text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
              {t("deny")}
            </Button>
          </form>

          {/* Footnote */}
          <p className="text-center text-body-xs text-muted-foreground leading-normal">
            {t("revoke")}
          </p>
        </div>
      )}
    </div>
  );
}
