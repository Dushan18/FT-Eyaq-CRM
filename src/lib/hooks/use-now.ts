"use client";

import { useEffect, useState } from "react";

/** Hora actual que se renueva cada `intervalMs` para que "hace 2 min" se mantenga al día. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
