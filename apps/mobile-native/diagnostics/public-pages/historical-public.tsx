import type { Href } from "expo-router";
import { useState } from "react";
import { PixelRatio, Platform } from "react-native";
import { publicFormCases } from "../../../../packages/forms/parity-cases";
import { meetingCaseIds } from "../../../../packages/meet/parity-cases";
import { directoryCases, directoryFrame } from "../../../../packages/public-links/fixtures";
import { directoryReadyScript } from "../../features/parity/directory-ready";
import { MarkedPageFrame } from "../../features/parity/MarkedPageFrame";
import { Reference, referenceOrigin as origin } from "../../features/parity/WebViewReference";

export const publicCaptureSections: readonly {
  title: string;
  group: string;
  items: readonly { name: string; href: Href }[];
}[] = [
  {
    title: "Daftar tautan", group: "directory",
    items: Object.keys(directoryCases).map(caseId => ({
      name: caseId, href: { pathname: "/internal/public-links/[caseId]", params: { caseId } },
    })),
  },
  {
    title: "Formulir publik", group: "public-forms",
    items: Object.keys(publicFormCases).map(caseId => ({
      name: caseId, href: { pathname: "/internal/public-forms/[caseId]", params: { caseId, frame: "1" } },
    })),
  },
  {
    title: "Google Meet", group: "meet",
    items: meetingCaseIds.map(caseId => ({ name: caseId, href: { pathname: "/internal/meet/[caseId]", params: { caseId } } })),
  },
];

const directoryCaseIds = Object.keys(directoryCases) as (keyof typeof directoryCases)[];

export function publicDirectoryReference(component: string) {
  const directoryCase = directoryCaseIds.find(id => component === `directory-${id}`);
  if (Platform.OS !== "android" || !directoryCase || PixelRatio.get() !== 1 || PixelRatio.getFontScale() !== 1) return null;
  return <DirectoryReference key={directoryCase} caseId={directoryCase} />;
}

function DirectoryReference({ caseId }: { caseId: keyof typeof directoryCases }) {
  const [ready, setReady] = useState(false);
  const uri = `${origin}/tautan/${caseId}`;
  const message = `directory-ready:${caseId}`;
  return (
    <MarkedPageFrame
      frame={directoryFrame}
      index={directoryCaseIds.indexOf(caseId)}
      markerColor={ready ? "#00f292" : "transparent"}
    >
      <Reference
        uri={uri}
        injectedJavaScript={directoryReadyScript(uri, caseId, message)}
        onMessage={({ nativeEvent }) => {
          // Android can report either the bridge's source origin or the full page URL.
          if ((nativeEvent.url === origin || nativeEvent.url === uri) && nativeEvent.data === message) setReady(true);
        }}
        onFailed={() => setReady(false)}
      />
    </MarkedPageFrame>
  );
}
