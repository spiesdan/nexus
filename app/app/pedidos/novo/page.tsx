import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { COLUNAS_DO_PRODUTO, type Produto } from "@/lib/schemas/produtos";
import { custoSomenteParaQuemVeMargem } from "@/lib/pedidos/custo-so-para-quem-ve-margem";
import { createClient } from "@/lib/supabase/server";

import { OrderEditor } from "./_editor";

export const dynamic = "force-dynamic";

/**
 * NOVO PEDIDO — editor de venda rápida (refatoração §2–3).
 *
 * O servidor entrega catálogo + contatos + tabelas + permissão de margem +
 * comissão; o editor monta o rascunho local (autosave) e a rota recalcula
 * tudo no Salvar/Finalizar (totais do cliente nunca entram).
 */
export default async function NovoPedidoPage({
  searchParams,
}: {
  searchParams: Promise<{ contato?: string }>;
}) {
  const user = await requireAuth();
  const t = (texto: string) => traduzir(texto, user.idioma);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const { contato: contatoDoLink } = await searchParams;

  const pode = user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;
  if (!pode) redirect("/app/pedidos");
  const verMargem = user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;

  const supabase = await createClient();
  const camposDoContato = "id, fantasia, display_name, name, phone_number, email";
  const [
    { data: produtos },
    { data: contatos },
    { data: tabelas },
    { data: policies },
    { data: organizacao },
    { data: contatoDoPedido },
    { data: prazos },
  ] = await Promise.all([
      supabase
        .from("catalog_products")
        .select(COLUNAS_DO_PRODUTO)
        .eq("organization_id", activeOrg.orgId)
        .eq("ativo", true)
        .order("nome")
        // O mesmo teto da rota de produtos e da importação por IA. Com 500
        // fixos, um catálogo de 635 fazia o seletor e a conferência da IA
        // esconderem justamente os produtos que ficaram de fora.
        .limit(2000),
      supabase
        .from("contacts")
        .select(camposDoContato)
        .eq("organization_id", activeOrg.orgId)
        .eq("is_anonymized", false)
        .order("display_name")
        .limit(500),
      supabase
        .from("price_tables")
        .select("id, nome, desconto_pct")
        .eq("organization_id", activeOrg.orgId)
        .eq("ativo", true)
        .order("nome")
        .limit(100),
      supabase
        .from("commercial_policies")
        .select("comissao_padrao_pct, desconto_max_vendedor_pct")
        .eq("organization_id", activeOrg.orgId)
        .maybeSingle(),
      // A "representada" do Mercos: razão social, CNPJ e telefone do emitente.
      // É o bloco 2 da tela de pedido — e é o que o cliente vê no PDF.
      supabase
        .from("organizations")
        .select("legal_name, cnpj, phone")
        .eq("id", activeOrg.orgId)
        .maybeSingle(),
      // O cliente veio de um link da ficha/360° (`?contato=<id>`). A lista do
      // seletor tem teto de 500 — numa base maior o contato do link pode ficar
      // de fora, e a tela abriria sem ninguém selecionado. Buscar o id UMA vez,
      // sempre com `organization_id` explícito, garante que o link funciona em
      // qualquer tamanho de carteira. Contato de outra org/anônimo não resolve.
      typeof contatoDoLink === "string" && contatoDoLink !== ""
        ? supabase
            .from("contacts")
            .select(camposDoContato)
            .eq("organization_id", activeOrg.orgId)
            .eq("is_anonymized", false)
            .eq("id", contatoDoLink)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      // Instalação que ainda não aplicou a 0334 continua funcionando com a
      // lista legada no editor — a configuração nova é acréscimo, não pré-requisito.
      (async () => {
        try {
          const r = await supabase
            .from("commercial_payment_methods")
            .select("codigo, nome")
            .eq("organization_id", activeOrg.orgId)
            .eq("tipo", "prazo")
            .eq("ativo", true)
            .order("nome");
          return { data: r.error ? [] : r.data };
        } catch {
          return { data: [] };
        }
      })(),
    ]);

  type ContatoDoEditor = {
    id: string;
    fantasia: string | null;
    display_name: string | null;
    name: string | null;
    phone_number: string | null;
    email: string | null;
  };
  const listaDeContatos = (contatos ?? []) as unknown as ContatoDoEditor[];
  const contatoInicial = (contatoDoPedido ?? null) as unknown as ContatoDoEditor | null;
  // O contato do link entra na frente da lista (e a lista local continua sendo
  // a primeira página da organização, com busca no servidor no seletor).
  const contatosDoEditor =
    contatoInicial && !listaDeContatos.some((c) => c.id === contatoInicial.id)
      ? [contatoInicial, ...listaDeContatos]
      : listaDeContatos;
  // Custo é dado de margem: quem não pode ver margem não precisa recebê-lo nem
  // no payload do RSC. A UI já escondia, mas o valor viajava até o browser.
  const produtosDoEditor = custoSomenteParaQuemVeMargem(
    (produtos ?? []) as unknown as Produto[],
    verMargem,
  );
  const politica = policies as unknown as {
    comissao_padrao_pct: number | null;
    desconto_max_vendedor_pct: number | null;
  } | null;

  return (
    <OrderEditor
      produtos={produtosDoEditor}
      contatos={contatosDoEditor}
      contatoInicial={contatoInicial?.id ?? null}
      tabelas={(tabelas ?? []) as unknown as { id: string; nome: string; desconto_pct: number }[]}
      verMargem={verMargem}
      comissaoPct={politica?.comissao_padrao_pct ?? null}
      // O servidor usa o mesmo default quando não há política (criar-pedido).
      descontoMaxVendedorPct={politica?.desconto_max_vendedor_pct ?? 5}
      nomeOrganizacao={activeOrg.name ?? ""}
      representada={{
        razaoSocial:
          (organizacao as unknown as { legal_name?: string | null } | null)?.legal_name ?? null,
        cnpj: (organizacao as unknown as { cnpj?: string | null } | null)?.cnpj ?? null,
        telefone: (organizacao as unknown as { phone?: string | null } | null)?.phone ?? null,
      }}
      nomeVendedor={user.full_name ?? user.email}
      escopoDoRascunho={`${activeOrg.orgId}:${user.id}`}
      prazos={(prazos ?? []).map((p: { codigo: string; nome: string }) => ({
        codigo: String(p.codigo),
        nome: String(p.nome),
      }))}
      textos={{
        titulo: t("Novo pedido"),
        subtitulo: t("Busque o cliente, adicione os produtos e finalize."),
        cliente: t("Cliente"),
        buscarCliente: t("Buscar cliente por nome, telefone ou e-mail…"),
        clienteAvulso: t("ou digite o nome para cliente avulso"),
        condicao: t("Condição de pagamento"),
        // 0261 — prazo estruturado e a marcação de NF.
        formaPagamento: t("Forma de pagamento"),
        prazoLivre: t("Prazo livre / não informado"),
        prazoPrecisaNf: t(
          "O prazo começa a contar quando a nota for emitida. Marque “é com NF” para o sistema acompanhar a emissão.",
        ),
        exigeNf: t("Nota fiscal"),
        exigeNfOpcao: t("Este pedido é com NF"),
        observacoes: t("Informações adicionais"),
        informacoesFiscais: t("Informações fiscais (NF-e)"),
        informacoesFiscaisDica: t(
          "Vai no infCpl da nota. Se ficar vazio, a emissão usa as informações adicionais.",
        ),
        obsInterna: t("Observação interna (equipe)"),
        endereco: t("Endereço de entrega"),
        enderecoExemplo: t("Rua, número, bairro, cidade"),
        transportadora: t("Transportadora"),
        tabelaPreco: t("Tabela de preço"),
        semTabela: t("Preço base"),
        relacionados: t("Você também pode vender"),
        adicionar: t("Adicionar"),
        historico: t("Histórico do cliente"),
        rascunhoRestaurado: t("Rascunho anterior restaurado"),
        rascunhoDeOutroCliente: t("Há um rascunho de outro cliente"),
        rascunhoDeOutroClienteDesc: t(
          "Você chegou aqui a partir de um cliente, mas existe um rascunho salvo de outro. Escolha qual manter — nada é apagado sem esta decisão.",
        ),
        usarClienteDoLink: t("Usar o cliente do link"),
        continuarRascunho: t("Continuar o rascunho"),
        produtos: t("Produtos"),
        // O atalho `/` é uma dica de TELA, não parte do nome do campo: com ele
        // aqui, o leitor de tela anunciava "… (/ foca)" em todo foco. A dica
        // vive no `title` do próprio campo (ver `_produtos.tsx`).
        buscarProduto: t("Buscar produto, código ou EAN"),
        subtotal: t("Subtotal"),
        desconto: t("Desconto"),
        frete: t("Frete"),
        total: t("Total"),
        margem: t("Margem"),
        comissao: t("Comissão estimada"),
        aguardandoAprovacao: t("Desconto acima do teto: vai para aprovação comercial."),
        salvarRascunho: t("Salvar rascunho"),
        finalizar: t("Gerar pedido"),
        revisar: t("Revisar pedido"),
        pedidoCriado: t("Pedido criado"),
      }}
    />
  );
}
