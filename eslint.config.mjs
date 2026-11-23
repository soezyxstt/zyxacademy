import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/set-state-in-effect": "off",
      "@typescript-eslint/no-require-imports": "off",
      "prefer-const": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
    }
  },
  // Enforce mobile/desktop UI separation boundaries under features/*/ui/{mobile,desktop}.
  {
    files: ["features/*/ui/mobile/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/db",
              message: "UI files must not import @/db directly. Move data access and types to features/*/data/ or features/*/model/.",
            },
            {
              name: "@/components/admin/table",
              message: "Mobile UI must not import desktop-only table primitives.",
            },
            {
              name: "@/components/ui/table",
              message: "Mobile UI must not import desktop-only table primitives.",
            },
            {
              name: "@/components/sidebar-shell",
              message: "Mobile UI must not import desktop-only sidebar primitives.",
            },
            {
              name: "@/components/navigation/desktop-sidebar-shell",
              message: "Mobile UI must not import desktop-only sidebar primitives.",
            },
            {
              name: "@/components/student-sidebar",
              message: "Mobile UI must not import desktop-only sidebar primitives.",
            },
            {
              name: "@/components/admin-sidebar",
              message: "Mobile UI must not import desktop-only sidebar primitives.",
            },
            {
              name: "@/components/tutor/tutor-sidebar",
              message: "Mobile UI must not import desktop-only sidebar primitives.",
            },
          ],
          patterns: [
            {
              group: [
                "@/features/*/ui/desktop",
                "@/features/*/ui/desktop/*",
                "**/ui/desktop",
                "**/ui/desktop/*",
                "../desktop",
                "../desktop/*",
                "../../desktop",
                "../../desktop/*",
              ],
              message: "Mobile UI must not import from desktop UI. Move shared UI to features/*/ui/shared/ or shared logic to model/ or data/.",
            },
            {
              group: [
                "@/db/*",
                "@/components/admin/table/*",
                "@/components/ui/table/*",
                "@/components/sidebar-shell/*",
                "@/components/navigation/desktop-sidebar-shell/*",
                "@/components/student-sidebar/*",
                "@/components/admin-sidebar/*",
                "@/components/tutor/tutor-sidebar/*",
              ],
              message: "Mobile UI must not import @/db or desktop-only primitives.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["features/*/ui/desktop/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/db",
              message: "UI files must not import @/db directly. Move data access and types to features/*/data/ or features/*/model/.",
            },
          ],
          patterns: [
            {
              group: [
                "@/features/*/ui/mobile",
                "@/features/*/ui/mobile/*",
                "**/ui/mobile",
                "**/ui/mobile/*",
                "../mobile",
                "../mobile/*",
                "../../mobile",
                "../../mobile/*",
              ],
              message: "Desktop UI must not import from mobile UI. Move shared UI to features/*/ui/shared/ or shared logic to model/ or data/.",
            },
            {
              group: ["@/db/*"],
              message: "UI files must not import @/db directly. Move data access and types to features/*/data/ or features/*/model/.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "**/.next/**",
    ".claude/**",
    "out/**",
    "build/**",
    "artifacts/**",
    ".temp/**",
    "dist/**",
    "next-env.d.ts",
    "tests/**",
    "apps/**",
    "**/*.test.*",
    "**/*.spec.*",
  ]),
]);

export default eslintConfig;
