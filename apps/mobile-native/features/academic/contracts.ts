export type AcademicActor = { id: string; role: "tutor" | "admin" | "student" };
export type AcademicScenario = "populated" | "empty" | "error";

export interface AcademicScreenProps {
  path: string;
  params: Readonly<Record<string, string>>;
  query: Readonly<Record<string, string>>;
  navigate(path: string): void;
  replace(path: string): void;
  back(): void;
  actor: AcademicActor;
  scenario: AcademicScenario;
  theme: "light" | "dark";
}
