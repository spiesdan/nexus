"use client";

import { Toaster } from "@/components/nexus-ui/feedback/nexus-toast";

import { useT } from "@/hooks/i18n/useT";

/**
 * O `<Toaster />` do produto, com o nome acessível no idioma da tela.
 *
 * ─── O DEFEITO (medido em 18/11/2026, no pacote instalado) ─────────────────
 *
 * O `sonner` 2.0.8 tem `closeButtonAriaLabel = 'Close toast'` como PADRÃO
 * (`node_modules/sonner/dist/index.js:502`). O produto liga `closeButton` no
 * `<Toaster/>` do `app/layout.tsx` e não passava esse rótulo: todo botão de
 * fechar aviso era anunciado em INGLÊS num produto que só tem `pt-BR`
 * (`lib/i18n/idiomas.ts: IDIOMAS = ["pt-BR"]`).
 *
 * Não é detalhe de tradução: é o único controle do aviso para quem usa leitor
 * de tela, e ele dizia "Close toast" — metade em inglês, metade sem dizer o que
 * fecha.
 *
 * ⚠️ O PROP `closeButtonAriaLabel` DO `<Toaster>` NÃO FUNCIONA — medido.
 *
 * A primeira versão desta correção passou `closeButtonAriaLabel` direto no
 * `<Toaster>` e o DOM continuou saindo com `aria-label="Close toast"`. O motivo
 * está no próprio pacote: o `Toaster` desestrutura esse prop com o default
 * (linha 502, dentro do componente de toast) mas só o REPASSA adiante pelo
 * `toastOptions` (linha 1233: `closeButtonAriaLabel: toastOptions?.closeButtonAriaLabel`).
 * O prop de topo é aceito pelo tipo e ignorado em runtime — o modo de falha
 * silencioso clássico. O caminho que vale é `toastOptions`.
 *
 * Fica registrado porque a alternativa ("passei o prop, deve funcionar") é o
 * que qualquer leitura do README sugere, e o teste deste arquivo só falha se
 * alguém olhar o nome acessível de verdade.
 *
 * ─── POR QUE UM WRAPPER, E NÃO O RÓTULO DIRETO NO LAYOUT ──────────────────
 *
 * `app/layout.tsx` é Server Component e o tradutor do produto (`useT`) é de
 * cliente. Escrever "Fechar aviso" como literal ali funcionaria hoje — o
 * produto só tem pt-BR — e viraria a única string de UI fora do tradutor no dia
 * em que houver um segundo idioma. O wrapper é client, usa `useT` e mantém o
 * layout no papel dele: montar infraestrutura, não decidir texto.
 *
 * As demais opções do `Toaster` (posição, cores ricas, fechar, 4 s) foram
 * movidas para cá sem mudança de valor.
 */
export function ToasterDoProduto() {
  const t = useT();
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      duration={4000}
      toastOptions={{ closeButtonAriaLabel: t("Fechar aviso") }}
    />
  );
}
