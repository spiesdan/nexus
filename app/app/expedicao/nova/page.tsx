import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { documentoNormalizado, vincularPorDocumento } from "@/lib/expedicao/buscar-embarcavel";
import { traduzir } from "@/lib/i18n/dicionario";
import { COLUNAS_DO_PEDIDO, type PedidoComercial } from "@/lib/schemas/pedidos";
import { createClient } from "@/lib/supabase/server";

import { NovaCargaClient } from "./_client";

export const dynamic = "force-dynamic";

/**
 * NOVA CARGA — a subtela de montagem da expedição.
 *
 * A fila de cargas responde "o que está na rua"; esta tela responde "o que sai
 * na próxima". São tarefas diferentes e por isso têm endereço próprio: dá para
 * mandar o link para quem vai separar, recarregar sem perder a fila e voltar
 * para a expedição sem rolar por uma bancada espremida ao lado dela.
 *
 * Só `agent` para cima entra. Quem não pode criar volta para a fila em vez de
 * ver um formulário que o servidor vai recusar.
 */
export default async function NovaCargaPage() {
  const user = await requireAuth();
  const t = (texto: string) => traduzir(texto, user.idioma);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const podeCriar = user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;
  if (!podeCriar) redirect("/app/expedicao");

  const supabase = await createClient();
  const { data: embarcaveis } = await supabase
    .from("commercial_orders")
    .select(COLUNAS_DO_PEDIDO)
    .eq("organization_id", activeOrg.orgId)
    // Só aprovado/faturado: quem embarcou virou `expedido` e saiu da fila
    // sozinho (a rota avança no POST da carga).
    .in("status", ["aprovado", "faturado"])
    .order("created_at", { ascending: false })
    .limit(200);

  // A CIDADE DE CADA PEDIDO, para o filtro de cidade.
  //
  // O endereço de entrega é digitado por pedido e boa parte da base não tem
  // (medido: 107 dos 109 pedidos abertos desta instalação). O cadastro do
  // cliente tem cidade/UF preenchidos em 3.200 dos 12.605 contatos — ou seja,
  // uma fonte complementar, não a principal. As duas juntas é o que faz o
  // filtro achar alguém; só o endereço não acha quase ninguém.
  const pedidos = (embarcaveis ?? []) as unknown as PedidoComercial[];
  const idsDeContato = [
    ...new Set(pedidos.map((p) => p.contact_id).filter((v): v is string => Boolean(v))),
  ];

  // QUEM NÃO TEM CONTATO VINCULADO — o caso dos pedidos importados, que trazem
  // o CNPJ no pedido mas não o vínculo com o cadastro. Sem esta segunda busca,
  // 101 dos 109 pedidos aprovados/faturados ficavam sem cidade nenhuma e o
  // filtro "Canoinhas" devolvia zero com 32 pedidos de Canoinhas na fila.
  const documentosSemContato = [
    ...new Set(
      pedidos
        .filter((p) => !p.contact_id)
        .map((p) => documentoNormalizado(p.cliente_documento))
        // Só CNPJ: `contacts.cnpj` guarda 14 dígitos, e CPF do pedido nunca
        // casaria com a coluna de lá — buscá-lo só aumentaria o `in`.
        .filter((doc) => doc.length === 14),
    ),
  ];

  const { data: contatosPorId } = idsDeContato.length
    ? await supabase
        .from("contacts")
        .select("id, cidade, uf")
        .eq("organization_id", activeOrg.orgId)
        .in("id", idsDeContato)
    : { data: [] as { id: string; cidade: string | null; uf: string | null }[] };
  const { data: contatosPorDocumento } = documentosSemContato.length
    ? await supabase
        .from("contacts")
        .select("id, cnpj, cidade, uf")
        .eq("organization_id", activeOrg.orgId)
        .in("cnpj", documentosSemContato)
    : { data: [] as { id: string; cnpj: string | null; cidade: string | null; uf: string | null }[] };

  const cidadePorContato: Record<string, string> = {};
  const idPorDocumento: Record<string, string> = {};

  for (const c of (contatosPorId ?? []) as { id: string; cidade: string | null; uf: string | null }[]) {
    const texto = [c.cidade, c.uf].filter(Boolean).join("/");
    if (texto) cidadePorContato[c.id] = texto;
  }
  for (const c of (contatosPorDocumento ?? []) as {
    id: string;
    cnpj: string | null;
    cidade: string | null;
    uf: string | null;
  }[]) {
    const texto = [c.cidade, c.uf].filter(Boolean).join("/");
    if (texto) cidadePorContato[c.id] = texto;
    const doc = documentoNormalizado(c.cnpj);
    // Cadastro duplicado pelo mesmo CNPJ: fica o que tem cidade. Sem esta
    // regra, o último lido (possivelmente o duplicado vazio) venceria e a
    // cidade sumiria de novo.
    if (doc && (cidadePorContato[c.id] || !idPorDocumento[doc])) idPorDocumento[doc] = c.id;
  }

  // O pedido importado fica com o contato que o documento achou, em memória e
  // só para leitura: o filtro lê a cidade por `contact_id`, e a linha passa a
  // mostrar a cidade do cadastro como as demais.
  const pedidosComContato = vincularPorDocumento(pedidos, idPorDocumento);

  return (
    <NovaCargaClient
      embarcaveis={pedidosComContato}
      cidadePorContato={cidadePorContato}
      textos={{
        titulo: t("Nova carga"),
        subtitulo: t("Escolha os pedidos, informe o veículo e confirme o que sai."),
        voltar: t("Voltar para expedição"),
      }}
    />
  );
}
