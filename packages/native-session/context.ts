export type NativeAccountContext = Readonly<{
  accountId: string;
  sessionId: string;
  roles: readonly ("admin" | "tutor" | "murid")[];
  locale: "id" | "en";
  dashboard: "/admin" | "/tutor" | "/dashboard";
  display?: Readonly<{ name: string; email: string }>;
}>;
