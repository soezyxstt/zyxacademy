"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/client";
import { updateStudentSocialSettingsAction } from "@/lib/gamification/social-actions";
import { equipProfileCosmetics } from "@/app/(student)/profile/edit/cosmetic-actions";
import type { StudentSocialSettings } from "@/lib/gamification/social-contracts";
import type { AchievementBadge, GamificationReward, CosmeticSlot } from "@/lib/gamification/contracts";
import { cosmeticNameKeys } from "@/lib/gamification/labels";
import { COSMETIC_FIELDS } from "@/lib/gamification/cosmetic-slots";
import { ZyraMascot3D } from "./zyra-mascot-3d";
import { CosmeticPreview } from "./cosmetic-preview";
import { StudentAvatar } from "./student-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectField } from "@/components/ui/select-field";

export function ProfileSettings({ initial, badges, rewards, name, image }: { initial: StudentSocialSettings; badges: AchievementBadge[]; rewards: GamificationReward[]; name: string; image: string | null }) {
 const t = useTranslations("student"); const router = useRouter();
 const [settings, setSettings] = useState(initial); const [pending, start] = useTransition(); const [message, setMessage] = useState("");
 const [equipped, setEquipped] = useState<Record<CosmeticSlot, string>>(Object.fromEntries(COSMETIC_FIELDS.map(({slot}) => [slot, rewards.find(x => x.equipped && x.slot === slot)?.id ?? "none"])) as Record<CosmeticSlot, string>);
 const earned = badges.filter(x => x.tier > 0);
 const save = () => start(async () => { try { const { publicId: _id, ...input } = settings; await updateStudentSocialSettingsAction(input); await equipProfileCosmetics(Object.fromEntries(COSMETIC_FIELDS.map(field => [field.input, equipped[field.slot] === "none" ? null : equipped[field.slot]]))); setMessage(t("profileCustomization.saved")); router.refresh(); } catch { setMessage(t("profile.saveFailed")); } });
 return <section className="max-w-2xl space-y-5 rounded-xl border bg-card p-4"><h2 className="font-heading text-body-base font-bold">{t("profileCustomization.identity")}</h2>
 <div className="flex items-center gap-5"><StudentAvatar name={settings.displayName || name} image={image} size={112} frameId={equipped.frame} themeId={equipped.theme} /><span className="text-body-sm font-semibold">{settings.displayName || name}</span></div>
 <label className="block space-y-1 text-body-sm font-semibold">{t("profileCustomization.displayName")}<Input maxLength={80} value={settings.displayName ?? ""} onChange={e => setSettings({ ...settings, displayName: e.target.value || null })} /></label>
 <SelectField label={t("profileCustomization.visibility")} value={settings.visibility} onValueChange={value => setSettings({ ...settings, visibility: value as "private" | "members" })} options={[{value:"private",label:t("profileCustomization.private")},{value:"members",label:t("profileCustomization.members")}]} />
 {(["showMajor", "showFaculty", "allowFollows", "leaderboardOptIn"] as const).map(key => <label key={key} className="flex items-center gap-2 text-body-sm"><Checkbox checked={settings[key]} onCheckedChange={checked => setSettings({ ...settings, [key]: checked === true })} />{t(`profileCustomization.${key}`)}</label>)}
 <fieldset className="space-y-2"><legend className="text-body-sm font-semibold">{t("profileCustomization.featured")}</legend>{earned.length === 0 && <p className="text-body-xs text-muted-foreground">{t("profileCustomization.noBadges")}</p>}{earned.map(x => <label key={x.family} className="flex items-center gap-2 text-body-sm"><Checkbox checked={settings.featuredBadgeIds.includes(x.family)} disabled={!settings.featuredBadgeIds.includes(x.family) && settings.featuredBadgeIds.length >= 3} onCheckedChange={checked => setSettings({ ...settings, featuredBadgeIds: checked ? [...settings.featuredBadgeIds, x.family] : settings.featuredBadgeIds.filter(id => id !== x.family) })} />{t(`profileCustomization.families.${x.family}`)}</label>)}</fieldset>
 <fieldset className="space-y-3"><legend className="text-body-sm font-semibold">{t("profileCustomization.yourFrame")}</legend>
 <div className="flex flex-wrap gap-2">{[{ id: "none", name: t("profileCustomization.clearFrame") }, ...rewards.filter(x => x.owned && x.slot === "frame").map(x => ({ id: x.id, name: cosmeticNameKeys[x.id] ? t(`gamificationUi.${cosmeticNameKeys[x.id]}`) : x.name }))].map(frame => <Button key={frame.id} type="button" variant="outline" aria-pressed={equipped.frame === frame.id} onClick={() => setEquipped({ ...equipped, frame: frame.id })} className={`h-auto min-w-24 flex-col gap-2 p-3 ${equipped.frame === frame.id ? "border-primary bg-muted" : ""}`}><StudentAvatar name={settings.displayName || name} image={image} frameId={frame.id === "none" ? null : frame.id} themeId={equipped.theme} /><span>{frame.name}</span></Button>)}</div></fieldset>
 {(["theme", "title"] as const).map(slot => <SelectField key={slot} label={t(`profileCustomization.${slot}`)} value={equipped[slot]} onValueChange={value => setEquipped({ ...equipped, [slot]: value })} options={[{value:"none",label:t("profileCustomization.none")}, ...rewards.filter(x => x.owned && x.slot === slot).map(x => ({value:x.id,label:cosmeticNameKeys[x.id] ? t(`gamificationUi.${cosmeticNameKeys[x.id]}`) : x.name}))]} />)}
 {(["zyra_skin", "zyra_avatar"] as const).map(slot => <fieldset key={slot} className="space-y-2"><legend className="text-body-sm font-semibold">{t(`profileCustomization.${slot}`)}</legend><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" aria-pressed={equipped[slot] === "none"} onClick={() => setEquipped({...equipped, [slot]: "none"})}>{t("profileCustomization.none")}</Button>{rewards.filter(item => item.owned && item.slot === slot).map(item => <Button key={item.id} type="button" variant="outline" className={`h-auto flex-col gap-2 p-3 ${equipped[slot] === item.id ? "border-primary bg-muted" : ""}`} aria-pressed={equipped[slot] === item.id} onClick={() => setEquipped({...equipped, [slot]: item.id})}><CosmeticPreview item={item} appearance={{name, image}} /><span>{cosmeticNameKeys[item.id] ? t(`gamificationUi.${cosmeticNameKeys[item.id]}`) : item.name}</span></Button>)}</div></fieldset>)}
 {equipped.zyra_avatar !== "none" && <div className="flex justify-center"><ZyraMascot3D cosmeticId={equipped.zyra_avatar} size={240} /></div>}
 <Button disabled={pending} onClick={save}>{pending ? t("profile.saving") : t("profileCustomization.save")}</Button>{message && <p role="status" className="text-body-xs">{message}</p>}</section>;
}
