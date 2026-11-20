"use client";
import React, { useState } from "react";
import { CollectibleFrame } from "@/components/gamification/collectible-frame";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { FRAME_COLLECTIONS } from "@/lib/gamification/collection-art";
import { portrait } from "./data";

export default function FrameMotionFixture() {
  const [selected, setSelected] = useState<string>(FRAME_COLLECTIONS[0].id);
  const [animated, setAnimated] = useState(true);
  const art = FRAME_COLLECTIONS.find(frame => frame.id === selected)!;
  return <main className="min-h-screen bg-background text-foreground p-4 md:p-8">
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Bingkai profil" actions={<Button variant="outline" data-testid="motion-toggle" aria-pressed={animated} onClick={() => setAnimated(value => !value)}>Animasi {animated ? "aktif" : "nonaktif"}</Button>} />
      <section className="flex flex-col items-center gap-3 py-4" aria-label={art.name.id}>
        <div data-testid="hero-crop" className="flex h-80 w-80 max-w-full items-center justify-center">
          <div data-testid="selected-frame" data-frame-id={selected} data-aperture={art.aperture}>
            <CollectibleFrame key={selected} frameId={selected} size={240} animated={animated}>
              <img data-testid="identity" src={portrait} alt="Alya Putri" draggable={false} />
            </CollectibleFrame>
          </div>
        </div>
        <h2 className="font-heading text-body-base font-bold">{art.name.id}</h2>
      </section>
      <nav aria-label="Pilihan bingkai" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {FRAME_COLLECTIONS.map(frame => <Button key={frame.id} data-frame-choice={frame.id} variant="outline" aria-pressed={selected === frame.id} className="h-auto min-h-24 whitespace-normal py-3 aria-pressed:border-primary aria-pressed:bg-primary/8" onClick={() => setSelected(frame.id)}>
          <span className="flex min-w-0 flex-col items-center gap-2">
            <CollectibleFrame frameId={frame.id} size={48} animated={false}><img src={portrait} alt="" draggable={false} /></CollectibleFrame>
            <span>{frame.name.id}</span>
          </span>
        </Button>)}
      </nav>
    </div>
  </main>;
}
