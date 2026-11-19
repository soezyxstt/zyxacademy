"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { getZyraAvatar } from "@/lib/gamification/zyra-cosmetics";
import { getZyraGlbMascot } from "@/lib/gamification/zyra-glb-mascots";
import { ZyraCosmeticAvatar } from "./zyra-cosmetic-avatar";
import type { MascotSceneHandle } from "./zyra-mascot-3d-scene";

export type ZyraMascot3DProps = {
  cosmeticId?: string | null;
  size?: number;
  animated?: boolean;
  animationReplay?: number;
  animationName?: string;
  practiceSuit?: string;
  practiceCycle?: boolean;
  className?: string;
};

/** Explicit large-viewer opt-in. Thumbnails never import Three or allocate a canvas. */
export function ZyraMascot3D({cosmeticId,size=320,animated=true,animationName="idle",animationReplay=0,practiceSuit="none",practiceCycle=false,className}: ZyraMascot3DProps) {
  const t=useTranslations("student");
  const avatar=getZyraAvatar(cosmeticId);
  const extent=Number.isFinite(size)&&size>0?Math.min(size,640):320;
  const host=useRef<HTMLSpanElement>(null),handle=useRef<MascotSceneHandle | null>(null);
  const motion=useRef(animated);motion.current=animated;
  const animation=useRef(animationName);animation.current=animationName;
  const [unavailable,setUnavailable]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const [readyKey,setReadyKey]=useState<string | null>(null);
  const modelKey=getZyraGlbMascot(avatar?.glbCharacter)?.key ?? avatar?.modelKey;
  const hasModel=Boolean(modelKey);
  const large=extent>=128;
  const selected=useRef(modelKey); selected.current=modelKey;
  useEffect(()=>{
    if(!hasModel||!large||!host.current) return;
    setReadyKey(null); setUnavailable(false);
    let cancelled=false;
    const container=host.current;
    import("./zyra-mascot-3d-scene").then(({mountMascotScene})=>{
      if(cancelled) return;
      handle.current=mountMascotScene(container,selected.current!,motion.current,()=>{if(!cancelled){setReadyKey(null);setUnavailable(true);}},key=>{if(!cancelled){setReadyKey(key);setUnavailable(false);}},animation.current, practiceSuit, practiceCycle);
    }).catch(()=>{if(!cancelled){setReadyKey(null);setUnavailable(true);}});
    return ()=>{cancelled=true;handle.current?.dispose();handle.current=null;};
  },[large,hasModel,attempt,practiceSuit,practiceCycle]);
  useEffect(()=>{
    if(!modelKey||!handle.current) return;
    setReadyKey(null);setUnavailable(false);
    if(handle.current.isDisposed()) setAttempt(value=>value+1);
    else handle.current.setModel(modelKey);
  },[modelKey]);
  useEffect(()=>{handle.current?.setAnimated(animated);},[animated]);
  useEffect(()=>{handle.current?.setAnimation(animationName);},[animationName,animationReplay]);
  const ready=large&&readyKey===modelKey;
  return <span className={`relative inline-block max-w-full align-middle ${className||""}`} style={{width:extent,height:extent}} data-mascot-renderer={ready?"webgl":"poster"}>
    <span ref={host} className="absolute inset-0 block" />
    {unavailable&&<span className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-center gap-1 rounded-md bg-background/90 px-2 py-1">
      <span role="status" className="text-body-xs">{t("cosmeticsStudio.unavailable")}</span>
      <Button type="button" variant="ghost" size="sm" onClick={()=>setAttempt(value=>value+1)}>{t("cosmeticsStudio.retry")}</Button>
    </span>}
    {!ready&&<span className="pointer-events-none absolute inset-0 flex items-center justify-center"><ZyraCosmeticAvatar cosmeticId={cosmeticId} size={extent} name={avatar?.name.id||"Zyra"} /></span>}
  </span>;
}
