import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { endpointDaMidia, idDaMidia } from "@/lib/channels/meta/media";

/**
 * A MÍDIA QUE O CLIENTE MANDA PELO CANAL OFICIAL.
 *
 * ─── O defeito, medido em produção (09/11/2026) ─────────────────────────────
 *
 * Um cliente respondeu com áudio no número oficial. A mensagem entrou como
 * `type=audio`, `media_mime='audio/ogg; codecs=opus'`, e `media_url` e
 * `media_storage_path` NULOS. No inbox, o player não tinha o que tocar.
 *
 * Eram TRÊS elos partidos, e nenhum sozinho explica o sintoma:
 *
 * 1. o ingest NÃO gravava `media_url` — só o id em `metadata.meta_media_id`;
 * 2. o ingest NUNCA emitia `media.persist_requested` — ninguém acordava o
 *    worker de persistência;
 * 3. o adapter do canal oficial NÃO implementava `fetchInboundMedia` — mesmo
 *    acordado, o worker saía com "canal_sem_midia_de_entrada".
 *
 * Os casos abaixo cobrem os três, e a parte de baixo prova o download de
 * verdade (duas chamadas à Graph, com o Bearer da sessão).
 */

const INGEST = readFileSync("lib/channels/meta/ingest.ts", "utf8");
const ADAPTER = readFileSync("lib/channels/adapters/meta-cloud.ts", "utf8");

describe("elo 1 — a Meta anuncia um ID, e a ingestão grava um endereço", () => {
  it("monta o endpoint da Graph a partir do id", () => {
    expect(endpointDaMidia("1156437400652850")).toBe(
      "https://graph.facebook.com/v22.0/1156437400652850",
    );
  });

  it("reconhece o endpoint de volta e ignora links que não são da Graph", () => {
    expect(idDaMidia(endpointDaMidia("123"))).toBe("123");
    expect(idDaMidia("https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1")).toBeNull();
    expect(idDaMidia("https://169.254.169.254/latest/meta-data")).toBeNull();
  });

  it("o ingest grava `media_url` mesmo quando o webhook só trouxe o id", () => {
    expect(INGEST).toMatch(
      /media_url: e\.media \? \(e\.media\.url \?\? endpointDaMidia\(e\.media\.id\)\) : null/,
    );
  });
});

describe("elo 2 — alguém acorda o worker", () => {
  it("emite `media.persist_requested` com o MESMO payload dos outros canais", () => {
    expect(INGEST).toMatch(/p_event_type: "media\.persist_requested"/);
    expect(INGEST).toMatch(
      /p_payload: \{ message_id: messageId, conversation_id: conversationId \}/,
    );
  });

  it("só pede quando HÁ anexo — texto não acorda o worker à toa", () => {
    expect(INGEST).toMatch(/if \(e\.media && messageId\)/);
  });

  it("falha do emit não derruba a ingestão", () => {
    expect(INGEST).toMatch(/\[meta\.ingest\] emit media\.persist_requested falhou/);
  });
});

describe("elo 3 — o adapter do canal oficial sabe baixar", () => {
  it("implementa `fetchInboundMedia`", () => {
    expect(ADAPTER).toMatch(/async fetchInboundMedia\(/);
  });

  it("usa a credencial da SESSÃO (organização no look-up), não o env", async () => {
    const { resolveMetaCreds } = await import("@/lib/channels/meta/credentials");
    const spy = vi.mocked(resolveMetaCreds);
    spy.mockClear();
    const { metaCloudAdapter } = await import("@/lib/channels/adapters/meta-cloud");
    stubFetch([
      jsonResponse({ url: "https://lookaside.fbsbx.com/a" }),
      bytesResponse(Buffer.from("abc"), "audio/ogg; codecs=opus"),
    ]);

    await metaCloudAdapter.fetchInboundMedia!({
      organizationId: "org-1",
      sessionRef: "111",
      url: endpointDaMidia("1156437400652850"),
    });

    expect(spy).toHaveBeenCalledWith(expect.anything(), {
      organizationId: "org-1",
      phoneNumberId: "111",
    });
  });

  it("faz as DUAS chamadas da Graph com Bearer e devolve bytes + mime limpo", async () => {
    const { metaCloudAdapter } = await import("@/lib/channels/adapters/meta-cloud");
    const chamadas = stubFetch([
      jsonResponse({ url: "https://lookaside.fbsbx.com/a", mime_type: "audio/ogg" }),
      bytesResponse(Buffer.from("opus-bytes"), "audio/ogg; codecs=opus"),
    ]);

    const media = await metaCloudAdapter.fetchInboundMedia!({
      organizationId: "org-1",
      sessionRef: "111",
      url: endpointDaMidia("1156437400652850"),
    });

    expect(media.buffer.toString()).toBe("opus-bytes");
    expect(media.mime).toBe("audio/ogg");
    expect(chamadas[0]!.url).toBe(
      "https://graph.facebook.com/v22.0/1156437400652850",
    );
    expect(chamadas[1]!.url).toBe("https://lookaside.fbsbx.com/a");
    for (const c of chamadas) {
      expect((c.init?.headers as Record<string, string>).Authorization).toBe("Bearer token-de-teste");
    }
  });

  it("baixa direto quando o webhook já mandou uma URL pronta", async () => {
    const { metaCloudAdapter } = await import("@/lib/channels/adapters/meta-cloud");
    const chamadas = stubFetch([bytesResponse(Buffer.from("img"), "image/jpeg")]);

    const media = await metaCloudAdapter.fetchInboundMedia!({
      organizationId: "org-1",
      sessionRef: "111",
      url: "https://lookaside.fbsbx.com/ja-pronta",
    });

    expect(chamadas).toHaveLength(1);
    expect(media.mime).toBe("image/jpeg");
  });
});

// ─── dublês ────────────────────────────────────────────────────────────────

vi.mock("@/lib/channels/meta/credentials", () => ({
  resolveMetaCreds: vi.fn(async () => ({
    phoneNumberId: "111",
    token: "token-de-teste",
    graphVersion: "v22.0",
    wabaId: null,
    source: "session",
  })),
}));

type Chamada = { url: string; init?: RequestInit };

function stubFetch(respostas: Response[]): Chamada[] {
  const chamadas: Chamada[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      chamadas.push({ url: String(url), init });
      const proxima = respostas.shift();
      if (!proxima) throw new Error("fetch inesperado");
      return proxima;
    }),
  );
  return chamadas;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function bytesResponse(buffer: Buffer, contentType: string): Response {
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: { "content-type": contentType },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});
