/**
 * TRÊS CARGAS DE TESTE — fixtures de roteirização no Supabase LOCAL.
 *
 * ## Por que existe
 *
 * Testar a Expedição com dados reais é caro (mexe em pedido de cliente) e testar
 * com dado inventado não prova nada: o que quebra a rota é o endereço que o OSM
 * não conhece, o bairro genérico ("centro"), a rodovia sem número. Estas três
 * cargas reproduzem os três regimes de geocodificação que a produção entrega,
 * com o resultado MEDIDO de cada parada:
 *
 *   A — planalto norte de SC: municípios próximos, uma parada com pino exato
 *       (o OSM tem o número da casa em Papanduva) e duas aproximadas de bairro.
 *   B — PR e SC na mesma rota: travessia de estado, outra parada exata
 *       (Caçador) e uma aproximada.
 *   C — a armadilha do PED-19566: "Rodovia BR 476 Km 344 — centro, Paula
 *       Freitas/PR". Antes da correção de 2026-11-13 esta parada ia parar em
 *       Carapicuíba/SP (600 km fora); hoje ela cai no município certo, marcada
 *       como aproximada. Se algum dia voltar a cair em outro estado, é aqui que
 *       aparece primeiro.
 *
 * ## Regras
 *
 * - **Só roda contra o Supabase local.** A URL é conferida antes de qualquer
 *   escrita; apontar para a VPS aborta. Dado de teste não pode entrar em
 *   produção por acidente de variável de ambiente.
 * - **Geocodifica de verdade**, com `geocodificarComFallback` — a mesma função
 *   que a rota `/api/v1/shipments/[id]/rota/geocodificar` usa. Nada de
 *   coordenada escrita à mão: o pino é o que o produto produziria.
 * - **Reexecutável**: roda de novo apagando as fixtures anteriores (tudo com o
 *   prefixo `TESTE QA ·`), em vez de duplicar.
 *
 * Uso:
 *   SUPABASE_SERVICE_ROLE_KEY=<service key local> pnpm tsx scripts/semear-cargas-de-teste.ts
 */

// Este é um script de operador: o que ele imprime na tela É o resultado (quais
// paradas caíram onde). Mesmo caso dos `scripts/qa-wave-*.ts`.
/* eslint-disable no-console */
import { createClient } from "@supabase/supabase-js";

import { geocodificarComFallback } from "@/lib/rotas/geocodificacao";
import { garantirDestinosDosPedidos } from "@/lib/rotas/destinos-do-banco";

/** Prefixo que identifica tudo que este script criou (e só isso ele apaga). */
const PREFIXO = "TESTE QA ·";
const MOTORISTAS = ["TESTE MOTORISTA A", "TESTE MOTORISTA B", "TESTE MOTORISTA C"];

interface Parada {
  cliente: string;
  rua: string;
  numero: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  itens: { codigo: string; nome: string; quantidade: number; precoCents: number }[];
}

interface CargaFake {
  rotulo: string;
  veiculo: string;
  motorista: string;
  paradas: Parada[];
}

/**
 * Os três regimes, com o endereço que os produz. O comentário de cada parada
 * diz o que a geocodificação DEVE devolver — é o que este script confere e
 * imprime no fim.
 */
export const CARGAS: CargaFake[] = [
  {
    rotulo: "A · planalto norte (SC)",
    veiculo: "UNO",
    motorista: MOTORISTAS[0]!,
    paradas: [
      {
        cliente: "Mercado Nereu Ramos",
        rua: "Rua Presidente Nereu Ramos",
        numero: "500",
        bairro: "Centro",
        cidade: "Mafra",
        uf: "SC",
        cep: "89300000",
        itens: [
          { codigo: "QA-A1", nome: "Caixa de papel 30x30 (fardo)", quantidade: 4, precoCents: 12500 },
          { codigo: "QA-A2", nome: "Saco de lixo 100L (pacote)", quantidade: 10, precoCents: 8990 },
        ],
      },
      {
        cliente: "Casa de Materiais Canoinhas",
        rua: "Rua Marechal Deodoro",
        numero: "120",
        bairro: "Centro",
        cidade: "Canoinhas",
        uf: "SC",
        cep: "89460000",
        itens: [{ codigo: "QA-A3", nome: "Fita adesiva transparente 45mm", quantidade: 24, precoCents: 1290 }],
      },
      {
        // Pino EXATO: o OSM tem o número da casa nesta rua.
        cliente: "Supermercado Papanduva",
        rua: "Rua Duque de Caxias",
        numero: "200",
        bairro: "Centro",
        cidade: "Papanduva",
        uf: "SC",
        cep: "89370000",
        itens: [{ codigo: "QA-A4", nome: "Luva de latex (caixa 100)", quantidade: 6, precoCents: 3490 }],
      },
    ],
  },
  {
    rotulo: "B · PR e SC na mesma rota",
    veiculo: "SAVEIRO",
    motorista: MOTORISTAS[1]!,
    paradas: [
      {
        cliente: "Distribuidora do Iguaçu",
        rua: "Rua Coronel Amazonas",
        numero: "300",
        bairro: "Centro",
        cidade: "União da Vitória",
        uf: "PR",
        cep: "84600000",
        itens: [{ codigo: "QA-B1", nome: "Bobina de papel toalha", quantidade: 12, precoCents: 4590 }],
      },
      {
        // Pino EXATO: também tem número no OSM.
        cliente: "Comercial Caçador",
        rua: "Rua Barão do Rio Branco",
        numero: "300",
        bairro: "Centro",
        cidade: "Caçador",
        uf: "SC",
        cep: "89500000",
        itens: [
          { codigo: "QA-B2", nome: "Detergente neutro 5L", quantidade: 8, precoCents: 3290 },
          { codigo: "QA-B3", nome: "Álcool 70% 1L", quantidade: 20, precoCents: 1490 },
        ],
      },
      {
        cliente: "Mercado Santa Catarina",
        rua: "Rua Santa Catarina",
        numero: "1190",
        bairro: "Centro",
        cidade: "Irineópolis",
        uf: "SC",
        cep: "89440000",
        itens: [{ codigo: "QA-B4", nome: "Papel higiênico folha dupla (fardo)", quantidade: 5, precoCents: 5690 }],
      },
    ],
  },
  {
    rotulo: "C · a armadilha do PED-19566",
    veiculo: "saveiro",
    motorista: MOTORISTAS[2]!,
    paradas: [
      {
        // O CASO REAL: rodovia sem número no OSM + bairro genérico "centro".
        // Antes de 2026-11-13 esta parada caía em Carapicuíba/SP.
        cliente: "SV Implementos (rodovia)",
        rua: "Rodovia BR 476 Km 344, 344, SALA: 03;",
        numero: "344",
        bairro: "centro",
        cidade: "Paula Freitas",
        uf: "PR",
        cep: "84630000",
        itens: [{ codigo: "QA-C1", nome: "Peça de implemento rodoviário", quantidade: 2, precoCents: 89000 }],
      },
      {
        cliente: "Serralheria Bela Vista",
        rua: "Rua Professora Alfredo Ludka",
        numero: "140",
        bairro: "Centro",
        cidade: "Bela Vista do Toldo",
        uf: "SC",
        cep: "89478000",
        itens: [{ codigo: "QA-C2", nome: "Eletrodo de solda 2,5mm (caixa)", quantidade: 3, precoCents: 7190 }],
      },
      {
        cliente: "Agropecuária Major Vieira",
        rua: "Rua Duque de Caxias",
        numero: "80",
        bairro: "Centro",
        cidade: "Major Vieira",
        uf: "SC",
        cep: "89480000",
        itens: [{ codigo: "QA-C3", nome: "Corda de sisal 10mm (rolo)", quantidade: 4, precoCents: 4290 }],
      },
    ],
  },
];

/**
 * O guarda-corpo. Só 127.0.0.1/localhost passa: este script escreve pedidos,
 * cargas e contatos, e um `SUPABASE_URL` copiado do `.env` de produção
 * transformaria "dado fake para testar" em lixo no banco do cliente.
 */
export function ehAmbienteLocal(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  } catch {
    return false;
  }
}

function linhaDaParada(p: Parada): string {
  return `${p.rua}, ${p.numero ?? "S/N"} — ${p.bairro}, ${p.cidade}/${p.uf}, ${p.cep}`;
}

async function main() {
  const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!ehAmbienteLocal(url)) {
    console.error(`recusado: ${url} não é ambiente local. Este script só escreve no Supabase local.`);
    process.exit(1);
  }
  if (!chave) {
    console.error("falta SUPABASE_SERVICE_ROLE_KEY (a service key do Supabase local).");
    process.exit(1);
  }

  const sb = createClient(url, chave, { auth: { persistSession: false } });

  const { data: org, error: erroOrg } = await sb.from("organizations").select("id, display_name").limit(1).single();
  if (erroOrg || !org) throw new Error(`não achei a organização: ${erroOrg?.message}`);
  const orgId = (org as unknown as { id: string }).id;

  // ── Limpa as fixtures anteriores (só as deste script) ────────────────────
  const { data: contatosAntigos } = await sb
    .from("contacts")
    .select("id")
    .eq("organization_id", orgId)
    .like("display_name", `${PREFIXO}%`);
  const idsContatosAntigos = ((contatosAntigos ?? []) as { id: string }[]).map((c) => c.id);

  const { data: pedidosAntigos } = await sb
    .from("commercial_orders")
    .select("id")
    .eq("organization_id", orgId)
    .like("cliente_nome", "%TESTE QA%");
  const idsPedidosAntigos = ((pedidosAntigos ?? []) as { id: string }[]).map((p) => p.id);

  const { data: cargasAntigas } = await sb
    .from("shipments")
    .select("id")
    .eq("organization_id", orgId)
    .in("motorista_nome", MOTORISTAS);
  const idsCargasAntigas = ((cargasAntigas ?? []) as { id: string }[]).map((c) => c.id);

  if (idsCargasAntigas.length > 0) {
    await sb.from("shipment_orders").delete().eq("organization_id", orgId).in("shipment_id", idsCargasAntigas);
    await sb.from("shipments").delete().eq("organization_id", orgId).in("id", idsCargasAntigas);
  }
  if (idsPedidosAntigos.length > 0) {
    await sb.from("commercial_order_items").delete().eq("organization_id", orgId).in("order_id", idsPedidosAntigos);
    await sb.from("shipment_destinations").delete().eq("organization_id", orgId).in("contact_id", idsContatosAntigos);
    await sb.from("commercial_orders").delete().eq("organization_id", orgId).in("id", idsPedidosAntigos);
  }
  if (idsContatosAntigos.length > 0) {
    await sb.from("contacts").delete().eq("organization_id", orgId).in("id", idsContatosAntigos);
  }
  if (idsCargasAntigas.length + idsPedidosAntigos.length + idsContatosAntigos.length > 0) {
    console.log(
      `fixtures anteriores removidas: ${idsCargasAntigas.length} carga(s), ` +
        `${idsPedidosAntigos.length} pedido(s), ${idsContatosAntigos.length} contato(s)\n`,
    );
  }

  // Quem assina a criação: o gerente do seed de E2E, quando existir.
  const { data: usuarios } = await sb.auth.admin.listUsers({ page: 1, perPage: 50 });
  const autor =
    usuarios?.users.find((u) => u.email === "e2e-manager@nexus.test")?.id ??
    usuarios?.users[0]?.id ??
    null;

  const resumo: string[] = [];

  for (const carga of CARGAS) {
    const { data: numeroCarga, error: erroNumero } = await sb.rpc("fn_proximo_numero_carga", { p_org: orgId });
    if (erroNumero || typeof numeroCarga !== "number") throw new Error(`numeração da carga: ${erroNumero?.message}`);

    // ── Cadastro dos clientes (contato = endereço estruturado) ─────────────
    const contactIds: string[] = [];
    for (const p of carga.paradas) {
      const { data: contato, error } = await sb
        .from("contacts")
        .insert({
          organization_id: orgId,
          display_name: `${PREFIXO}${p.cliente}`,
          source: "manual",
          logradouro: p.rua,
          numero_end: p.numero,
          bairro: p.bairro,
          cidade: p.cidade,
          uf: p.uf,
          cep: p.cep,
        })
        .select("id")
        .single();
      if (error || !contato) throw new Error(`contato "${p.cliente}": ${error?.message}`);
      contactIds.push((contato as unknown as { id: string }).id);
    }

    // ── Pedidos (aprovado: a única situação que embarca) ───────────────────
    const orderIds: string[] = [];
    for (const [i, p] of carga.paradas.entries()) {
      const { data: numeroPedido, error: erroPedido } = await sb.rpc("fn_proximo_numero_pedido", { p_org: orgId });
      if (erroPedido || typeof numeroPedido !== "number") throw new Error(`numeração do pedido: ${erroPedido?.message}`);
      const total = p.itens.reduce((s, it) => s + it.quantidade * it.precoCents, 0);

      const { data: pedido, error } = await sb
        .from("commercial_orders")
        .insert({
          organization_id: orgId,
          numero: numeroPedido,
          contact_id: contactIds[i]!,
          cliente_nome: `${PREFIXO}${p.cliente}`,
          status: "aprovado",
          origem: "vendedor",
          modalidade_frete: "propria",
          endereco_entrega: linhaDaParada(p),
          subtotal_cents: total,
          total_cents: total,
          created_by: autor,
        })
        .select("id")
        .single();
      if (error || !pedido) throw new Error(`pedido de "${p.cliente}": ${error?.message}`);
      const orderId = (pedido as unknown as { id: string }).id;
      orderIds.push(orderId);

      const { error: erroItens } = await sb.from("commercial_order_items").insert(
        p.itens.map((it, pos) => ({
          organization_id: orgId,
          order_id: orderId,
          produto_codigo: it.codigo,
          produto_nome: it.nome,
          quantidade: it.quantidade,
          preco_unit_cents: it.precoCents,
          subtotal_cents: it.quantidade * it.precoCents,
          posicao: pos,
        })),
      );
      if (erroItens) throw new Error(`itens de "${p.cliente}": ${erroItens.message}`);
    }

    // ── A carga, exatamente como POST /api/v1/shipments faz ────────────────
    const { data: shipment, error: erroCarga } = await sb
      .from("shipments")
      .insert({
        organization_id: orgId,
        numero: numeroCarga,
        placa: null,
        veiculo_tipo: carga.veiculo,
        motorista_nome: carga.motorista,
        status: "montando",
        created_by: autor,
      })
      .select("id")
      .single();
    if (erroCarga || !shipment) throw new Error(`carga: ${erroCarga?.message}`);
    const cargaId = (shipment as unknown as { id: string }).id;

    const { error: erroVinculo } = await sb.from("shipment_orders").insert(
      orderIds.map((order_id, i) => ({
        organization_id: orgId,
        shipment_id: cargaId,
        order_id,
        sequencia: i + 1,
        status: "na_carga",
      })),
    );
    if (erroVinculo) throw new Error(`vínculo dos pedidos: ${erroVinculo.message}`);

    // O destino nasce do MESMO código que a rota usa (snapshot + chave).
    const { destinos, erro: erroDestinos } = await garantirDestinosDosPedidos(sb, orgId, orderIds);
    if (erroDestinos) throw new Error(`destinos: ${erroDestinos}`);

    for (const [orderId, destinoId] of destinos) {
      await sb
        .from("shipment_orders")
        .update({ destination_id: destinoId })
        .eq("shipment_id", cargaId)
        .eq("order_id", orderId)
        .eq("organization_id", orgId);
    }
    // Pedido embarcado sai da fila de "aguardando embarque", como na rota.
    await sb.from("commercial_orders").update({ status: "expedido" }).eq("organization_id", orgId).in("id", orderIds);

    // ── Geocodificação REAL, parada a parada ───────────────────────────────
    resumo.push(`\nCARGA ${numeroCarga} — ${carga.rotulo} (${carga.veiculo} · ${carga.motorista})`);
    for (const [i, p] of carga.paradas.entries()) {
      const r = await geocodificarComFallback(
        {
          logradouro: p.rua,
          numero_end: p.numero,
          bairro: p.bairro,
          cidade: p.cidade,
          uf: p.uf,
          cep: p.cep,
        },
        linhaDaParada(p),
      );
      const destinoId = destinos.get(orderIds[i]!);
      const patch =
        r.estado === "ok"
          ? {
              latitude: r.latitude,
              longitude: r.longitude,
              geo_status: "ok",
              geo_em: new Date().toISOString(),
              geo_fonte: `nominatim:${r.precisao ?? "rua"}`,
            }
          : {
              latitude: null,
              longitude: null,
              geo_status: r.estado,
              geo_em: new Date().toISOString(),
              geo_fonte: "nominatim",
            };
      if (destinoId) {
        await sb.from("shipment_destinations").update(patch).eq("id", destinoId).eq("organization_id", orgId);
      }
      const onde = r.componentes ? `${r.componentes.municipio}/${r.componentes.uf}` : "—";
      const pino = r.latitude != null ? `${r.latitude}, ${r.longitude}` : "sem pino";
      resumo.push(
        `  ${i + 1}. ${p.cidade}/${p.uf} — ${r.estado} · ${r.precisao ?? "—"} · ${pino} · provedor diz ${onde}`,
      );
      // A parada NUNCA pode cair fora do estado que o cadastro pediu.
      if (r.componentes?.uf && r.componentes.uf !== p.uf) {
        throw new Error(`parada ${i + 1} da carga ${numeroCarga} caiu em ${onde}: esperado ${p.cidade}/${p.uf}`);
      }
    }
  }

  console.log(`organização: ${org.display_name} (${orgId})\n${resumo.join("\n")}\n`);
  console.log("Pronto. Abra /app/expedicao no app local (Supabase em 127.0.0.1:54321).");
}

// `import.meta.url` compara o próprio arquivo: importar este módulo num teste
// não dispara escrita nenhuma.
if (process.argv[1]?.endsWith("semear-cargas-de-teste.ts")) {
  void main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
