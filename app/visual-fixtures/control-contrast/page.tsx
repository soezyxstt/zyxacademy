"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function ControlContrastFixture() {
  const [dark, setDark] = useState(false);
  return (
    <main className={dark ? "dark" : ""}>
      <div className="min-h-screen space-y-4 bg-background p-6 text-foreground">
        <Button variant="outline" onClick={() => setDark(!dark)}>Ganti tema</Button>
        <div className="flex flex-wrap gap-3">
          <Button data-testid="primary">Simpan</Button>
          <Button data-testid="secondary" variant="secondary">Lanjutkan</Button>
          <Button data-testid="brand" className="bg-brand-primary text-primary-foreground hover:bg-brand-primary/90">Kelola</Button>
          <Button data-testid="destructive" variant="destructive">Hapus</Button>
          <Button variant="outline">Batal</Button>
          <Badge variant="secondary">Mata kuliah</Badge>
        </div>
      </div>
    </main>
  );
}
