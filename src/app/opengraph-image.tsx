import { ImageResponse } from "next/og";

import { APP_NAME, APP_TAGLINE } from "@/config/app";

/**
 * Imagem de compartilhamento (WhatsApp, Instagram, LinkedIn).
 *
 * ⚠️ GERADA, não um arquivo estático. O nome e a frase vêm de `config/app`, os
 * mesmos que a interface usa — assim o card compartilhado nunca diverge do
 * produto depois de uma mudança de copy.
 *
 * O WhatsApp é o canal principal desta cliente, e ele é exigente: sem imagem,
 * o link vira uma linha de texto cinza que ninguém abre. Com imagem, vira um
 * cartão.
 *
 * Cores escritas em hex de propósito. O `ImageResponse` roda fora do navegador
 * e não enxerga as variáveis CSS do tema — são os mesmos valores de
 * `globals.css`, e mudá-los aqui exige mudar lá.
 */
export const alt = `${APP_NAME} — ${APP_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0e17",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        {/* Faixa ciano no topo: a assinatura da marca, legível em miniatura. */}
        <div style={{ display: "flex", width: 140, height: 8, background: "#22d3ee" }} />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 30,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: "#22d3ee",
            }}
          >
            O Algoritmo
          </div>
          <div
            style={{
              fontSize: 84,
              fontWeight: 700,
              letterSpacing: -2,
              color: "#dbe4f3",
              marginTop: 4,
            }}
          >
            da Aprovação
          </div>
          <div
            style={{
              fontSize: 34,
              color: "#8ea0bd",
              marginTop: 28,
              maxWidth: 900,
              lineHeight: 1.35,
            }}
          >
            {APP_TAGLINE}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 26, color: "#8ea0bd" }}>
          Seu edital vira plano de estudo. Todo dia.
        </div>
      </div>
    ),
    size,
  );
}
