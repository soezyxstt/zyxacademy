import { useState } from "react";
import { Image, View } from "react-native";
import { cosmeticNameKeys } from "../../../../../packages/student-community/labels";
import { DEFAULT_PET_ID, petForAction, petSupportsAction } from "../../../../../packages/student-community/pet-studio";
import { getZyraAvatar } from "../../../../../packages/student-community/zyra-cosmetics";
import { getZyraGlbMascot } from "../../../../../packages/student-community/zyra-glb-mascots";
import en from "../../../../../messages/en/student.json";
import id from "../../../../../messages/id/student.json";
import type { AchievementData, AchievementTab, Badge, CosmeticSlot, GamificationReward, GamificationSummary, PetData } from "../../../../../packages/native-parity/student/community/contracts";
import { Action, Actions, Choices, Copy, Notice, Page, Remote, Row, Rows, communityPath, dateLabel, operationResult, post, styles, useCommunity, useOperation, useRemote } from "./ui";

const tabs = ["overview", "badges", "missions", "rewards"] as const;
const petSlots = ["zyra_avatar", "pet_suit", "pet_action"] as const;
const freePet: GamificationReward = { id: DEFAULT_PET_ID, name: "Zyra", slot: "zyra_avatar", priceLp: 0, owned: true, equipped: true };

export function localizedReward(item: GamificationReward, locale: string) {
  const labels = (locale === "en" ? en : id).gamificationUi as Record<string, string>;
  return labels[cosmeticNameKeys[item.id]] ?? item.name;
}

export function BadgeRows({ badges, collectedOnly = false }: { badges: Badge[]; collectedOnly?: boolean }) {
  const { tr, session } = useCommunity();
  const labels = (session.locale === "en" ? en : id).profileCustomization.families;
  const display = badges.filter(badge => !collectedOnly || badge.tier > 0);
  return display.length ? <Rows>{display.map(badge => <Row key={badge.family} title={labels[badge.family]}
    meta={badge.nextThreshold !== null ? `${badge.count} / ${badge.nextThreshold}` : String(badge.count)}
    aside={badge.tier > 0 ? `${tr("Tingkat", "Tier")} ${badge.tier}` : tr("Terkunci", "Locked")} />)}</Rows>
    : <Copy kind="muted">{tr("Belum ada lencana.", "No badges yet.")}</Copy>;
}

export function RankSummary({ summary }: { summary: GamificationSummary }) {
  const { tr, session } = useCommunity();
  const format = new Intl.NumberFormat(session.locale, { maximumFractionDigits: 1 });
  return <Rows>
    <Row title={tr("Pangkat", "Rank")} aside={summary.rankKey.charAt(0).toUpperCase() + summary.rankKey.slice(1)} />
    <Row title="XP" aside={format.format(summary.baseXpMicro / 1e6)} />
    <Row title={tr("XP bonus", "Bonus XP")} aside={format.format(summary.bonusXpMicro / 1e6)} />
    <Row title={tr("Kredit kursus", "Course credits")} aside={format.format(summary.courseCreditsMicro / 1e6)} />
    <Row title={tr("Saldo LP", "LP balance")} aside={format.format(summary.lpBalance)} />
  </Rows>;
}

function Mascot({ id: mascotId }: { id: string }) {
  const { session } = useCommunity();
  const item = getZyraAvatar(mascotId);
  const [failed, setFailed] = useState<string>();
  if (!item) return null;
  const artwork = getZyraGlbMascot(item.glbCharacter)?.poster ?? item.src;
  if (failed === artwork) return <Copy kind="strong">{session.locale === "en" ? item.name.en : item.name.id}</Copy>;
  return <Image style={{ width: 186, height: 186, alignSelf: "center" }} source={{ uri: new URL(artwork, session.origin).href }}
    onError={() => setFailed(artwork)} resizeMode="contain" accessibilityLabel={session.locale === "en" ? item.name.en : item.name.id} accessible />;
}

export function RewardRows({ rewards, balance, refresh, pet }: { rewards: GamificationReward[]; balance: number; refresh(): void; pet?: string }) {
  const { request, session, tr } = useCommunity();
  const operation = useOperation();
  const [purchase, setPurchase] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const run = (item: GamificationReward, action: "buy" | "equip" | "remove") => void operation.run(async () => {
    operationResult(await post(request, "reward", { id: item.id, operation: action, slot: item.slot }));
    setPurchase(null);
    refresh();
  }, tr("Koleksi diperbarui.", "Collection updated."));
  return <>
    <Notice notice={operation.notice} />
    {!rewards.length && <Copy kind="muted">{tr("Belum ada item.", "No items yet.")}</Copy>}
    <Rows>{rewards.map(item => {
      const name = localizedReward(item, session.locale);
      const removable = item.equipped && (item.slot === "pet_suit" || item.slot === "pet_action");
      const incompatible = pet && item.slot === "pet_action" && !petSupportsAction(pet, item.id);
      const requiredPet = incompatible ? getZyraAvatar(petForAction(item.id)) : null;
      const meta = item.equipped ? tr("Dipakai", "Equipped") : item.owned ? tr("Dimiliki", "Owned") : `${item.priceLp} LP`;
      return <Row key={item.id} title={name} meta={meta}>
        {requiredPet && <Copy kind="muted">{tr("Untuk", "For")} {session.locale === "en" ? requiredPet.name.en : requiredPet.name.id}</Copy>}
        {preview === item.id && <Mascot id={item.id} />}
        {purchase === item.id
          ? <><Copy>{tr("Beli", "Buy")} {name} · {item.priceLp} LP</Copy><Actions>
              <Action label={tr("Konfirmasi pembelian", "Confirm purchase")} mode="default" busy={operation.pending} onPress={() => run(item, "buy")} />
              <Action label={tr("Batal", "Cancel")} disabled={operation.pending} onPress={() => setPurchase(null)} />
            </Actions></>
          : <Actions>
            {pet && item.slot === "zyra_avatar" && <Action label={preview === item.id ? tr("Tutup pratinjau", "Close preview") : tr("Pratinjau", "Preview")}
              onPress={() => setPreview(preview === item.id ? null : item.id)} />}
            {!item.owned && <Action label={balance < item.priceLp ? tr("LP belum cukup", "Insufficient LP") : tr("Beli", "Buy")}
              mode="default" disabled={operation.pending || balance < item.priceLp} onPress={() => setPurchase(item.id)} />}
            {item.owned && !item.equipped && <Action label={tr("Pakai", "Equip")} disabled={operation.pending || Boolean(incompatible)} onPress={() => run(item, "equip")} />}
            {removable && <Action label={tr("Lepas", "Remove")} disabled={operation.pending} onPress={() => run(item, "remove")} />}
          </Actions>}
      </Row>;
    })}</Rows>
  </>;
}

export function AchievementsScreen() {
  const { navigate, route, session, tr } = useCommunity();
  const raw = route.query.tab as AchievementTab;
  const tab = tabs.includes(raw) ? raw : "overview";
  const labels = (session.locale === "en" ? en : id).achievementPage;
  const state = useRemote<AchievementData>(communityPath("achievements", { tab }));
  return <Page title={tr("Pencapaian", "Achievements")}>
    <Choices value={tab} options={tabs.map(value => ({ value, label: labels[value] }))} onSelect={value => navigate(`/achievements?tab=${value}`)} />
    <Remote state={state}>{data => <>
      {tab === "overview" && data.summary && <><RankSummary summary={data.summary} />
        <Copy kind="heading">{tr("Papan lencana", "Badge board")}</Copy><BadgeRows badges={data.badges} collectedOnly /></>}
      {tab === "badges" && <BadgeRows badges={data.badges} />}
      {tab === "missions" && (data.missions.length ? <Rows>{data.missions.map(mission => {
        const title = labels.mission[mission.kind as keyof typeof labels.mission] ?? labels.mission.unknown;
        const date = dateLabel(mission.endsAt, session.locale);
        return <Row key={mission.id} title={title} meta={mission.completedAt ? labels.complete : `${mission.progress} / ${mission.target} · ${date}`}
          aside={`${mission.rewardLp} LP`} />;
      })}</Rows> : <Copy kind="muted">{labels.noMissions}</Copy>)}
      {tab === "rewards" && data.summary && <><Copy>{labels.balance} {data.summary.lpBalance} LP</Copy>
        <RewardRows rewards={data.rewards} balance={data.summary.lpBalance} refresh={state.reload} /></>}
    </>}</Remote>
  </Page>;
}

export function PetScreen() {
  const { tr } = useCommunity();
  const [slot, setSlot] = useState<CosmeticSlot>("zyra_avatar");
  const state = useRemote<PetData>(communityPath("pet"));
  return <Page title={tr("Studio peliharaan", "Pet studio")}>
    <Remote state={state}>{data => {
      const active = data.items.find(item => item.slot === "zyra_avatar" && item.equipped)?.id ?? DEFAULT_PET_ID;
      const collection = data.items.some(item => item.id === DEFAULT_PET_ID) ? data.items : [freePet, ...data.items];
      const labels = { zyra_avatar: tr("Peliharaan", "Pets"), pet_suit: tr("Pakaian", "Outfits"), pet_action: tr("Aksi", "Actions") };
      return <>
        <View style={styles.block}><Mascot id={active} /></View>
        <Copy kind="heading">{tr("Koleksi", "Collection")}</Copy>
        <Copy>{tr("Saldo", "Balance")} {data.summary.lpBalance} LP</Copy>
        <Choices value={slot as typeof petSlots[number]} options={petSlots.map(value => ({ value, label: labels[value] }))} onSelect={setSlot} />
        <RewardRows key={slot} balance={data.summary.lpBalance} rewards={collection.filter(item => item.slot === slot).map(item =>
          slot === "zyra_avatar" ? { ...item, equipped: item.id === active } : item)} refresh={state.reload} pet={active} />
      </>;
    }}</Remote>
  </Page>;
}
