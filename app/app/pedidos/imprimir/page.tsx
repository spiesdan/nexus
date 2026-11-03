import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { rotuloDoDocumento } from "@/lib/comercial/documento";
import { MAXIMO_PEDIDOS_NO_LOTE, emLotes, idsDoLote } from "@/lib/comercial/ids-do-lote";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { enderecoEmLinha } from "@/lib/contacts/endereco-em-linha";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";
import { COLUNAS_DO_ITEM, COLUNAS_DO_PEDIDO, type ItemDoPedido, type PedidoComercial } from "@/lib/schemas/pedidos";

import { ImprimirLoteClient, type ClienteImpresso, type ItemImpresso } from "./_imprimir";

export const dynamic = "force-dynamic";

/**
 * IMPRESSÃO EM LOTE — a porta é o botão Imprimir da barra de massa, que
 * passa os ids na URL.
 *
 * **Com ids, esta página NÃO desenha nada**: ela resolve a sessão e
 * redireciona no servidor para o PDF (`/api/v1/commercial-orders/pdf`), que
 * abre no visor do navegador na mesma aba. É por isso que "Pedidos > Imprimir"
 * não aparece no papel — o breadcrumb vive no HTML desta rota, e este HTML
 * nunca chega a ser pintado.
 *
 * **Sem ids, ela continua renderizando a tela de impressão como sempre**
 * (estado vazio, sem pedido nenhum selecionado). Fora de propósito: os e2e
 * `responsividade-nas-rotas` e `auditoria-aceite-11-itens` visitam exatamente
 * `/app/pedidos/imprimir` sem query, e o shell, o h1 e a ausência de overflow
 * ali são medidos — apagar a tela derrubaria as duas specs.
 *
 * **`?carga=<id>` imprime os pedidos de uma carga** — a segunda porta, aberta
 * pelo botão "Imprimir pedidos" da ficha da carga. Ela existe porque a
 * expedição já imprimia o romaneio (a folha de quem dirige), mas não os
 * documentos dos pedidos: quem separa a mercadoria no galpão tinha de voltar
 * até Pedidos e marcar um por um. A lista sai na ordem das PARADAS, que é a
 * ordem em que o motorista entrega.
 */
export default async function ImprimirLotePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; carga?: string }>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const params = await searchParams;

  const supabase = await createClient();
  const ids = idsDoLote(params.ids);

  if (ids.length > 0) {
    redirect(`/api/v1/commercial-orders/pdf?ids=${ids.join(",")}`);
  }

  /**
   * OS PEDIDOS DA CARGA, na ordem das paradas.
   *
   * A carga chega como `?carga=<uuid>`; a lista sai de `shipment_orders` com o
   * `organization_id` explícito (id de outra organização não devolve nada, e
   * carga vazia cai na tela de impressão, não num PDF em branco).
   */
  const cargaId = idsDoLote(params.carga)[0];
  const idsDaCarga = cargaId
    ? ((
        await supabase
          .from("shipment_orders")
          .select("order_id, sequencia")
          .eq("organization_id", activeOrg.orgId)
          .eq("shipment_id", cargaId)
          .order("sequencia")
      ).data ?? []
      ).map((linha) => (linha as { order_id: string }).order_id)
    : [];

  if (idsDaCarga.length > 0 && idsDaCarga.length <= MAXIMO_PEDIDOS_NO_LOTE) {
    redirect(`/api/v1/commercial-orders/pdf?ids=${idsDaCarga.join(",")}`);
  }

  /**
   * CARGA MAIOR QUE UM LOTE. Não imprime 50 e esconde o resto: diz o número e
   * entrega um botão por lote, na ordem das paradas. Hoje nenhuma carga chega
   * perto disso (a maior desta instalação tem 22 pedidos), mas o teto é regra
   * do impresso — e a saída precisa existir antes do dia em que ela encostar.
   */
  if (idsDaCarga.length > MAXIMO_PEDIDOS_NO_LOTE) {
    const t = (texto: string) => traduzir(texto, user.idioma);
    const lotes = emLotes(idsDaCarga);
    return (
      <div className="mx-auto max-w-xl space-y-4 p-6">
        <h1 className="text-lg font-semibold">{t("Imprimir pedidos da carga")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Esta carga tem")} {idsDaCarga.length} {t("pedidos, e cada arquivo imprime até")}{" "}
          {MAXIMO_PEDIDOS_NO_LOTE}. {t("Abra um lote por vez, na ordem das paradas:")}
        </p>
        <div className="flex flex-col gap-2">
          {lotes.map((lote, indice) => (
            <Button key={lote[0]} variant="outline" asChild className="justify-start">
              <Link href={`/app/pedidos/imprimir?ids=${lote.join(",")}`} target="_blank">
                {t("Lote")} {indice + 1} · {lote.length} {t("pedidos")}
              </Link>
            </Button>
          ))}
        </div>
      </div>
    );
  }

  const [{ data: org }, { data: pedidosRaw }, { data: itensRaw }] = await Promise.all([
    supabase.from("organizations").select("display_name").eq("id", activeOrg.orgId).maybeSingle(),
    ids.length > 0
      ? supabase.from("commercial_orders").select(COLUNAS_DO_PEDIDO).eq("organization_id", activeOrg.orgId).in("id", ids)
      : Promise.resolve({ data: [] }),
    ids.length > 0
      ? supabase
          .from("commercial_order_items")
          .select(`order_id, ${COLUNAS_DO_ITEM}`)
          .eq("organization_id", activeOrg.orgId)
          .in("order_id", ids)
          .order("posicao")
      : Promise.resolve({ data: [] }),
  ]);

  const porPedido = new Map<string, ItemDoPedido[]>();
  for (const it of ((itensRaw ?? []) as unknown as (ItemDoPedido & { order_id: string })[])) {
    const lista = porPedido.get(it.order_id) ?? [];
    lista.push(it);
    porPedido.set(it.order_id, lista);
  }
  const listaPedidos = (pedidosRaw ?? []) as unknown as PedidoComercial[];

  // Bloco do cliente (um select para o lote) + unidade dos itens (idem).
  const idsContatos = [...new Set(listaPedidos.map((p) => p.contact_id).filter(Boolean))] as string[];
  const idsProdutos = [
    ...new Set(
      [...porPedido.values()].flat().map((i) => i.product_id).filter(Boolean),
    ),
  ] as string[];
  const [{ data: contatosRaw }, { data: prodsRaw }] = await Promise.all([
    idsContatos.length > 0
      ? supabase
          .from("contacts")
          .select("id, display_name, name, tipo_pessoa, fantasia, ie, cnpj, phone_number, email, logradouro, numero_end, complemento, bairro, cidade, uf, cep")
          .eq("organization_id", activeOrg.orgId)
          .in("id", idsContatos)
      : Promise.resolve({ data: [] }),
    idsProdutos.length > 0
      ? supabase
          .from("catalog_products")
          .select("id, unidade")
          .eq("organization_id", activeOrg.orgId)
          .in("id", idsProdutos)
      : Promise.resolve({ data: [] }),
  ]);
  const porContato = new Map(
    ((contatosRaw ?? []) as unknown as Record<string, string | null>[]).map((c) => [c.id as string, c]),
  );
  const unidadePorProduto = new Map(
    ((prodsRaw ?? []) as { id: string; unidade: string | null }[]).map((pr) => [pr.id, pr.unidade ?? "UN"]),
  );

  function clienteDe(p: PedidoComercial): ClienteImpresso {
    const c = p.contact_id ? porContato.get(p.contact_id) : undefined;
    if (!c) {
      return {
        nome: p.cliente_nome,
        fantasia: null,
        rotuloDocumento: rotuloDoDocumento(null, p.cliente_documento),
        documento: p.cliente_documento,
        ie: null,
        endereco: p.endereco_entrega,
        bairro: null,
        cep: null,
        cidade: null,
        uf: null,
        fone: null,
        email: null,
      };
    }
    const s = (k: string) => (c[k] as string | null) ?? null;
    const documento = s("cnpj") ?? p.cliente_documento;
    return {
      nome: s("display_name") ?? s("name") ?? p.cliente_nome,
      fantasia: s("fantasia"),
      rotuloDocumento: rotuloDoDocumento(s("tipo_pessoa"), documento),
      documento,
      ie: s("ie"),
      endereco:
        enderecoEmLinha({
          logradouro: s("logradouro"),
          numero_end: s("numero_end"),
          complemento: s("complemento"),
          bairro: s("bairro"),
          cidade: s("cidade"),
          uf: s("uf"),
          cep: s("cep"),
        }) || p.endereco_entrega,
      bairro: s("bairro"),
      cep: s("cep"),
      cidade: s("cidade"),
      uf: s("uf"),
      fone: s("phone_number"),
      email: s("email"),
    };
  }

  const pedidos = listaPedidos.map((p) => ({
    pedido: p,
    cliente: clienteDe(p),
    itens: (porPedido.get(p.id) ?? []).map(
      (it): ItemImpresso => ({ ...it, unidade: (it.product_id && unidadePorProduto.get(it.product_id)) || "UN" }),
    ),
  }));
  // Mesma ordem da seleção.
  pedidos.sort((a, b) => ids.indexOf(a.pedido.id) - ids.indexOf(b.pedido.id));

  return (
    <ImprimirLoteClient
      nomeOrganizacao={(org as unknown as { display_name?: string } | null)?.display_name ?? ""}
      pedidos={pedidos}
    />
  );
}
