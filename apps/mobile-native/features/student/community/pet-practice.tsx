import { useEffect, useState } from "react";
import { Text } from "react-native";
import type { GamificationReward } from "../../../../../packages/native-parity/student/community/contracts";
import { cosmeticNameKeys } from "../../../../../packages/student-community/labels";
import { petPracticeRound } from "../../../../../packages/student-community/pet-practice";
import { DEFAULT_PET_ID, petSupportsAction } from "../../../../../packages/student-community/pet-studio";
import en from "../../../../../messages/en/student.json";
import id from "../../../../../messages/id/student.json";
import { SharedDialog } from "../../shared-ui/overlays";
import { PetViewer } from "../pet/PetViewer";
import { Action, Actions, Choices, Copy, useCommunity } from "./ui";

export function PetPractice({ rewards, onOpenChange }: { rewards: GamificationReward[]; onOpenChange?(open: boolean): void }) {
  const [open, setOpen] = useState(false);
  const { session, tr } = useCommunity();
  const labels = (session.locale === "en" ? en : id).achievementPage.rewardGroups;
  function change(value: boolean) { setOpen(value); onOpenChange?.(value); }
  return <>
    <Action label={labels.play} onPress={() => change(true)} />
    {open && <SharedDialog open title={labels.play} closeLabel={tr("Tutup", "Close")} onDismiss={() => change(false)}>
      <PracticeRound rewards={rewards} />
    </SharedDialog>}
  </>;
}

function PracticeRound({ rewards }: { rewards: GamificationReward[] }) {
  const { session } = useCommunity();
  const copy = session.locale === "en" ? en : id;
  const labels = copy.achievementPage.rewardGroups;
  const owned = rewards.filter(item => item.owned);
  const equipped = (slot: string) => owned.find(item => item.slot === slot && item.equipped)?.id;
  const [pet, setPet] = useState(equipped("zyra_avatar") ?? DEFAULT_PET_ID);
  const [suit, setSuit] = useState(equipped("pet_suit") ?? "none");
  const [action, setAction] = useState(equipped("pet_action") ?? "idle");
  const [round, setRound] = useState(petPracticeRound);
  const [score, setScore] = useState(0);
  const [miss, setMiss] = useState(false);
  const [cheering, setCheering] = useState(false);
  const petAction = petSupportsAction(pet, action) ? action : "idle";
  const options = (slot: string) => owned.filter(item => item.slot === slot && item.id !== DEFAULT_PET_ID &&
    (slot !== "pet_action" || petSupportsAction(pet, item.id))).map(item => ({
      value: item.id, label: (copy.gamificationUi as Record<string, string>)[cosmeticNameKeys[item.id]] ?? item.name,
    }));
  const pets = options("zyra_avatar"), suits = options("pet_suit"), actions = options("pet_action");
  useEffect(() => {
    if (!cheering) return;
    const timer = setTimeout(() => setCheering(false), 1500);
    return () => clearTimeout(timer);
  }, [cheering, score]);
  function answer(choice: number) {
    if (choice !== round.answer) { setMiss(true); return; }
    setMiss(false);
    setCheering(true);
    setScore(value => value + 1);
    setRound(petPracticeRound());
  }
  return <>
    <PetViewer pet={pet} suit={suit} action={petAction} pose={cheering ? "happy" : undefined} replay={score} />
    {pets.length > 0 && <Choices value={pet} onSelect={setPet} options={[{ value: DEFAULT_PET_ID, label: "Zyra" }, ...pets]} />}
    {suits.length > 0 && pet.startsWith("zyra-avatar-studio-") && <Choices value={suit} onSelect={setSuit}
      options={[{ value: "none", label: labels.plain }, ...suits]} />}
    {actions.length > 0 && <Choices value={petAction} onSelect={setAction} options={[{ value: "idle", label: labels.idle }, ...actions]} />}
    <Copy kind="heading">{round.left} × {round.right} = ?</Copy>
    <Actions>{round.choices.map(choice => <Action key={choice} label={String(choice)} onPress={() => answer(choice)} />)}</Actions>
    <Text accessibilityLiveRegion="polite"><Copy>{miss ? labels.retry + " · " : ""}{labels.correct} {score}</Copy></Text>
  </>;
}
