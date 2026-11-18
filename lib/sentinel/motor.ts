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
import { fingerprint, PESO_SEVERIDADE, type Achado, type Snapshot } from "./tipos";
import { REGRAS } from "./regras";

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

export function executarDetectores(
  snapshot: Snapshot,
  opcoes: OpcoesDeteccao = {},
): ResultadoDeteccao {
  const desativados = new Set(opcoes.desativados ?? []);
  const regras = opcoes.regras ?? REGRAS;
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
      for (const achado of achados) {
        invalido = achadoValido(achado, regra.id);
        if (invalido) break;
      }
      if (invalido) {
        falhas.push({ regra: regra.id, motivo: invalido });
        continue;
      }

      // Só conta como avaliada quando produziu resultado válido: uma regra
      // que estourou no meio não pode fechar ocorrências por ausência.
      regrasAvaliadas.push(regra.id);
      for (const achado of achados) {
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
