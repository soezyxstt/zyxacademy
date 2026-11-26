import type { Href } from "expo-router";
import type { ReactElement } from "react";

// The hosted diagnostic build replaces these defaults with the archived fixtures.
export const publicCaptureSections: readonly {
  title: string;
  group: string;
  items: readonly { name: string; href: Href }[];
}[] = [];

export function publicDirectoryReference(_component: string): ReactElement | null {
  return null;
}
