/**
 * POST /api/v1/products/images — fotos de VÁRIOS produtos em UMA ida.
 *
 * Existe porque a tela de catálogo renderiza `FotosDoProduto` por linha e cada
 * um fazia `GET /api/v1/products/{id}/images`. Com 640 produtos eram 640
 * requisições — medido na VPS: 600 requests levaram 104 s (≈1 s cada, porque
 * cada uma revalida a sessão no GoTrue). A rajada derrubava o GoTrue (dial
 * error/timeout), o que voltava como **401** no console, com a sessão válida.
 *
 * **POR QUE POST E NÃO GET:** a primeira versão mandava os ids em
 * `?ids=a,b,c…`. Com 500 ids a URL passa de 18 KB, e o limite de header do
 * HTTP/2 estoura: o browser recebia `ERR_HTTP2_PROTOCOL_ERROR` e a conexão
 * morria — derrubando junto as requisições vizinhas (`/conversations/counts`,
 * `/ai/inbox`, os prefetches de RSC). No corpo da requisição não existe limite
 * de URL, e o problema some.
 *
 * Leitura `viewer`, igual à rota individual: os ids são filtrados pelo MESMO
 * `organization_id` do chamador — este não é atalho que abre o que a rota
 * individual esconde.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { urlDeExibicaoDaFoto } from "@/lib/storage/foto";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Teto de ids por requisição: acima disso a resposta não ajuda ninguém. */
const MAX_IDS = 500;

const corpoSchema = z.object({
  ids: z.array(z.string().uuid()).max(MAX_IDS),
});

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "product_images" });
  if (!authz.ok) return authz.response;

  const bruto = await req.json().catch(() => null);
  const parse = corpoSchema.safeParse(bruto);
  if (!parse.success) {
    return fail("validation_failed", `Envie { ids: [...] } com até ${MAX_IDS} ids.`, 422, {
      requestId,
    });
  }

  const ids = [...new Set(parse.data.ids)];
  if (ids.length === 0) return ok({}, { requestId });

  const supabase = await createClient();
  const porProduto: Record<string, { id: string; url: string; posicao: number }[]> = {};
  for (const id of ids) porProduto[id] = [];

  // O PostgREST transforma `in.(...)` na QUERY STRING. Medido na VPS: 500
  // ids viram uma URL de 19 KB e ele responde `414 URI too long` — que esta
  // rota devolvia como 500. Por isso o filtro vai em fatias de 100 (≈3,8 KB
  // cada), em paralelo. O teto do lote continua 500 ids por REQUISIÇÃO; o que
  // mudou foi o tamanho de cada consulta ao banco.
  const FATIA = 100;
  const fatias: string[][] = [];
  for (let i = 0; i < ids.length; i += FATIA) fatias.push(ids.slice(i, i + FATIA));

  const respostas = await Promise.all(
    fatias.map((fatia) =>
      supabase
        .from("product_images")
        .select("id, product_id, storage_path, posicao")
        .eq("organization_id", authz.org.orgId)
        .in("product_id", fatia)
        .order("posicao"),
    ),
  );

  const erro = respostas.find((r) => r.error)?.error;
  if (erro) return fail("internal_error", "Erro ao ler as fotos.", 500, { requestId });

  const linhas = respostas.flatMap(
    (r) =>
      (r.data ?? []) as unknown as {
        id: string;
        product_id: string;
        storage_path: string;
        posicao: number;
      }[],
  );

  for (const f of linhas) {
    // A distinção entre foto em disco e foto no bucket mora em
    // `urlDeExibicaoDaFoto` — aqui ela seria a terceira cópia da mesma regra.
    const url = urlDeExibicaoDaFoto(f.storage_path, { productId: f.product_id, fotoId: f.id });
    porProduto[f.product_id]?.push({ id: f.id, url, posicao: f.posicao });
  }

  return ok(porProduto, { requestId });
}
