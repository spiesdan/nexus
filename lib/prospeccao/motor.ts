import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { googlePlacesHabilitado, resolverChaveGoogle } from "@/lib/prospeccao/chave";
import { custoEfetivo } from "@/lib/prospeccao/custos";
import { termosDeDescoberta } from "@/lib/prospeccao/expansao";
import { distanciaKm } from "@/lib/prospeccao/geo";
import { gerarGrade } from "@/lib/prospeccao/grade";
import {
  decidirDedup,
  type ProspectCandidato,
  type ProspectExistente,
} from "@/lib/prospeccao/dedup";
import {
  extrairDominio,
  normalizarNome,
  normalizarTelefone,
  partirEndereco,
  whatsappPotencial,
} from "@/lib/prospeccao/normalizacao";
import { bonusDeAderencia, scoreDeProspect } from "@/lib/prospeccao/score";
import { criarProvider } from "@/lib/prospeccao/providers/registro";
import type { NegocioDescoberto } from "@/lib/prospeccao/tipos";
import {
  MENSAGEM_ORCAMENTO_ATINGIDO,
  limiteDiarioAtingido,
  orcamentoDoMes,
  type DecisaoOrcamento,
} from "@/lib/prospeccao/uso";

/**
 * O MOTOR — um tick processa N células da busca mais antiga pendente.
 *
 * Modelo de execução (§10 do plano, com a infra que o projeto JÁ tem): NÃO há
 * BullMQ/Redis de fila aqui — há a rota cron `prospecting-drain` (mesmo molde
 * de `event-log-drain`), chamada a cada minuto pelo scheduler da VPS e pelo
 * `pnpm dev:crons` em dev. Cada tick avança o cursor; o cursor (contagem
 * sobre a grade determinística) É o checkpoint (§12): cair o servidor no
 * meio só perde o tick atual, e `running` velho volta a `queued` sozinho.
 */

/**
 * Teto padrão de células por tick. Antes era 3 fixo — subestimava a VPS e
 * alongava buscas grandes para dezenas de minutos. Cresce controlado por
 * `PROSPECCAO_CELULAS_POR_TICK` (1..12); o portão de reduzirAutomação (90%
 * do orçamento) continua forçando 1, e o de orçamento mensal manda antes.
 */
const CELULAS_POR_TICK_PADRAO = 6;
const CELULAS_POR_TICK_MAX = 12;
/** Quantas células correm EM PARALELO dentro do tick (teto 8). */
const CONCORRENCIA_PADRAO = 3;
const CONCORRENCIA_MAX = 8;
const STUCK_MINUTOS = 30;

function lidoOuDefault(nome: string, padrao: number, teto: number): number {
  const bruto = Number(process.env[nome]);
  if (!Number.isFinite(bruto) || bruto < 1) return padrao;
  return Math.min(Math.floor(bruto), teto);
}

function celulasPorTick(): number {
  return lidoOuDefault(
    "PROSPECCAO_CELULAS_POR_TICK",
    CELULAS_POR_TICK_PADRAO,
    CELULAS_POR_TICK_MAX,
  );
}

function concorrenciaCelulas(): number {
  return lidoOuDefault("PROSPECCAO_CONCORRENCIA_CELULAS", CONCORRENCIA_PADRAO, CONCORRENCIA_MAX);
}

/**
 * Ritmo GLOBAL entre chamadas ao provider: com as células paralelas, a pausa
 * entre CHAMADAS continua valendo para TODA a VPS do tenant (§11), não uma
 * por célula concorrente — senão 3 células × 60 req/min = 180 req/min contra
 * o OSM público. O relógio agenda slots: quem chega pega o próximo slot livre.
 */
class RitmoChamadas {
  private proximoSlot = 0;
  constructor(private pausaMs: number) {}
  async aguardar(): Promise<void> {
    if (this.pausaMs <= 0) return;
    const agora = Date.now();
    const slot = Math.max(agora, this.proximoSlot);
    this.proximoSlot = slot + this.pausaMs;
    const espera = slot - agora;
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  }
}

export interface TickResult {
  search_id: string | null;
  status: string | null;
  celulas: number;
  novas: number;
  duplicadas: number;
  erros: number;
}

function hashBusca(params: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(params)).digest("hex").slice(0, 32);
}

export function hashDaBusca(p: {
  categorias: string[];
  cidade: string | null;
  estado: string | null;
  raioKm: number;
  provider: string;
  latitude?: number | null;
  longitude?: number | null;
}): string {
  return hashBusca({
    categorias: [...p.categorias].sort(),
    cidade: (p.cidade ?? "").toLowerCase().trim(),
    estado: (p.estado ?? "").toLowerCase().trim(),
    raioKm: p.raioKm,
    provider: p.provider,
    ...(p.latitude != null && p.longitude != null
      ? { lat: Math.round(p.latitude * 1000) / 1000, lng: Math.round(p.longitude * 1000) / 1000 }
      : {}),
  });
}

interface LinhaBusca {
  id: string;
  organization_id: string;
  categorias: string[];
  cidade: string | null;
  estado: string | null;
  latitude: number | null;
  longitude: number | null;
  raio_km: number;
  max_empresas: number;
  provider: string;
  status: string;
  grid_size_km: number;
  grid_overlap_pct: number;
  total_celulas: number;
  celulas_processadas: number;
  encontradas: number;
  novas: number;
  duplicadas: number;
  erros: number;
  requisicoes: number;
  detalhes: number;
  custo_estimado_cents: number;
}

async function lerSettings(admin: SupabaseClient, orgId: string) {
  const { data } = await admin
    .from("prospecting_settings")
    .select(
      "limite_diario, requisicoes_por_minuto, provider_ativo, " +
        "orcamento_mensal_cents, preco_busca_cents, preco_detalhe_cents",
    )
    .eq("organization_id", orgId)
    .maybeSingle();
  const linha = data as unknown as {
    limite_diario: number;
    requisicoes_por_minuto: number;
    provider_ativo: string;
    orcamento_mensal_cents: number | null;
    preco_busca_cents: number | null;
    preco_detalhe_cents: number | null;
  } | null;
  return {
    temLinha: Boolean(linha),
    limite_diario: linha?.limite_diario ?? 2000,
    requisicoes_por_minuto: linha?.requisicoes_por_minuto ?? 60,
    provider_ativo: linha?.provider_ativo ?? "google_places",
    orcamento_mensal_cents: linha?.orcamento_mensal_cents ?? null,
    preco_busca_cents: linha?.preco_busca_cents ?? null,
    preco_detalhe_cents: linha?.preco_detalhe_cents ?? null,
  };
}

export async function processarTick(
  admin: SupabaseClient,
  criar: typeof criarProvider = criarProvider,
): Promise<TickResult> {
  const vazio: TickResult = {
    search_id: null,
    status: null,
    celulas: 0,
    novas: 0,
    duplicadas: 0,
    erros: 0,
  };

  // Recupera travadas: running sem atualização há 30min volta para a fila.
  const limiteStuck = new Date(Date.now() - STUCK_MINUTOS * 60000).toISOString();
  await admin
    .from("prospecting_searches")
    .update({ status: "queued" })
    .eq("status", "running")
    .lt("updated_at", limiteStuck);

  const { data: linha } = await admin
    .from("prospecting_searches")
    .select("*")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const busca = linha as unknown as LinhaBusca | null;
  if (!busca) return vazio;

  const res: TickResult = {
    search_id: busca.id,
    status: busca.status,
    celulas: 0,
    novas: 0,
    duplicadas: 0,
    erros: 0,
  };

  const falhar = async (msg: string) => {
    await admin
      .from("prospecting_searches")
      .update({
        status: "failed",
        ultimo_erro: msg.slice(0, 500),
        finished_at: new Date().toISOString(),
      })
      .eq("id", busca.id);
    res.status = "failed";
    return res;
  };

  if (busca.provider !== "google_places" && busca.provider !== "osm_overpass") {
    return falhar(`provider "${busca.provider}" sem executor ligado.`);
  }

  const settings = await lerSettings(admin, busca.organization_id);
  // Sem linha de settings, vale o default honesto: osm_overpass (grátis, sem
  // chave) — não google_places, que falharia nomeando chave inexistente.
  const ativo = settings.temLinha ? settings.provider_ativo : "osm_overpass";
  if (ativo !== busca.provider) {
    return falhar(
      `Provider ${busca.provider} desligado nas configurações (Configurações → Prospecção).`,
    );
  }

  // Teto diário (§29 + limites do tenant). OSM não custa, mas o teto também
  // protege a instância pública (uso justo) — mesmo portão, dois motivos.
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: hojeRows } = await admin
    .from("prospecting_searches")
    .select("requisicoes")
    .eq("organization_id", busca.organization_id)
    .gte("created_at", `${hoje}T00:00:00Z`);
  const gastoHoje = ((hojeRows ?? []) as { requisicoes: number }[]).reduce(
    (s, r) => s + r.requisicoes,
    0,
  );
  if (limiteDiarioAtingido(gastoHoje, settings.limite_diario)) {
    return falhar(`Teto diário de ${settings.limite_diario} requisições atingido. Volta amanhã.`);
  }

  // Preço efetivo do tenant (D4): settings por cima do arquivo neutro (OSM = 0
  // naturalmente, e um preço gravado nunca vira cobrança em provider grátis).
  const preco = custoEfetivo(busca.provider, settings);

  // Budget guard (§24) — o teto mensal decide ANTES de qualquer chamada paga.
  // Em 100% a busca falha com a mensagem literal da spec (nunca ultrapassar
  // silenciosamente); em 90% a AUTOMAÇÃO reduz — uma célula por tick e só o
  // termo pedido, sem expansão —; em 80% só o painel avisa. Provider grátis
  // não tem o que bloquear, e preço configurado 0 declara consulta grátis.
  let decisaoOrcamento: DecisaoOrcamento = {
    estado: "sem_limite",
    gasto_cents: 0,
    limite_cents: null,
    pct: 0,
  };
  if (preco.busca > 0 || preco.detalhe > 0) {
    decisaoOrcamento = await orcamentoDoMes(
      admin,
      busca.organization_id,
      settings.orcamento_mensal_cents,
    );
    if (decisaoOrcamento.estado === "bloqueio") {
      return falhar(MENSAGEM_ORCAMENTO_ATINGIDO);
    }
  }
  const reduzirAutomacao = decisaoOrcamento.estado === "reducao";
  const celulasDoTick = reduzirAutomacao ? 1 : celulasPorTick();
  // Orçamento reduzido = modo de proteção: seqüencial, sem paralelismo.
  const concorrencia = reduzirAutomacao ? 1 : concorrenciaCelulas();

  // Google exige chave (tenant cifrada ou instalação); OSM é aberto.
  let chave: string | null = null;
  if (busca.provider === "google_places") {
    if (!googlePlacesHabilitado()) {
      return falhar("GOOGLE_PLACES_ENABLED=false nesta instalação.");
    }
    chave = (await resolverChaveGoogle(admin, busca.organization_id)).chave;
    if (!chave) {
      return falhar(
        "Sem chave do Google (tenant e instalação). Configure em Configurações → Prospecção.",
      );
    }
  }

  if (busca.latitude === null || busca.longitude === null) {
    return falhar("Busca sem coordenadas (geocodificação falhou na criação).");
  }

  let provider;
  try {
    provider = criar(busca.provider, { chaveGoogle: chave ?? "" });
  } catch (e) {
    return falhar(e instanceof Error ? e.message : String(e));
  }

  // Grade determinística: cursor = contagem (checkpoint).
  const grade = gerarGrade(
    busca.latitude,
    busca.longitude,
    busca.raio_km,
    Number(busca.grid_size_km),
    Number(busca.grid_overlap_pct),
  );
  const categorias = busca.categorias.length > 0 ? busca.categorias : ["empresas"];
  const total = grade.length * categorias.length;
  if (busca.total_celulas !== total) {
    await admin.from("prospecting_searches").update({ total_celulas: total }).eq("id", busca.id);
  }

  if (busca.status === "queued") {
    await admin
      .from("prospecting_searches")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", busca.id);
    res.status = "running";
  } else {
    res.status = "running";
  }

  const pausaMs = Math.max(0, Math.round(60000 / Math.max(1, settings.requisicoes_por_minuto)));
  let processadas = busca.celulas_processadas;
  let encontradas = busca.encontradas;
  let novas = busca.novas;
  let duplicadas = busca.duplicadas;
  let erros = busca.erros;
  let requisicoes = busca.requisicoes;
  let detalhes = busca.detalhes;
  let custo = busca.custo_estimado_cents;

  const gravarProgresso = () =>
    admin
      .from("prospecting_searches")
      .update({
        celulas_processadas: processadas,
        encontradas,
        novas,
        duplicadas,
        erros,
        requisicoes,
        detalhes,
        custo_estimado_cents: custo,
      })
      .eq("id", busca.id);

  // Ritmo do tenant (§11): pausa entre CHAMADAS, não entre células — com a
  // expansão de categoria ligada, uma célula vira N chamadas e todas ritmadas.
  // Agora é GLOBAL: as células correm em paralelo, mas o espaço entre duas
  // chamadas ao provider continua o mesmo para todas.
  const ritmo = new RitmoChamadas(pausaMs);
  let bloqueadoFornecedor: string | null = null;

  for (
    let base = 0;
    base < celulasDoTick && processadas < total && bloqueadoFornecedor === null;
    base += concorrencia
  ) {
    const alvo = Math.min(concorrencia, celulasDoTick - base, total - processadas);
    await Promise.all(
      Array.from({ length: alvo }, async (_, i) => {
        const pos = processadas + base + i;
        const idxCat = Math.floor(pos / grade.length);
        const idxCel = pos % grade.length;
        const categoria = categorias[idxCat] ?? "empresas";
        const celula = grade[idxCel];
        if (!celula) return;

        try {
          // Expansão (§5): default 1 termo = a mesma chamada de antes; ligada
          // (PROSPECCAO_EXPANSAO=true), varre a família da categoria na mesma célula.
          // Em 90% do teto mensal a expansão sai: sobra o termo pedido (índice 0).
          const todosTermos = termosDeDescoberta(categoria);
          const termos = reduzirAutomacao ? todosTermos.slice(0, 1) : todosTermos;
          for (const [indiceTermo, termo] of termos.entries()) {
            await ritmo.aguardar();
            const r = await provider.search({
              categoria: termo.termo,
              latitude: celula.latitude,
              longitude: celula.longitude,
              raioMetros: celula.raioMetros,
              limite: 60,
            });
            requisicoes += r.requisicoes;
            detalhes += r.detalhes;
            custo += r.requisicoes * preco.busca + r.detalhes * preco.detalhe;

            // Índice 0 é sempre o termo que o operador pediu (§5); os irmãos da
            // expansão valem aderência parcial no score (§11/§12, D13).
            const { novas: nn, duplicadas: dd } = await ingerirNegocios(
              admin,
              busca,
              r.negocios,
              termo.termo,
              indiceTermo === 0,
            );
            novas += nn;
            duplicadas += dd;
            encontradas += r.negocios.length;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          erros++;
          logger.warn("[prospeccao] célula falhou", {
            search: busca.id,
            celula: celula.indice,
            error: msg,
          });
          // Bloqueio do fornecedor (§3): não insiste — falha a busca nomeando.
          if (/google_40[13]|NAO_AUTORIZADO|INVALID|bloque/i.test(msg)) {
            bloqueadoFornecedor = msg;
            return;
          }
          await admin
            .from("prospecting_searches")
            .update({ ultimo_erro: msg.slice(0, 500) })
            .eq("id", busca.id);
        }
      }),
    );
    processadas += alvo;
    res.celulas += alvo;
    await gravarProgresso();
  }

  if (bloqueadoFornecedor !== null) {
    return falhar(`Fornecedor recusou: ${bloqueadoFornecedor} (tarefa pausada, sem retry cego).`);
  }

  res.novas = novas - busca.novas;
  res.duplicadas = duplicadas - busca.duplicadas;
  res.erros = erros - busca.erros;

  if (processadas >= total) {
    await admin
      .from("prospecting_searches")
      .update({ status: "completed", finished_at: new Date().toISOString() })
      .eq("id", busca.id);
    res.status = "completed";
  }
  return res;
}

async function ingerirNegocios(
  admin: SupabaseClient,
  busca: Pick<LinhaBusca, "organization_id" | "provider" | "latitude" | "longitude" | "raio_km"> & {
    id: string | null;
  },
  negocios: NegocioDescoberto[],
  categoriaBusca: string,
  categoriaPedida: boolean,
): Promise<{ novas: number; duplicadas: number }> {
  let novas = 0;
  let duplicadas = 0;
  if (negocios.length === 0) return { novas, duplicadas };

  type Cand = ProspectCandidato & { bruto: NegocioDescoberto };
  const candidatos: Cand[] = negocios
    .filter((b) => b.nome && b.nome.trim())
    .map((b) => {
      const telefone = normalizarTelefone(b.telefone);
      return {
        provider: busca.provider,
        external_id: b.idExterno,
        nome_normalizado: normalizarNome(b.nome),
        telefone_normalizado: telefone,
        dominio: extrairDominio(b.website),
        endereco: b.endereco,
        latitude: b.latitude,
        longitude: b.longitude,
        bruto: b,
      };
    });

  // Busca em lote (3 queries, não 3N): identidade, telefone+domínio.
  const idsExternos = [
    ...new Set(candidatos.map((c) => c.external_id).filter(Boolean)),
  ] as string[];
  const fones = [
    ...new Set(candidatos.map((c) => c.telefone_normalizado).filter(Boolean)),
  ] as string[];
  const dominios = [...new Set(candidatos.map((c) => c.dominio).filter(Boolean))] as string[];

  const existentes: ProspectExistente[] = [];
  if (idsExternos.length > 0) {
    const { data } = await admin
      .from("business_prospects")
      .select(
        "id, provider, external_id, nome_normalizado, telefone_normalizado, dominio, endereco, latitude, longitude",
      )
      .eq("organization_id", busca.organization_id)
      .eq("provider", busca.provider)
      .in("external_id", idsExternos);
    existentes.push(...((data ?? []) as unknown as ProspectExistente[]));
  }
  if (fones.length > 0 || dominios.length > 0) {
    const q = admin
      .from("business_prospects")
      .select(
        "id, provider, external_id, nome_normalizado, telefone_normalizado, dominio, endereco, latitude, longitude",
      )
      .eq("organization_id", busca.organization_id)
      .limit(2000);
    const conds: string[] = [];
    if (fones.length > 0) conds.push(`telefone_normalizado.in.(${fones.join(",")})`);
    if (dominios.length > 0) conds.push(`dominio.in.(${dominios.join(",")})`);
    const { data } = await q.or(conds.join(","));
    for (const e of (data ?? []) as unknown as ProspectExistente[]) {
      if (!existentes.some((x) => x.id === e.id)) existentes.push(e);
    }
  }

  const vistos = new Map(existentes.map((e) => [e.id, e]));

  for (const c of candidatos) {
    const decisao = decidirDedup(c, [...vistos.values()]);
    if (decisao.nivel === "proximidade_sugestao" || decisao.nivel === "novo") {
      const inserido = await inserirProspect(
        admin,
        busca,
        c,
        categoriaBusca,
        categoriaPedida,
        decisao.nivel === "proximidade_sugestao" ? decisao.comQuem : null,
      );
      if (inserido) {
        novas++;
        vistos.set(inserido, {
          id: inserido,
          provider: c.provider,
          external_id: c.external_id,
          nome_normalizado: c.nome_normalizado,
          telefone_normalizado: c.telefone_normalizado,
          dominio: c.dominio,
          endereco: c.endereco,
          latitude: c.latitude,
          longitude: c.longitude,
        });
        if (busca.id !== null) {
          await vincularResultado(
            admin,
            { organization_id: busca.organization_id, id: busca.id },
            inserido,
            true,
          );
        }
      }
    } else if (decisao.comQuem) {
      duplicadas++;
      await admin
        .from("business_prospects")
        .update({ last_verified_at: new Date().toISOString() })
        .eq("id", decisao.comQuem);
      if (busca.id !== null) {
        await vincularResultado(
          admin,
          { organization_id: busca.organization_id, id: busca.id },
          decisao.comQuem,
          false,
        );
      }
    }
  }
  return { novas, duplicadas };
}

/**
 * A PONTE DE ARQUIVO — mesmos dedup/score/insert do tick, sem busca.
 *
 * Arquivo não tem search: `vincularResultado` é pulado (id null) e o
 * provider é `maps_arquivo` (identidade separada do `google_places` no
 * unique org+provider+external_id). Recusadas = sem nome após o trim.
 */
export async function importarNegociosDeArquivo(
  admin: SupabaseClient,
  orgId: string,
  categoria: string,
  brutos: NegocioDescoberto[],
): Promise<{ novas: number; duplicadas: number; recusadas: number }> {
  const validos = brutos.filter((b) => b.nome && b.nome.trim());
  const { novas, duplicadas } = await ingerirNegocios(
    admin,
    // Arquivo não tem âncora de busca: distância não pontua (D13 da spec 19).
    {
      organization_id: orgId,
      provider: "maps_arquivo",
      id: null,
      latitude: null,
      longitude: null,
      raio_km: 0,
    },
    validos,
    categoria,
    // O rótulo do arquivo É o que o operador pediu — aderência cheia.
    true,
  );
  return { novas, duplicadas, recusadas: brutos.length - validos.length };
}

async function vincularResultado(
  admin: SupabaseClient,
  busca: Pick<LinhaBusca, "id" | "organization_id">,
  prospectId: string,
  primeiraVez: boolean,
): Promise<void> {
  await admin.from("prospect_search_results").upsert(
    {
      search_id: busca.id,
      prospect_id: prospectId,
      organization_id: busca.organization_id,
      primeira_vez: primeiraVez,
    },
    { onConflict: "search_id,prospect_id", ignoreDuplicates: true },
  );
}

async function inserirProspect(
  admin: SupabaseClient,
  busca: Pick<LinhaBusca, "organization_id" | "latitude" | "longitude" | "raio_km">,
  c: ProspectCandidato & { bruto: NegocioDescoberto },
  categoriaBusca: string,
  categoriaPedida: boolean,
  sugestaoDe: string | null,
): Promise<string | null> {
  const b = c.bruto;
  const partes = partirEndereco(b.endereco);
  // Distância ao âncora da busca dentro do raio escolhido (§11): sem âncora
  // (arquivo) ou sem coordenadas, vale zero — nunca inventa geografia.
  const distancia =
    busca.latitude != null && busca.longitude != null && b.latitude != null && b.longitude != null
      ? distanciaKm(busca.latitude, busca.longitude, b.latitude, b.longitude)
      : null;
  const score = scoreDeProspect({
    temTelefone: Boolean(c.telefone_normalizado),
    temWebsite: Boolean(c.dominio),
    whatsappPotencial: whatsappPotencial(c.telefone_normalizado),
    nota: b.nota,
    totalAvaliacoes: b.totalAvaliacoes,
    bonusCategoria: bonusDeAderencia(categoriaPedida),
    distanciaKm: distancia,
    raioKm: busca.raio_km > 0 ? busca.raio_km : null,
  });
  const { data, error } = await admin
    .from("business_prospects")
    .insert({
      organization_id: busca.organization_id,
      nome: b.nome.trim(),
      nome_normalizado: c.nome_normalizado,
      categoria: categoriaBusca,
      categorias: [categoriaBusca, ...(b.categoriasSecundarias ?? [])].slice(0, 10),
      telefone: b.telefone,
      telefone_normalizado: c.telefone_normalizado,
      whatsapp_potencial: whatsappPotencial(c.telefone_normalizado),
      website: b.website,
      dominio: c.dominio,
      email: b.email,
      endereco: b.endereco,
      logradouro: partes.logradouro,
      numero_end: partes.numero,
      bairro: partes.bairro ?? b.bairro,
      cidade: partes.cidade ?? b.cidade,
      estado: partes.estado ?? b.estado,
      cep: partes.cep,
      pais: b.pais ?? "BR",
      latitude: b.latitude,
      longitude: b.longitude,
      provider: c.provider,
      external_id: c.external_id,
      external_url: b.urlExterna,
      nota: b.nota,
      total_avaliacoes: b.totalAvaliacoes,
      horario_funcionamento: b.horarioFuncionamento,
      status_comercial: "novo",
      score,
      candidato_duplicado_de: sugestaoDe,
      source: `provider:${c.provider}`,
      source_url: b.urlExterna,
      created_by: null,
    })
    .select("id")
    .single();
  if (error) {
    // Corrida entre ticks (unique provider+id): quem perdeu vira duplicada.
    if (error.code === "23505") return null;
    logger.warn("[prospeccao] insert falhou", { error: error.message });
    return null;
  }
  return (data as unknown as { id: string }).id;
}
