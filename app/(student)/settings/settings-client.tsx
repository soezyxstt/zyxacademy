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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { hapticSelection } from "@/lib/native/haptics";
import { isNativeApp } from "@/lib/native/runtime";
import { Download } from "lucide-react";
import { useHapticsPreference } from "@/hooks/use-haptics-preference";

const THEMES = ["light", "dark", "system"] as const;
const LANGUAGES = ["id", "en"] as const;

function PreferenceChoice<Value extends string>({
  label,
  options,
  optionLabel,
  value,
  onChange,
  disabled,
  error,
}: {
  label: string;
  options: readonly Value[];
  optionLabel: (value: Value) => string;
  value: Value;
  onChange: (value: Value) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const id = useId();
  return (
    <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] items-center gap-x-2 py-1 sm:grid-cols-[minmax(0,1fr)_12rem]">
      <label htmlFor={id} className="text-body-sm font-medium text-foreground">{label}</label>
      <Select value={value} disabled={disabled} onValueChange={(next) => {
        const selected = options.find((option) => option === next);
        if (selected) onChange(selected);
      }}>
        <SelectTrigger
          id={id}
          variant="inline"
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-auto min-h-9 justify-self-end px-1.5 py-1 text-right [&>span]:whitespace-normal"
        >
          <SelectValue>{optionLabel(value)}</SelectValue>
        </SelectTrigger>
        <SelectContent align="end">
          {options.map((option) => <SelectItem key={option} value={option}>{optionLabel(option)}</SelectItem>)}
        </SelectContent>
      </Select>
      {error && <p id={`${id}-error`} role="alert" className="col-span-2 text-body-xs text-destructive">{error}</p>}
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
    <div className="flex min-h-11 items-center justify-between gap-3 py-1.5">
      <label htmlFor={id} className="text-body-sm font-medium text-foreground">{label}</label>
      <Switch id={id} className="shrink-0" checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function PreferenceGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="pb-1 font-heading text-body-base font-bold text-foreground">{title}</h2>
      {description && <p className="mb-1 text-body-xs text-muted-foreground">{description}</p>}
      <div className="divide-y divide-border/25">{children}</div>
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
  const { enabled: hapticsEnabled, setEnabled: setHapticsEnabled } = useHapticsPreference();

  useEffect(() => setMounted(true), []);

  const activeTheme = mounted ? THEMES.find((option) => option === theme) ?? "system" : "system";

  return (
    <div className="space-y-(--section-gap)">
      {mounted && experience.mode !== "demo" && !isNativeApp() && (
        <Button asChild variant="outline">
          <Link href="/download"><Download aria-hidden="true" />{t("preferences.downloadApp")}</Link>
        </Button>
      )}
      <PreferenceGroup title={t("preferences.interface")} description={t("preferences.browserSettings")}>
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
        <PreferenceChoice
          label={common("language.label")}
          options={LANGUAGES}
          optionLabel={(value) => common(value === "id" ? "language.indonesian" : "language.english")}
          value={locale}
          disabled={isPending}
          error={error}
          onChange={(value) => {
            if (experience.mode === "demo") experience.changeLocale?.(value);
            else void setLocale(value);
          }}
        />
      </PreferenceGroup>

      <PreferenceGroup title={t("preferences.layout")} description={t("preferences.layoutScope")}>
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
          <figure className="border-l-2 border-border/60 pl-3">
            <figcaption className="mb-1 text-body-xs font-semibold text-muted-foreground">
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
        <PreferenceSwitch
          label={t("preferences.haptics")}
          checked={hapticsEnabled}
          onCheckedChange={(checked) => {
            setHapticsEnabled(checked);
            if (checked) void hapticSelection();
          }}
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
        <TabsList aria-label={common("preferences")}>
          <TabsTrigger value="appearance">{t("preferences.appearance")}</TabsTrigger>
          <TabsTrigger value="profile">{t("settings.profile")}</TabsTrigger>
          <TabsTrigger value="email">{t("preferences.email")}</TabsTrigger>
        </TabsList>
        <TabsContent value="appearance" className="mt-3 sm:mt-6"><DisplayPreferences /></TabsContent>
        <TabsContent value="profile" forceMount className="mt-3 space-y-4 data-[state=inactive]:hidden sm:mt-6">
          {profile ? (
            <>
              <div className="flex justify-end">
                <Button asChild variant="outline" size="sm">
                  <Link href={href("/profile")}>{t("settings.viewProfile")}</Link>
                </Button>
              </div>
              {profile}
            </>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link href={href("/profile/edit")}>{t("profile.editTitle")}</Link>
            </Button>
          )}
        </TabsContent>
        <TabsContent value="email" forceMount className="mt-3 data-[state=inactive]:hidden sm:mt-6">
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
