"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useUrlTab } from "@/hooks/use-url-tab";
import { useTranslations } from "next-intl";

type TabsProps = React.ComponentProps<typeof TabsPrimitive.Root> & {
  paramKey?: string;
  syncUrl?: boolean;
};

const tabListClassName =
  "inline-flex h-auto min-w-0 max-w-full flex-nowrap items-center gap-1 overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-muted/40 p-1 text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible";
const tabTriggerClassName =
  "interactive inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-body-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
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
      className={cn("max-w-full min-w-0", className)}
      {...props}
    />
  );
}

function Tabs({ paramKey, syncUrl, ...props }: TabsProps) {
  if (syncUrl === false) {
    return <TabsPrimitive.Root {...props} className={cn("max-w-full min-w-0", props.className)} />;
  }

  if (props.value !== undefined && props.onValueChange !== undefined) {
    return <TabsPrimitive.Root {...props} className={cn("max-w-full min-w-0", props.className)} />;
  }

  return (
    <React.Suspense fallback={<TabsPrimitive.Root {...props} className={cn("max-w-full min-w-0", props.className)} />}>
      <TabsInner {...props} paramKey={paramKey} syncUrl={syncUrl} />
    </React.Suspense>
  );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List data-slot="tabs-list" className={cn(tabListClassName, className)} {...props} />;
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
  return <TabsPrimitive.Content className={cn("mt-4 min-w-0 outline-hidden", className)} {...props} />;
}

type TabNavItem = {
  href: string;
  label: string;
};

function TabNav({ tabs, label }: { tabs: TabNavItem[]; label?: string }) {
  const pathname = usePathname();
  const t = useTranslations("ui");

  return (
    <nav className="mb-6 max-w-full overflow-hidden" aria-label={label ?? t("sectionNavigation")}>
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
