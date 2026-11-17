import {
  type InscricaoEstadual,
  buscarInscricoesEstaduais,
  escolherIe,
} from "@/lib/brasil/inscricao-estadual";
import { normalizarTelefone } from "@/lib/prospeccao/normalizacao";

/**
 * CNPJ — validar, buscar e mapear (cadastro de cliente PJ).
 *
 * Fonte: BrasilAPI (`/api/cnpj/v1/{cnpj}`), pública e sem chave. Timeout de
 * 10s e erros NOMEADOS (cnpj_invalido, nao_encontrado, servico_indisponivel)
 * para a tela dizer o motivo em vez de "algo deu errado".
 *
 * **A IE vem de outra fonte, e é de propósito.** A BrasilAPI não publica
 * inscrição estadual (verificado em 16/11/2026), e é ela que a NF-e exige —
 * rejeição 232 é exatamente isso. As duas consultas saem em paralelo, e a de
 * IE pode falhar sem derrubar o cadastro: cliente sem IE ainda é cliente.
 */

const CNPJ_DIGITS = /^\d{14}$/;

/**
 * A BrasilAPI responde **403 ao User-Agent padrão do Node** (`node`), medido em
 * 16/11/2026: `curl` recebia 200 e o `fetch` do servidor, 403 — o cadastro
 * aparecia como "Receita indisponível" sem a Receita ter caído. Identificar o
 * cliente devolve 200. Não é cosmético: é o que separa "fonte fora do ar" de
 * "fonte recusou o cliente".
 */
const CABECALHOS_HTTP = {
  accept: "application/json",
  "user-agent": "nexus-selfhost/1.0 (+https://github.com/spiesdan/nexus)",
} as const;

/**
 * Dígitos verificadores (módulo 11, pesos 5→2 e 6→2 — algoritmo da Receita).
 * Rejeita repetidos (00000000000000, 11111111111111, ...).
 */
export function isValidCnpj(raw: string): boolean {
  const s = raw.replace(/\D/g, "");
  if (!CNPJ_DIGITS.test(s) || /^(\d)\1{13}$/.test(s)) return false;
  const calc = (base: string, pesos: number[]): number => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += parseInt(base[i]!, 10) * pesos[i]!;
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(s.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== parseInt(s[12]!, 10)) return false;
  const d2 = calc(s.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d2 === parseInt(s[13]!, 10);
}

/** "12.345.678/0001-90" → "12345678000190" (ou NULL se nem tem 14 dígitos). */
export function normalizarCnpj(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  return d.length === 14 ? d : null;
}

/** "12345678000190" → "12.345.678/0001-90" (para exibir). */
export function formatarCnpj(digitos: string): string {
  const d = digitos.replace(/\D/g, "");
  if (d.length !== 14) return digitos;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export interface EmpresaReceita {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  email: string | null;
  telefone: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  situacao: string | null;
  /** IEs publicadas para o CNPJ, uma por UF. Vazio quando a fonte não tem. */
  inscricoes_estaduais: InscricaoEstadual[];
}

export type ErroCnpj = "cnpj_invalido" | "nao_encontrado" | "servico_indisponivel";

/** Busca na BrasilAPI. Nunca lança: erro vira {ok:false, erro}. */
export async function buscarCnpj(
  raw: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; empresa: EmpresaReceita } | { ok: false; erro: ErroCnpj }> {
  const digitos = normalizarCnpj(raw);
  if (!digitos || !isValidCnpj(digitos)) return { ok: false, erro: "cnpj_invalido" };

  // As duas fontes saem juntas. A de IE nunca rejeita (tem catch próprio), e o
  // resultado dela é lido só no caminho de sucesso — cadastro não depende dela.
  const iesPromessa = buscarInscricoesEstaduais(digitos, fetchFn);

  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 10000);
  try {
    const res = await fetchFn(`https://brasilapi.com.br/api/cnpj/v1/${digitos}`, {
      signal: controle.signal,
      headers: CABECALHOS_HTTP,
    });
    if (res.status === 404) return { ok: false, erro: "nao_encontrado" };
    if (!res.ok) return { ok: false, erro: "servico_indisponivel" };
    const j = (await res.json()) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const ies = await iesPromessa;
    return {
      ok: true,
      empresa: {
        cnpj: digitos,
        razao_social: str(j.razao_social) ?? "",
        nome_fantasia: str(j.nome_fantasia),
        email: str(j.email),
        telefone: [str(j.ddd_telefone_1), str(j.ddd_telefone_2)].find((t) => t) ?? null,
        logradouro: str(j.logradouro),
        numero: str(j.numero),
        bairro: str(j.bairro),
        municipio: str(j.municipio),
        uf: str(j.uf),
        cep: typeof j.cep === "string" ? j.cep.replace(/\D/g, "") || null : null,
        situacao: str(j.descricao_situacao_cadastral),
        inscricoes_estaduais: ies.inscricoes,
      },
    };
  } catch {
    return { ok: false, erro: "servico_indisponivel" };
  } finally {
    clearTimeout(limite);
  }
}

export interface ContatoPreenchido {
  cnpj: string;
  name: string;
  display_name: string | null;
  email: string | null;
  phone_number: string | null;
  fantasia: string | null;
  logradouro: string | null;
  numero_end: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  /**
   * IE do CNPJ na UF da empresa — `null` quando a fonte não publica nenhuma
   * para aquele estado. É o que a tela de cliente preenche e o que evita a
   * rejeição 232 na primeira nota.
   */
  ie: string | null;
  source_metadata: Record<string, unknown>;
}

/** Empresa → campos do contato. Telefone passa pela normalização BR. */
export function mapearParaContato(e: EmpresaReceita): ContatoPreenchido {
  const fone = normalizarTelefone(e.telefone);
  return {
    cnpj: e.cnpj,
    name: e.razao_social,
    display_name: e.nome_fantasia || e.razao_social || null,
    email: e.email,
    phone_number: fone,
    fantasia: e.nome_fantasia || null,
    logradouro: e.logradouro,
    numero_end: e.numero,
    bairro: e.bairro,
    cidade: e.municipio,
    uf: e.uf,
    cep: e.cep,
    ie: escolherIe(e.inscricoes_estaduais, e.uf),
    source_metadata: {
      receita: {
        situacao: e.situacao,
        endereco: [
          e.logradouro,
          e.numero,
          e.bairro,
          e.municipio && e.uf ? `${e.municipio}/${e.uf}` : null,
          e.cep,
        ]
          .filter(Boolean)
          .join(", "),
        // Guardar TODAS as IEs, e não só a escolhida: a empresa pode ter
        // inscrição em mais de um estado, e quem muda o destinatário de UF
        // precisa da outra sem consultar de novo.
        inscricoes_estaduais: e.inscricoes_estaduais,
      },
    },
  };
}
