"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KeyRound } from "lucide-react";
import { EnrollmentForm } from "@/components/enrollment-form";

export function ActivateClassModal() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="rounded-md gap-1.5 h-8 text-body-sm font-semibold hover:bg-muted/70 transition-colors shrink-0"
        >
          <KeyRound className="size-3.5" />
          Aktivasi Kelas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Aktivasi Kelas Baru</DialogTitle>
          <DialogDescription>
            Gunakan token kelas dari admin.
          </DialogDescription>
        </DialogHeader>
        <div className="pt-2">
          <EnrollmentForm onSuccess={() => setOpen(false)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
