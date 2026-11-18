import type { MetadataRoute } from "next";

/**
 * O MANIFESTO PWA — o "app do entregador" instalável.
 *
 * Não é um app nativo: é a operação instalável na tela inicial (Android:
 * "Adicionar à tela inicial" / iOS: "Adicionar à Tela de Início"), abrindo
 * em `standalone` (sem barra do navegador).
 *
 * ─── O que funciona offline (e o que este comentário já negou por engano) ───
 *
 * O comentário anterior dizia que service worker era "fase futura". Não é:
 * `public/sw.js` existe, é registrado em produção por
 * `app/app/_components/RegistrarServiceWorker.tsx` e guarda HTML/JS/CSS da
 * última visita. O que funciona sem rede: abrir as telas já visitadas (o
 * pedido do vendedor em `localStorage`), a captura no shell nativo e a fila
 * SQLite. O que NÃO funciona: dado novo do servidor — sem rede não há dado,
 * e o app mostra o estado offline em vez de uma lista vazia silenciosa.
 *
 * Nome neutro de propósito: o manifest é estático e a marca varia por
 * instalação (doutrina white-label) — o ícone 512px carrega a marca,
 * porque ele é gerado em runtime (`app/icone-512/route.ts`).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // `id` explícito: é a identidade da instalação. Sem ele o navegador usa
    // `start_url`, e mudar a rota inicial passaria a criar um SEGUNDO app
    // instalado no aparelho em vez de atualizar o existente.
    id: "/",
    name: "Operação de vendas",
    short_name: "Vendas",
    description: "Rotas de entrega com controle offline.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon", sizes: "64x64", type: "image/png" },
      { src: "/icone-512", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
