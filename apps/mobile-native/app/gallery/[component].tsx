import { Redirect, useLocalSearchParams, useRouter } from "expo-router";

import { componentNames } from "../../../../packages/ui-parity/gallery";
import ParityGallery from "../../ParityGallery";

export default function GalleryRoute() {
  const { component } = useLocalSearchParams<{ component: string }>();
  const router = useRouter();
  const selected = componentNames.find((name) => name === component);
  if (!selected) return <Redirect href="/" />;
  return (
    <ParityGallery
      component={selected}
      onSelect={(name) => router.replace({ pathname: "/gallery/[component]", params: { component: name } })}
      onOpenCaptureMenu={process.env.EXPO_PUBLIC_PARITY_CAPTURE_NAVIGATION === "1"
        ? () => router.replace("/internal/parity-capture")
        : undefined}
    />
  );
}
