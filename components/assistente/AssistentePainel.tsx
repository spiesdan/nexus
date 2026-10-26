"use client";

import { AssistenteChat } from "./AssistenteChat";
import { useAssistente } from "./AssistenteProvider";

/**
 * O painel do assistente — aba de cima a baixo, encostada à direita.
 *
 * ─── Por que painel, e não balão ────────────────────────────────────────────
 *
 * O chat nasceu como popover de canto: 420px de altura, ancorado no avatar, e
 * brigava com o rodapé em qualquer tela. Virou uma superfície de ALTURA CHEIA,
 * logo abaixo da TopBar (`top-14`, a mesma altura do `header` em
 * `components/shell/TopBar.tsx`), como o painel de IA do Mercos: a conversa
 * tem espaço para histórico, propostas de ação e o campo de pergunta sem que
 * nada fique por baixo de outro elemento.
 *
 * A largura é fixa no desktop (416/432px: cabe uma mensagem com link e sobra
 * leitura) e TOTAL no celular, onde dividir a tela com o conteúdo daria duas
 * colunas inúteis. `z-50` fica acima do dock mobile (`z-40`): o formulário de
 * envio é o último item do painel e não pode ficar atrás da navegação.
 *
 * O desenho do painel é do `AssistenteChat` (`h-full`); aqui só o
 * posicionamento. `data-assistente="painel"` é o gancho de teste/inspeção.
 */
export function AssistentePainel() {
  const { aberto, fechar, contexto } = useAssistente();

  if (!aberto) return null;

  return (
    <aside
      className="assistente-painel-entra fixed top-14 right-0 bottom-0 z-50 flex w-full flex-col border-l border-border bg-background shadow-2xl sm:w-104 lg:w-108 print:hidden"
      data-assistente="painel"
    >
      <AssistenteChat aberto onFechar={fechar} contexto={contexto} />
    </aside>
  );
}
