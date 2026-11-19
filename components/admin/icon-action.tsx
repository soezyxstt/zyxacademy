import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type AdminIconActionProps = Omit<ComponentProps<typeof Button>, "aria-label" | "size"> & {
  label: string;
};

export function AdminIconAction({ label, type = "button", ...props }: AdminIconActionProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type={props.asChild ? undefined : type} size="icon-lg" aria-label={label} {...props} />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
