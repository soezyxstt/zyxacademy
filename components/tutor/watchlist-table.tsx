import type { WatchlistStudent } from "@/lib/cohort-analytics";

function relativeTime(iso: string | null): string {
  if (!iso) return "Belum pernah";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Hari ini";
  if (diffDays === 1) return "Kemarin";
  if (diffDays < 7) return `${diffDays} hari lalu`;
  return `${Math.floor(diffDays / 7)} minggu lalu`;
}

export function WatchlistTable({ students }: { students: WatchlistStudent[] }) {
  if (students.length === 0) {
    return (
      <p className="text-body-sm text-muted-foreground">
        Tidak ada siswa yang memerlukan perhatian khusus saat ini.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-body-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground text-body-xs font-semibold">
            <th className="px-4 py-2.5 font-medium">Siswa</th>
            <th className="px-4 py-2.5 font-medium">Konsep menurun</th>
            <th className="px-4 py-2.5 font-medium whitespace-nowrap">Terakhir aktif</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {students.map((s) => {
            const shown = s.decliningConcepts.slice(0, 3);
            const overflow = s.decliningConcepts.length - shown.length;
            const conceptLabel =
              shown.length === 0
                ? `${s.activeInterventionCount} intervensi aktif`
                : shown.join(", ") + (overflow > 0 ? ` +${overflow}` : "");

            return (
              <tr key={s.studentId}>
                <td className="px-4 py-2.5 font-medium text-foreground">{s.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground max-w-xs truncate">
                  {conceptLabel}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                  {relativeTime(s.lastActiveAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
