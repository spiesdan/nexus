/**
 * DEDUP DO MAPS — os três degraus do plano v5 (§3).
 *
 *   1. `place_id` — identidade. Mesmo lugar = mesma linha; idempotência.
 *   2. telefone E.164 — o mesmo número em formatações diferentes (com/sem DDD,
 *      com/sem +55, pontuação) é a mesma empresa.
 *   3. nome + CEP/endereço — PROVÁVEL. Conta como "já existia" na tela, mas
 *      NÃO bloqueia a gravação: fica marcado para revisão humana. Duas filiais
 *      na mesma rua têm o mesmo nome, e bloquear apagaria uma loja real.
 *
 * O motor existente (`decidirDedup`) continua sendo a decisão do fluxo de
 * prospects; esta função é o contrato específico do Maps, onde o telefone
 * sozinho já é forte (o scraper devolve um telefone por ficha, não uma matriz
 * compartilhada como no export do usuário).
 */

import { normalizarNome, normalizarTelefone, partirEndereco } from "./normalizacao";

export type DegrauDedupMaps = "place_id" | "telefone" | "provavel" | "novo";

export interface ProspectMapsExistente {
  id: string;
  /** `place_id` cru; quem guarda `maps:<id>` em external_id pode extrair antes. */
  placeId: string | null;
  /** Já normalizado em E.164; a função normaliza de novo por segurança. */
  telefone: string | null;
  nome: string;
  cep?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  logradouro?: string | null;
}

export interface CandidatoMaps {
  placeId: string | null;
  telefone: string | null;
  nome: string;
  cep?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  logradouro?: string | null;
}

export interface DecisaoDedupMaps {
  degrau: DegrauDedupMaps;
  comQuem: string | null;
  /** `false` = atualiza a linha existente; `true` = pode inserir. */
  gravar: boolean;
  /** Conta em "já existia" na tela (inclusive o provável). */
  contaComoExistente: boolean;
  motivo: string;
}

/** `maps:ChIJ...` → `ChIJ...`; valores sem prefixo passam iguais. */
export function placeIdDeExternalId(externalId: string | null | undefined): string | null {
  if (!externalId) return null;
  const t = externalId.trim();
  if (t === "") return null;
  return t.startsWith("maps:") ? t.slice("maps:".length) : t;
}

function enderecoNormalizado(endereco: string | null | undefined): string | null {
  if (!endereco || !endereco.trim()) return null;
  const n = endereco
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return n.length > 8 ? n : null;
}

function cepNormalizado(cep: string | null | undefined): string | null {
  if (!cep) return null;
  const d = cep.replace(/\D/g, "");
  return d.length === 8 ? d : null;
}

function textoNormalizado(v: string | null | undefined): string | null {
  if (!v || !v.trim()) return null;
  const n = v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return n.length > 2 ? n : null;
}

/**
 * Degrau 3 — nome + CEP; sem CEP, nome + cidade + logradouro.
 *
 * O CEP é a prova mais forte. Quando o scraper não traz CEP (ou o cadastro não
 * tem), a queda é nome + cidade + logradouro — nunca só o nome, que juntaria
 * filiais de cidades diferentes. `endereco` completo continua aceito como
 * último recurso para linhas antigas que não foram partidas.
 */
function mesmoLugarProvavel(c: CandidatoMaps, e: ProspectMapsExistente): boolean {
  if (normalizarNome(c.nome) !== normalizarNome(e.nome)) return false;

  const cepC = cepNormalizado(c.cep);
  const cepE = cepNormalizado(e.cep);
  if (cepC && cepE) return cepC === cepE;

  const cidadeC = textoNormalizado(c.cidade);
  const cidadeE = textoNormalizado(e.cidade);
  const ruaC = textoNormalizado(c.logradouro);
  const ruaE = textoNormalizado(e.logradouro);
  if (cidadeC && cidadeE && ruaC && ruaE) {
    return cidadeC === cidadeE && ruaC === ruaE;
  }

  const endC = enderecoNormalizado(c.endereco);
  const endE = enderecoNormalizado(e.endereco);
  return Boolean(endC && endE && endC === endE);
}

export function decidirDedupMaps(
  candidato: CandidatoMaps,
  existentes: ProspectMapsExistente[],
): DecisaoDedupMaps {
  const placeId = candidato.placeId?.trim() || null;
  if (placeId) {
    const igual = existentes.find((e) => e.placeId && e.placeId === placeId);
    if (igual) {
      return {
        degrau: "place_id",
        comQuem: igual.id,
        gravar: false,
        contaComoExistente: true,
        motivo: "mesmo place_id — atualiza a linha, não duplica",
      };
    }
  }

  const telefone = normalizarTelefone(candidato.telefone);
  if (telefone) {
    const igual = existentes.find((e) => normalizarTelefone(e.telefone) === telefone);
    if (igual) {
      return {
        degrau: "telefone",
        comQuem: igual.id,
        gravar: false,
        contaComoExistente: true,
        motivo: `mesmo telefone E.164 (${telefone})`,
      };
    }
  }

  const provavel = existentes.find((e) => mesmoLugarProvavel(candidato, e));
  if (provavel) {
    return {
      degrau: "provavel",
      comQuem: provavel.id,
      gravar: true,
      contaComoExistente: true,
      motivo: "mesmo nome + CEP/endereço — provável duplicado, marcado para revisão",
    };
  }

  return {
    degrau: "novo",
    comQuem: null,
    gravar: true,
    contaComoExistente: false,
    motivo: "sem correspondência nos três degraus",
  };
}

/**
 * Conveniência para quem lê `business_prospects`: monta o existente a partir
 * das colunas reais (`external_id`, `telefone_normalizado`, `nome`, `cep`,
 * `endereco`) sem espalhar o parsing do prefixo `maps:`.
 */
export function existenteDeProspect(p: {
  id: string;
  external_id: string | null;
  telefone_normalizado: string | null;
  nome: string;
  cep?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  logradouro?: string | null;
}): ProspectMapsExistente {
  return {
    id: p.id,
    placeId: placeIdDeExternalId(p.external_id),
    telefone: p.telefone_normalizado,
    nome: p.nome,
    cep: p.cep ?? null,
    endereco: p.endereco ?? null,
    cidade: p.cidade ?? null,
    logradouro: p.logradouro ?? null,
  };
}

// Reexportado para o teste do degrau 3 documentar a mesma partição usada na
// leitura do endereço do scraper (logradouro+número, cidade, UF, CEP).
export { partirEndereco };
