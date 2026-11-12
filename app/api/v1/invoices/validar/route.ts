/**
 * POST /api/v1/invoices/validar — pré-validação fiscal SEM emitir.
 *
 * Aceita `{ order_id }` (emissão de pedido) e `{ extras: { avulsa } }` (NF-e de
 * venda sem pedido). Em ambos devolve a lista de pendências (cliente, produtos,
 * emitente) com para onde ir corrigir. A UI mostra antes do "Emitir" para a SEFAZ
 * nunca ser a primeira a dizer que falta NCM.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { carregarDestinatario } from "@/lib/fiscal/destinatario-da-nota";
import { resolverProdutosDosItens } from "@/lib/fiscal/produto-do-item";
import { carregarContextoSped, montarPayloadSped } from "@/lib/fiscal/sped-payload";
import { extrasFiscaisSchema, statusFaturavel } from "@/lib/schemas/fiscal";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const corpoSchema = z
  .object({
    order_id: z.string().uuid().optional(),
    extras: extrasFiscaisSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.order_id && !(v.extras?.avulsa ?? null)) {
      ctx.addIssue({
        code: "custom",
        path: ["order_id"],
        message: "Informe o pedido (order_id) ou a venda avulsa (extras.avulsa).",
      });
    }
  });

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "invoices" });
  if (!authz.ok) return authz.response;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Dados inválidos.", 422, { requestId });

  const supabase = await createClient();
  const pendencias: { campo: string; mensagem: string; onde: string }[] = [];

  // NF-E AVULSA (venda sem pedido): o fato vem de `extras.avulsa`; a pré-validação
  // cobre destinatário e itens da própria venda, sem pedido por trás.
  const avulsa = parsed.data.order_id ? null : (parsed.data.extras?.avulsa ?? null);
  if (avulsa) {
    const destinatario = await carregarDestinatario(supabase, authz.org.orgId, {
      cliente_nome: avulsa.cliente_nome ?? undefined,
      cliente_documento: avulsa.cliente_documento ?? null,
      contact_id: avulsa.contato_id ?? null,
    });
    for (const falta of destinatario.faltando) {
      pendencias.push({
        campo: "cliente",
        mensagem: `Cliente: ajuste ${falta}`,
        onde: avulsa.contato_id ? `/app/contacts/${avulsa.contato_id}` : "/app/contacts",
      });
    }

    const ctx = await carregarContextoSped(authz.org.orgId);
    if (!ctx) {
      return ok(
        {
          ok: false,
          pendencias: [{ campo: "emitente", mensagem: "Configuração fiscal incompleta.", onde: "/app/notas" }],
        },
        { requestId },
      );
    }
    const montado = montarPayloadSped(
      {
        serie: "",
        natureza_operacao: (ctx.emitente.natureza_operacao as string) ?? "",
        cfop_padrao: (ctx.emitente.cfop_padrao as string) ?? "",
        emitente_documento: ctx.emitente.emitente_documento ?? null,
        razao_social: ctx.emitente.razao_social ?? null,
        ie: ctx.emitente.ie ?? null,
        crt: (ctx.emitente.crt as string) ?? "1",
        logradouro: ctx.emitente.logradouro ?? null,
        numero_end: ctx.emitente.numero_end ?? null,
        bairro: ctx.emitente.bairro ?? null,
        municipio: ctx.emitente.municipio ?? null,
        codigo_municipio: ctx.emitente.codigo_municipio ?? null,
        uf: ctx.emitente.uf ?? null,
        cep: ctx.emitente.cep ?? null,
        ambiente: (ctx.emitente.ambiente as string) ?? "homologacao",
        certificado_path: ctx.emitente.certificado_path ?? null,
      },
      ctx.senhaCertificado ?? "",
      ctx.orgId,
      {
        numero: 0,
        nome: destinatario.nome || avulsa.cliente_nome || "",
        documento: destinatario.documento ?? avulsa.cliente_documento ?? null,
        ie: destinatario.ie,
        indicador_ie: destinatario.indicador_ie,
        frete_cents: avulsa.frete_cents ?? 0,
      },
      avulsa.itens.map((i) => ({
        codigo: i.codigo ?? "",
        descricao: i.descricao ?? "",
        ncm: i.ncm ?? null,
        cfop: i.cfop ?? null,
        unidade: i.unidade ?? null,
        quantidade: i.quantidade,
        preco_cents: i.preco_cents,
        desconto_pct: i.desconto_pct,
      })),
      parsed.data.extras,
    );
    if (!montado.ok) {
      pendencias.push({ campo: "fiscal", mensagem: montado.falta, onde: "/app/notas" });
    }
    return ok({ ok: pendencias.length === 0, pendencias }, { requestId });
  }

  const { data: pedido } = await supabase
    .from("commercial_orders")
    .select(
      "id, numero, cliente_nome, cliente_documento, total_cents, frete_cents, status, contact_id",
    )
    .eq("id", parsed.data.order_id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const ped = pedido as unknown as {
    id: string;
    numero: number;
    cliente_nome: string;
    cliente_documento: string | null;
    total_cents: number;
    frete_cents: number;
    status: string;
    contact_id: string | null;
  } | null;
  if (!ped) return fail("not_found", "Pedido não encontrado.", 404, { requestId });
  if (!statusFaturavel(ped.status)) {
    return ok(
      {
        ok: false,
        pendencias: [
          {
            campo: "status",
            mensagem: `Pedido está "${ped.status}" — só pedido concluído, faturado, expedido ou entregue vira nota.`,
            onde: `/app/pedidos/${ped.id}`,
          },
        ],
      },
      { requestId },
    );
  }

  // O MESMO resolvedor da emissão. Antes esta pré-validação exigia CEP e olhava
  // as colunas soltas do contato: divergia do que a emissão faz — bloqueava
  // pedido emissível (CEP é opcional no TLocal) e deixava passar cidade que não
  // resolve no IBGE. Agora o que a tela mostra é o que o drain vai usar.
  const destinatario = await carregarDestinatario(supabase, authz.org.orgId, ped);
  for (const falta of destinatario.faltando) {
    pendencias.push({
      campo: "cliente",
      mensagem: `Cliente: ajuste ${falta}`,
      onde: ped.contact_id ? `/app/contacts/${ped.contact_id}` : "/app/contacts",
    });
  }

  const ctx = await carregarContextoSped(authz.org.orgId);
  if (!ctx) {
    return ok(
      {
        ok: false,
        pendencias: [
          { campo: "emitente", mensagem: "Configuração fiscal incompleta.", onde: "/app/notas" },
        ],
      },
      { requestId },
    );
  }
  const { data: itensDb } = await supabase
    .from("commercial_order_items")
    .select("produto_codigo, produto_nome, quantidade, preco_unit_cents, desconto_pct, product_id")
    .eq("order_id", ped.id)
    .eq("organization_id", authz.org.orgId)
    .order("posicao");
  // O MESMO resolvedor do drain: vínculo explícito → código → nome. Esta é a
  // tela que mostrou `Falta NCM do produto "ESPONJA COM 4 UN"` enquanto o NCM
  // estava no cadastro — porque só olhava `product_id`, que é nulo no item de
  // texto livre.
  const produtosDosItens = await resolverProdutosDosItens(supabase, authz.org.orgId, itensDb ?? []);
  const em = ctx.emitente as unknown as Record<string, string | null>;
  const montado = montarPayloadSped(
    {
      serie: "",
      natureza_operacao: (em.natureza_operacao as string) ?? "",
      cfop_padrao: (em.cfop_padrao as string) ?? "",
      emitente_documento: em.emitente_documento ?? null,
      razao_social: em.razao_social ?? null,
      ie: em.ie ?? null,
      crt: (em.crt as string) ?? "1",
      logradouro: em.logradouro ?? null,
      numero_end: em.numero_end ?? null,
      bairro: em.bairro ?? null,
      municipio: em.municipio ?? null,
      codigo_municipio: em.codigo_municipio ?? null,
      uf: em.uf ?? null,
      cep: em.cep ?? null,
      ambiente: (em.ambiente as string) ?? "homologacao",
      certificado_path: em.certificado_path ?? null,
    },
    ctx.senhaCertificado ?? "",
    // Só para o caminho do certificado: o sidecar exige o caminho completo
    // dentro de `/certs/`, e o nome gravado no banco não basta.
    ctx.orgId,
    {
      numero: ped.numero,
      nome: destinatario.nome || ped.cliente_nome,
      documento: destinatario.documento ?? ped.cliente_documento,
      ie: destinatario.ie,
      indicador_ie: destinatario.indicador_ie,
      frete_cents: ped.frete_cents,
    },
    (
      (itensDb ?? []) as unknown as {
        produto_codigo: string;
        produto_nome: string;
        quantidade: number;
        preco_unit_cents: number;
        desconto_pct: number;
        product_id: string | null;
      }[]
    ).map((i, pos) => {
      const produto = produtosDosItens[pos];
      return {
        codigo: i.produto_codigo,
        descricao: i.produto_nome,
        ncm: produto?.ncm ?? null,
        cfop: produto?.cfop ?? null,
        unidade: produto?.unidade ?? null,
        quantidade: i.quantidade,
        preco_cents: i.preco_unit_cents,
        desconto_pct: Number(i.desconto_pct),
      };
    }),
  );
  if (!montado.ok) {
    pendencias.push({ campo: "fiscal", mensagem: montado.falta, onde: "/app/notas" });
  }
  return ok({ ok: pendencias.length === 0, pendencias }, { requestId });
}
