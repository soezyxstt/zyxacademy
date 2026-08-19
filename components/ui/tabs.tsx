"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { useUrlTab } from "@/hooks/use-url-tab";

type TabsProps = React.ComponentProps<typeof TabsPrimitive.Root> & {
  paramKey?: string;
  syncUrl?: boolean;
};

function TabsInner({
  value,
  onValueChange,
  defaultValue,
  paramKey = "tab",
  syncUrl = true,
  className,
  ...props
}: TabsProps) {
  const isControlled = value !== undefined && onValueChange !== undefined;

  const [urlTab, setUrlTab] = useUrlTab(
    paramKey,
    typeof defaultValue === "string" ? defaultValue : "default"
  );

  const activeValue = isControlled
    ? value
    : syncUrl && defaultValue
    ? urlTab
    : value;

  const handleValueChange = isControlled
    ? onValueChange
    : syncUrl && defaultValue
    ? (newVal: string) => {
        setUrlTab(newVal);
        onValueChange?.(newVal);
      }
    : onValueChange;

  return (
    <TabsPrimitive.Root
      value={activeValue}
      onValueChange={handleValueChange}
      defaultValue={syncUrl && defaultValue ? undefined : defaultValue}
      className={cn(className)}
      {...props}
    />
  );
}

function Tabs(props: TabsProps) {
  if (!props.syncUrl && props.syncUrl !== undefined) {
    return <TabsPrimitive.Root className={cn(props.className)} {...props} />;
  }

  if (props.value !== undefined && props.onValueChange !== undefined) {
    return <TabsPrimitive.Root className={cn(props.className)} {...props} />;
  }

  return (
    <React.Suspense fallback={<TabsPrimitive.Root className={cn(props.className)} {...props} />}>
      <TabsInner {...props} />
    </React.Suspense>
  );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("inline-flex h-10 items-center rounded-lg bg-muted p-1 text-muted-foreground", className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "interactive inline-flex items-center justify-center rounded-md border-b-2 border-transparent px-3 py-1.5 text-body-xs font-medium whitespace-nowrap",
        "data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:border-primary",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("mt-4", className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
