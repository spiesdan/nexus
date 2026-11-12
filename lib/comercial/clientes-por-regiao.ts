/**
 * QUEM JÁ COMPROU NUMA REGIÃO — a audiência da campanha por cidade.
 *
 * ═══ A PERGUNTA ═══════════════════════════════════════════════════════════
 *
 * "Quais clientes já foram atendidos nas cidades que eu escolhi?" Não existe
 * uma coluna só com a resposta: o pedido guarda o ENDEREÇO DE ENTREGA em texto
 * (`commercial_orders.endereco_entrega`, "…, CANOINHAS/SC, 89460048") e o
 * cadastro do contato guarda `cidade`/`uf` — e os dois discordam com frequência.
 * Medido nesta instalação (2026-11-12): 11.814 pedidos não cancelados, 1.898
 * contatos compradores, e a cidade do cadastro sozinha deixava de fora 260
 * clientes que só tinham cidade no endereço do pedido.
 *
 * Por isso a função lê os DOIS lados e o cliente entra na cidade quando
 * QUALQUER UM deles o coloca lá:
 *
 *   1. o endereço de entrega do pedido — a cidade onde a loja de fato atendeu;
 *   2. o cadastro do contato (`contacts.cidade`) — quem mudou de endereço mas
 *      continua na mesma cidade, e o pedido antigo não tinha endereço;
 *   3. qualquer pedido NÃO CANCELADO conta como "já atendemos" — a mesma régua
 *      do radar de inativos (`lib/comercial/inativos.ts`);
 *   4. o contato entra UMA vez por cidade, somando os pedidos daquele recorte;
 *   5. veto de contato é o MESMO do resto do produto (`contatoPodeReceber`):
 *      STOP, recusa de marketing, anonimizado ou mesclado não recebem campanha.
 *
 * ═══ A COMPARAÇÃO DE CIDADE É FEITA AQUI, NÃO NO BANCO ════════════════════
 *
 * A base tem "Caçador" e "Cacador", "Canoinhas" e "Canoinhas, Santa Catarina"
 * (o Mercos colou o nome do estado no cadastro). O PostgREST não sabe disso,
 * então a comparação usa `chaveComparavel` — sem acento, sem caixa e sem o
 * nome do estado colado. Se fosse `eq` no banco, escolher a cidade na tela
 * deixaria gente de fora em silêncio.
 *
 * ═══ O QUE ESTA FUNÇÃO NÃO DECIDE ═════════════════════════════════════════
 *
 * Reserva de campanha. Um contato já reservado por outra campanha não pode
 * entrar nesta (trigger da 0277); a borda cruza as duas listas com
 * `idsReservadosPorOutras`. Aqui só se responde "quem já comprou nesta região".
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { contatoPodeReceber } from "@/lib/comercial/inativos";
import { cidadeSemEstado } from "@/lib/contacts/endereco-em-linha";
import { normalizaTelefone } from "@/lib/contacts/csv";
import { NOMES_DOS_ESTADOS, nomeDoEstado } from "@/lib/format/estados";
import { chaveDeCidade } from "@/lib/prospeccao/publico-da-base";

/** Teto de PEDIDOS varridos — 20 páginas de 1.000, com ordem estável. */
const PAGINA = 1_000;
const MAX_PAGINAS = 20;
/** Teto de CONTATOS devolvidos — o mesmo teto do `contato_ids` no schema. */
export const LIMITE_DE_CLIENTES = 10_000;

/** E.164 mínimo que o motor exige (`escolherContato`). */
const TELEFONE_VALIDO = /^\+\d{8,15}$/;

export interface CidadeDaCampanha {
  cidade: string;
  estado?: string | null;
}

/** Uma cidade onde o cliente já foi atendido (ou onde mora). */
export interface CidadeDoContato {
  cidade: string;
  uf: string | null;
}

export interface ClienteDaRegiao {
  contact_id: string;
  nome: string;
  /** Como está no cadastro — a tela mostra; o motor normaliza de novo. */
  telefone: string | null;
  /** `null` = não dá para mandar (sem telefone ou fora do E.164). */
  telefone_e164: string | null;
  /** Cidade de exibição: a do pedido mais recente; senão, a do cadastro. */
  cidade: string;
  uf: string | null;
  /**
   * TODAS as cidades em que o cliente aparece (pedido + cadastro). É o que faz
   * a contagem por cidade não perder quem comprou em mais de uma.
   */
  cidades: CidadeDoContato[];
  pedidos: number;
  total_cents: number;
  ultimo_pedido_em: string;
}

export interface CidadeComCliente {
  cidade: string;
  uf: string | null;
  /** Quantos contatos daquela cidade já têm pedido (não quantos pedidos). */
  total: number;
}

export interface ResultadoDeClientesPorRegiao {
  lista: ClienteDaRegiao[];
  /** Pedidos lidos até o teto — é o denominador da varredura. */
  pedidos_lidos: number;
  /** `false` = havia mais pedidos do que o teto; a tela não pode dizer "todos". */
  completa: boolean;
}

interface ContatoBruto {
  id: string;
  name: string | null;
  display_name: string | null;
  phone_number: string | null;
  cidade: string | null;
  uf: string | null;
  is_blocked: boolean;
  is_anonymized: boolean;
  is_merged_into: string | null;
  consent: { marketing?: { declined_at?: string | null } | null } | null;
}

interface PedidoComContato {
  contact_id: string | null;
  total_cents: number;
  created_at: string;
  endereco_entrega: string | null;
  contacts: ContatoBruto | ContatoBruto[] | null;
}

/** A UF só entra na conta quando a campanha declarou uma. */
function ufCombina(ufDoContato: string | null, ufDoCriterio: string | null | undefined): boolean {
  if (ufDoCriterio === null || ufDoCriterio === undefined || ufDoCriterio.trim() === "") {
    return true;
  }
  return (ufDoContato ?? "").trim().toUpperCase() === ufDoCriterio.trim().toUpperCase();
}

/**
 * A chave de comparação: acento e caixa fora, e o nome do estado colado fora.
 * "Canoinhas", "CANOINHAS" e "Canoinhas, Santa Catarina" viram a mesma chave.
 */
export function chaveComparavel(
  cidade: string | null | undefined,
  uf: string | null | undefined,
): string {
  return chaveDeCidade(cidadeSemEstadoColado(cidade, uf)).trim();
}

/** O sufixo é nome ou sigla de estado? (para o cadastro que veio sem UF) */
function ehSufixoDeEstado(sufixo: string): boolean {
  const bruto = sufixo.trim().toUpperCase();
  if (bruto === "") return false;
  // Sigla ("SC") ou nome por extenso ("Santa Catarina", com ou sem acento).
  if (NOMES_DOS_ESTADOS[bruto]) return true;
  const semAcento = (t: string) =>
    t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return Object.values(NOMES_DOS_ESTADOS).some((nome) => semAcento(nome) === semAcento(bruto));
}

/**
 * "Canoinhas, Santa Catarina" → "Canoinhas", MESMO quando a UF não veio.
 *
 * `cidadeSemEstado` só corta o sufixo quando conhece a UF. O cadastro importado
 * tem cidade sem UF (204 contatos nesta instalação) e o nome do estado colado —
 * e aí a mesma cidade virava uma linha separada na lista de cidades, com o
 * rótulo comprido. Aqui o sufixo é reconhecido contra os 27 estados.
 */
export function cidadeSemEstadoColado(
  cidade: string | null | undefined,
  uf: string | null | undefined,
): string {
  const nome = cidadeSemEstado(cidade, uf);
  const corte = nome.lastIndexOf(",");
  if (corte < 0) return nome;
  if (!ehSufixoDeEstado(nome.slice(corte + 1))) return nome;
  return nome.slice(0, corte).trim();
}

const CHAVE_VAZIA = "";

/**
 * O ENDEREÇO DE ENTREGA VIRA CIDADE — "RUA X, 96 — CENTRO, CANOINHAS/SC, 89460048".
 *
 * O Mercos grava o endereço como uma linha só, no formato
 * `logradouro, número, complemento — bairro, cidade, [Estado]/UF, cep`. A cidade
 * é o segmento que vem antes de `/UF`; quando o estado foi colado no meio
 * ("GENERAL CARNEIRO, Paraná/PR"), o segmento anterior é que traz o município.
 *
 * Endereço sem cidade (só a rua) devolve `null` — aí quem responde é o cadastro,
 * e o cliente não é descartado só porque o importador não trouxe o município.
 */
export function cidadeDoEnderecoDeEntrega(
  endereco: string | null | undefined,
): CidadeDoContato | null {
  const texto = (endereco ?? "").trim();
  if (texto === "") return null;

  const segmentos = texto.split(",").map((s) => s.trim());
  for (let i = segmentos.length - 1; i >= 0; i -= 1) {
    // O formato do Mercos usa " — " entre o número e o bairro; quando o bairro
    // não veio, o traço cola na cidade ("2297 — Três Barras/SC").
    const segmento = (segmentos[i] ?? "").split("—").pop() ?? "";
    const achado = /^(.*?)\s*\/\s*([A-Za-z]{2})\s*(?:[\d-]{8,9})?$/.exec(segmento);
    if (!achado) continue;
    const uf = (achado[2] ?? "").toUpperCase();
    let municipio = achado[1] ?? "";
    // "Paraná/PR": o segmento é o nome do estado, não a cidade — recua um.
    if (chaveComparavel(municipio, uf) === chaveComparavel(nomeDoEstado(uf), uf)) {
      municipio = (segmentos[i - 1] ?? "").split("—").pop() ?? "";
    }
    const cidade = cidadeSemEstado(municipio, uf).replace(/\s+/g, " ").trim();
    if (cidade === "") continue;
    return { cidade, uf };
  }
  return null;
}

/** O cliente está em UMA das cidades escolhidas? (acento, caixa e estado fora) */
export function cidadeCombina(
  cidade: string | null | undefined,
  uf: string | null | undefined,
  criterios: readonly CidadeDaCampanha[],
): boolean {
  const chave = chaveComparavel(cidade, uf);
  if (chave === CHAVE_VAZIA) return false;
  if (criterios.length === 0) return true;
  return criterios.some(
    (c) =>
      chaveComparavel(c.cidade, c.estado ?? uf) === chave &&
      ufCombina(uf ?? null, c.estado),
  );
}

/**
 * Uma linha por cidade, contando CONTATOS. Um cliente que comprou em duas
 * cidades aparece nas duas (com um voto cada), e as grafias que a chave une
 * ("Canoinhas" / "Canoinhas, Santa Catarina") não viram duas linhas.
 *
 * A UF entra na chave porque "Bom Sucesso" existe no PR e na PB — misturar as
 * duas faria a campanha escolher um estado e perder o outro. Mas cadastro
 * importado vem sem UF com frequência: quando a cidade tem UM estado conhecido
 * e o contato veio sem UF, ele entra nessa linha em vez de abrir uma quarta
 * "Canoinhas" na tela.
 */
export function agruparPorCidade(
  lista: readonly ClienteDaRegiao[],
): CidadeComCliente[] {
  const porChave = new Map<string, CidadeComCliente>();
  for (const cliente of lista) {
    const vistas = new Set<string>();
    const cidades =
      cliente.cidades && cliente.cidades.length > 0
        ? cliente.cidades
        : [{ cidade: cliente.cidade, uf: cliente.uf }];
    for (const c of cidades) {
      // O rótulo é a cidade SEM o estado colado: "Canoinhas, Santa Catarina"
      // é nome de importador, não de tela.
      const nome = cidadeSemEstadoColado(c.cidade, c.uf);
      if (nome.trim() === "") continue;
      const uf = (c.uf ?? "").trim().toUpperCase() || null;
      const chave = `${chaveDeCidade(nome)}|${uf ?? ""}`;
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      const atual = porChave.get(chave);
      if (atual) atual.total += 1;
      else porChave.set(chave, { cidade: nome, uf, total: 1 });
    }
  }
  return juntarSemUf([...porChave.values()]).sort(
    (a, b) => b.total - a.total || a.cidade.localeCompare(b.cidade, "pt-BR"),
  );
}

/**
 * Junta a linha sem UF na linha da cidade quando existe UM estado só para ela.
 * Com dois estados conhecidos ("Bom Sucesso/PR" e "Bom Sucesso/PB") as linhas
 * ficam separadas — o operador escolhe o estado, e a campanha compara UF.
 */
function juntarSemUf(cidades: CidadeComCliente[]): CidadeComCliente[] {
  const porNome = new Map<string, CidadeComCliente[]>();
  for (const c of cidades) {
    const nome = chaveDeCidade(c.cidade);
    const grupo = porNome.get(nome) ?? [];
    grupo.push(c);
    porNome.set(nome, grupo);
  }
  const saida: CidadeComCliente[] = [];
  for (const grupo of porNome.values()) {
    const comUf = grupo.filter((c) => c.uf !== null);
    const alvo = comUf.length === 1 ? comUf[0] : undefined;
    if (!alvo) {
      saida.push(...grupo);
      continue;
    }
    for (const c of grupo) {
      if (c !== alvo) alvo.total += c.total;
    }
    saida.push(alvo);
  }
  return saida;
}

/** O embed pode vir como objeto ou array — normaliza sem perder a linha. */
function contatoDoPedido(pedido: PedidoComContato): ContatoBruto | null {
  const bruto = Array.isArray(pedido.contacts) ? pedido.contacts[0] : pedido.contacts;
  return bruto ?? null;
}

/**
 * Lista os clientes com pedido não cancelado nas cidades escolhidas.
 *
 * `cidades: []` (ou omitido) = todas: é o que a rota de cidades usa para montar
 * as opções da tela com a contagem real.
 */
export async function listarClientesPorRegiao(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    cidades?: readonly CidadeDaCampanha[];
    limite?: number;
  },
): Promise<ResultadoDeClientesPorRegiao> {
  const cidades = input.cidades ?? [];
  const limite = Math.min(
    Math.max(input.limite ?? LIMITE_DE_CLIENTES, 1),
    LIMITE_DE_CLIENTES,
  );

  const porContato = new Map<
    string,
    {
      contato: ContatoBruto;
      pedidos: number;
      total_cents: number;
      ultimo_pedido_em: string;
      /** Cidade de exibição — a do pedido mais recente que casou com o recorte. */
      exibicao: CidadeDoContato | null;
      /** Todas as cidades conhecidas do cliente, sem repetir pela chave. */
      cidades: Map<string, CidadeDoContato>;
    }
  >();
  let pedidosLidos = 0;
  let completa = true;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const de = pagina * PAGINA;
    const { data, error } = await supabase
      .from("commercial_orders")
      .select(
        "contact_id, total_cents, created_at, endereco_entrega, " +
          "contacts!inner(id, name, display_name, phone_number, cidade, uf, " +
          "is_blocked, is_anonymized, is_merged_into, consent)",
      )
      .eq("organization_id", input.organizationId)
      // A mesma organização DENTRO do contato: o `!inner` só traz pedido cujo
      // contato é desta organização — um vínculo cross-tenant não vira público.
      .eq("contacts.organization_id", input.organizationId)
      .neq("status", "cancelado")
      .not("contact_id", "is", null)
      // Ordem estável: `created_at` sozinho empata, e o `range` pularia ou
      // repetiria linha. O mesmo defeito que a `opcoes` já documentou.
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(de, de + PAGINA - 1);

    if (error) throw new Error(`pedidos_indisponiveis: ${error.message}`);
    const lote = (data ?? []) as unknown as PedidoComContato[];
    pedidosLidos += lote.length;

    for (const pedido of lote) {
      if (!pedido.contact_id) continue;
      const contato = contatoDoPedido(pedido);
      if (!contato) continue;
      if (!contatoPodeReceber(contato)) continue;

      const doEndereco = cidadeDoEnderecoDeEntrega(pedido.endereco_entrega);
      const doCadastro: CidadeDoContato | null =
        (contato.cidade ?? "").trim() === ""
          ? null
          : { cidade: (contato.cidade ?? "").trim(), uf: (contato.uf ?? "").trim() || null };

      // A cidade DESTE pedido: o endereço de entrega manda (foi onde a loja
      // atendeu); o cadastro só responde quando o endereço não trouxe município.
      const cidadeDoPedido = doEndereco ?? doCadastro;
      if (!cidadeDoPedido) continue;
      if (!cidadeCombina(cidadeDoPedido.cidade, cidadeDoPedido.uf, cidades)) continue;

      const atual = porContato.get(pedido.contact_id);
      const alvo =
        atual ??
        {
          contato,
          pedidos: 0,
          total_cents: 0,
          ultimo_pedido_em: pedido.created_at,
          exibicao: null as CidadeDoContato | null,
          cidades: new Map<string, CidadeDoContato>(),
        };

      if (!atual) porContato.set(pedido.contact_id, alvo);

      alvo.pedidos += 1;
      alvo.total_cents += pedido.total_cents;
      // A varredura vem em ordem decrescente: o primeiro pedido é o mais novo.
      if (alvo.pedidos === 1 || pedido.created_at > alvo.ultimo_pedido_em) {
        alvo.ultimo_pedido_em = pedido.created_at;
      }

      // O cadastro entra primeiro: é a grafia "humana" da cidade, melhor para
      // a tela. A do endereço é a prova de onde a loja atendeu.
      for (const candidata of [doCadastro, doEndereco]) {
        if (!candidata) continue;
        const chave = `${chaveComparavel(candidata.cidade, candidata.uf)}|${(candidata.uf ?? "").toUpperCase()}`;
        if (!alvo.cidades.has(chave)) alvo.cidades.set(chave, candidata);
      }
      const exibicao = doEndereco ?? doCadastro;
      if (exibicao && alvo.exibicao === null) alvo.exibicao = exibicao;
    }

    if (lote.length < PAGINA) break;
    if (pagina === MAX_PAGINAS - 1) completa = false;
  }

  const lista = [...porContato.entries()]
    .map(([contact_id, v]): ClienteDaRegiao => {
      const normalizado = v.contato.phone_number
        ? normalizaTelefone(v.contato.phone_number)
        : null;
      const exibicao = v.exibicao ?? { cidade: "", uf: null };
      return {
        contact_id,
        nome:
          v.contato.display_name ?? v.contato.name ?? v.contato.phone_number ?? "Sem nome",
        telefone: v.contato.phone_number,
        telefone_e164: normalizado !== null && TELEFONE_VALIDO.test(normalizado) ? normalizado : null,
        cidade: exibicao.cidade,
        uf: exibicao.uf,
        cidades: [...v.cidades.values()],
        pedidos: v.pedidos,
        total_cents: v.total_cents,
        ultimo_pedido_em: v.ultimo_pedido_em,
      };
    })
    .sort(
      (a, b) =>
        Date.parse(b.ultimo_pedido_em) - Date.parse(a.ultimo_pedido_em) ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );

  const cortada = lista.length > limite;
  return {
    lista: cortada ? lista.slice(0, limite) : lista,
    pedidos_lidos: pedidosLidos,
    completa: completa && !cortada,
  };
}
