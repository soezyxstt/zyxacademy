import { sharedUiCases } from "./cases";

const components: ReadonlySet<string> = new Set([
  "compact-shell", "page-header", "responsive-list", "mobile-navbar", "bottom-navigation",
  "navigation-tabs", "shared-dialog", "shared-sheet", "shared-popover", "grid", "table", "calendar",
]);

export const sharedUiRelativeCases = sharedUiCases.filter(
  item => components.has(item.component) && item.id !== "shared-ui-list-wide-light",
);
