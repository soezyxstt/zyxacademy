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

const sensitiveScopes = new Set([
  "users:roles:admin", "users:roles:write", "users:status:write", "users:pii:read",
  "access:secrets:read", "access:write", "forms:responses:read", "forms:responses:export",
  "notifications:send", "jobs:write", "meet:write", "authoring:publish", "authoring:withdraw",
]);

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
  sessionId: string;
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
  sessionId,
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
    <div className="w-full space-y-(--related-gap)">
      <h1 className="wrap-anywhere font-heading text-h5 font-bold text-foreground">
        {t("title", { client: client.clientName })}
      </h1>

      <div className="flex flex-wrap items-center justify-between gap-(--compact-gap) border-y border-border/60 py-(--row-padding)">
        <div className="min-w-0 flex-1 basis-44">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="wrap-anywhere text-body-sm font-semibold text-foreground">
              {user.name || user.email.split("@")[0]}
            </p>
            <Badge variant="secondary" className="text-body-2xs font-medium text-muted-foreground">
              {t(isAdmin ? "admin" : "notAdmin")}
            </Badge>
          </div>
          <p className="wrap-anywhere text-body-xs text-muted-foreground">{user.email}</p>
        </div>

        <Link
          href={`/sign-in?next=${encodeURIComponent(currentPathWithSearch)}`}
          className="shrink-0 text-body-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {t("switchAccount")}
        </Link>
      </div>

      {/* Non-Admin Block Warning */}
      {!isAdmin ? (
        <div className="space-y-(--related-gap)">
          <div className="border-l-2 border-destructive/40 py-1 pl-(--compact-gap)">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-status-error shrink-0 mt-0.5" />
              <div>
                <h2 className="text-body-sm font-semibold text-foreground">
                  {t("adminRequired")}
                </h2>
                <p className="mt-1 wrap-anywhere text-body-xs leading-relaxed text-muted-foreground">
                  {t("adminRequiredDescription", { email: user.email })}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button asChild variant="outline">
              <a href={cancelUrl}>
                {t("cancelReturn")}
              </a>
            </Button>
            <Button asChild>
              <Link href={`/sign-in?next=${encodeURIComponent(currentPathWithSearch)}`}>
                {t("signInAdmin")}
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        /* Admin Interactive Consent Flow */
        <div className="space-y-(--compact-gap)">
          {/* Permissions / Scopes list */}
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-body-sm font-semibold text-foreground">
                {t("permissions")}
              </h2>
              <span className="text-body-xs text-muted-foreground font-mono">
                {t("permissionCount", { selected: selectedScopes.length, total: scopes.length })}
              </span>
            </div>

            <div className="divide-y divide-border/60 border-y border-border/60">
              {Array.from(groups, ([group, members]) => {
                const count = members.filter(scope => selectedScopes.includes(scope)).length;
                const name = t(`groups.${group}`);
                return <Collapsible key={group} defaultOpen={groups.size === 1 || members.some(scope => sensitiveScopes.has(scope) && defaultScopes.includes(scope))}>
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
                      <Button type="button" variant="ghost" className="group h-auto min-h-9 min-w-0 flex-1 whitespace-normal text-left [&>span]:w-full">
                        <span className="flex w-full items-center justify-between gap-2">
                          <span className="min-w-0 wrap-anywhere">{name}</span>
                          <span className="flex shrink-0 items-center gap-2 text-body-xs text-muted-foreground">
                            {count}/{members.length}
                            <ChevronDown className="size-4 group-data-[state=open]:rotate-180" />
                          </span>
                        </span>
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent className="ml-(--related-gap) divide-y divide-border/40">
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
                          <div className="min-w-0 flex-1">
                            <p className="wrap-anywhere text-body-sm font-medium text-foreground">{title}</p>
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
          <details className="border-b border-border/60 pb-2">
            <summary className="cursor-pointer text-body-sm font-medium">
              <ShieldCheck className="mr-2 inline size-4 text-status-success" />
              <span>{t("security")}</span>
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-body-xs text-muted-foreground">
              <li className="text-body-xs">{t("noPasswords")}</li>
              {!requestsAdminAccess && <li className="text-body-xs">{t("noStudentData")}</li>}
              <li className="text-body-xs">{t("scopeBoundary")}</li>
            </ul>
          </details>

          {/* Host & Target metadata */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-body-xs text-muted-foreground">
            <div className="flex min-w-0 items-start gap-1.5">
              <Globe className="size-3.5 shrink-0" />
              <span className="wrap-anywhere">{t("target")}: <span className="font-mono text-foreground">{redirectHostname}</span></span>
            </div>
            <span>{t("sessionDuration")}</span>
          </div>

          {/* Actions Form */}
          <form
            action={(formData) => {
              startTransition(async () => {
                await submitMcpAuthorization(formData);
              });
            }}
            className="flex flex-wrap items-center justify-end gap-2"
          >
            <input type="hidden" name="client_id" value={searchParams.clientId} />
            <input type="hidden" name="expected_user_id" value={user.id} />
            <input type="hidden" name="expected_session_id" value={sessionId} />
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
              value="deny"
              variant="outline"
              disabled={isPending}
            >
              <X className="size-4" />
              {t("deny")}
            </Button>

            <Button
              type="submit"
              name="decision"
              value="approve"
              disabled={isPending || selectedScopes.length === 0}
              className="h-auto min-h-9 min-w-0 max-w-full whitespace-normal py-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("authorizing")}
                </>
              ) : (
                <>
                  <Lock className="size-4" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{t("allow", { client: client.clientName })}</span>
                </>
              )}
            </Button>

            {selectedScopes.length === 0 && (
              <p role="status" className="basis-full text-right text-body-xs text-destructive">{t("selectScope")}</p>
            )}
          </form>

          {/* Footnote */}
          <p className="text-body-xs leading-normal text-muted-foreground">
            {t("revoke")}{" "}
            <Link href="/mcp/connections" className="font-medium underline underline-offset-4">{t("manageConnections")}</Link>
          </p>
        </div>
      )}
    </div>
  );
}
