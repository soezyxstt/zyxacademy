"use client";

import * as React from "react";
import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { FormFieldWrapper } from "@/components/ui/form-field-wrapper";
import { useTranslations } from "next-intl";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  label?: string;
  description?: string;
  error?: string;
  required?: boolean;
  placeholder?: string;
  options: SelectOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
  disabled?: boolean;
  name?: string;
  className?: string;
  contentClassName?: string;
  id?: string;
}

function SelectField({
  label,
  description,
  error,
  required,
  placeholder,
  options,
  value,
  onValueChange,
  defaultValue,
  disabled,
  name,
  className,
  contentClassName,
  id,
}: SelectFieldProps) {
  const t = useTranslations("ui");
  const uniqueId = React.useId();
  const selectId = id || uniqueId;

  return (
    <FormFieldWrapper
      label={label}
      description={description}
      error={error}
      required={required}
      htmlFor={selectId}
      className={className}
    >
      <Select
        value={value}
        onValueChange={onValueChange}
        defaultValue={defaultValue}
        disabled={disabled}
        name={name}
      >
        <SelectTrigger
          id={selectId}
          aria-invalid={!!error}
        >
          <SelectValue placeholder={placeholder ?? t("selectPlaceholder")} />
        </SelectTrigger>
        <SelectContent className={contentClassName}>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormFieldWrapper>
  );
}

export { SelectField };
export type { SelectFieldProps, SelectOption };
