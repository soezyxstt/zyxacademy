import type {
  NativeListState,
  NativePageHeaderProps,
  SharedUiAction,
  SharedUiActionHandler,
} from "./index";

type Assert<Condition extends true> = Condition;
type Reject<Actual, Expected> = Actual extends Expected ? false : true;
type ActionId = "filter" | "retry";
type Row = { id: string };

export type LayoutContractChecks = [
  Assert<Reject<{ id: "unregistered"; label: string }, SharedUiAction<ActionId>>>,
  Assert<Reject<{ id: "filter"; label: string; iconOnly: true }, SharedUiAction<ActionId>>>,
  Assert<Reject<{ actions: SharedUiAction<ActionId>[] }, NativePageHeaderProps<ActionId>>>,
  Assert<Reject<{
    status: "error";
    title: string;
    action: SharedUiAction<ActionId>;
  }, NativeListState<Row, ActionId>>>,
  Assert<Reject<{
    status: "ready";
    rows: readonly { title: string }[];
  }, NativeListState<Row, ActionId>>>,
  Assert<Parameters<SharedUiActionHandler<ActionId>>[0] extends ActionId ? true : false>,
];
