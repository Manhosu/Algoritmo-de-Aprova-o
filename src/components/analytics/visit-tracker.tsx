"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { INTERVALO_DA_BATIDA_S } from "@/modules/analytics/visits";

/**
 * O SINAL DE "ESTOU AQUI" QUE ALIMENTA OS VISITANTES DO PAINEL.
 *
 * Uma batida ao abrir cada página e outra a cada 30 segundos enquanto a aba está
 * visível. Nada fica guardado no aparelho: quem junta as batidas numa visita é o
 * servidor (ver `modules/analytics/visits`).
 *
 * ⚠️ FALHA EM SILÊNCIO. Contar visita é secundário; um erro aqui nunca pode
 * aparecer para o aluno nem atrapalhar a página que ele abriu.
 */
function enviar(tipo: "pagina" | "batida", path: string) {
  try {
    const corpo = JSON.stringify({ tipo, path });

    /* `sendBeacon` sobrevive ao fechamento da aba, que é quando `fetch` morre. */
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/visita", new Blob([corpo], { type: "application/json" }));
      return;
    }

    void fetch("/api/visita", {
      method: "POST",
      body: corpo,
      headers: { "content-type": "application/json" },
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  } catch {
    /* ver a nota acima */
  }
}

export function VisitTracker() {
  const pathname = usePathname();

  useEffect(() => {
    /* O painel da cliente não conta como visita. */
    if (!pathname || pathname === "/admin" || pathname.startsWith("/admin/")) return;

    enviar("pagina", pathname);

    const batida = window.setInterval(() => {
      if (document.visibilityState === "visible") enviar("batida", pathname);
    }, INTERVALO_DA_BATIDA_S * 1000);

    return () => window.clearInterval(batida);
  }, [pathname]);

  return null;
}
