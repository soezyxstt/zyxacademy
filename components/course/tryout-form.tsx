"use client";

import { ViewportSwitch } from "@/components/navigation";
import {
  useTryoutForm,
  type AnswerState,
  type TryoutFormProps,
  type TryoutPresentationExam,
} from "@/features/student-assessment/model/use-tryout-draft";
import { TryoutSubmitConfirmDialog } from "@/features/student-assessment/ui/shared/tryout-form-parts";
import { TryoutFormDesktop } from "@/features/student-assessment/ui/desktop/tryout-form-desktop";
import { TryoutFormMobile } from "@/features/student-assessment/ui/mobile/tryout-form-mobile";

export type { AnswerState, TryoutPresentationExam };

/**
 * Shared tryout orchestrator lifting persistent draft state above ViewportSwitch
 * so answers, flags, and active question index survive 767px <-> 768px transitions.
 */
export function TryoutForm(props: TryoutFormProps) {
  const controller = useTryoutForm(props);

  if (controller.submitted || !controller.q) return null;

  return (
    <>
      <ViewportSwitch
        desktop={() => <TryoutFormDesktop props={props} controller={controller} />}
        mobile={() => <TryoutFormMobile props={props} controller={controller} />}
        fallback={<TryoutFormDesktop props={props} controller={controller} />}
      />
      <TryoutSubmitConfirmDialog controller={controller} />
    </>
  );
}
