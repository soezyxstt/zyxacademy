import { Platform, Share } from "react-native";
import { createPublicLinkSharer } from "./share-links";

export type { PublicLinkInput, PublicLinkResult } from "./share-links";

export const sharePublicLink = createPublicLinkSharer({
  platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "unavailable",
  dismissedAction: Share.dismissedAction,
  share: (content, dialogTitle) => content.url
    ? Share.share({ ...content, url: content.url }, { dialogTitle })
    : Share.share({ ...content, message: content.message ?? "" }, { dialogTitle }),
});
