/**
 * SISTEMA DE CONFIANÇA — Address Recovery Engine (§5 do requisito).
 *
 * Três estados com regra dura: vetos independentes da pontuação vencem
 * qualquer score alto. É preferível pedir confirmação humana do que mandar
 * uma entrega para o endereço errado.
 *
 * Regras de veto (independentes do score):
 *   - UF divergente entre informado e candidato ⇒ nunca automático.
 *   - CEP presente em ambos e divergente ⇒ nunca automático (caso clássico:
 *     CEP correto, cidade escrita errada — o CEP manda).
 *   - Município divergente sem CEP de confirmação ⇒ nunca automático.
 *   - Dois provedores com pontos a mais de 5 km um do outro ⇒ pelo menos
 *     intermediário (nunca automático).
 *
 * Limiares configuráveis por env:
 *   RECUPERACAO_LIMIAR_ALTA         default 0.85
 *   RECUPERACAO_LIMIAR_INTERMEDIARIA default 0.60
 */

export interface ContextoConfianca {
  /** Pontuação global 0–1 do candidato. */
  score: number;
  /** Componentes por parte do endereço (null quando ausente). */
  componentes: {
    rua: number | null;
    municipio: number | null;
    uf: number | null;
    cep: number | null;
    bairro: number | null;
    numero: number | null;
  };
  /** CEP informado e CEP do candidato (para veto de CEP). */
  cepInformado: string | null;
  cepCandidato: string | null;
  /** UF informada e UF do candidato (para veto de UF). */
  ufInformada: string | null;
  ufCandidata: string | null;
  /** Município informado e município do candidato. */
  municipioInformado: string | null;
  municipioCandidato: string | null;
  /** Distância em metros entre candidatos de provedores diferentes (null se só um). */
  distanciaEntreProvedoresM: number | null;
  /** Se já há um candidato "recuperado" aceito anteriormente. */
  jaRecuperado: boolean;
}

export type NivelConfianca = "alta" | "intermediaria" | "baixa";

export interface ResultadoConfianca {
  nivel: NivelConfianca;
  /** Pode corrigir automaticamente sem intervenção humana. */
  permiteCorrecaoAutomatica: boolean;
  /** Motivo legível para a tela e para o log de auditoria. */
  motivo: string;
  /** Vetos disparados, se houver. */
  vetos: string[];
  score: number;
}

const LIMIAR_ALTA_PADRAO = 0.85;
const LIMIAR_INTERMEDIARIA_PADRAO = 0.60;
const DISTANCIA_MAX_ENTRE_PROVEDORES_M = 5_000;

function lerLimiar(chave: string, padrao: number): number {
  const bruto = Number(process.env[chave]);
  return Number.isFinite(bruto) && bruto >= 0 && bruto <= 1 ? bruto : padrao;
}

/**
 * Avalia a confiança de um candidato. Retorna o nível e se a correção
 * automática é permitida.
 */
export function avaliarConfianca(ctx: ContextoConfianca): ResultadoConfianca {
  const limiarAlta = lerLimiar("RECUPERACAO_LIMIAR_ALTA", LIMIAR_ALTA_PADRAO);
  const limiarIntermediaria = lerLimiar(
    "RECUPERACAO_LIMIAR_INTERMEDIARIA",
    LIMIAR_INTERMEDIARIA_PADRAO
  );
  const vetos: string[] = [];

  // ── VETOS DUROS (vencem qualquer score) ────────────────────────────────

  const ufInformada = (ctx.ufInformada ?? "").trim().toUpperCase();
  const ufCandidata = (ctx.ufCandidata ?? "").trim().toUpperCase();
  if (ufInformada && ufCandidata && ufInformada !== ufCandidata) {
    vetos.push("uf_divergente");
  }

  const cepInformado = ctx.cepInformado ? ctx.cepInformado.replace(/[^0-9]/g, "") : null;
  const cepCandidato = ctx.cepCandidato ? ctx.cepCandidato.replace(/[^0-9]/g, "") : null;
  if (cepInformado && cepCandidato && cepInformado !== cepCandidato) {
    vetos.push("cep_divergente");
  }

  const municipioInformado = (ctx.municipioInformado ?? "").trim().toLowerCase();
  const municipioCandidato = (ctx.municipioCandidato ?? "").trim().toLowerCase();
  if (
    municipioInformado &&
    municipioCandidato &&
    municipioInformado !== municipioCandidato &&
    !(cepInformado && cepCandidato && cepInformado === cepCandidato)
  ) {
    vetos.push("municipio_divergente_sem_cep");
  }

  // Distância entre provedores diferentes: se o primeiro candidato do
  // Nominatim e o primeiro do Photon apontam para pontos distantes, não
  // confiamos cegamente em nenhum.
  if (
    ctx.distanciaEntreProvedoresM != null &&
    ctx.distanciaEntreProvedoresM > DISTANCIA_MAX_ENTRE_PROVEDORES_M
  ) {
    vetos.push("provedores_divergentes");
  }

  // ── Avaliação ──────────────────────────────────────────────────────────

  if (vetos.length > 0) {
    return {
      nivel: "intermediaria",
      permiteCorrecaoAutomatica: false,
      motivo: `Veto de confiança: ${vetos.join(", ")}. Exige confirmação humana.`,
      vetos,
      score: ctx.score,
    };
  }

  if (ctx.jaRecuperado) {
    // Já existe um candidato aceito para este destino: não substitui
    // silenciosamente. Vai para confirmação humana.
    return {
      nivel: "intermediaria",
      permiteCorrecaoAutomatica: false,
      motivo: "Destino já possui recuperação aceita. Exige confirmação humana para sobrescrever.",
      vetos: ["ja_recuperado"],
      score: ctx.score,
    };
  }

  if (ctx.score >= limiarAlta) {
    return {
      nivel: "alta",
      permiteCorrecaoAutomatica: true,
      motivo:
        ctx.score >= 0.95
          ? "Endereço idêntico ou quase idêntico em todos os componentes."
          : `Alta confiança (${(ctx.score * 100).toFixed(0)}%): componentes consistentes.`,
      vetos: [],
      score: ctx.score,
    };
  }

  if (ctx.score >= limiarIntermediaria) {
    return {
      nivel: "intermediaria",
      permiteCorrecaoAutomatica: false,
      motivo: `Confiança intermediária (${(ctx.score * 100).toFixed(0)}%): exibe sugestões para confirmação.`,
      vetos: [],
      score: ctx.score,
    };
  }

  return {
    nivel: "baixa",
    permiteCorrecaoAutomatica: false,
    motivo: `Baixa confiança (${(ctx.score * 100).toFixed(0)}%): não altera o endereço.`,
    vetos: [],
    score: ctx.score,
  };
}

/**
 * Limiares efetivos em vigor (útil para testes e logs).
 */
export function limiares(): { alta: number; intermediaria: number } {
  return {
    alta: lerLimiar("RECUPERACAO_LIMIAR_ALTA", LIMIAR_ALTA_PADRAO),
    intermediaria: lerLimiar("RECUPERACAO_LIMIAR_INTERMEDIARIA", LIMIAR_INTERMEDIARIA_PADRAO),
  };
}
