import { useState } from "react";
import { Text } from "react-native";
import { petPracticeRound } from "../../../../../packages/student-community/pet-practice";
import en from "../../../../../messages/en/student.json";
import id from "../../../../../messages/id/student.json";
import { SharedDialog } from "../../shared-ui/overlays";
import { Action, Actions, Copy, useCommunity } from "./ui";

export function PetPractice() {
  const [open, setOpen] = useState(false);
  const { session, tr } = useCommunity();
  const labels = (session.locale === "en" ? en : id).achievementPage.rewardGroups;
  return <>
    <Action label={labels.play} onPress={() => setOpen(true)} />
    {open && <SharedDialog open title={labels.play} closeLabel={tr("Tutup", "Close")} onDismiss={() => setOpen(false)}>
      <PracticeRound labels={labels} />
    </SharedDialog>}
  </>;
}

function PracticeRound({ labels }: { labels: typeof id.achievementPage.rewardGroups }) {
  const [round, setRound] = useState(petPracticeRound);
  const [score, setScore] = useState(0);
  const [miss, setMiss] = useState(false);
  function answer(choice: number) {
    if (choice !== round.answer) { setMiss(true); return; }
    setMiss(false);
    setScore(value => value + 1);
    setRound(petPracticeRound());
  }
  return <>
    <Copy kind="heading">{round.left} × {round.right} = ?</Copy>
    <Actions>{round.choices.map(choice => <Action key={choice} label={String(choice)} onPress={() => answer(choice)} />)}</Actions>
    <Text accessibilityLiveRegion="polite"><Copy>{miss ? labels.retry + " · " : ""}{labels.correct} {score}</Copy></Text>
  </>;
}
