"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "@/lib/i18n/client";
import { updateStudentSocialSettingsAction } from "@/lib/gamification/social-actions";
import { equipProfileCosmetics } from "@/app/(student)/profile/edit/cosmetic-actions";
import type { StudentSocialSettings } from "@/lib/gamification/social-contracts";
import type { AchievementBadge, GamificationReward, CosmeticSlot } from "@/lib/gamification/contracts";
import { cosmeticNameKeys } from "@/lib/gamification/labels";
import { COSMETIC_FIELDS } from "@/lib/gamification/cosmetic-slots";
import { ZyraMascot3D } from "./zyra-mascot-3d";
import { StudentAvatar } from "./student-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectField } from "@/components/ui/select-field";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const profileFields = COSMETIC_FIELDS.filter(field => field.slot !== "pet_action" && field.slot !== "pet_suit");

export function ProfileSettings({ initial, badges, rewards, name, image, academicForm }: { initial: StudentSocialSettings; badges: AchievementBadge[]; rewards: GamificationReward[]; name: string; image: string | null; academicForm?: ReactNode }) {
 const t = useTranslations("student"); const router = useRouter();
 const [settings, setSettings] = useState(initial);
 const [pending, start] = useTransition();
 const [result, setResult] = useState<{ section: "privacy" | "appearance"; error: boolean } | null>(null);
 const [equipped, setEquipped] = useState<Record<CosmeticSlot, string>>(Object.fromEntries(profileFields.map(({slot}) => [slot, rewards.find(x => x.equipped && x.slot === slot)?.id ?? "none"])) as Record<CosmeticSlot, string>);
 const earned = badges.filter(x => x.tier > 0);
 const save = (section: "privacy" | "appearance") => {
  setResult(null);
  start(async () => {
   try {
    if (section === "privacy") {
     const { publicId: _id, ...input } = settings;
     await updateStudentSocialSettingsAction({ ...input, displayName: input.displayName?.trim() || null });
    } else {
     await equipProfileCosmetics(Object.fromEntries(profileFields.map(field => [field.input, equipped[field.slot] === "none" ? null : equipped[field.slot]])));
    }
    setResult({ section, error: false }); router.refresh();
   } catch { setResult({ section, error: true }); }
  });
 };
 const feedback = (section: "privacy" | "appearance") => result?.section === section && <p role={result.error ? "alert" : "status"} className={`text-body-xs ${result.error ? "text-status-error" : "text-status-success"}`}>{t(result.error ? "profile.saveFailed" : "profileCustomization.saved")}</p>;
 const rewardOptions = (slot: CosmeticSlot) => [{ value: "none", label: t("profileCustomization.none") }, ...rewards.filter(item => item.owned && item.slot === slot).map(item => ({ value: item.id, label: cosmeticNameKeys[item.id] ? t(`gamificationUi.${cosmeticNameKeys[item.id]}`) : item.name }))];

 return <div className="space-y-(--group-gap)">
  <div className="flex items-center gap-(--related-gap) border-b pb-(--group-gap)">
   <StudentAvatar name={settings.displayName || name} image={image} size={88} frameId={equipped.frame === "none" ? null : equipped.frame} themeId={equipped.theme} />
   <div className="min-w-0 space-y-1"><p className="break-words font-heading text-body-base font-bold">{settings.displayName || name}</p><p className="text-body-xs text-muted-foreground">{t("profileCustomization.photoSource")}</p></div>
  </div>
  <Tabs defaultValue={academicForm ? "academic" : "privacy"} paramKey="section">
   <TabsList aria-label={t("profile.editTitle")}>
    {academicForm && <TabsTrigger value="academic">{t("profileCustomization.academicTab")}</TabsTrigger>}
    <TabsTrigger value="privacy">{t("profileCustomization.privacyTab")}</TabsTrigger>
    <TabsTrigger value="appearance">{t("profileCustomization.appearanceTab")}</TabsTrigger>
   </TabsList>
   {academicForm && <TabsContent value="academic" forceMount className="data-[state=inactive]:hidden">{academicForm}</TabsContent>}
   <TabsContent value="privacy" forceMount className="data-[state=inactive]:hidden">
    <form onSubmit={event => { event.preventDefault(); save("privacy"); }} className="space-y-(--group-gap)">
     <h2 className="font-heading text-body-base font-bold">{t("profileCustomization.identity")}</h2>
     <fieldset disabled={pending} className="grid min-w-0 gap-(--group-gap) md:grid-cols-2">
      <div className="space-y-2"><label htmlFor="profile-display-name" className="text-body-sm font-semibold">{t("profileCustomization.displayName")}</label><Input id="profile-display-name" maxLength={80} placeholder={name} aria-describedby="profile-name-help" value={settings.displayName ?? ""} onChange={event => { setResult(null); setSettings({ ...settings, displayName: event.target.value || null }); }} /><p id="profile-name-help" className="text-body-xs text-muted-foreground">{t("profileCustomization.nameFallback")}</p></div>
      <SelectField label={t("profileCustomization.visibility")} value={settings.visibility} onValueChange={value => { setResult(null); setSettings({ ...settings, visibility: value as "private" | "members" }); }} options={[{value:"private",label:t("profileCustomization.private")},{value:"members",label:t("profileCustomization.members")}]} />
      <div className="space-y-(--related-gap)">{(["showMajor", "showFaculty", "allowFollows", "leaderboardOptIn"] as const).map(key => <label key={key} className="flex items-center gap-2 text-body-sm"><Checkbox checked={settings[key]} onCheckedChange={checked => { setResult(null); setSettings({ ...settings, [key]: checked === true }); }} />{t(`profileCustomization.${key}`)}</label>)}<p className="text-body-xs text-muted-foreground">{t("profileCustomization.privacyEffect")}</p></div>
      <fieldset className="space-y-(--compact-gap)"><legend className="mb-2 text-body-sm font-semibold">{t("profileCustomization.featured")}</legend>{earned.length === 0 && <p className="text-body-xs text-muted-foreground">{t("profileCustomization.noBadges")}</p>}{earned.map(item => <label key={item.family} className="flex items-center gap-2 text-body-sm"><Checkbox checked={settings.featuredBadgeIds.includes(item.family)} disabled={!settings.featuredBadgeIds.includes(item.family) && settings.featuredBadgeIds.length >= 3} onCheckedChange={checked => { setResult(null); setSettings({ ...settings, featuredBadgeIds: checked ? [...settings.featuredBadgeIds, item.family] : settings.featuredBadgeIds.filter(id => id !== item.family) }); }} />{t(`profileCustomization.families.${item.family}`)}</label>)}</fieldset>
     </fieldset>
     <div className="flex flex-wrap items-center gap-(--compact-gap) border-t pt-(--related-gap)"><Button type="submit" disabled={pending}>{pending ? t("profile.saving") : t("profileCustomization.savePrivacy")}</Button>{feedback("privacy")}</div>
    </form>
   </TabsContent>
   <TabsContent value="appearance" forceMount className="data-[state=inactive]:hidden">
    <form onSubmit={event => { event.preventDefault(); save("appearance"); }} className="space-y-(--group-gap)">
     <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-heading text-body-base font-bold">{t("profileCustomization.appearanceTab")}</h2><Button asChild variant="outline" size="sm"><Link href="/achievements?tab=rewards">{t("profileCustomization.getCosmetics")}</Link></Button></div>
     <fieldset disabled={pending} className="grid min-w-0 gap-(--group-gap) sm:grid-cols-2">
      {profileFields.map(({slot}) => <SelectField key={slot} label={t(`profileCustomization.${slot}`)} value={equipped[slot]} onValueChange={value => { setResult(null); setEquipped({ ...equipped, [slot]: value }); }} options={rewardOptions(slot)} />)}
     </fieldset>
     <p className="text-body-xs text-muted-foreground">{t("profileCustomization.ownedOnly")}</p>
     {equipped.zyra_avatar !== "none" && <div className="flex justify-center"><ZyraMascot3D cosmeticId={equipped.zyra_avatar} size={240} /></div>}
     <div className="flex flex-wrap items-center gap-(--compact-gap) border-t pt-(--related-gap)"><Button type="submit" disabled={pending}>{pending ? t("profile.saving") : t("profileCustomization.saveAppearance")}</Button>{feedback("appearance")}</div>
    </form>
   </TabsContent>
  </Tabs>
 </div>;
}
