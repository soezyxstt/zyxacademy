import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldWrapperProps {
  label?: string;
  description?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

function FormFieldWrapper({
  label,
  description,
  error,
  required,
  htmlFor,
  className,
  children,
}: FormFieldWrapperProps) {
  return (
    <div className={cn("flex flex-col gap-2 w-full", className)}>
      {label && (
        <div className="flex items-center justify-between">
          <Label htmlFor={htmlFor} className="font-heading text-body-sm font-semibold text-foreground">
            {label}
            {required && <span className="ml-1 text-status-error" aria-hidden="true">*</span>}
          </Label>
        </div>
      )}
      
      {children}
      
      {description && !error && (
        <p className="text-support text-muted-foreground">
          {description}
        </p>
      )}
      
      {error && (
        <div 
          className="flex items-start gap-1.5 text-body-sm text-status-error font-medium animate-in fade-in slide-in-from-top-1 duration-150"
          role="alert"
        >
          <TriangleAlert className="size-4 shrink-0 mt-0.5" />
          <span className="leading-normal">{error}</span>
        </div>
      )}
    </div>
  );
}

export { FormFieldWrapper };
export type { FormFieldWrapperProps };
