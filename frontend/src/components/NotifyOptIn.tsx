import React, { useEffect, useRef, useState } from "react";

function parseIso(s?: string | null): Date | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
}

export default function NotifyOptIn({ nextCritical, title = "Risco alto de NO₂ chegando" }: { nextCritical?: string | null; title?: string }) {
  const [perm, setPerm] = useState<NotificationPermission>(typeof Notification !== "undefined" ? Notification.permission : "denied");
  const timerRef = useRef<number | null>(null);

  function request() {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then(setPerm);
  }

  useEffect(() => {
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    if (typeof Notification === "undefined") return;
    if (perm !== "granted") return;
    const when = parseIso(nextCritical);
    if (!when) return;
    const now = new Date();
    const ms = when.getTime() - now.getTime();
    if (ms <= 0) return;
    const twoHours = 2 * 60 * 60 * 1000;
    if (ms > twoHours) return;
    timerRef.current = window.setTimeout(() => {
      try { new Notification(title, { body: `Risco alto previsto às ${when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.` }); } catch {}
    }, Math.max(0, ms - 60 * 1000));
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, [nextCritical, perm, title]);

  if (typeof Notification === "undefined") return null;

  return perm === "granted" ? (
    <div style={{ fontSize: 13, color: "#9ca3af" }}>Notificações ativas para o próximo pico (&lt; 2h).</div>
  ) : (
    <button onClick={request} style={{ background: "#0ea5e9", border: "1px solid #0284c7", padding: "6px 12px", borderRadius: 8, color: "#fff", cursor: "pointer" }}>
      Ativar notificações
    </button>
  );
}
