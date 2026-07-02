"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

function getRemaining(target: Date) {
  const diffMs = Math.max(0, target.getTime() - Date.now());
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
  return { days, hours, minutes, done: diffMs <= 0 };
}

/** Client countdown to the estimated (non-official) PKA test date. */
export function PkaCountdown({ targetDate }: { targetDate: string }) {
  const [remaining, setRemaining] = useState(() => getRemaining(new Date(targetDate)));

  useEffect(() => {
    const interval = setInterval(() => setRemaining(getRemaining(new Date(targetDate))), 60_000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-secondary/10 text-brand-secondary">
        <Clock className="size-5" />
      </div>
      <div>
        {remaining.done ? (
          <span className="text-body-sm font-semibold text-foreground">Perkiraan jadwal PKA sudah dekat/berlalu</span>
        ) : (
          <span className="text-body-sm font-semibold text-foreground">
            Perkiraan {remaining.days} hari {remaining.hours} jam {remaining.minutes} menit menuju PKA
          </span>
        )}
        <p className="text-body-sm text-muted-foreground">Estimasi tidak resmi; jadwal pasti mengikuti pengumuman Ditsama ITB.</p>
      </div>
    </div>
  );
}
