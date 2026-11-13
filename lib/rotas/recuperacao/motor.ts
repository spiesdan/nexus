/**
 * ADDRESS RECOVERY ENGINE — motor de recuperação de endereços (§3–§7).
 *
 * Fluxo obrigatório, sem pular etapa:
 *   1. endereço original (consulta exata);
 *   2. normalizado (espaço, acento, abreviação, CEP) — cadeia completa;
 *   3. correção de digitação (variações de rua/número/complemento);
 *   4. pesquisa por componentes (rua, número, bairro, cidade, UF, CEP);
 *   5. provedor alternativo (Photon), comparado com o que o Nominatim achou.
 *
 * Regras que este arquivo garante:
 *   - NUNCA assume o primeiro resultado: cada candidato é pontuado contra o
 *     que o vendedor digitou e passa por vetos duros (confianca.ts).
 *   - Ponto aproximado (bairro/cidade) NUNCA é correção automática: vira
 *     sugestão para o operador. Pino no centroide não é endereço de entrega.
 *   - Sem componentes do provedor não há como verificar UF/CEP/município,
 *     então também não há correção automática.
 *   - Destino já resolvido (`encontrado`/`recuperado`) não é reconsultado.
 *   - Falha de provedor não derruba a carga: vira `erro` e a carga segue.
 *   - Endereço original é imutável; `endereco_normalizado` e
 *     `endereco_recuperado` são campos separados.
 *   - Toda tentativa vira linha em `shipment_destination_recoveries`.
 */

import {
  geocodificarComFallback,
  geocodificarEndereco,
  type EstadoGeo,
  type PartesEndereco,
  type ResultadoGeo,
} from "@/lib/rotas/geocodificacao";
import { buscarPhoton, buscarPhotonPorComponentes, photonDisponivel } from "./photon";
import { avaliarConfianca, limiares } from "./confianca";
import { formatarCep, haversineM, normalizarTexto, similaridadeEndereco } from "./similaridade";
import { logger } from "@/lib/logger";

export type EstadoRecuperacao =
  | "nao_tentada"
  | "encontrado"
  | "recuperado"
  | "ambiguo"
  | "nao_encontrado"
  | "erro";

/**
 * Estado da coluna `shipment_destinations.geo_status` (0308), que tem
 * `pendente` a mais que `EstadoGeo`: "ainda não tem pino, e não é erro".
 * `EstadoGeo` descreve o resultado de UMA consulta ao provedor; este descreve
 * o estado do DESTINO no banco. Confundir os dois é o que produzia update com
 * valor fora do check da 0308.
 */
export type GeoStatusDestino = "pendente" | "ok" | "nao_encontrado" | "ambiguo" | "erro";

export type MetodoRecuperacao =
  | "original"
  | "normalizado"
  | "digitos"
  | "componentes"
  | "photon"
  | "manual";

export interface PartesEnderecoInformado {
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  /** Linha completa do endereço, como o vendedor digitou. */
  linha?: string | null;
}

export interface CandidatoRecuperado {
  endereco: string;
  latitude: number;
  longitude: number;
  precisao: "numero" | "rua" | "bairro" | "cidade";
  metodo: MetodoRecuperacao;
  provedor: "nominatim" | "photon";
  confianca: number;
  motivo: string;
  componentes: PartesEnderecoInformado;
  /** Pontuação detalhada por componente, para auditoria. */
  scoreComponentes?: Record<string, number | null>;
  bruto?: unknown;
}

export interface TentativaRegistrada {
  tentativa: number;
  provedor: string;
  consulta: string;
  estado: EstadoGeo;
  candidatos: number;
  confianca: number | null;
  motivo: string;
}

export interface ResultadoRecuperacao {
  destinationId: string;
  /** Estado do destino após a recuperação. */
  estado: EstadoRecuperacao;
  /** Candidato aceito automaticamente, ou null. */
  candidato: CandidatoRecuperado | null;
  /** Sugestões para confirmação humana (intermediária/baixa). */
  sugestoes: CandidatoRecuperado[];
  /** Histórico de tentativas executadas (para o log de auditoria). */
  tentativas: TentativaRegistrada[];
  /** Se o destino já estava resolvido e não houve nova consulta. */
  jaEstavaResolvido: boolean;
}

/** Orçamento de consultas por destino (protege o provedor público). */
const ORCAMENTO_REQUISICOES_POR_DESTINO = 40;
/** Abaixo disto nem vale sugerir: é ruído, não candidato. */
const LIMIAR_MIN_SUGESTAO = 0.5;

/**
 * Extrai partes estruturadas do endereço informado (linha ou partes soltas).
 */
function extrairPartes(informado: PartesEnderecoInformado): PartesEnderecoInformado {
  const partes: PartesEnderecoInformado = {};
  if (informado.rua) partes.rua = informado.rua.trim();
  if (informado.numero) partes.numero = String(informado.numero).trim();
  if (informado.complemento) partes.complemento = informado.complemento.trim();
  if (informado.bairro) partes.bairro = informado.bairro.trim();
  if (informado.cidade) partes.cidade = informado.cidade.trim();
  if (informado.uf) partes.uf = informado.uf.trim().toUpperCase();
  if (informado.cep) partes.cep = formatarCep(informado.cep) ?? informado.cep.trim();
  if (informado.linha) partes.linha = informado.linha.trim();
  return partes;
}

/** Monta uma linha legível a partir das partes. */
function linhaDasPartes(p: PartesEnderecoInformado): string {
  return [
    p.rua,
    p.numero,
    p.complemento,
    p.bairro,
    p.cidade,
    p.uf,
    p.cep,
  ]
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .join(", ");
}

/** Linha a partir dos componentes que o PROVEDOR devolveu (o que ele resolveu). */
function linhaDoCandidato(c: NonNullable<ResultadoGeo["componentes"]>): string | null {
  const linha = [
    c.rua,
    c.numero,
    c.bairro,
    c.municipio,
    c.uf,
    c.cep,
  ]
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .join(", ");
  return linha || null;
}

interface MotorDeps {
  /** Grava uma linha no histórico de recuperações. */
  gravarHistorico: (linha: {
    destinationId: string;
    tentativa: number;
    provedor: string;
    consulta: string;
    candidatos: unknown[];
    confianca: number | null;
    motivo: string;
    criadoPor: string | null;
  }) => Promise<void>;
  /** Atualiza o destino no banco com o resultado da recuperação. */
  atualizarDestino: (linha: {
    destinationId: string;
    recuperacaoStatus: EstadoRecuperacao;
    enderecoNormalizado: string | null;
    enderecoRecuperado: string | null;
    latitude: number | null;
    longitude: number | null;
    geoStatus: GeoStatusDestino;
    geoFonte: string | null;
    geoPrecisaoM: number | null;
    confianca: number | null;
    metodo: MetodoRecuperacao | null;
    provedor: string | null;
    recuperadoEm: string | null;
  }) => Promise<void>;
  /** Usuário que está executando a recuperação (para auditoria). */
  criadoPor: string | null;
}

type Desfecho = "auto" | "sugestao" | "nada";

/**
 * Executa as 5 tentativas de recuperação para um destino.
 *
 * Idempotente: destino já resolvido (`encontrado`/`recuperado`) não consulta
 * nada e devolve `jaEstavaResolvido = true`.
 */
export async function recuperarDestino(
  destinationId: string,
  enderecoOriginal: string | null,
  partesInformado: PartesEnderecoInformado,
  estadoAtual: EstadoRecuperacao,
  coordenadaAtual: { latitude: number | null; longitude: number | null } | null,
  deps: MotorDeps
): Promise<ResultadoRecuperacao> {
  const resultado: ResultadoRecuperacao = {
    destinationId,
    estado: estadoAtual,
    candidato: null,
    sugestoes: [],
    tentativas: [],
    jaEstavaResolvido: false,
  };

  if (estadoAtual === "recuperado" || estadoAtual === "encontrado") {
    resultado.jaEstavaResolvido = true;
    return resultado;
  }

  const inicioMs = Date.now();

  const partes = extrairPartes(partesInformado);
  const linhaOriginal = enderecoOriginal?.trim() || partes.linha || null;
  const enderecoNormalizado = linhaDasPartes(partes) || null;

  const informadoComparacao = {
    rua: partes.rua ?? null,
    municipio: partes.cidade ?? null,
    uf: partes.uf ?? null,
    cep: partes.cep ?? null,
    bairro: partes.bairro ?? null,
    numero: partes.numero ?? null,
  };

  let requisicoes = 0;
  const restante = () => ORCAMENTO_REQUISICOES_POR_DESTINO - requisicoes;
  let viuErro = false;
  let melhorSugestao: CandidatoRecuperado | null = null;
  let melhorScore = 0;
  // Em objeto de propósito: o valor é atribuído dentro de `avaliarResultado`
  // (closure), então a análise de fluxo do TS estreitaria a variável a `never`
  // na leitura. Propriedade de objeto não sofre essa estreiteza.
  const nominatim: { melhor: CandidatoRecuperado | null } = { melhor: null };

  const registrar = async (
    tentativa: number,
    provedor: string,
    consulta: string,
    estado: EstadoGeo,
    candidatos: unknown[],
    confianca: number | null,
    motivo: string
  ) => {
    resultado.tentativas.push({
      tentativa,
      provedor,
      consulta,
      estado,
      candidatos: candidatos.length,
      confianca,
      motivo,
    });
    await deps.gravarHistorico({
      destinationId,
      tentativa,
      provedor,
      consulta,
      candidatos,
      confianca,
      motivo,
      criadoPor: deps.criadoPor,
    });
  };

  /**
   * Pontua um resultado do provedor e decide: corrige, sugere ou descarta.
   * É aqui que os vetos duros entram — nunca no chamador.
   */
  const avaliarResultado = async (
    r: ResultadoGeo,
    tentativa: number,
    metodo: MetodoRecuperacao,
    consulta: string
  ): Promise<Desfecho> => {
    if (r.estado !== "ok" || r.latitude == null || r.longitude == null) {
      if (r.estado === "erro") viuErro = true;
      await registrar(
        tentativa,
        "nominatim",
        consulta,
        r.estado,
        [],
        null,
        r.estado === "erro" ? "Provedor indisponível nesta tentativa." : "Sem candidato."
      );
      return "nada";
    }

    const comp = r.componentes ?? null;
    const componentes = {
      rua: comp?.rua ?? null,
      numero: comp?.numero ?? null,
      bairro: comp?.bairro ?? null,
      cidade: comp?.municipio ?? null,
      uf: comp?.uf ?? null,
      cep: comp?.cep ?? null,
    };

    const sim = similaridadeEndereco(informadoComparacao, {
      rua: componentes.rua,
      municipio: componentes.cidade,
      uf: componentes.uf,
      cep: componentes.cep,
      bairro: componentes.bairro,
      numero: componentes.numero,
    });

    const conf = avaliarConfianca({
      score: sim.score,
      componentes: sim.componentes,
      cepInformado: partes.cep ?? null,
      cepCandidato: componentes.cep,
      ufInformada: partes.uf ?? null,
      ufCandidata: componentes.uf,
      municipioInformado: partes.cidade ?? null,
      municipioCandidato: componentes.cidade,
      distanciaEntreProvedoresM: null,
      jaRecuperado: false,
    });

    // Sem componentes do provedor não há verificação possível: sugere, nunca
    // corrige sozinho. (O `classificarResultado` só omite componentes quando o
    // provedor não devolveu `address`.)
    const verificavel = comp != null;
    // Centroide de bairro/cidade não é endereço de entrega.
    const preciso = r.precisao === "numero" || r.precisao === "rua";
    const aceitaAutomatico = conf.permiteCorrecaoAutomatica && conf.nivel === "alta" && verificavel && preciso;

    const endereco =
      linhaDoCandidato(comp ?? { rua: null, numero: null, bairro: null, municipio: null, uf: null, cep: null }) ??
      linhaOriginal ??
      enderecoNormalizado ??
      consulta;

    const cand: CandidatoRecuperado = {
      endereco,
      latitude: r.latitude,
      longitude: r.longitude,
      precisao: r.precisao ?? "rua",
      metodo,
      provedor: "nominatim",
      confianca: Math.round(sim.score * 1000) / 1000,
      motivo: aceitaAutomatico
        ? conf.motivo
        : `${conf.motivo}${preciso ? "" : " Ponto aproximado (sem número) não é corrigido automaticamente."}`,
      componentes,
      scoreComponentes: sim.componentes,
      bruto: comp,
    };

    await registrar(
      tentativa,
      "nominatim",
      consulta,
      "ok",
      [cand],
      cand.confianca,
      cand.motivo
    );

    if (aceitaAutomatico) {
      resultado.candidato = cand;
      // "recuperado" = houve correção; "encontrado" = confirmou o que já havia.
      // A comparação é por COMPONENTE: formatar o CEP de outro jeito, ou o
      // provedor devolver a linha completa em ordem diferente, não é correção
      // de endereço — e marcar isso como "recuperado" faria o histórico
      // mentir sobre o que mudou.
      const corrigiu = houveCorrecao(partes, componentes, linhaOriginal, enderecoNormalizado);
      const estado: EstadoRecuperacao = corrigiu ? "recuperado" : "encontrado";
      await aplicarResultado(deps, resultado, estado, cand, "nominatim", enderecoNormalizado);
      logger.info("recuperacao.endereco", {
        destinationId,
        estado,
        metodo: cand.metodo,
        provedor: cand.provedor,
        precisao: cand.precisao,
        confianca: cand.confianca,
        tentativa,
        duracaoMs: Date.now() - inicioMs,
      });
      return "auto";
    }

    if (nominatim.melhor == null) nominatim.melhor = cand;
    if (sim.score >= LIMIAR_MIN_SUGESTAO && sim.score > melhorScore) {
      melhorScore = sim.score;
      melhorSugestao = cand;
    }
    return "sugestao";
  };

  const partesGeo: PartesEndereco = {
    logradouro: partes.rua ?? null,
    numero_end: partes.numero ?? null,
    bairro: partes.bairro ?? null,
    cidade: partes.cidade ?? null,
    uf: partes.uf ?? null,
    cep: partes.cep ?? null,
  };

  // ── Tentativa 1 — endereço original, como foi digitado ───────────────────
  if (restante() > 0 && linhaOriginal) {
    requisicoes++;
    try {
      const r = await geocodificarEndereco(linhaOriginal);
      if ((await avaliarResultado(r, 1, "original", linhaOriginal)) === "auto") return resultado;
    } catch {
      viuErro = true;
      await registrar(1, "nominatim", linhaOriginal, "erro", [], null, "Exceção na tentativa 1.");
    }
  }

  // ── Tentativa 2 — normalização (cadeia completa) ─────────────────────────
  const consultaNormalizada = enderecoNormalizado ?? linhaOriginal;
  if (restante() > 0 && consultaNormalizada) {
    requisicoes++;
    try {
      const r = await geocodificarComFallback(partesGeo, linhaOriginal);
      if ((await avaliarResultado(r, 2, "normalizado", consultaNormalizada)) === "auto") return resultado;
    } catch {
      viuErro = true;
      await registrar(2, "nominatim", consultaNormalizada, "erro", [], null, "Exceção na tentativa 2.");
    }
  }

  // ── Tentativa 3 — correção de digitação ──────────────────────────────────
  if (restante() > 0) {
    for (const variacao of gerarVariacoesDigito(linhaOriginal, partes)) {
      if (restante() <= 0) break;
      if (variacao === linhaOriginal || variacao === consultaNormalizada) continue;
      requisicoes++;
      try {
        const r = await geocodificarEndereco(variacao);
        if ((await avaliarResultado(r, 3, "digitos", variacao)) === "auto") return resultado;
      } catch {
        viuErro = true;
        await registrar(3, "nominatim", variacao, "erro", [], null, "Exceção na tentativa 3.");
      }
    }
  }

  // ── Tentativa 4 — pesquisa por componentes ───────────────────────────────
  const consultaComponentes = [partes.rua, partes.numero, partes.bairro, partes.cidade, partes.uf, partes.cep]
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .join(", ");
  if (restante() > 0 && consultaComponentes && consultaComponentes !== consultaNormalizada) {
    requisicoes++;
    try {
      const r = await geocodificarEndereco(consultaComponentes);
      if ((await avaliarResultado(r, 4, "componentes", consultaComponentes)) === "auto") return resultado;
    } catch {
      viuErro = true;
      await registrar(4, "nominatim", consultaComponentes, "erro", [], null, "Exceção na tentativa 4.");
    }
  }

  // ── Tentativa 5 — provedor alternativo (Photon) ──────────────────────────
  if (restante() > 0 && photonDisponivel()) {
    const consultaPhoton = linhaOriginal ?? consultaNormalizada ?? consultaComponentes;
    if (consultaPhoton) {
      requisicoes++;
      try {
        let candidatos = await buscarPhoton(consultaPhoton);
        if (candidatos.length === 0) {
          candidatos = await buscarPhotonPorComponentes(partes);
        }
        const melhor = escolherMelhorPhoton(candidatos, informadoComparacao);
        if (melhor) {
          const distancia =
            nominatim.melhor != null
              ? haversineM(
                  nominatim.melhor.latitude,
                  nominatim.melhor.longitude,
                  melhor.latitude,
                  melhor.longitude
                )
              : null;

          if (distancia != null && distancia > 5_000 && nominatim.melhor != null) {
            // Provedores apontam para pontos distantes: nenhum é confiável
            // sozinho. Vira sugestão, com o motivo declarado.
            const motivo = `Nominatim e Photon divergem ${(distancia / 1000).toFixed(1)} km. Exige confirmação humana.`;
            await registrar(5, "photon", consultaPhoton, "ok", [melhor], melhor.confianca, motivo);
            if (melhor.confianca >= LIMIAR_MIN_SUGESTAO && melhor.confianca > melhorScore) {
              melhorScore = melhor.confianca;
              melhorSugestao = { ...melhor, motivo };
            }
          } else {
            const conf = avaliarConfianca({
              score: melhor.confianca,
              componentes: {
                rua: null,
                municipio: null,
                uf: null,
                cep: null,
                bairro: null,
                numero: null,
              },
              cepInformado: partes.cep ?? null,
              cepCandidato: melhor.componentes.cep ?? null,
              ufInformada: partes.uf ?? null,
              ufCandidata: melhor.componentes.uf ?? null,
              municipioInformado: partes.cidade ?? null,
              municipioCandidato: melhor.componentes.cidade ?? null,
              distanciaEntreProvedoresM: distancia,
              jaRecuperado: false,
            });
            await registrar(5, "photon", consultaPhoton, "ok", [melhor], melhor.confianca, conf.motivo);

            // Photon tem tipagem menos confiável que o Nominatim: só sugere,
            // nunca corrige automaticamente sem confirmação humana.
            if (melhor.confianca >= LIMIAR_MIN_SUGESTAO && melhor.confianca > melhorScore) {
              melhorScore = melhor.confianca;
              melhorSugestao = { ...melhor, motivo: conf.motivo };
            }
          }
        } else {
          await registrar(5, "photon", consultaPhoton, "nao_encontrado", [], null, "Photon sem candidato.");
        }
      } catch {
        viuErro = true;
        await registrar(5, "photon", consultaPhoton, "erro", [], null, "Photon indisponível.");
      }
    }
  }

  // ── Desfecho ────────────────────────────────────────────────────────────
  if (melhorSugestao) {
    resultado.sugestoes = [melhorSugestao];
    resultado.estado = "ambiguo";
    await aplicarResultado(deps, resultado, "ambiguo", null, null, enderecoNormalizado, melhorSugestao);
    logger.warn("recuperacao.aguardando_confirmacao", {
      destinationId,
      estado: "ambiguo",
      provedor: melhorSugestao.provedor,
      confianca: melhorSugestao.confianca,
      tentativas: resultado.tentativas.length,
      duracaoMs: Date.now() - inicioMs,
    });
    return resultado;
  }

  // Nada encontrado: se já havia coordenada válida, ela é preservada — não se
  // apaga um pino bom só porque a busca não achou nada melhor.
  const temCoordenada = coordenadaAtual?.latitude != null && coordenadaAtual?.longitude != null;
  const estadoFinal: EstadoRecuperacao = temCoordenada ? "encontrado" : viuErro ? "erro" : "nao_encontrado";
  resultado.estado = estadoFinal;
  await aplicarResultado(deps, resultado, estadoFinal, null, null, enderecoNormalizado);
  logger.warn("recuperacao.sem_resultado", {
    destinationId,
    estado: estadoFinal,
    tentativas: resultado.tentativas.length,
    duracaoMs: Date.now() - inicioMs,
  });
  return resultado;
}

/**
 * Houve correção de endereço? Compara componente a componente.
 *
 * O que NÃO conta como correção:
 *   - o provedor devolver a linha completa (o informado pode ter só a rua);
 *   - CEP em outro formato (`89460000` × `89460-000`);
 *   - acento/caixa/pontuação, que `normalizarTexto` já resolve.
 *
 * O que conta: rua, número, bairro, município, UF ou CEP (dígitos) diferentes,
 * quando os dois lados têm o componente. Componente ausente no que o vendedor
 * digitou não é correção — é o provedor completando, e completar não é mudar.
 */
function houveCorrecao(
  informado: PartesEnderecoInformado,
  componentes: {
    rua: string | null;
    numero: string | null;
    bairro: string | null;
    cidade: string | null;
    uf: string | null;
    cep: string | null;
  },
  linhaOriginal: string | null,
  enderecoNormalizado: string | null
): boolean {
  const pares: Array<[string | null | undefined, string | null]> = [
    [informado.rua, componentes.rua],
    [informado.numero, componentes.numero],
    [informado.bairro, componentes.bairro],
    [informado.cidade, componentes.cidade],
    [informado.uf, componentes.uf],
  ];
  for (const [a, b] of pares) {
    if (!a?.trim() || !b?.trim()) continue;
    if (normalizarTexto(a) !== normalizarTexto(b)) return true;
  }

  const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
  const cepInformado = digitos(informado.cep);
  const cepCandidato = digitos(componentes.cep);
  if (cepInformado && cepCandidato && cepInformado !== cepCandidato) return true;

  // Sem componentes estruturados do lado informado, a linha é a única prova.
  // Aí o CEP sai da comparação: o provedor sempre devolve o dele, e digitá-lo
  // não é o vendedor ter errado o endereço.
  const temEstruturado = Boolean(informado.rua?.trim() || informado.cidade?.trim() || informado.uf?.trim());
  if (!temEstruturado) {
    const semCep = (s: string) => normalizarTexto(s.replace(/\b\d{5}-?\d{3}\b/g, ""));
    const base = linhaOriginal ?? enderecoNormalizado ?? "";
    const candidato = [componentes.rua, componentes.numero, componentes.bairro, componentes.cidade, componentes.uf]
      .filter((v): v is string => typeof v === "string" && v.trim() !== "")
      .join(", ");
    if (base && candidato && semCep(base) !== semCep(candidato)) return true;
  }

  return false;
}

/** Escolhe o candidato Photon mais parecido com o que foi informado. */
function escolherMelhorPhoton(
  candidatos: unknown[],
  informado: {
    rua: string | null;
    municipio: string | null;
    uf: string | null;
    cep: string | null;
    bairro: string | null;
    numero: string | null;
  }
): CandidatoRecuperado | null {
  let melhor: { cand: CandidatoRecuperado; score: number } | null = null;
  for (const bruto of candidatos) {
    const c = bruto as {
      rua?: string | null;
      numero?: string | null;
      bairro?: string | null;
      cidade?: string | null;
      uf?: string | null;
      cep?: string | null;
      lat?: number | null;
      lng?: number | null;
    };
    if (c.lat == null || c.lng == null) continue;
    const sim = similaridadeEndereco(informado, {
      rua: c.rua ?? null,
      municipio: c.cidade ?? null,
      uf: c.uf ?? null,
      cep: c.cep ?? null,
      bairro: c.bairro ?? null,
      numero: c.numero ?? null,
    });
    const endereco =
      [c.rua, c.numero, c.bairro, c.cidade, c.uf, c.cep]
        .filter((v): v is string => typeof v === "string" && v.trim() !== "")
        .join(", ") || "Endereço sugerido pelo Photon";
    const cand: CandidatoRecuperado = {
      endereco,
      latitude: c.lat,
      longitude: c.lng,
      precisao: c.numero ? "numero" : "cidade",
      metodo: "photon",
      provedor: "photon",
      confianca: Math.round(sim.score * 1000) / 1000,
      motivo: `Candidato do Photon (similaridade ${(sim.score * 100).toFixed(0)}%).`,
      componentes: {
        rua: c.rua ?? null,
        numero: c.numero ?? null,
        bairro: c.bairro ?? null,
        cidade: c.cidade ?? null,
        uf: c.uf ?? null,
        cep: c.cep ?? null,
      },
      scoreComponentes: sim.componentes,
    };
    if (!melhor || sim.score > melhor.score) melhor = { cand, score: sim.score };
  }
  return melhor?.cand ?? null;
}

/**
 * Aplica o resultado no banco: nunca toca em `endereco_original`.
 *
 * Quando `sugestao` existe e nenhum ponto foi aceito, o destino fica
 * `ambiguo` SEM coordenada nova (a anterior, se houver, é preservada) — a
 * sugestão vive no histórico e na resposta da API até o operador decidir.
 */
async function aplicarResultado(
  deps: MotorDeps,
  resultado: ResultadoRecuperacao,
  estado: EstadoRecuperacao,
  cand: CandidatoRecuperado | null,
  provedor: string | null,
  enderecoNormalizado: string | null,
  sugestao?: CandidatoRecuperado
) {
  resultado.estado = estado;
  if (cand) {
    await deps.atualizarDestino({
      destinationId: resultado.destinationId,
      recuperacaoStatus: estado,
      enderecoNormalizado,
      enderecoRecuperado: cand.endereco,
      latitude: cand.latitude,
      longitude: cand.longitude,
      geoStatus: "ok",
      geoFonte: provedor === "photon" ? "photon" : `nominatim:${cand.precisao}`,
      geoPrecisaoM: null,
      confianca: cand.confianca,
      metodo: cand.metodo,
      provedor: cand.provedor,
      recuperadoEm: new Date().toISOString(),
    });
    return;
  }

  await deps.atualizarDestino({
    destinationId: resultado.destinationId,
    recuperacaoStatus: estado,
    enderecoNormalizado,
    enderecoRecuperado: sugestao?.endereco ?? null,
    // Sugestão não vira coordenada do destino: quem confirma é o operador.
    latitude: null,
    longitude: null,
    geoStatus: estado === "nao_encontrado" ? "nao_encontrado" : estado === "erro" ? "erro" : "pendente",
    geoFonte: sugestao ? `${sugestao.provedor}:${sugestao.precisao}` : null,
    geoPrecisaoM: null,
    confianca: sugestao?.confianca ?? null,
    metodo: sugestao?.metodo ?? null,
    provedor: sugestao?.provedor ?? null,
    recuperadoEm: null,
  });
}

/**
 * Variações de digitação (tentativa 3): complemento fora, número fora, rua
 * curta. Cada uma existe porque um erro medido de cadastro a criou.
 */
function gerarVariacoesDigito(
  linha: string | null,
  partes: PartesEnderecoInformado
): string[] {
  const variacoes = new Set<string>();
  if (partes.rua) {
    if (partes.cidade) {
      variacoes.add(
        [partes.rua, partes.cidade, partes.uf, partes.cep]
          .filter((v): v is string => typeof v === "string" && v.trim() !== "")
          .join(", ")
      );
    }
    variacoes.add(partes.rua);
  }
  if (linha) {
    // Complemento colado ("LOJA 2", "SALA 3", "FUNDOS") atrapalha o casamento.
    variacoes.add(
      linha
        .replace(/\b(LOJA|SALA|SOBRELOJA|FUNDOS|CASA|APT|APARTAMENTO|BOX|QUIOSQUE)\b.*/gi, "")
        .replace(/,\s*,/g, ",")
        .replace(/,\s*$/, "")
        .trim()
    );
  }
  return [...variacoes].filter((v) => v.trim().length > 0);
}

/**
 * Executa a recuperação para todos os destinos de uma carga que precisam.
 * Respeita o orçamento por destino e nunca trava a carga por falha de provedor.
 */
export async function recuperarLote(
  destinos: Array<{
    destinationId: string;
    enderecoOriginal: string | null;
    partes: PartesEnderecoInformado;
    estadoAtual: EstadoRecuperacao;
    coordenada: { latitude: number | null; longitude: number | null } | null;
  }>,
  deps: MotorDeps
): Promise<{
  resultados: ResultadoRecuperacao[];
  resumo: {
    analisados: number;
    encontrados: number;
    recuperados: number;
    aguardandoConfirmacao: number;
    naoEncontrados: number;
    erros: number;
  };
}> {
  const resultados: ResultadoRecuperacao[] = [];
  const resumo = {
    analisados: 0,
    encontrados: 0,
    recuperados: 0,
    aguardandoConfirmacao: 0,
    naoEncontrados: 0,
    erros: 0,
  };

  for (const d of destinos) {
    resumo.analisados++;
    try {
      const r = await recuperarDestino(
        d.destinationId,
        d.enderecoOriginal,
        d.partes,
        d.estadoAtual,
        d.coordenada,
        deps
      );
      resultados.push(r);

      if (r.jaEstavaResolvido || r.estado === "encontrado") {
        resumo.encontrados++;
      } else if (r.estado === "recuperado") {
        resumo.recuperados++;
      } else if (r.estado === "ambiguo") {
        resumo.aguardandoConfirmacao++;
      } else if (r.estado === "nao_encontrado") {
        resumo.naoEncontrados++;
      } else {
        resumo.erros++;
      }
    } catch {
      // Falha de provedor não derruba a carga (§7).
      resultados.push({
        destinationId: d.destinationId,
        estado: "erro",
        candidato: null,
        sugestoes: [],
        tentativas: [],
        jaEstavaResolvido: false,
      });
      resumo.erros++;
    }
  }

  return { resultados, resumo };
}

/** Limiares em vigor — reexportado para a tela exibir a régua usada. */
export { limiares };
