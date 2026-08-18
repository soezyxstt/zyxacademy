import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button interactive inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-body-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-transparent focus-visible:outline-[2px] focus-visible:outline-offset-2 focus-visible:outline-[var(--zx-accent)] focus-visible:ring-0 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:outline-destructive/80 dark:aria-invalid:border-destructive/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 relative",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover hover:brightness-110 hover:shadow-[0_4px_14px_oklch(from_var(--color-primary)_l_c_h_/_0.35)] active:brightness-95 active:scale-[0.98]",
        outline:
          "border-border bg-background hover:border-primary hover:text-primary hover:bg-primary/8 aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
        /** Landing/marketing CTAs ; navy fill, kept separate from `--primary`. */
        marketingPrimary:
          "rounded-md bg-marketing-navy text-white hover:bg-marketing-navy/90 hover:brightness-105 active:brightness-95 [&_svg]:text-white",
        marketingSecondary:
          "rounded-md border-2 border-marketing-navy bg-background text-marketing-navy hover:bg-marketing-navy/5",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-md px-2 text-body-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-md px-2.5 text-body-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-md in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-md in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
        marketing: "h-10 gap-2 px-4 text-body-sm font-medium rounded-md [&_svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  isLoading = false,
  children,
  disabled,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    isLoading?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"
  const isDisabled = disabled || isLoading

  if (asChild && isLoading) {
    console.warn("Button with asChild and isLoading is not supported for automatic spinners.");
  }

  // To preserve button width and layout when loading, we wrap children in an invisible flex container
  // that matches the button's native gap.
  let gapClass = "gap-1.5"
  if (size === "xs" || size === "sm") gapClass = "gap-1"
  if (size === "marketing") gapClass = "gap-2"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={isDisabled}
      aria-busy={isLoading}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {isLoading && (
            <Loader2 className="absolute size-4 animate-spin text-inherit" aria-hidden="true" />
          )}
          <span className={cn("inline-flex items-center justify-center", gapClass, isLoading && "opacity-0 invisible")}>
            {children}
          </span>
        </>
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
