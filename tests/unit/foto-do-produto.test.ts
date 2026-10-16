/**
 * FOTOS DO PRODUTO — ler, resolver, copiar e enviar (o caso do "tem foto?").
 *
 * Sem Gemini, sem WAHA, sem banco: PostgREST, Storage e handler de envio são
 * dublês. O que estes testes prendem:
 * - leitura resolve produto ATIVO por código exato + fotos ordenadas, sem `local:`;
 * - envio mira a conversa DO RUNTIME (nunca do payload) e é idempotente;
 * - sem foto/produto/conversa a tool RECUSA com motivo em vez de inventar;
 * - a cópia para a conversa é determinística e recusa caminho inventado.
 */
import { describe, expect, it, vi } from "vitest";

import { resolverFotoDoProduto } from "@/lib/catalogo/foto-do-produto";
import { copiarFotoParaConversa } from "@/lib/messaging/media/copiar-foto-produto";
import { crmGetProductPhotos, crmSendProductPhoto } from "@/lib/mcp/tools/comercio";

vi.mock("@/app/api/v1/messages/_handler", () => ({
  sendMessageHandler: vi.fn(),
}));

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";

const PRODUTO = { id: "prod-1", nome: "Vassoura de pelo" };

/**
 * Dublê PostgREST: respostas programadas por tabela; `maybeSingle` e `order`
 * são os terminais (como no driver real, o `await` resolve na última chamada).
 */
function fakeDb(respostas: Record<string, { data: unknown; error: null | { message: string } }>) {
  let tabela = "";
  const chain: Record<string, unknown> = {};
  const terminal = () => {
    const r = respostas[tabela] ?? { data: null, error: null };
    return Promise.resolve(r);
  };
  for (const m of ["select", "eq", "limit"]) chain[m] = () => chain;
  chain["maybeSingle"] = terminal;
  chain["order"] = terminal;
  // O client real é thenable: `await` na cadeia resolve no terminal.
  (chain as { then: unknown }).then = (ok: (v: unknown) => unknown) =>
    terminal().then((v) => ok(v));
  return {
    supabase: {
      from: (t: string) => {
        tabela = t;
        return chain;
      },
    } as never,
  };
}

const FOTOS = [{ storage_path: "org-1/p1/1.jpg", posicao: 1 }];

const dbProdutoComFoto = () =>
  fakeDb({
    catalog_products: { data: PRODUTO, error: null },
    product_images: { data: FOTOS, error: null },
  });

const ctxBase = (db: ReturnType<typeof fakeDb>, conversationId: string | null = "conv-1") => ({
  supabase: db.supabase,
  organizationId: "org-1",
  role: "agent",
  actor: { type: "ai_agent" as const, id: "a" },
  apiTokenId: "tok",
  requestId: "req-1",
  conversationId,
});

describe("resolverFotoDoProduto", () => {
  it("⭐ produto ativo + fotos ordenadas, sem local:", async () => {
    const db = fakeDb({
      catalog_products: { data: PRODUTO, error: null },
      product_images: {
        data: [
          { storage_path: "org-1/p1/2.jpg", posicao: 2 },
          { storage_path: "local:/srv/foto.jpg", posicao: 0 },
          { storage_path: "org-1/p1/1.jpg", posicao: 1 },
        ],
        error: null,
      },
    });
    const r = await resolverFotoDoProduto(db.supabase, "org-1", "VAS-1");
    expect(r).toEqual({
      found: true,
      produto: PRODUTO,
      fotos: [
        { storage_path: "org-1/p1/2.jpg", posicao: 2 },
        { storage_path: "org-1/p1/1.jpg", posicao: 1 },
      ],
      mensagem: null,
    });
  });

  it("produto inexistente → found false com mensagem", async () => {
    const db = fakeDb({
      catalog_products: { data: null, error: null },
      product_images: { data: [], error: null },
    });
    const r = await resolverFotoDoProduto(db.supabase, "org-1", "XXX");
    expect(r.found).toBe(false);
    if (!r.found) expect(r.mensagem).toContain("XXX");
  });

  it("erro de banco vira exceção nomeada, não silêncio", async () => {
    const db = fakeDb({
      catalog_products: { data: null, error: { message: "boom" } },
      product_images: { data: [], error: null },
    });
    await expect(resolverFotoDoProduto(db.supabase, "org-1", "VAS-1")).rejects.toThrow(
      /buscar_produto_falhou/,
    );
  });
});

describe("crm_get_product_photos", () => {
  it("devolve fotos + sem mensagem quando há", async () => {
    const db = dbProdutoComFoto();
    const r = (await crmGetProductPhotos.handler(
      { codigo: "VAS-1" } as never,
      ctxBase(db) as never,
    )) as { fotos: unknown[] };
    expect(r.fotos).toHaveLength(1);
  });

  it("sem foto → lista vazia + mensagem honesta", async () => {
    const db = fakeDb({
      catalog_products: { data: PRODUTO, error: null },
      product_images: { data: [], error: null },
    });
    const r = (await crmGetProductPhotos.handler(
      { codigo: "VAS-1" } as never,
      ctxBase(db) as never,
    )) as { fotos: unknown[]; mensagem?: string };
    expect(r.fotos).toEqual([]);
    expect(String(r.mensagem)).toMatch(/não tem foto/);
  });
});

describe("crm_send_product_photo", () => {
  it("⭐ sem conversa vinculada → recusa, sem tocar no envio", async () => {
    const db = dbProdutoComFoto();
    const r = (await crmSendProductPhoto.handler(
      { codigo: "VAS-1" } as never,
      ctxBase(db, null) as never,
    )) as { sent: boolean; motivo?: string };
    expect(r).toMatchObject({ sent: false, motivo: "sem_conversa" });
    expect(vi.mocked(sendMessageHandler)).not.toHaveBeenCalled();
  });

  it("⭐ envia com idempotência por run+produto e legenda default = nome", async () => {
    const db = dbProdutoComFoto();
    vi.mocked(sendMessageHandler).mockResolvedValueOnce({ id: "msg-1", status: "sent" } as never);
    const r = (await crmSendProductPhoto.handler(
      { codigo: "VAS-1" } as never,
      ctxBase(db) as never,
    )) as { sent: boolean; message_id?: string };
    expect(r).toMatchObject({ sent: true, message_id: "msg-1" });
    const chamada = vi.mocked(sendMessageHandler).mock.calls[0]!;
    expect(chamada[2]).toMatchObject({
      conversation_id: "conv-1",
      type: "image",
      media_storage_path: "org-1/p1/1.jpg",
      body: "Vassoura de pelo",
    });
    expect(
      ((chamada[2] as { metadata?: { idempotency_key?: string } }).metadata?.idempotency_key ??
        ""),
    ).toContain("foto-produto");
  });

  it("sem foto → não chama o handler e devolve motivo", async () => {
    const db = fakeDb({
      catalog_products: { data: PRODUTO, error: null },
      product_images: { data: [], error: null },
    });
    vi.mocked(sendMessageHandler).mockClear();
    const r = (await crmSendProductPhoto.handler(
      { codigo: "VAS-1" } as never,
      ctxBase(db) as never,
    )) as { sent: boolean; motivo?: string };
    expect(r).toMatchObject({ sent: false, motivo: "sem_foto" });
    expect(vi.mocked(sendMessageHandler)).not.toHaveBeenCalled();
  });
});

describe("copiarFotoParaConversa", () => {
  function dbComStorage() {
    const base = dbProdutoComFoto();
    return {
      ...(base.supabase as unknown as Record<string, unknown>),
      storage: {
        from: (_bucket: string) => ({
          download: async (_p: string) => ({ data: new Blob(["x"]), error: null }),
          upload: async (_p: string, _b: unknown, _o: unknown) => ({
            data: { path: _p },
            error: null,
          }),
        }),
      },
    } as never;
  }

  it("⭐ destino determinístico sob {org}/{conversa}/ + mime por extensão", async () => {
    const r = await copiarFotoParaConversa(dbComStorage(), {
      organizationId: "org-1",
      conversationId: "conv-1",
      storagePath: "org-1/p1/1.jpg",
    });
    expect(r).toEqual({ destino: "org-1/conv-1/catalogo/1.jpg", mime: "image/jpeg" });
  });

  it("caminho inventado (fora do catálogo) → erro antes de tocar no Storage", async () => {
    const base = fakeDb({
      catalog_products: { data: null, error: null },
      product_images: { data: [], error: null },
    });
    const supabase = {
      ...(base.supabase as unknown as Record<string, unknown>),
      storage: {
        from: () => {
          throw new Error("storage não deveria ser chamado");
        },
      },
    } as never;
    await expect(
      copiarFotoParaConversa(supabase, {
        organizationId: "org-1",
        conversationId: "conv-1",
        storagePath: "org-1/outra/foto.jpg",
      }),
    ).rejects.toThrow(/foto_nao_confirmada/);
  });

  it("path traversal e local: recusados na porta", async () => {
    const supabase = { from: () => ({}) } as never;
    await expect(
      copiarFotoParaConversa(supabase, { organizationId: "o", conversationId: "c", storagePath: "../x.jpg" }),
    ).rejects.toThrow(/caminho_de_foto_invalido/);
    await expect(
      copiarFotoParaConversa(supabase, { organizationId: "o", conversationId: "c", storagePath: "local:/srv/a.jpg" }),
    ).rejects.toThrow(/caminho_de_foto_invalido/);
  });
});
