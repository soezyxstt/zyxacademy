"use client";

import { PawPrint } from "lucide-react";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { StudentPetStudio } from "@/components/gamification/student-pet-studio";
import { demoRewards } from "@/lib/demo/gamification";
import { useDemoGamification } from "./demo-gamification-provider";

export function DemoPet() {
  const { state, changeReward } = useDemoGamification();
  const rewards = demoRewards(state).filter(item => ["zyra_avatar", "pet_suit", "pet_action"].includes(item.slot));
  return <ApplicationPage>
    <PageHeader title="Pet" icon={PawPrint} />
    <StudentPetStudio rewards={rewards} balance={state.balance} onChangeReward={changeReward} />
  </ApplicationPage>;
}
