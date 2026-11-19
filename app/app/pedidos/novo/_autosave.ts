"use client";

import * as React from "react";

/**
 * Autosave do rascunho (§31): salva no localStorage com debounce, nunca a
 * cada tecla. Restaura ao voltar (navegador fechado no meio da venda não
 * perde nada). O servidor só vê o pedido no Salvar/Finalizar — rascunho
 * local não é rascunho no banco.
 */
/** Prefixo único: a chave real é `pedido-rascunho:<org>:<user>`. */
export const PREFIXO_DO_RASCUNHO = "pedido-rascunho";

/**
 * O RASCUNHO É DE UMA ORGANIZAÇÃO E DE UM USUÁRIO.
 *
 * A chave era global (`pedido-rascunho`): o mesmo navegador, ao trocar de
 * organização ou ao entrar outro usuário, restaurava a venda do anterior. A
 * chave agora carrega o escopo; nada vaza entre tenants nem entre pessoas.
 */
export function chaveDoRascunho(escopo: string): string {
  return `${PREFIXO_DO_RASCUNHO}:${escopo}`;
}

export interface RascunhoSalvo {
  salvoEm: number;
  dados: Record<string, unknown>;
}

/**
 * O rascunho salvo é de OUTRO cliente que o link da ficha mandou?
 *
 * O link `/app/pedidos/novo?contato=<id>` chega com um cliente escolhido. Se o
 * localStorage tem uma venda em andamento de outro cliente (ou avulsa), aplicar
 * uma das duas em silêncio é errado: restaurar troca o cliente que a pessoa
 * acabou de escolher; descartar perde a venda. Quem decide é a tela.
 *
 * Rascunho sem `contatoId` (versão antiga ou cliente avulso) também conflita:
 * ele tem dono desconhecido, e o link tem um dono explícito.
 */
export function rascunhoDeOutroCliente(
  rascunho: { contatoId?: string | null } | null | undefined,
  contatoDoLink: string | null | undefined,
): boolean {
  if (!contatoDoLink || !rascunho) return false;
  return (rascunho.contatoId ?? null) !== contatoDoLink;
}

/**
 * A CHAVE DO RASCUNHO É DO DONO, NÃO DO NAVEGADOR.
 *
 * O autosave morava em `localStorage["pedido-rascunho"]` — uma chave só para a
 * instalação inteira. Num balcão compartilhado (que é como loja pequena usa o
 * sistema) a vendedora B abria o pedido e encontrava o rascunho da vendedora A:
 * cliente, itens e, pior, o nome de quem comprou. Trocando de organização no
 * mesmo browser, o vazamento era entre tenants.
 *
 * A chave passa a carregar organização + usuário. O rascunho antigo (sem
 * escopo) NÃO é lido: restaurar um rascunho de dono desconhecido é exatamente
 * o vazamento que esta função existe para impedir, e perder um rascunho local é
 * um preço honesto por não mostrar a venda de outra pessoa.
 */
export function chaveDoRascunho(
  orgId: string | null | undefined,
  userId: string | null | undefined,
): string {
  return `pedido-rascunho:${orgId ?? "sem-org"}:${userId ?? "sem-usuario"}`;
}


export function useAutosaveDraft(chave: string, dados: Record<string, unknown>, ativo: boolean) {
  const [salvoEm, setSalvoEm] = React.useState<number | null>(null);
  const [restaurou, setRestaurou] = React.useState(false);
  // `localStorage` pode recusar (modo privado, cota cheia, política do browser).
  // Antes o catch era silencioso: o vendedor achava que o rascunho estava salvo.
  const [falhaAoSalvar, setFalhaAoSalvar] = React.useState(false);
  const ref = React.useRef(dados);
  React.useEffect(() => {
    ref.current = dados;
  });

  const carregar = React.useCallback((): Record<string, unknown> | null => {
    try {
      const cru = window.localStorage.getItem(chave);
      if (!cru) return null;
      const parsed = JSON.parse(cru) as RascunhoSalvo;
      setSalvoEm(parsed.salvoEm);
      setRestaurou(true);
      return parsed.dados;
    } catch {
      return null;
    }
  }, [chave]);

  const assinatura = JSON.stringify(dados);
  React.useEffect(() => {
    if (!ativo) return;
    const timer = setTimeout(() => {
      try {
        const agora = Date.now();
        window.localStorage.setItem(chave, JSON.stringify({ salvoEm: agora, dados: ref.current }));
        setSalvoEm(agora);
        setFalhaAoSalvar(false);
      } catch {
        // Quota cheia ou privado: autosave é cortesia, mas o vendedor PRECISA
        // saber que o rascunho não está no disco. A tela mostra o aviso e deixa
        // continuar (o pedido ainda pode ser gerado).
        setFalhaAoSalvar(true);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [chave, ativo, assinatura]);

  const limpar = React.useCallback(() => {
    try {
      window.localStorage.removeItem(chave);
    } catch {
      // Silêncio de propósito (ver acima).
    }
    setSalvoEm(null);
    setRestaurou(false);
  }, [chave]);

  return { salvoEm, restaurou, carregar, limpar, falhaAoSalvar };
}

/** "há N segundos/minutos" para o selo de salvo. */
export function haQuantoTempo(salvoEm: number | null): string | null {
  if (!salvoEm) return null;
  const s = Math.max(0, Math.round((Date.now() - salvoEm) / 1000));
  if (s < 5) return "agora mesmo";
  if (s < 60) return `há ${s} segundos`;
  return `há ${Math.floor(s / 60)} min`;
}
