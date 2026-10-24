"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FormFieldWrapper } from "@/components/ui/form-field-wrapper";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface InputFieldProps extends React.ComponentProps<typeof Input> {
  label?: string;
  description?: string;
  error?: string;
  required?: boolean;
  showPasswordLabel?: string;
  hidePasswordLabel?: string;
}

const InputField = React.forwardRef<HTMLInputElement, InputFieldProps>(
  ({ className, type = "text", label, description, error, required, showPasswordLabel, hidePasswordLabel, id, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);
    const t = useTranslations("ui");
    const passwordToggleLabel = showPassword
      ? hidePasswordLabel ?? t("hidePassword")
      : showPasswordLabel ?? t("showPassword");
    const uniqueId = React.useId();
    const inputId = id || uniqueId;
    const isPassword = type === "password";
    const actualType = isPassword && showPassword ? "text" : type;

    return (
      <FormFieldWrapper
        label={label}
        description={description}
        error={error}
        required={required}
        htmlFor={inputId}
      >
        <div className="relative w-full">
          <Input
            id={inputId}
            type={actualType}
            className={cn(
              isPassword && "pr-10",
              error && "border-status-error focus-visible:ring-status-error/30 focus-visible:border-status-error",
              className
            )}
            ref={ref}
            required={required}
            aria-invalid={!!error}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-2.5 h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground focus:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-zx-accent rounded-sm transition-colors"
              title={passwordToggleLabel}
              aria-label={passwordToggleLabel}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4 shrink-0" />
              ) : (
                <Eye className="h-4 w-4 shrink-0" />
              )}
            </button>
          )}
        </div>
      </FormFieldWrapper>
    );
  }
);

InputField.displayName = "InputField";

export { InputField };
export type { InputFieldProps };
