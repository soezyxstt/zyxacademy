import { Info, Zap } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { alertPosition, type AlertCaseSpec } from "@/packages/ui-parity/alert-cases";

export function AlertCase({ item }: { item: AlertCaseSpec }) {
  const Icon = item.icon === "info" ? Info : item.icon === "zap" ? Zap : null;
  return (
    <div style={alertPosition}>
      <Alert variant={item.variant}>
        {Icon && <Icon aria-hidden />}
        <AlertTitle>{item.title}</AlertTitle>
        {(item.description || item.action) && (
          <AlertDescription>
            {item.description}
            {item.action && <Link href={item.action.href} prefetch={false} className="underline underline-offset-4">{item.action.label}</Link>}
          </AlertDescription>
        )}
      </Alert>
    </div>
  );
}
