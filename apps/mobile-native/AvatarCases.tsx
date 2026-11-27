import { useState } from "react";
import { View } from "react-native";

import { avatarPosition, invalidAvatarImage, type AvatarCaseSpec } from "../../packages/ui-parity/avatar-cases";
import { Avatar, type AvatarImageStatus } from "./components/Avatar";

const portrait: number = require("../../public/founders/adi.jpeg");
const sources = { portrait, invalid: invalidAvatarImage, none: undefined };

export function AvatarCase({ item }: { item: AvatarCaseSpec }) {
  const [status, setStatus] = useState<AvatarImageStatus>("idle");
  return (
    <View style={avatarPosition}>
      <Avatar
        accessibilityLabel={item.label}
        initials={item.initials}
        onLoadingStatusChange={setStatus}
        source={sources[item.source]}
        testID={`${item.id}-${status}`}
        theme={item.theme}
      />
    </View>
  );
}
