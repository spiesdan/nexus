"use client";
import { AssistenteAvatar } from "@/components/assistente/AssistenteAvatar";
import { useAssistente } from "@/components/assistente/AssistenteProvider";
import { Breadcrumb } from "./Breadcrumb";
import { MobileSidebar } from "./MobileSidebar";
import { NotificationCenter } from "./NotificationCenter";
import { SearchTrigger } from "./SearchTrigger";
import { TenantSwitcher } from "./TenantSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

/**
 * O gatilho do assistente na barra.
 *
 * Ele mora entre o tema e o sino — antes do sino, como no Mercos (✦ · sino ·
 * conta) — e não mais no canto inferior direito, onde cobria conteúdo e
 * disputava o rodapé com o dock do celular. O ícone é o símbolo do Grok Bot
 * (`IconeAssistente`), desenhado no tamanho dos ícones vizinhos.
 */
function GatilhoAssistente() {
  const { aberto, alternar } = useAssistente();
  return <AssistenteAvatar aberto={aberto} onToggle={alternar} />;
}

/**
 * A barra do topo do app — CONTEXTO à esquerda, AÇÕES à direita.
 *
 * ─── Por que a trilha subiu para cá ─────────────────────────────────────────
 *
 * Antes a barra era [menu/empresa] · [busca centralizada] · [tema/sino/avatar],
 * e a trilha de navegação ocupava uma faixa própria logo abaixo, dentro do
 * `main`. Medido em 1440px: o grupo da esquerda ficava com 0px (empresa única
 * não renderiza o seletor) e a busca boiava a 86px do centro ótico da barra,
 * enquanto uma linha inteira de conteúdo era gasta repetindo "onde estou" —
 * informação que a barra tinha espaço de sobra para carregar.
 *
 * Agora a esquerda é o contexto (menu mobile → empresa → trilha) e a direita é
 * a ação (busca, tema, assistente, avisos, conta). A busca deixou de disputar o
 * centro: é um gatilho de comando, e comando mora junto das outras ações. No
 * mobile ela continua sendo o primeiro item do grupo, como ícone — o rótulo
 * textual só aparece a partir de `md`, onde há largura para ele.
 *
 * O assistente entrou neste grupo em vez de flutuar no canto: ele ABRE um
 * painel, e gatilho de painel mora na barra que o painel encosta (o painel
 * começa em `top-14`, exatamente onde esta barra termina).
 *
 * A trilha em si continua vindo do registro de navegação (`Breadcrumb.tsx`);
 * aqui só mudou QUEM a posiciona.
 */
export function TopBar() {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 md:gap-3 md:px-6 print:hidden">
      <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
        <MobileSidebar />
        <TenantSwitcher />
        <div className="hidden min-w-0 flex-1 md:flex">
          <Breadcrumb />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 md:gap-2">
        <SearchTrigger />
        <ThemeToggle />
        <GatilhoAssistente />
        <NotificationCenter />
        {/* Separador: o avatar é a única ação que fala de QUEM está logado, e
            não do que a barra faz. Sem ele, os quatro alvos têm o mesmo peso. */}
        <span aria-hidden className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <UserMenu />
      </div>
    </header>
  );
}
