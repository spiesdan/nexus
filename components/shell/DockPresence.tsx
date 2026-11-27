"use client";

import * as React from "react";

/**
 * O DOCK ESTÁ NA TELA? — uma resposta, não uma suposição.
 *
 * Barras fixas que compõem com o dock (`/app/expedicao/nova`) precisam saber se
 * ele existe. Elas assumiam que sim e ficavam 57 px acima do rodapé quando o
 * dock devolve `null` — papel sem nenhum destino, ou rota em `SEM_DOCK`. A
 * barra flutuava sobre o vazio (medido em 27/11/2026).
 *
 * O valor é calculado no `AppShell` pela MESMA regra que o `MobileDock` usa
 * para renderizar: não há segunda medida que possa discordar.
 */
const DockPresenteContext = React.createContext(false);

export function DockPresenceProvider({
  presente,
  children,
}: {
  presente: boolean;
  children: React.ReactNode;
}) {
  return <DockPresenteContext.Provider value={presente}>{children}</DockPresenteContext.Provider>;
}

/** `true` quando o dock inferior ocupa o rodapé desta tela. */
export function useDockPresente(): boolean {
  return React.useContext(DockPresenteContext);
}
