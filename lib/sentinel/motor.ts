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

/**
 * Orçamento de detecção por rodada.
 *
 * O cron roda a cada 15 min; a detecção é in-memory e hoje leva dezenas de ms
 * num snapshot cheio. O teto existe para uma regra patológica (ou um snapshot
 * anormalmente grande) não segurar a rodada: ao estourar, as regras restantes
 * NÃO são avaliadas e a rodada vira truncada — logo, não encerra ocorrências
 * por ausência. Medido nesta máquina (18/11/2026) com 2k produtos + 2k pedidos
 * + 2k recebíveis + 2k leads: **7 ms** para as 29 regras (`motor.test.ts`);
 * o default de 8 s é folga de três ordens de grandeza.
 *
 * É um teto de TEMPO, não de contagem: o registry tem 29 detectores fixos e
 * contar regras não protegeria contra uma regra lenta.
 */
export const ORCAMENTO_DETECCAO_PADRAO_MS = 8_000;

export interface ResultadoDeteccao {
  achados: Achado[];
  /** Regras que rodaram até o fim — só elas podem encerrar ocorrências ausentes. */
  regrasAvaliadas: string[];
  /** Regras que NÃO rodaram (orçamento estourou ou falharam) — intocadas. */
  regrasNaoAvaliadas: string[];
  /** Tempo por regra avaliada, em ms — para medir quem estoura o orçamento. */
  temposPorRegra: Record<string, number>;
  falhas: FalhaDeRegra[];
  /** Tempo total da fase de detecção (sem coleta/persistência). */
  tempoMs: number;
  /** true = o orçamento acabou e regras ficaram de fora (rodada não é prova). */
  truncadoPorTempo: boolean;
}

export interface OpcoesDeteccao {
  /** Ids desativados pela configuração da organização. */
  desativados?: readonly string[];
  /** Injeção para teste; default = registry. */
  regras?: typeof REGRAS;
  /** Injeção para teste; default = RECOMENDACOES. */
  recomendacoes?: Record<string, (achado: Achado) => Recomendacao>;
  /** Teto de tempo da detecção; default = ORCAMENTO_DETECCAO_PADRAO_MS. */
  orcamentoMs?: number;
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
  const orcamento = opcoes.orcamentoMs ?? ORCAMENTO_DETECCAO_PADRAO_MS;
  const porFingerprint = new Map<string, Achado>();
  const regrasAvaliadas: string[] = [];
  const regrasNaoAvaliadas: string[] = [];
  const temposPorRegra: Record<string, number> = {};
  const falhas: FalhaDeRegra[] = [];
  const inicio = performance.now();
  let truncadoPorTempo = false;

  for (const regra of regras) {
    if (desativados.has(regra.id)) continue;

    // Checado ANTES de cada regra: uma regra já iniciada termina (não há como
    // interromper CPU síncrona); o que não acontece é começar a próxima.
    if (performance.now() - inicio > orcamento) {
      truncadoPorTempo = true;
      // Tudo o que ainda não foi avaliado (inclusive esta e as seguintes) fica
      // registrado como intocado; o runner não pode encerrar ocorrência delas.
      const indiceAtual = regras.indexOf(regra);
      for (const restante of regras.slice(indiceAtual)) {
        if (!desativados.has(restante.id) && !regrasAvaliadas.includes(restante.id)) {
          regrasNaoAvaliadas.push(restante.id);
        }
      }
      break;
    }

    try {
      const inicioDaRegra = performance.now();
      const achados = regra.detectar(snapshot);
      temposPorRegra[regra.id] = Math.round((performance.now() - inicioDaRegra) * 10) / 10;
      if (!Array.isArray(achados)) {
        falhas.push({ regra: regra.id, motivo: "detector não devolveu array" });
        regrasNaoAvaliadas.push(regra.id);
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
        regrasNaoAvaliadas.push(regra.id);
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
      regrasNaoAvaliadas.push(regra.id);
    }
  }

  const achados = [...porFingerprint.values()].sort((a, b) => {
    const porSeveridade = PESO_SEVERIDADE[b.severidade] - PESO_SEVERIDADE[a.severidade];
    if (porSeveridade !== 0) return porSeveridade;
    if (a.regra !== b.regra) return a.regra.localeCompare(b.regra);
    return a.entidadeId.localeCompare(b.entidadeId);
  });

  return {
    achados,
    regrasAvaliadas,
    regrasNaoAvaliadas,
    temposPorRegra,
    falhas,
    tempoMs: Math.round(performance.now() - inicio),
    truncadoPorTempo,
  };
}
