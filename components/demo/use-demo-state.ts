"use client";

import { useEffect, useState } from "react";
import { demoStateSchema, demoStorageKey, initialDemoState, type DemoState } from "@/lib/demo-state";

export function useDemoState(coursePath: string) {
  const key = demoStorageKey(coursePath);
  const [state, setState] = useState(initialDemoState);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem(key);
        setState(raw ? demoStateSchema.parse(JSON.parse(raw)) : initialDemoState());
        setError("");
      } catch {
        setError("Data demo tidak dapat dibaca. Izinkan penyimpanan browser atau hapus data demo yang rusak melalui pengaturan browser.");
      }
      setReady(true);
    };
    const sync = (event: StorageEvent) => { if (event.key === key || event.key === null) read(); };
    read();
    window.addEventListener("storage", sync);
    window.addEventListener(key, read);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener(key, read); };
  }, [key]);

  const save = (update: (current: DemoState) => DemoState) => {
    try {
      const raw = localStorage.getItem(key);
      const current = raw ? demoStateSchema.parse(JSON.parse(raw)) : initialDemoState();
      const next = demoStateSchema.parse(update(current));
      localStorage.setItem(key, JSON.stringify(next));
      setState(next);
      setError("");
      window.dispatchEvent(new Event(key));
      return true;
    } catch {
      setError("Perubahan belum tersimpan. Penyimpanan browser penuh, diblokir, atau data demo rusak. Periksa pengaturan browser lalu coba lagi.");
      return false;
    }
  };
  return { state, save, ready, error };
}
