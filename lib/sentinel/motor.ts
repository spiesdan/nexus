/**
 * Motor de detecção — puro e à prova de regra quebrada.
 *
 * Contrato:
 *  - uma regra que lança NÃO derruba as outras (falha isolada é registrada);
 *  - achado inválido (sem entidade, regra trocada) é rejeitado e vira falha;
 *  - a mesma impressão digital não aparece duas vezes na mesma rodada;
 *  - a ordem é determinística: severidade desc → regra → entidade.
 *
 * O runner aplica o teto de carga DEPOIS daqui, para que o corte seja por
 * severidade e não pela ordem em que as tabelas foram lidas.
 */
import { fingerprint, PESO_SEVERIDADE, type Achado, type Recomendacao, type Snapshot } from "./tipos";
import { REGRAS } from "./regras";
import { RECOMENDACOES } from "./recomendacoes";

export interface FalhaDeRegra {
  regra: string;
  motivo: string;
}

export interface ResultadoDeteccao {
  achados: Achado[];
  /** Regras que rodaram até o fim — só elas podem encerrar ocorrências ausentes. */
  regrasAvaliadas: string[];
  falhas: FalhaDeRegra[];
}

export interface OpcoesDeteccao {
  /** Ids desativados pela configuração da organização. */
  desativados?: readonly string[];
  /** Injeção para teste; default = registry. */
  regras?: typeof REGRAS;
  /** Injeção para teste; default = RECOMENDACOES. */
  recomendacoes?: Record<string, (achado: Achado) => Recomendacao>;
}

const CAMPOS_TEXTO = ["regra", "entidadeTipo", "entidadeId", "titulo", "resumo", "causaProvavel"] as const;

function achadoValido(a: Achado, idEsperado: string): string | null {
  if (a.regra !== idEsperado) return `regra devolveu id "${a.regra}" em vez de "${idEsperado}"`;
  for (const campo of CAMPOS_TEXTO) {
    if (typeof a[campo] !== "string" || a[campo].trim() === "") {
      return `campo obrigatório vazio: ${campo}`;
    }
  }
  if (!a.entidadeId.trim()) return "entidadeId vazio";
  return null;
}

/** O plano do Nível 1 precisa ser utilizável pela tela, não só existir. */
function recomendacaoValida(a: Achado): string | null {
  const r = a.recomendacao;
  if (!r) return "regra sem plano de correção (RECOMENDACOES)";
  if (typeof r.resumo !== "string" || r.resumo.trim().length < 8) return "plano sem resumo";
  if (!Array.isArray(r.passos) || r.passos.length === 0) return "plano sem passos";
  if (!Array.isArray(r.campos_pendentes)) return "plano sem campos_pendentes";
  if (!["baixo", "medio", "alto"].includes(r.risco)) return "plano com risco inválido";
  if (!["reversivel", "parcial", "irreversivel"].includes(r.reversibilidade)) {
    return "plano com reversibilidade inválida";
  }
  if (!["alta", "media", "baixa"].includes(r.confianca)) return "plano com confiança inválida";
  if (!Array.isArray(r.fonte) || r.fonte.length === 0) return "plano sem fonte";
  if (typeof r.exige_aprovacao !== "boolean") return "plano sem exige_aprovacao";
  if (r.limitacao !== null && typeof r.limitacao !== "string") return "plano com limitação inválida";
  return null;
}

export function executarDetectores(
  snapshot: Snapshot,
  opcoes: OpcoesDeteccao = {},
): ResultadoDeteccao {
  const desativados = new Set(opcoes.desativados ?? []);
  const regras = opcoes.regras ?? REGRAS;
  const recomendacoes = opcoes.recomendacoes ?? RECOMENDACOES;
  const porFingerprint = new Map<string, Achado>();
  const regrasAvaliadas: string[] = [];
  const falhas: FalhaDeRegra[] = [];

  for (const regra of regras) {
    if (desativados.has(regra.id)) continue;

    try {
      const achados = regra.detectar(snapshot);
      if (!Array.isArray(achados)) {
        falhas.push({ regra: regra.id, motivo: "detector não devolveu array" });
        continue;
      }

      let invalido: string | null = null;
      const comPlano: Achado[] = [];
      for (const achado of achados) {
        invalido = achadoValido(achado, regra.id);
        if (invalido) break;
        const recomendacao = recomendacoes[regra.id]?.(achado);
        if (!recomendacao) {
          invalido = "regra sem plano de correção no mapa RECOMENDACOES";
          break;
        }
        const planoInvalido = recomendacaoValida({ ...achado, recomendacao });
        if (planoInvalido) {
          invalido = planoInvalido;
          break;
        }
        comPlano.push({ ...achado, recomendacao });
      }
      if (invalido) {
        falhas.push({ regra: regra.id, motivo: invalido });
        continue;
      }

      // Só conta como avaliada quando produziu resultado válido: uma regra
      // que estourou no meio não pode fechar ocorrências por ausência.
      regrasAvaliadas.push(regra.id);
      for (const achado of comPlano) {
        const chave = fingerprint(achado);
        const existente = porFingerprint.get(chave);
        if (!existente || PESO_SEVERIDADE[achado.severidade] > PESO_SEVERIDADE[existente.severidade]) {
          porFingerprint.set(chave, achado);
        }
      }
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      falhas.push({ regra: regra.id, motivo: motivo.slice(0, 300) });
    }
  }

  const achados = [...porFingerprint.values()].sort((a, b) => {
    const porSeveridade = PESO_SEVERIDADE[b.severidade] - PESO_SEVERIDADE[a.severidade];
    if (porSeveridade !== 0) return porSeveridade;
    if (a.regra !== b.regra) return a.regra.localeCompare(b.regra);
    return a.entidadeId.localeCompare(b.entidadeId);
  });

  return { achados, regrasAvaliadas, falhas };
}
