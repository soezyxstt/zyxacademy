"use client";

import * as React from "react";
import { Search, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useIsMobileSearchInline,
  useMobileChrome,
  useMobileTopNavSearch,
} from "@/components/navigation/mobile-chrome-context";
import { useViewportMode } from "@/hooks/use-viewport-mode";

export interface SearchBarProps
  extends Omit<React.ComponentProps<"input">, "size"> {
  /** Value of the search input for controlled usage */
  value?: string;
  /** Default value for uncontrolled usage */
  defaultValue?: string;
  /** Callback fired when search query changes */
  onSearch?: (value: string) => void;
  /** Callback fired when clear button is clicked */
  onClear?: () => void;
  /** Visual variant of the search bar */
  variant?: "default" | "muted" | "bordered";
  /** Size variant of the search bar */
  size?: "sm" | "md" | "lg";
  /** Shows a spinning loading state instead of search icon */
  isLoading?: boolean;
  /** Optional keyboard shortcut hint (e.g. "⌘K" or "/") */
  shortcut?: string;
  /** Additional container element CSS classes */
  containerClassName?: string;
  /** Optional element rendered on the far right */
  rightSection?: React.ReactNode;
  /** Enable expandable/collapsible behavior (defaults to true) */
  expandable?: boolean;
  /** Alias for expandable, preserved for toolbar callers */
  collapsible?: boolean;
  /** Controlled expanded state */
  expanded?: boolean;
  /** Initial expanded state for uncontrolled expandable usage */
  defaultExpanded?: boolean;
  /** Callback fired when expanded state changes */
  onExpandedChange?: (expanded: boolean) => void;
  /** Auto-collapse when focus leaves the search bar while query is empty (defaults to true) */
  autoCollapseOnBlur?: boolean;
  /** Delegate to the unified mobile top navbar when active on mobile (defaults to true) */
  mobileTopNav?: boolean;
}

const variantStyles = {
  default:
    "bg-card border border-border hover:border-border-strong focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30",
  muted:
    "bg-muted/40 border border-transparent hover:bg-muted/70 hover:border-border focus-within:bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30",
  bordered:
    "bg-background border border-border hover:border-foreground/30 focus-within:border-brand-primary focus-within:ring-2 focus-within:ring-brand-primary/25 shadow-xs",
};

const sizeStyles = {
  sm: {
    container: "h-9 rounded-lg text-body-sm",
    collapsed: "w-9 max-w-9 min-w-9 flex-none",
    expandedMax: "max-w-full",
    trigger: "size-9",
    icon: "size-3.5",
    input: "min-h-0 py-1 pl-0 pr-1.5 text-body-sm",
    rightPad: "pr-2",
    clear: "p-0.5",
  },
  md: {
    container: "h-10 rounded-xl text-body-sm",
    collapsed: "w-10 max-w-10 min-w-10 flex-none",
    expandedMax: "max-w-full",
    trigger: "size-10",
    icon: "size-4",
    input: "min-h-0 py-1.5 pl-0 pr-2 text-body-sm",
    rightPad: "pr-2.5",
    clear: "p-1",
  },
  lg: {
    container: "h-12 rounded-lg text-body-sm",
    collapsed: "w-12 max-w-12 min-w-12 flex-none",
    expandedMax: "max-w-full",
    trigger: "size-12",
    icon: "size-4.5",
    input: "min-h-0 py-2 pl-0 pr-2.5 text-body-sm",
    rightPad: "pr-3",
    clear: "p-1.5",
  },
};

export const SearchBar = React.forwardRef<HTMLInputElement, SearchBarProps>(
  (
    {
      value,
      defaultValue,
      onChange,
      onKeyDown,
      onSearch,
      onClear,
      variant = "default",
      size = "md",
      isLoading = false,
      shortcut,
      containerClassName,
      className,
      placeholder,
      disabled,
      rightSection,
      expandable,
      collapsible,
      expanded,
      defaultExpanded = false,
      onExpandedChange,
      autoCollapseOnBlur = true,
      mobileTopNav = true,
      id,
      "aria-label": ariaLabel,
      ...props
    },
    ref
  ) => {
    const t = useTranslations("search");
    const viewportMode = useViewportMode();
    const { isTopNavActive } = useMobileChrome();
    const isInsideOverlay = useIsMobileSearchInline();
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const triggerRef = React.useRef<HTMLButtonElement | null>(null);
    const generatedId = React.useId();
    const inputId = id ?? generatedId;

    const isExpandable = expandable ?? collapsible ?? true;

    const [internalValue, setInternalValue] = React.useState(
      defaultValue ?? ""
    );
    const [internalExpanded, setInternalExpanded] = React.useState(
      defaultExpanded || Boolean(defaultValue) || Boolean(value)
    );

    const isControlled = value !== undefined;
    const query = isControlled ? (value ?? "") : internalValue;
    const isExpandedControlled = expanded !== undefined;
    const rawExpanded = isExpandedControlled ? expanded : internalExpanded;
    const isExpanded = !isExpandable || rawExpanded || query.length > 0;
    const currentSize = sizeStyles[size];

    const setExpandedState = React.useCallback(
      (next: boolean) => {
        if (!isExpandedControlled) {
          setInternalExpanded(next);
        }
        onExpandedChange?.(next);
      },
      [isExpandedControlled, onExpandedChange]
    );

    // Combine forwarded ref and local ref
    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const handleExpand = () => {
      if (disabled) return;
      if (!isExpanded) {
        setExpandedState(true);
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      } else {
        inputRef.current?.focus();
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!isControlled) {
        setInternalValue(e.target.value);
      }
      onChange?.(e);
      onSearch?.(e.target.value);
    };

    const clearQuery = () => {
      if (!isControlled) {
        setInternalValue("");
      }
      onClear?.();
      onSearch?.("");
    };

    const handleClear = () => {
      clearQuery();
      // Re-focus input after clearing so the user can type a new query
      if (inputRef.current) {
        inputRef.current.value = "";
        inputRef.current.focus();
      }
    };

    const closeSearch = () => {
      if (query.length > 0) {
        clearQuery();
      }
      setExpandedState(false);
      requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    };

    const handleContainerBlur = (e: React.FocusEvent<HTMLDivElement>) => {
      if (!isExpandable || !autoCollapseOnBlur) return;
      const nextFocus = e.relatedTarget as Node | null;
      if (nextFocus && e.currentTarget.contains(nextFocus)) return;
      if (query.length === 0) {
        setExpandedState(false);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented || e.nativeEvent.isComposing) return;
      if (e.key === "Escape" && isExpandable) {
        e.preventDefault();
        e.stopPropagation();
        closeSearch();
      }
    };

    const searchLabel = ariaLabel ?? placeholder ?? t("searchAction");

    const delegateToTopNav =
      mobileTopNav &&
      !disabled &&
      !isInsideOverlay &&
      viewportMode === "mobile" &&
      isTopNavActive;

    const handleDelegatedChange = (nextValue: string) => {
      if (!isControlled) {
        setInternalValue(nextValue);
      }
      if (onChange) {
        onChange({
          target: { value: nextValue },
          currentTarget: { value: nextValue },
        } as React.ChangeEvent<HTMLInputElement>);
      }
      onSearch?.(nextValue);
    };

    useMobileTopNavSearch(
      delegateToTopNav
        ? {
            value: query,
            onChange: handleDelegatedChange,
            onClear: clearQuery,
            placeholder: placeholder ?? t("placeholder"),
            ariaLabel: searchLabel,
            isLoading,
          }
        : null
    );

    if (delegateToTopNav) {
      return null;
    }

    return (
      <TooltipProvider>
        <div
          data-slot="search-bar"
          data-state={isExpanded ? "open" : "closed"}
          data-search-expanded={isExpandable && isExpanded ? "true" : undefined}
          onBlur={handleContainerBlur}
          className={cn(
            "group relative flex items-center overflow-hidden transition-[max-width,width,flex-grow,background-color,border-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            variantStyles[variant],
            currentSize.container,
            isExpanded
              ? cn("w-full", currentSize.expandedMax, collapsible && "min-w-0 flex-1", containerClassName)
              : cn(currentSize.collapsed, "cursor-pointer"),
            disabled && "opacity-50 pointer-events-none"
          )}
        >
          {/* Left Search or Loading Icon Trigger */}
          <Tooltip open={isExpanded ? false : undefined}>
            <TooltipTrigger asChild>
              <button
                ref={triggerRef}
                type="button"
                onClick={handleExpand}
                disabled={disabled}
                tabIndex={isExpanded ? -1 : 0}
                aria-label={searchLabel}
                aria-expanded={isExpandable ? isExpanded : undefined}
                aria-busy={isLoading || undefined}
                className={cn(
                  "flex shrink-0 items-center justify-center text-muted-foreground transition-colors duration-200 group-focus-within:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset rounded-[inherit]",
                  currentSize.trigger,
                  !isExpanded && "cursor-pointer hover:text-foreground"
                )}
              >
                {isLoading ? (
                  <Loader2
                    className={cn("animate-spin text-brand-primary", currentSize.icon)}
                    aria-hidden="true"
                  />
                ) : (
                  <Search
                    className={cn(
                      "transition-transform duration-200 motion-reduce:transition-none",
                      !isExpanded && "group-hover:scale-105",
                      currentSize.icon
                    )}
                    aria-hidden="true"
                  />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>{searchLabel}</TooltipContent>
          </Tooltip>

          {/* Input Field */}
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? t("placeholder")}
            aria-label={searchLabel}
            aria-hidden={!isExpanded || undefined}
            tabIndex={isExpanded ? 0 : -1}
            disabled={disabled}
            className={cn(
              "min-w-0 bg-transparent text-foreground font-sans placeholder:text-muted-foreground/60 focus:outline-none transition-opacity duration-200 motion-reduce:transition-none",
              isExpanded
                ? cn("w-full flex-1 opacity-100", currentSize.input)
                : "w-0 flex-none opacity-0 pointer-events-none p-0",
              className
            )}
            {...props}
          />

          {/* Right Actions: Clear Button or Keyboard Shortcut or Custom Section */}
          <div
            className={cn(
              "flex shrink-0 items-center gap-1.5 transition-[opacity,transform] duration-200 motion-reduce:transition-none",
              isExpanded
                ? cn("ml-auto opacity-100 scale-100", currentSize.rightPad)
                : "w-0 overflow-hidden opacity-0 scale-90 pointer-events-none"
            )}
          >
            {query.length > 0 ? (
              <button
                type="button"
                data-search-close=""
                onClick={handleClear}
                tabIndex={isExpanded ? 0 : -1}
                className={cn(
                  "rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted/80 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  currentSize.clear
                )}
                aria-label={t("clear")}
                title={t("clear")}
              >
                <X className={cn(currentSize.icon)} aria-hidden="true" />
              </button>
            ) : shortcut ? (
              <kbd className="pointer-events-none hidden shrink-0 select-none items-center gap-1 rounded-md border border-border/70 bg-muted/60 px-2 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground transition-colors group-hover:border-border sm:inline-flex">
                {shortcut}
              </kbd>
            ) : null}

            {rightSection}
          </div>
        </div>
      </TooltipProvider>
    );
  }
);

SearchBar.displayName = "SearchBar";
