"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

/** Live `HH:MM:SS` countdown to `endsAt`, stopping at zero. */
export function OfferCountdown({ endsAt, className }: { endsAt: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const remainingSeconds = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000));
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  return (
    <time dateTime={endsAt} className={cn("tabular-nums", className)}>
      {pad(hours)}:{pad(minutes)}:{pad(seconds)}
    </time>
  );
}
