"use client";

import { type ReactNode, useEffect, useId, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  DENSITY_OPTIONS,
  DEFAULT_APPEARANCE_PREFERENCES,
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
import { isNativeApp } from "@/lib/native/runtime";
import { isHapticsSupported } from "@/lib/native/haptics";
import { resolveSettingsTab, type SettingsTab } from "@/lib/settings-tabs";
import { ArrowRight, Download, HardDriveDownload, RotateCcw } from "lucide-react";
import { useHapticsPreference } from "@/hooks/use-haptics-preference";
import { AccountSessions } from "@/components/settings/account-sessions";

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
  description,
  disabled,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <label htmlFor={id} className="text-body-sm font-medium text-foreground">{label}</label>
        {description && <p id={`${id}-description`} className="mt-0.5 text-body-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch id={id} className="shrink-0" checked={checked} disabled={disabled}
        aria-describedby={description ? `${id}-description` : undefined} onCheckedChange={onCheckedChange} />
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

function GeneralPreferences() {
  const t = useTranslations("student");
  const common = useTranslations("common");
  const experience = useStudentExperience();
  const { locale, setLocale, isPending, error } = useAppLocale();
  const { enabled: hapticsEnabled, setEnabled: setHapticsEnabled } = useHapticsPreference();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const hapticsSupported = mounted && isHapticsSupported();

  return (
    <div className="max-w-3xl space-y-(--section-gap)">
      <PreferenceGroup title={t("preferences.account")} description={t("preferences.languageScope")}>
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
      <AccountSessions />
      <PreferenceGroup title={t("preferences.device")} description={t("preferences.deviceScope")}>
        <PreferenceSwitch
          label={t("preferences.haptics")}
          description={!hapticsSupported ? t("preferences.hapticsUnavailable") : undefined}
          disabled={!hapticsSupported}
          checked={hapticsEnabled}
          onCheckedChange={setHapticsEnabled}
        />
        {experience.mode !== "demo" && (
          <div className="flex flex-col items-start gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-body-sm font-medium">{t("preferences.offlineReadings")}</p>
              <p className="mt-0.5 text-body-xs text-muted-foreground">{t("preferences.offlineReadingsDescription")}</p>
            </div>
            <Button asChild variant="outline" className="min-h-9">
              <Link href="/offline"><HardDriveDownload aria-hidden="true" />{t("preferences.manageReadings")}</Link>
            </Button>
          </div>
        )}
        {mounted && experience.mode !== "demo" && !isNativeApp() && (
          <div className="py-3">
            <Button asChild variant="outline" className="min-h-9">
              <Link href="/download"><Download aria-hidden="true" />{t("preferences.downloadApp")}<ArrowRight aria-hidden="true" /></Link>
            </Button>
          </div>
        )}
      </PreferenceGroup>
    </div>
  );
}

function DisplayPreferences() {
  const t = useTranslations("student");
  const common = useTranslations("common");
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { preferences, setPreference } = useAppearancePreferences();

  useEffect(() => setMounted(true), []);

  const activeTheme = mounted ? THEMES.find((option) => option === theme) ?? "system" : "system";
  const restoreDisplayDefaults = () => {
    setTheme("system");
    setPreference("background", DEFAULT_APPEARANCE_PREFERENCES.background);
    setPreference("animations", DEFAULT_APPEARANCE_PREFERENCES.animations);
    setPreference("density", DEFAULT_APPEARANCE_PREFERENCES.density);
    setPreference("fontSize", DEFAULT_APPEARANCE_PREFERENCES.fontSize);
    toast.success(t("preferences.displayRestored"));
  };

  return (
    <div className="max-w-3xl space-y-(--section-gap)">
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
        <PreferenceSwitch
          label={t("preferences.animations")}
          checked={preferences.animations}
          onCheckedChange={(checked) => setPreference("animations", checked)}
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

      <div className="border-t border-border/40 pt-3">
        <Button type="button" variant="outline" className="min-h-9" disabled={!mounted} onClick={restoreDisplayDefaults}>
          <RotateCcw aria-hidden="true" />{t("preferences.restoreDisplay")}
        </Button>
      </div>
    </div>
  );
}

function OnScreenAlertPreferences() {
  const t = useTranslations("student");
  const { preferences, setPreference } = useAppearancePreferences();
  return (
    <PreferenceGroup title={t("preferences.onScreenAlerts")} description={t("preferences.alertPositionScope")}>
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
  );
}

export function SettingsClient({
  profile,
  email,
  initialTab = "general",
}: {
  profile?: ReactNode;
  email?: ReactNode;
  initialTab?: SettingsTab | "email";
}) {
  const t = useTranslations("student");
  const common = useTranslations("common");
  const experience = useStudentExperience();
  const href = (path: string) => experience.href?.(path) ?? path;
  const [tab, setTab] = useUrlTab("tab", "general", resolveSettingsTab(initialTab));
  const activeTab = resolveSettingsTab(tab);

  return (
    <ApplicationPage>
      <PageHeader title={common("preferences")} />
      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList aria-label={common("preferences")}>
          <TabsTrigger value="general">{t("preferences.general")}</TabsTrigger>
          <TabsTrigger value="appearance">{t("preferences.appearance")}</TabsTrigger>
          <TabsTrigger value="notifications">{t("preferences.notifications")}</TabsTrigger>
          <TabsTrigger value="profile">{t("settings.profile")}</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="mt-3 sm:mt-6"><GeneralPreferences /></TabsContent>
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
        <TabsContent value="notifications" forceMount className="mt-3 max-w-3xl space-y-(--section-gap) data-[state=inactive]:hidden sm:mt-6">
          <OnScreenAlertPreferences />
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
