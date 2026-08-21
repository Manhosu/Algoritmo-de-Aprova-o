import type { MetadataRoute } from "next";

import { APP_DESCRIPTION, APP_NAME } from "@/config/app";

/**
 * Manifesto do site — é o que permite "Adicionar à tela de início" no celular.
 *
 * Pedido da cliente em 21/08/2026. Com ele, o aluno ganha um ícone na tela
 * inicial do telefone com o símbolo da marca, e ao tocar o site abre em tela
 * cheia, sem a barra de endereço do navegador.
 *
 * Não é um aplicativo nativo, e não pretende ser. É a mesma plataforma web —
 * o que muda é o atalho e a moldura.
 *
 * `display: "standalone"` é o que remove a barra do navegador. `start_url`
 * aponta para a área do aluno: quem já tem o atalho instalado é alguém que já
 * usa, e cair na landing de vendas seria um passo a mais todo dia.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: "Algoritmo",
    description: APP_DESCRIPTION,
    lang: "pt-BR",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0e17",
    theme_color: "#0a0e17",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        // "any maskable" deixa o Android recortar no formato do sistema sem
        // cortar o símbolo — o ícone foi gerado com margem interna para isso.
        purpose: "any",
      },
      {
        src: "/brand/symbol-square.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
