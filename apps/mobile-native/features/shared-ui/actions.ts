import type { ComponentProps } from "react";

import type { Button } from "../../components/Button";

type ButtonProps = ComponentProps<typeof Button>;
type ActionIcon = NonNullable<ButtonProps["renderIcon"]>;

export type SharedUiTheme = NonNullable<ButtonProps["theme"]>;

export type SharedUiAction<Id extends string = string> = {
  id: Id;
  label: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  pending?: boolean;
  variant?: ButtonProps["variant"];
} & (
  | { iconOnly: true; renderIcon: ActionIcon }
  | { iconOnly?: false; renderIcon?: ActionIcon }
);

export type SharedUiActionHandler<Id extends string> = (actionId: Id) => void;

export type SharedUiActionGroup<Id extends string> =
  | { actions?: undefined; onAction?: undefined }
  | { actions: readonly SharedUiAction<Id>[]; onAction: SharedUiActionHandler<Id> };
