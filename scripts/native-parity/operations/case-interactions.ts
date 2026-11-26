// These commands run only against the offline fixture deep link on an installed build.
import en from "../../../messages/en/marketing.json";
import id from "../../../messages/id/marketing.json";
import notices from "../../../messages/id/notifications.json";

type Selector = { id: string } | { text: string };

function tap(selector: Selector, centerElement = false) {
  return [
    { scrollUntilVisible: { element: selector, timeout: 20000, speed: 65, centerElement } },
    { tapOn: selector },
  ];
}

function fill(field: string, value: string) {
  return [
    ...tap({ id: "public-form-" + field }),
    { inputText: value },
    "hideKeyboard",
  ];
}

const retry = { id: "public-retry" };
const submit = { id: "public-form-submit" };
const confirm = { id: "public-unsubscribe-confirm" };

export function caseInteractions(caseId: string): unknown[] {
  switch (caseId) {
    case "operations-public-form-validation":
      return [...tap(submit), { assertVisible: "Form validation failed. Please check the fields." }];
    case "operations-public-form-local-submit":
      return [
        ...fill("fullName", "Pengguna Fixture"),
        ...fill("email", "learner@example.test"),
        ...tap({ id: "public-form-age" }),
        { inputText: "21" },
        { runFlow: { when: { platform: "iOS" }, commands: [{ tapOn: "Done" }] } },
        { runFlow: { when: { platform: "Android" }, commands: ["hideKeyboard"] } },
        ...fill("password", "Practice2026"),
        ...tap({ text: "Select subject" }),
        ...tap({ text: "TPB Kalkulus I" }),
        ...tap({ id: "public-form-choose-files" }, true),
        { scrollUntilVisible: { element: { text: "latihan\\.pdf" }, timeout: 20000 } },
        ...tap({ id: "public-form-agreement" }),
        ...tap(submit),
        { extendedWaitUntil: { visible: "Profile registration successful.", timeout: 10000 } },
      ];
    case "operations-public-plans-course-limits":
      return [
        ...tap({ text: "Course list .*" }),
        ...tap({ text: en.plans.decreaseCourses }),
        ...tap({ text: en.plans.decreaseCourses }),
        { assertVisible: { text: en.plans.decreaseCourses, enabled: false } },
      ];
    case "operations-public-unsubscribe-confirm":
      return [...tap(confirm), { assertVisible: notices.email.unsubscribe.successTitle }];
    case "operations-public-unsubscribe-retry":
      return [
        ...tap(retry), ...tap(confirm),
        { assertVisible: id.home.quizTryAgain },
        ...tap(confirm), { assertVisible: notices.email.unsubscribe.successTitle },
      ];
    case "operations-public-blog-detail-retry":
    case "operations-public-blog-list-retry":
    case "operations-public-demo-retry":
    case "operations-public-download-retry":
      return [...tap(retry), { assertNotVisible: retry }];
    case "operations-public-plans-retry":
      return [
        ...tap(retry),
        { extendedWaitUntil: { visible: "Rp 390\\.000 / orang", timeout: 10000 } },
        { assertVisible: "Diskon 40%" },
        { assertNotVisible: retry },
      ];
    default:
      return [];
  }
}
