"use client";

import { type ReactNode, useEffect, useId, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  DENSITY_OPTIONS,
  FONT_SIZE_OPTIONS,
  TOAST_POSITION_OPTIONS,
  useAppearancePreferences,
} from "@/components/appearance-preferences";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { useStudentExperience } from "@/components/student-experience-provider";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";

const THEMES = ["light", "dark", "system"] as const;
const LANGUAGES = ["id", "en"] as const;

function PreferenceChoice<Value extends string>({
  label,
  description,
  options,
  optionLabel,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  options: readonly Value[];
  optionLabel: (value: Value) => string;
  value: Value;
  onChange: (value: Value) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const descriptionId = `${id}-description`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-(--row-padding)">
      <div className="min-w-0">
        <label htmlFor={id} className="text-body-sm font-medium text-foreground">{label}</label>
        {description ? <p id={descriptionId} className="mt-1 text-body-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Select value={value} disabled={disabled} onValueChange={(next) => {
        const selected = options.find((option) => option === next);
        if (selected) onChange(selected);
      }}>
        <SelectTrigger
          id={id}
          aria-describedby={description ? descriptionId : undefined}
          className="h-auto min-h-11 w-full sm:min-h-9 sm:w-48"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {options.map((option) => <SelectItem key={option} value={option}>{optionLabel(option)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function PreferenceSwitch({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-(--row-padding)">
      <label htmlFor={id} className="text-body-sm font-medium text-foreground">{label}</label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function PreferenceGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="border-b border-border/40 pb-2 font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="divide-y divide-border/30">{children}</div>
    </section>
  );
}

function DisplayPreferences() {
  const t = useTranslations("student");
  const common = useTranslations("common");
  const experience = useStudentExperience();
  const { locale, setLocale, isPending, error } = useAppLocale();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { preferences, setPreference } = useAppearancePreferences();

  useEffect(() => setMounted(true), []);

  const languageErrorId = useId();
  const activeTheme = mounted ? THEMES.find((option) => option === theme) ?? "system" : "system";

  return (
    <div className="space-y-(--section-gap)">
      <p className="text-body-xs text-muted-foreground">{t("preferences.browserSettings")}</p>
      <PreferenceGroup title={t("preferences.interface")}>
        <PreferenceChoice
          label={t("preferences.theme")}
          options={THEMES}
          optionLabel={(option) => common(option)}
          value={activeTheme}
          onChange={setTheme}
          disabled={!mounted}
        />
        <PreferenceSwitch
          label={t("preferences.backgroundOrnaments")}
          checked={preferences.background === "default"}
          onCheckedChange={(checked) => setPreference("background", checked ? "default" : "solid")}
        />
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-(--row-padding)">
          <div>
            <span className="text-body-sm font-medium text-foreground">{common("language.label")}</span>
            {error && <p id={languageErrorId} role="alert" className="mt-1 text-body-xs text-destructive">{error}</p>}
          </div>
          <ToggleGroup
            type="single"
            value={locale}
            disabled={isPending}
            aria-label={common("language.label")}
            aria-describedby={error ? languageErrorId : undefined}
            onValueChange={(value) => {
              if (value !== "id" && value !== "en") return;
              if (experience.mode === "demo") experience.changeLocale?.(value);
              else void setLocale(value);
            }}
          >
            {LANGUAGES.map((value) => (
              <ToggleGroupItem
                key={value}
                value={value}
                aria-label={common(value === "id" ? "language.indonesian" : "language.english")}
                className="min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 sm:min-h-9"
              >
                {value.toUpperCase()}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </PreferenceGroup>

      <PreferenceGroup title={t("preferences.layout")}>
        <p className="py-2 text-body-xs text-muted-foreground">{t("preferences.layoutScope")}</p>
        <PreferenceChoice
          label={t("preferences.spacing")}
          options={DENSITY_OPTIONS}
          optionLabel={(option) => t(`preferences.spacingOptions.${option}`)}
          value={preferences.density}
          onChange={(value) => setPreference("density", value)}
        />
        <PreferenceChoice
          label={t("preferences.fontSize")}
          options={FONT_SIZE_OPTIONS}
          optionLabel={(option) => t(`preferences.fontSizeOptions.${option}`)}
          value={preferences.fontSize}
          onChange={(value) => setPreference("fontSize", value)}
        />
        <div className="pt-(--related-gap)">
          <figure className="rounded-lg border border-border bg-card p-(--panel-padding)">
            <figcaption className="mb-(--related-gap) text-body-xs font-semibold text-muted-foreground">
              {t("preferences.previewLabel")}
            </figcaption>
            <div className="grid max-w-[70ch] gap-(--paragraph-gap)">
              <p className="m-0 text-body-base">{t("preferences.previewFirst")}</p>
              <p className="m-0 text-body-base">{t("preferences.previewSecond")}</p>
            </div>
          </figure>
        </div>
      </PreferenceGroup>

      <PreferenceGroup title={t("preferences.motionAndMessages")}>
        <PreferenceSwitch
          label={t("preferences.animations")}
          checked={preferences.animations}
          onCheckedChange={(checked) => setPreference("animations", checked)}
        />
        <PreferenceChoice
          label={t("preferences.toastPosition")}
          options={TOAST_POSITION_OPTIONS}
          optionLabel={(option) => t(`preferences.toastOptions.${option}`)}
          value={preferences.toastPosition}
          onChange={(position) => {
            if (position === preferences.toastPosition) return;
            setPreference("toastPosition", position);
            toast(t("preferences.toastPreview"), { id: "toast-position-preview", position });
          }}
        />
      </PreferenceGroup>
    </div>
  );
}

export function SettingsClient({
  profile,
  email,
  initialTab = "appearance",
}: {
  profile?: ReactNode;
  email?: ReactNode;
  initialTab?: "appearance" | "profile" | "email";
}) {
  const t = useTranslations("student");
  const common = useTranslations("common");
  const experience = useStudentExperience();
  const href = (path: string) => experience.href?.(path) ?? path;
  const [tab, setTab] = useUrlTab("tab", "appearance", initialTab);
  const activeTab = tab === "profile" || tab === "email" ? tab : "appearance";

  return (
    <ApplicationPage>
      <PageHeader title={common("preferences")} />
      <Tabs value={activeTab} onValueChange={setTab}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border/50">
          <TabsList aria-label={common("preferences")} className="border-b-0">
            <TabsTrigger value="appearance">{t("preferences.appearance")}</TabsTrigger>
            <TabsTrigger value="profile">{t("settings.profile")}</TabsTrigger>
            <TabsTrigger value="email">{t("preferences.email")}</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 pb-1.5">
            {activeTab === "profile" && (
              <Button asChild variant="outline" size="sm">
                <Link href={href("/profile")}>{t("settings.viewProfile")}</Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={href("/feedback")}>{t("settings.sendFeedback")}</Link>
            </Button>
          </div>
        </div>
        <TabsContent value="appearance" className="mt-0"><DisplayPreferences /></TabsContent>
        <TabsContent value="profile" forceMount className="mt-0 data-[state=inactive]:hidden">
          {profile ?? (
            <Button asChild variant="outline" size="sm">
              <Link href={href("/profile/edit")}>{t("profile.editTitle")}</Link>
            </Button>
          )}
        </TabsContent>
        <TabsContent value="email" forceMount className="mt-0 data-[state=inactive]:hidden">
          {email ?? (
            <Button asChild variant="outline" size="sm">
              <Link href={href("/settings/notifications")}>{t("settings.manageNotifications")}</Link>
            </Button>
          )}
        </TabsContent>
      </Tabs>
    </ApplicationPage>
  );
}
