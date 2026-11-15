"use client";

import { useEffect, useRef, useState } from "react";
import { getZyraAvatar } from "@/lib/gamification/zyra-cosmetics";
import { ZyraCosmeticAvatar } from "./zyra-cosmetic-avatar";
import type { MascotSceneHandle } from "./zyra-mascot-3d-scene";

export type ZyraMascot3DProps = {
  cosmeticId?: string | null;
  size?: number;
  animated?: boolean;
  className?: string;
};

/** Explicit large-viewer opt-in. Thumbnails never import Three or allocate a canvas. */
export function ZyraMascot3D({cosmeticId,size=320,animated=true,className}: ZyraMascot3DProps) {
  const avatar=getZyraAvatar(cosmeticId);
  const extent=Number.isFinite(size)&&size>0?Math.min(size,640):320;
  const host=useRef<HTMLSpanElement>(null),handle=useRef<MascotSceneHandle | null>(null);
  const motion=useRef(animated);motion.current=animated;
  const [unavailable,setUnavailable]=useState(false);
  const [readyKey,setReadyKey]=useState<string | null>(null);
  const modelKey=avatar?.modelKey;
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
      handle.current=mountMascotScene(container,selected.current!,motion.current,()=>{if(!cancelled){setReadyKey(null);setUnavailable(true);}},()=>{if(!cancelled)setReadyKey(selected.current!);});
    }).catch(()=>{if(!cancelled){setReadyKey(null);setUnavailable(true);}});
    return ()=>{cancelled=true;handle.current?.dispose();handle.current=null;};
  },[large,hasModel]);
  useEffect(()=>{if(modelKey&&handle.current){setReadyKey(null);handle.current.setModel(modelKey);}},[modelKey]);
  useEffect(()=>{handle.current?.setAnimated(animated);},[animated]);
  const ready=large&&readyKey===modelKey;
  return <span className={`relative inline-block max-w-full align-middle ${className||""}`} style={{width:extent,height:extent}} data-mascot-renderer={ready?"webgl":"poster"}>
    <span ref={host} className="absolute inset-0 block" />
    {unavailable&&<span role="status" className="absolute bottom-0 z-10 rounded-md bg-background/90 px-2 py-1 text-body-xs">3D tidak tersedia</span>}
    {!ready&&<span className="pointer-events-none absolute inset-0 flex items-center justify-center"><ZyraCosmeticAvatar cosmeticId={cosmeticId} size={extent} name={avatar?.name.id||"Zyra"} /></span>}
  </span>;
}
