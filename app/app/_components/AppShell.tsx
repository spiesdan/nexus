"use client";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { MobileDock } from "@/components/shell/MobileDock";
import { TopBar } from "@/components/shell/TopBar";
import { AssistentePainel } from "@/components/assistente/AssistentePainel";
import { AssistenteProvider } from "@/components/assistente/AssistenteProvider";
import { useT } from "@/hooks/i18n/useT";
import { useInboundMessageAlerts } from "@/hooks/notifications/useInboundMessageAlerts";
import { useCrmAlerts } from "@/hooks/notifications/useCrmAlerts";
import { useNotifyOpenFromServiceWorker } from "@/lib/notifications/notify_open";

interface AppShellProps {
  sidebarCollapsed: boolean;
  children: ReactNode;
}

export function AppShell({ sidebarCollapsed, children }: AppShellProps) {
  useInboundMessageAlerts();
  useCrmAlerts();
  useNotifyOpenFromServiceWorker();
  const t = useT();
  return (
    <AssistenteProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        {/* Primeiro alvo do Tab. A casca tem TopBar + Sidebar antes do conteúdo, e
          sem este atalho quem navega por teclado atravessa a navegação inteira
          em TODA tela. `focus:not-sr-only` o revela só quando recebe foco. */}
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:border focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
        >
          {t("Pular para o conteúdo")}
        </a>
        {/*
        Casca travada no viewport: `h-screen overflow-hidden` em vez de
        `min-h-screen`. Antes a casca crescia com o conteúdo e a rolagem era do
        body — o TopBar (`sticky`) ficava para cima e sumia da tela nas páginas
        longas. Agora só o `main` rola; TopBar e Sidebar ficam sempre visíveis.
      */}
        <div className="hidden md:block print:hidden">
          <Sidebar collapsed={sidebarCollapsed} />
        </div>
        {/*
        `min-w-0` é o que permite a coluna de conteúdo ENCOLHER. Um flex item
        nasce com `min-width: auto`, ou seja, nunca fica menor que o conteúdo —
        então qualquer bloco largo (uma fila de abas, uma tabela) empurrava a
        PÁGINA INTEIRA para o lado em vez de rolar dentro da própria caixa, e o
        conteúdo sumia sem nada indicando que existia.

        Medido em 390x844 no detalhe do agente, que tem seis abas: a página
        estourava 476px na horizontal; com esta classe, 212px — o que sobra é o
        cabeçalho, presente também em telas que não têm abas (a lista de agentes
        estoura 236px). Isolado ancestral por ancestral: é este o que decide.
      */}
        {/*
        Sem `md:ml-*`: a barra voltou a ocupar lugar na linha (ver o comentário
        em `Sidebar.tsx`), então o que sobra para esta coluna é exatamente o que
        ela não usou. A margem existia para compensar uma barra `fixed`, e era a
        SEGUNDA medida da mesma coisa — a que discordava e deixava a barra por
        cima da lista.
      */}
        {/*
        `min-h-0` nos dois níveis é o que deixa o `overflow` do `main`
        engatar: item de flex nasce com `min-height: auto` e nunca encolhe
        abaixo do conteúdo — sem isso a coluna estourava o viewport de novo
        e a rolagem voltava para o body (o defeito original por outro caminho).
      */}
        <div className="flex h-screen min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar />
          {/* `pb-24 md:pb-6`: o dock mobile é fixo e cobriria o fim do conteúdo.
            A trilha de navegação NÃO mora mais aqui: ela subiu para a TopBar
            (`components/shell/TopBar.tsx`), que era onde havia espaço vazio e
            é o lugar em que "onde estou" se lê junto de "para onde vou". Com
            isso o `main` perdeu a faixa fixa de ~28px que a trilha reservava em
            toda página de dois níveis ou mais. `id`/`tabIndex` existem para o
            atalho "Pular para o conteúdo" conseguir mover o FOCO, não só a
            rolagem; `focus:outline-hidden` evita o anel no contêiner inteiro
            depois do salto. */}
          <main
            id="conteudo"
            tabIndex={-1}
            className="flex min-h-0 flex-1 flex-col overflow-auto p-6 pb-24 focus:outline-hidden md:pb-6"
          >
            <div className="min-h-0 flex-1">{children}</div>
          </main>
        </div>
        <MobileDock />
        {/* Assistente: o gatilho mora na TopBar; este é o painel que ele abre —
          aba de altura cheia à direita, abaixo da barra. Só na área logada. */}
        <AssistentePainel />
      </div>
    </AssistenteProvider>
  );
}
