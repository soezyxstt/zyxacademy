import { cn } from "@/lib/utils";

export type AdminOptionLetterProps = {
  index: number;
  isCorrect?: boolean;
  className?: string;
};

export function AdminOptionLetter({ index, isCorrect = false, className }: AdminOptionLetterProps) {
  return (
    <span
      className={cn(
        "flex size-6 items-center justify-center rounded border text-body-xs font-bold shrink-0",
        isCorrect
          ? "bg-emerald-500 border-emerald-600 text-white shadow-xs"
          : "bg-muted border-border text-muted-foreground",
        className
      )}
    >
      {String.fromCharCode(65 + index)}
    </span>
  );
}
