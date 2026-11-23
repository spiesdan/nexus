/**
 * ORÇAMENTOS PARADOS — o dado que a tela do D vai mostrar.
 *
 * Magnitude medida em produção (20/11/2026, doc 40 §16): 124 rascunhos
 * `origem='mercos'` somando R$ 218.003,63; 119 deles nunca foram abertos pelo
 * nosso operador (`created_by IS NULL`). Aqui não se inventa regra comercial:
 * a régua de idade vem de `organizations.settings`, com padrão de 60 dias
 * declarado — nunca um número escondido no componente.
 *
 * Toda linha sai com PRÓXIMO PASSO (invariante 4): lista sem ação é lista morta.
 */
/** Padrão declarado; a org pode sobrescrever em `settings.orcamentos_parados.dias_limite`. */
export const DIAS_PADRAO = 60;

export interface OrcadorParado {
  id: string;
  numero: number;
  cliente: string;
  valor_cents: number;
  criado_em: string;
  criado_por_humano: boolean;
}

export interface OrcamentoParado extends OrcadorParado {
  idade_dias: number;
  dias_limite: number;
  proximo_passo: {
    acao: "converter" | "cobrar" | "expirar" | "observar";
    texto: string;
  };
}

/** settings é jsonb livre: valor inválido cai no padrão, não derruba a rota. */
export function diasDaRégua(settings: unknown): number {
  if (!settings || typeof settings !== "object") return DIAS_PADRAO;
  const bloco = (settings as Record<string, unknown>).orcamentos_parados;
  if (!bloco || typeof bloco !== "object") return DIAS_PADRAO;
  const bruto = (bloco as Record<string, unknown>).dias_limite;
  const numero = typeof bruto === "number" ? bruto : Number(bruto);
  if (!Number.isFinite(numero)) return DIAS_PADRAO;
  return Math.min(365, Math.max(1, Math.trunc(numero)));
}

/** Idade em dias corridos, nunca negativa (relógio do servidor pode andar). */
export function idadeEmDias(criadoEm: string, agora: Date): number {
  const inicio = new Date(criadoEm).getTime();
  if (!Number.isFinite(inicio)) return 0;
  return Math.max(0, Math.floor((agora.getTime() - inicio) / 86_400_000));
}

/**
 * Próximo passo por linha. Rascunho do ERP nunca aberto (`created_by IS NULL`)
 * pede CONVERTER, não "cobrar" — ninguém da nossa equipe começou aquilo.
 * Passado o limite, o passo é EXPIRAR/encerrar, não insistir Thomas.
 */
export function proximoPasso(args: {
  idadeDias: number;
  diasLimite: number;
  criadoPorHumano: boolean;
}): OrcamentoParado["proximo_passo"] {
  if (args.idadeDias >= args.diasLimite) {
    return {
      acao: "expirar",
      texto: `Parado há ${args.idadeDias} dias (limite ${args.diasLimite}): confirmar encerramento ou converter em pedido.`,
    };
  }
  if (!args.criadoPorHumano) {
    return {
      acao: "converter",
      texto: `Orçamento do Mercos nunca aberto há ${args.idadeDias} dias: conferir no ERP e converter em pedido se ainda estiver vivo.`,
    };
  }
  if (args.idadeDias >= Math.floor(args.diasLimite / 2)) {
    return {
      acao: "cobrar",
      texto: `Rascunho humano há ${args.idadeDias} dias: entrar em contato e fechar ou arquivar.`,
    };
  }
  return {
    acao: "observar",
    texto: `Rascunho recente (${args.idadeDias} dias): acompanhar na próxima rodada.`,
  };
}

/** Ordena por idade (mais parado primeiro) — a fila é de trabalho, não alfabética. */
export function montarFila(
  linhas: readonly OrcadorParado[],
  agora: Date,
  diasLimite: number,
): OrcamentoParado[] {
  return linhas
    .map((linha) => {
      const idade = idadeEmDias(linha.criado_em, agora);
      return {
        ...linha,
        idade_dias: idade,
        dias_limite: diasLimite,
        proximo_passo: proximoPasso({
          idadeDias: idade,
          diasLimite,
          criadoPorHumano: linha.criado_por_humano,
        }),
      };
    })
    .sort((a, b) => b.idade_dias - a.idade_dias);
}
