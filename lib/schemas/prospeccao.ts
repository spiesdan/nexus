import { z } from "zod";

import type { Classificacao } from "@/lib/prospeccao/classificacao";
import { MENSAGENS_POR_DISPARO_MAX } from "@/lib/prospeccao/disparo";

/**
 * O CONTRATO DA PROSPECÇÃO — um só, lido pela tela E pelas rotas.
 */

export const buscaCreateSchema = z.object({
  categorias: z.array(z.string().trim().min(2).max(80)).min(1).max(10),
  cidade: z.string().trim().max(120).optional(),
  estado: z.string().trim().max(10).optional(),
  pais: z.string().trim().length(2).default("BR"),
  raio_km: z.number().int().min(1).max(500).default(30),
  max_empresas: z.number().int().min(1).max(10000).default(500),
  // Opcional SEM default: quem escolhe o provider é Configurações →
  // Prospecção (provider_ativo); a tela principal nem manda nem vê provider
  // (§1 da spec 19). Mandado e diferente do ativo, a rota recusa na hora.
  provider: z.enum(["google_places", "osm_overpass", "maps_browser"]).optional(),
  campaign_id: z.string().uuid().nullable().optional(),
  /** "Buscar nesta área": centro direto do mapa — dispensa cidade/geocode. */
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  rotulo: z.string().trim().max(120).nullable().optional(),
});

export type BuscaCreate = z.infer<typeof buscaCreateSchema>;

export const STATUS_BUSCA = [
  "queued",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
] as const;

/** Rótulos comerciais dos status de busca — o usuário nunca lê "running". */
export const ROTULO_STATUS_BUSCA: Record<(typeof STATUS_BUSCA)[number], string> = {
  queued: "Na fila",
  running: "Procurando",
  paused: "Pausada",
  completed: "Concluída",
  failed: "Falhou",
  cancelled: "Cancelada",
};

export const STATUS_COMERCIAL = [
  "novo",
  "nao_analisado",
  "qualificado",
  "contato_pendente",
  "contatado",
  "respondeu",
  "sem_interesse",
  "cliente",
  "descartado",
] as const;
export type StatusComercial = (typeof STATUS_COMERCIAL)[number];

export const ROTULO_STATUS_COMERCIAL: Record<StatusComercial, string> = {
  novo: "Novo",
  nao_analisado: "Não analisado",
  qualificado: "Qualificado",
  contato_pendente: "Contato pendente",
  contatado: "Contatado",
  respondeu: "Respondeu",
  sem_interesse: "Sem interesse",
  cliente: "Cliente",
  descartado: "Descartado",
};

export const prospectPatchSchema = z.object({
  status_comercial: z.enum(STATUS_COMERCIAL).optional(),
  do_not_contact: z.boolean().optional(),
  bloqueado: z.boolean().optional(),
  // Correção manual da categoria (0277): o operador confirma o rótulo que a
  // heurística não conseguiu decidir. `categoria_revisar: false` limpa o veto.
  categoria: z.string().trim().min(1).max(120).optional(),
  categoria_revisar: z.boolean().optional(),
  // FASE 8 (item 16): fila — vendedor dono e próxima ação. null explícito é
  // válido (desatribuir / limpar o passo), por isso o .nullable().
  owner_user_id: z.string().uuid().nullable().optional(),
  proximo_passo: z.string().trim().max(300).nullable().optional(),
});

export type ProspectPatch = z.infer<typeof prospectPatchSchema>;

export const importBatchSchema = z.object({
  prospect_ids: z.array(z.string().uuid()).min(1).max(100),
  owner_user_id: z.string().uuid().nullable().optional(),
});

/**
 * DISPARO EM LOTE — a mesma mensagem para os prospects escolhidos.
 *
 * `dry_run` é `true` POR PADRITO. A rota que envia uma mensagem fixa para
 * centenas de números é das poucas em que o erro não aparece como erro: o
 * WhatsApp derruba o número e o dano só aparece semanas depois, como "não
 * recebo mais mensagem". Quem chama tem que PEDIR o envio; não happens por
 * omissão de um campo.
 */
export const disparoSchema = z
  .object({
    prospect_ids: z.array(z.string().uuid()).min(1).max(2000),
    // O `.trim()` antes do `.min(1)` é o que faz "   " ser erro de formulário.
    // Sem ele, `min(1)` passa (a string tem 3 caracteres) e a mensagem em branco
    // só morre lá dentro no `validarMensagem` — 400 mais tarde, e o operador vê
    // "Nenhum dos prospects pertence a esta organização" num campo de texto.
    mensagem: z.string().trim().min(1).max(4000).optional(),
    /**
     * As VARIAÇÕES de texto, na ordem. O 1º envio leva a 1ª, o 2º a 2ª… e
     * quando acabam, volta à 1ª (1→2→3→1). É o que evita a mesma string em
     * massa, que é o padrão que queima número.
     *
     * `mensagem` (texto único) continua valendo: quem já chamava a API não
     * precisa mudar nada. Os dois campos juntos: as variações ganham.
     */
    mensagens: z.array(z.string().trim().min(1).max(4000)).min(1).max(MENSAGENS_POR_DISPARO_MAX).optional(),
    /** Cota do dia. O teto real é `TETO_DIARIO` do planejador. */
    limite: z.number().int().min(1).max(500).optional(),
    /** Intervalo mínimo entre dois envios, em ms. */
    espaco_ms: z.number().int().min(0).max(60000).optional(),
    /** `false` envia de verdade. O padrão é só simular. */
    dry_run: z.boolean().default(true),
    /**
     * A campanha que recebe o envio (0277). Obrigatória no envio real: é ela
     * que reserva as empresas, aplica a categoria e grava o ledger global.
     * A simulação aceita sem — a tela de Empresas pode simular antes de criar.
     */
    campaign_id: z.string().uuid().optional(),
  })
  // Sem texto não há disparo — e o erro tem que sair daqui, não de um plano
  // com 500 recusas de "mensagem vazia", que não é recusa de NINGUÉM.
  .refine((v) => Boolean(v.mensagem?.trim()) || (v.mensagens?.length ?? 0) > 0, {
    message: "Informe a mensagem (ou as variações) do disparo.",
    path: ["mensagem"],
  });

export type Disparo = z.infer<typeof disparoSchema>;

/**
 * Linha da ponte do Google Maps Scraper (JSON já mapeado pela tela via
 * `lib/prospeccao/importacao-maps.ts`). Espelha `NegocioDescoberto` campo a
 * campo — a rota revalida tudo, nunca confia no cliente.
 */
export const negocioArquivoSchema = z.object({
  idExterno: z.string().max(200).nullable().optional(),
  nome: z.string().trim().min(1).max(200),
  categoriaPrincipal: z.string().trim().max(120).nullable().optional(),
  categoriasSecundarias: z.array(z.string().trim().max(120)).max(10).optional(),
  telefone: z.string().trim().max(40).nullable().optional(),
  website: z.string().trim().max(300).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
  endereco: z.string().trim().max(500).nullable().optional(),
  bairro: z.string().trim().max(120).nullable().optional(),
  cidade: z.string().trim().max(120).nullable().optional(),
  estado: z.string().trim().max(10).nullable().optional(),
  cep: z.string().trim().max(12).nullable().optional(),
  pais: z.string().trim().max(4).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  urlExterna: z.string().trim().max(500).nullable().optional(),
  nota: z.number().min(0).max(5).nullable().optional(),
  totalAvaliacoes: z.number().int().min(0).nullable().optional(),
});

export type NegocioArquivo = z.infer<typeof negocioArquivoSchema>;

export const arquivoMapsSchema = z.object({
  categoria: z.string().trim().min(2).max(80),
  negocios: z.array(negocioArquivoSchema).min(1).max(500),
});

export type ArquivoMaps = z.infer<typeof arquivoMapsSchema>;

/**
 * AGENDAMENTO — o relógio da campanha (0273).
 *
 * `janelas` são VÁRIAS por dia ([{inicio:"07:00",fim:"12:00"},{inicio:"13:00",
 * fim:"19:00"}]). `inicio < fim` é a regra dura: uma janela invertida nunca
 * fica aberta, e a campanha ficaria parada sem o operador entender por quê —
 * melhor recusar na borda com uma frase do que gravar silêncio.
 *
 * `espaco_ms` = intervalo entre mensagens; `limite_diario` = a cota do DIA (a
 * janela é do RELÓGIO; confundir as duas é o erro que a tela precisa ajudar a
 * não cometer).
 */
export const janelaDoDiaSchema = z
  .object({
    inicio: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (ex.: 07:00)."),
    fim: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (ex.: 12:00)."),
    /**
     * OS DIAS DA SEMANA da janela — 0 = domingo … 6 = sábado.
     *
     * Ausente ou vazia = TODOS os dias. É o que mantém as campanhas agendadas
     * antes desta versão mandando no dia seguinte ao deploy: a coluna é jsonb,
     * então a linha antiga simplesmente não tem a chave.
     */
    dias: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  })
  .refine((j) => j.inicio < j.fim, {
    message: "O fim da janela tem de ser depois do início.",
    path: ["fim"],
  });

export const agendamentoSchema = z.object({
  /**
   * A LISTA FECHADA escolhida na tela — o tick manda só para ela.
   *
   * Teto alto de propósito: a base desta instalação tem 21.668 empresas e uma
   * campanha de 5 dias úteis com janelas 07–12/13–19 tem ~3.300 vagas de um
   * minuto. Recusar em 2.000 cortaria a campanha que o operador quer montar.
   */
  prospect_ids: z.array(z.string().uuid()).min(1).max(10_000).optional(),
  /** As variações (1..5) da rotação anti-ban. */
  mensagens: z
    .array(z.string().trim().min(1).max(4000))
    .min(1)
    .max(MENSAGENS_POR_DISPARO_MAX)
    .optional(),
  espaco_ms: z.number().int().min(1000).max(60000).optional(),
  limite_diario: z.number().int().min(1).max(500).optional(),
  data_inicio: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use AAAA-MM-DD.")
    .nullable()
    .optional(),
  data_fim: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use AAAA-MM-DD.")
    .nullable()
    .optional(),
  janelas: z.array(janelaDoDiaSchema).max(10).optional(),
  /** Quando o agendamento foi confirmado; NULL = não agendada. */
  agendada_em: z.string().datetime({ offset: true }).nullable().optional(),
  /** `ativa` liga o tick; `concluida` encerra; `pausada` para sem perder a agenda. */
  status: z.enum(["rascunho", "ativa", "pausada", "concluida"]).optional(),
});

/** O período só faz sentido com os dois lados — e nunca com o fim antes. */
const periodoValido = (v: { data_inicio?: string | null; data_fim?: string | null }) =>
  !v.data_inicio || !v.data_fim || v.data_fim >= v.data_inicio;

export const campanhaCreateSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  objetivo: z.string().trim().max(300).nullable().optional(),
  categorias: z.array(z.string().trim().min(2).max(80)).min(1).max(10),
  cidades: z
    .array(
      z.object({
        cidade: z.string().trim().min(2).max(120),
        estado: z.string().trim().max(10).optional(),
      }),
    )
    .min(1)
    .max(50),
  recorrencia_dias: z.number().int().min(7).max(365).nullable().optional(),
  /**
   * De onde a campanha tira o público (0271). `busca` é o de sempre: fan-out
   * no provider ativo, gastando API. `base`: o que já está cadastrado em
   * `business_prospects`, sem API e sem chave. `ambas`: a union.
   *
   * O default é `busca` porque campanha que muda de fonte sem o operador pedir
   * é campanha que manda para a pessoa errada — e o dano (mensagem a cliente
   * próprio) não volta.
   */
  fonte_publico: z.enum(["busca", "base", "ambas"]).optional(),
})
  // A criação também aceita o agendamento (0273): quem cria a campanha já com
  // o relógio não precisa de um segundo request — mas os campos são opcionais.
  .extend(agendamentoSchema.shape)
  .refine(periodoValido, {
    message: "A data final não pode ser anterior à inicial.",
    path: ["data_fim"],
  });

/**
 * A CAMPANHA DE RECUPERAÇÃO (0274) — a MESMA agenda da prospecção, com outra
 * audiência.
 *
 * A lista não vem de busca nem de importação: vem do radar de recuperação
 * (`GET /api/v1/comercial/inativos`), que devolve contatos que JÁ compraram e
 * pararam de comprar. Por isso não há `categorias` nem `cidades` aqui — esse
 * recorte é da garimpagem, não de quem já é cliente.
 *
 * A campanha nasce AGENDADA e ativa: o formulário da tela é a agenda inteira
 * (janelas, período, mensagens, cota). Quem quiser parar, pausa na lista.
 */
export const campanhaDeRecuperacaoSchema = z
  .object({
    nome: z.string().trim().min(2).max(120),
    /** A lista fechada do radar. */
    contato_ids: z.array(z.string().uuid()).min(1).max(10_000),
    /** As variações (1..5) da rotação anti-ban — a mesma régua do disparo. */
    mensagens: z
      .array(z.string().trim().min(1).max(4000))
      .min(1)
      .max(MENSAGENS_POR_DISPARO_MAX),
    espaco_ms: z.number().int().min(1000).max(60000).optional(),
    limite_diario: z.number().int().min(1).max(500).optional(),
    data_inicio: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use AAAA-MM-DD.")
      .nullable()
      .optional(),
    data_fim: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use AAAA-MM-DD.")
      .nullable()
      .optional(),
    janelas: z.array(janelaDoDiaSchema).max(10).optional(),
  })
  .refine(periodoValido, {
    message: "A data final não pode ser anterior à inicial.",
    path: ["data_fim"],
  });

/** A fonte do público é um botão da tela de campanha, não campo de texto. */
export type FonteDoPublico = NonNullable<
  z.infer<typeof campanhaCreateSchema>["fonte_publico"]
>;

/**
 * FASE 10 (§28): objetivo é o único campo editável da campanha por enquanto —
 * o PATCH existe para o painel preencher o "Objetivo" que a spec cobra.
 * null explícito limpa o campo (mesmo contrato do prospectPatchSchema).
 */
export const campanhaPatchSchema = z
  .object({
    // `objetivo` vira opcional (era obrigatório quando era o único campo): o
    // PATCH do agendamento não mexe nele, e exigir a chave obrigaria a tela a
    // reescrever um campo que ela não tocou.
    objetivo: z.string().trim().max(300).nullable().optional(),
    /** 0271 — trocar a fonte do público é decisão do operador, e fica registrada. */
    fonte_publico: z.enum(["busca", "base", "ambas"]).optional(),
    /** 0277 — corrigir o recorte de uma campanha existente. */
    categorias: z.array(z.string().trim().min(2).max(80)).min(1).max(10).optional(),
    cidades: z
      .array(
        z.object({
          cidade: z.string().trim().min(2).max(120),
          estado: z.string().trim().max(10).optional(),
        }),
      )
      .min(1)
      .max(50)
      .optional(),
  })
  // 0273 — o mesmo PATCH que salva o objetivo salva o relógio da campanha.
  .extend(agendamentoSchema.shape)
  .refine(periodoValido, {
    message: "A data final não pode ser anterior à inicial.",
    path: ["data_fim"],
  });

export const settingsPutSchema = z.object({
  provider_ativo: z.enum(["google_places", "osm_overpass", "maps_browser"]).optional(),
  google_api_key: z.string().trim().min(10).max(300).nullable().optional(),
  limite_por_busca: z.number().int().min(10).max(10000).optional(),
  limite_diario: z.number().int().min(10).max(100000).optional(),
  grid_size_km: z.number().min(1).max(50).optional(),
  raio_padrao_km: z.number().int().min(1).max(500).optional(),
  concorrencia: z.number().int().min(1).max(10).optional(),
  retries: z.number().int().min(0).max(10).optional(),
  timeout_ms: z.number().int().min(2000).max(120000).optional(),
  requisicoes_por_minuto: z.number().int().min(1).max(600).optional(),
  cache_ttl_dias: z.number().int().min(0).max(365).optional(),
  // FASE 13 (§21/§24/D4): teto mensal e a tabela vigente de preços.
  // null explícito = sem teto / voltar ao default do arquivo neutro.
  orcamento_mensal_cents: z.number().int().min(0).nullable().optional(),
  preco_busca_cents: z.number().int().min(0).nullable().optional(),
  preco_detalhe_cents: z.number().int().min(0).nullable().optional(),
});

export interface Prospect {
  id: string;
  nome: string;
  categoria: string | null;
  /** Categorias secundárias do Google — a evidência que corrige a primária. */
  categorias?: string[] | null;
  /** Correção/revisão persistida (0277). */
  categoria_canonica?: string | null;
  categoria_confianca?: "alta" | "media" | "baixa" | null;
  categoria_revisar?: boolean;
  /** Rótulo EFETIVO calculado na leitura (0277) — o que a tela mostra. */
  categoria_efetiva?: string | null;
  categoria_motivo?: string;
  cidade: string | null;
  estado: string | null;
  telefone: string | null;
  website: string | null;
  whatsapp_potencial: boolean;
  nota: number | null;
  total_avaliacoes: number;
  provider: string;
  status_comercial: StatusComercial;
  score: number;
  /** Qualificação automática pelo laya local (migration 0260) — null até a primeira passada. */
  laya_fit?: "potencial" | "duvidoso" | "sem_potencial" | null;
  laya_fit_em?: string | null;
  contact_id: string | null;
  lead_id: string | null;
  do_not_contact: boolean;
  latitude: number | null;
  longitude: number | null;
  endereco: string | null;
  discovered_at: string;
  /** Fila (item 16): vendedor dono e próxima ação. */
  owner_user_id: string | null;
  proximo_passo: string | null;
  /** Derivada a cada GET (§10/D13) — opcional porque nem toda rota que devolve linha a calcula. */
  classificacao?: Classificacao;
}

export const COLUNAS_DO_PROSPECT =
  "id, nome, categoria, categorias, categoria_canonica, categoria_confianca, categoria_revisar, " +
  "cidade, estado, telefone, email, website, whatsapp_potencial, " +
  "nota, total_avaliacoes, provider, status_comercial, score, contact_id, lead_id, " +
  "do_not_contact, latitude, longitude, endereco, discovered_at, owner_user_id, proximo_passo, " +
  "laya_fit, laya_fit_em";
