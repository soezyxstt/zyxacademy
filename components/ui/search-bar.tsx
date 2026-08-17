"use client";

import * as React from "react";
import { Search, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

const variantStyles = {
  default:
    "bg-card border border-border/80 hover:border-border hover:bg-card/90 focus-within:bg-card focus-within:border-brand-primary/80 focus-within:ring-2 focus-within:ring-brand-primary/20 focus-within:shadow-[0_0_16px_rgba(37,99,235,0.12)] shadow-2xs",
  muted:
    "bg-muted/40 border border-transparent hover:bg-muted/70 hover:border-border/50 focus-within:bg-background focus-within:border-brand-primary/80 focus-within:ring-2 focus-within:ring-brand-primary/20 focus-within:shadow-[0_0_16px_rgba(37,99,235,0.12)]",
  bordered:
    "bg-background border border-border hover:border-foreground/30 focus-within:border-brand-primary focus-within:ring-2 focus-within:ring-brand-primary/25 shadow-xs",
};

const sizeStyles = {
  sm: {
    container: "min-h-9 px-3 rounded-lg text-body-xs",
    icon: "size-3.5",
    input: "min-h-0 py-1 pl-2.5 pr-1.5 text-body-xs",
    clear: "p-0.5",
  },
  md: {
    container: "min-h-10 px-3.5 rounded-xl text-body-sm",
    icon: "size-4",
    input: "min-h-0 py-1.5 pl-2.5 pr-2 text-body-sm",
    clear: "p-1",
  },
  lg: {
    container: "min-h-12 px-4 rounded-xl text-body-base",
    icon: "size-4.5",
    input: "min-h-0 py-2 pl-3 pr-2.5 text-body-base",
    clear: "p-1.5",
  },
};

export const SearchBar = React.forwardRef<HTMLInputElement, SearchBarProps>(
  (
    {
      value,
      defaultValue,
      onChange,
      onSearch,
      onClear,
      variant = "default",
      size = "md",
      isLoading = false,
      shortcut,
      containerClassName,
      className,
      placeholder = "Cari...",
      disabled,
      rightSection,
      ...props
    },
    ref
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const [internalValue, setInternalValue] = React.useState(
      defaultValue ?? ""
    );

    const isControlled = value !== undefined;
    const query = isControlled ? (value ?? "") : internalValue;
    const currentSize = sizeStyles[size];

    // Combine forwarded ref and local ref
    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!isControlled) {
        setInternalValue(e.target.value);
      }
      onChange?.(e);
      onSearch?.(e.target.value);
    };

    const handleClear = () => {
      if (!isControlled) {
        setInternalValue("");
      }
      onClear?.();
      onSearch?.("");

      // Re-focus input after clearing
      if (inputRef.current) {
        inputRef.current.value = "";
        inputRef.current.focus();
      }
    };

    return (
      <div
        className={cn(
          "group relative flex items-center w-full transition-all duration-200 ease-out",
          variantStyles[variant],
          currentSize.container,
          disabled && "opacity-50 pointer-events-none",
          containerClassName
        )}
      >
        {/* Left Search or Loading Icon */}
        <div className="flex shrink-0 items-center justify-center text-muted-foreground transition-all duration-200 group-focus-within:text-brand-primary group-focus-within:scale-105">
          {isLoading ? (
            <Loader2 className={cn("animate-spin text-brand-primary", currentSize.icon)} />
          ) : (
            <Search className={cn(currentSize.icon)} aria-hidden="true" />
          )}
        </div>

        {/* Input Field */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "w-full min-w-0 bg-transparent text-foreground font-sans placeholder:text-muted-foreground/60 focus:outline-none",
            currentSize.input,
            className
          )}
          {...props}
        />

        {/* Right Actions: Clear Button or Keyboard Shortcut or Custom Section */}
        <div className="flex shrink-0 items-center gap-1.5 ml-auto">
          {query.length > 0 ? (
            <button
              type="button"
              onClick={handleClear}
              className={cn(
                "rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted/80 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                currentSize.clear
              )}
              aria-label="Bersihkan pencarian"
              title="Bersihkan pencarian"
            >
              <X className={cn(currentSize.icon)} />
            </button>
          ) : shortcut ? (
            <kbd className="pointer-events-none hidden shrink-0 select-none items-center gap-1 rounded-md border border-border/70 bg-muted/60 px-2 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground transition-colors group-hover:border-border sm:inline-flex">
              {shortcut}
            </kbd>
          ) : null}

          {rightSection}
        </div>
      </div>
    );
  }
);

SearchBar.displayName = "SearchBar";
