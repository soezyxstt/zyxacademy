"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useUrlTab } from "@/hooks/use-url-tab";

type TabsProps = React.ComponentProps<typeof TabsPrimitive.Root> & {
  paramKey?: string;
  syncUrl?: boolean;
};

const tabListClassName =
  "inline-flex h-auto max-w-full flex-wrap items-center gap-1 rounded-xl border border-border bg-muted/40 p-1 text-muted-foreground";
const tabTriggerClassName =
  "interactive inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-body-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const tabTriggerActiveClassName = "bg-card text-foreground shadow-xs";

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

function Tabs({ paramKey, syncUrl, ...props }: TabsProps) {
  if (syncUrl === false) {
    return <TabsPrimitive.Root {...props} className={cn(props.className)} />;
  }

  if (props.value !== undefined && props.onValueChange !== undefined) {
    return <TabsPrimitive.Root {...props} className={cn(props.className)} />;
  }

  return (
    <React.Suspense fallback={<TabsPrimitive.Root {...props} className={cn(props.className)} />}>
      <TabsInner {...props} paramKey={paramKey} syncUrl={syncUrl} />
    </React.Suspense>
  );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn(tabListClassName, className)} {...props} />;
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        tabTriggerClassName,
        "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("mt-4 outline-hidden", className)} {...props} />;
}

type TabNavItem = {
  href: string;
  label: string;
};

function TabNav({ tabs, label = "Navigasi bagian" }: { tabs: TabNavItem[]; label?: string }) {
  const pathname = usePathname();

  return (
    <nav className="mb-6" aria-label={label}>
      <div className={tabListClassName}>
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                tabTriggerClassName,
                isActive ? tabTriggerActiveClassName : "text-muted-foreground"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  TabNav,
  tabListClassName,
  tabTriggerClassName,
  tabTriggerActiveClassName,
};
