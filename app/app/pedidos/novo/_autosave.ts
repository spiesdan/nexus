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
 * SALVAR NA ABA QUANDO O DISCO RECUSA (decisão 5, 20/11/2026).
 *
 * `localStorage` falha em modo privado, com a cota cheia e por política do
 * navegador. Antes, a única resposta era avisar "não foi possível salvar" — e a
 * venda ficava só na memória, perdida no primeiro reload. `sessionStorage` é a
 * segunda chance: sobrevive a recarregar a aba (não a fechá-la), que é o caso
 * comum de quem recarrega no meio da venda.
 *
 * Ordem: disco primeiro (é o que sobrevive ao navegador), sessão depois. A
 * LEITURA escolhe o rascunho mais NOVO entre os dois — se o disco está cheio, o
 * da sessão é o fresco, e um par antigo no disco não pode ganhar por estar no
 * lugar "preferido".
 */
function gravar(chave: string, valor: string): boolean {
  try {
    window.localStorage.setItem(chave, valor);
    return true;
  } catch {
    // cota/modo privado: tenta a aba
  }
  try {
    window.sessionStorage.setItem(chave, valor);
    return true;
  } catch {
    return false;
  }
}

function ler(chave: string): RascunhoSalvo | null {
  const candidatos: RascunhoSalvo[] = [];
  for (const armazenamento of [window.localStorage, window.sessionStorage]) {
    try {
      const cru = armazenamento.getItem(chave);
      if (!cru) continue;
      const parsed = JSON.parse(cru) as RascunhoSalvo;
      if (typeof parsed?.salvoEm === "number") candidatos.push(parsed);
    } catch {
      // armazenamento bloqueado ou conteúdo corrompido: tenta o próximo
    }
  }
  if (candidatos.length === 0) return null;
  return candidatos.reduce((maisNovo, c) => (c.salvoEm > maisNovo.salvoEm ? c : maisNovo));
}

function apagar(chave: string): void {
  for (const armazenamento of [window.localStorage, window.sessionStorage]) {
    try {
      armazenamento.removeItem(chave);
    } catch {
      // silêncio de propósito: limpar é cortesia, não pode quebrar o fluxo
    }
  }
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
      const parsed = ler(chave);
      if (!parsed) return null;
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
      const agora = Date.now();
      const gravou = gravar(chave, JSON.stringify({ salvoEm: agora, dados: ref.current }));
      if (gravou) {
        setSalvoEm(agora);
        setFalhaAoSalvar(false);
        return;
      }
      // As DUAS recusaram: autosave é cortesia, mas o vendedor PRECISA saber
      // que o rascunho não está em lugar nenhum. A tela avisa e deixa continuar
      // (o pedido ainda pode ser gerado).
      setFalhaAoSalvar(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [chave, ativo, assinatura]);

  const limpar = React.useCallback(() => {
    apagar(chave);
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
