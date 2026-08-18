"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { useUrlTab } from "@/hooks/use-url-tab";

type AdminTabsProps = React.ComponentProps<typeof TabsPrimitive.Root> & {
  paramKey?: string;
  syncUrl?: boolean;
};

function AdminTabsInner({
  value,
  onValueChange,
  defaultValue,
  paramKey = "tab",
  syncUrl = true,
  className,
  ...props
}: AdminTabsProps) {
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
      className={cn("space-y-6", className)}
      {...props}
    />
  );
}

function AdminTabs(props: AdminTabsProps) {
  if (!props.syncUrl && props.syncUrl !== undefined) {
    return <TabsPrimitive.Root className={cn("space-y-6", props.className)} {...props} />;
  }

  if (props.value !== undefined && props.onValueChange !== undefined) {
    return <TabsPrimitive.Root className={cn("space-y-6", props.className)} {...props} />;
  }

  return (
    <React.Suspense fallback={<TabsPrimitive.Root className={cn("space-y-6", props.className)} {...props} />}>
      <AdminTabsInner {...props} />
    </React.Suspense>
  );
}

function AdminTabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "flex h-auto w-full flex-wrap items-center gap-1 rounded-xl bg-muted p-1 sm:w-auto sm:flex-nowrap",
        className
      )}
      {...props}
    />
  );
}

function AdminTabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-body-xs font-medium whitespace-nowrap text-muted-foreground transition-colors",
        "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs",
        className
      )}
      {...props}
    />
  );
}

function AdminTabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("outline-hidden", className)} {...props} />;
}

export { AdminTabs, AdminTabsList, AdminTabsTrigger, AdminTabsContent };
