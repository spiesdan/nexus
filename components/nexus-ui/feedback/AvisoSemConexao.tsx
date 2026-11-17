"use client";

import { Warning } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";

/**
 * AVISO DE AÇÃO PAUSADA POR FALTA DE REDE.
 *
 * O TanStack Query, no modo `online` (padrão), **pausa** a busca quando o
 * navegador está offline: não dispara requisição, não erra, não avisa. A tela
 * fica exatamente igual — e "Carregar mais" vira um botão que não faz nada.
 *
 * Medido em 17/11/2026 com o navegador offline: 25 linhas antes, 25 depois,
 * zero requisições, zero avisos, botão inalterado por 20 segundos (V-42).
 *
 * O componente existe para a mensagem ser UMA, com o mesmo texto e a mesma cor,
 * em toda lista paginada do produto — em vez de cada tela inventar a sua.
 */
export function AvisoSemConexao({ children }: { children?: React.ReactNode }) {
  const t = useT();
  return (
    <p role="status" className="flex items-center gap-1.5 text-sm text-warning-fg">
      <Warning size={14} aria-hidden />
      {children ??
        t(
          "Sem conexão. O que já carregou continua na tela; o resto vem quando a rede voltar.",
        )}
    </p>
  );
}
