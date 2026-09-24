"use client";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { AnimatedSidebarProvider } from "@/components/motion/animated-sidebar";
import { AnimatedAppSidebar } from "@/components/shell/AnimatedAppSidebar";
import { MobileDock } from "@/components/shell/MobileDock";
import { TopBar } from "@/components/shell/TopBar";
import { AssistenteFlutuante } from "@/components/assistente/AssistenteFlutuante";
import { toggleSidebar } from "@/app/actions/shell/toggleSidebar";
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
  // Estado controlado espelhando o cookie `sidebar_collapsed` (lido no SSR
  // para não piscar). Cada alternância persiste via Server Action.
  const [open, setOpen] = useState(!sidebarCollapsed);
  const [, startTransition] = useTransition();

  return (
    <AnimatedSidebarProvider
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        startTransition(() => toggleSidebar(!next));
      }}
      className="h-screen min-h-0 overflow-hidden bg-background"
    >
      <AnimatedAppSidebar />
      {/*
        `min-w-0` é o que permite a coluna de conteúdo ENCOLHER. Um flex item
        nasce com `min-width: auto`, ou seja, nunca fica menor que o conteúdo —
        então qualquer bloco largo (uma fila de abas, uma tabela) empurrava a
        PÁGINA INTEIRA para o lado em vez de rolar dentro da própria caixa, e o
        conteúdo sumia sem nada indicando que existia.
      */}
      <div className="flex h-screen min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        {/* `pb-24 md:pb-6`: o dock mobile é fixo e cobriria o fim do conteúdo. */}
        <main className="min-h-0 flex-1 overflow-auto p-6 pb-24 md:pb-6">{children}</main>
      </div>
      <MobileDock />
      {/* Assistente de ajuda: só na área logada (/app/*), canto inferior
          direito. Reage ao mouse, pula no clique e abre o chat de ajuda. */}
      <AssistenteFlutuante />
    </AnimatedSidebarProvider>
  );
}
