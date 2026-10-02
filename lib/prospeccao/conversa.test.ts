import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Prospect } from "@/lib/schemas/prospeccao";
import { abrirConversaDoProspect, payloadDaConversaDoProspect } from "@/lib/prospeccao/conversa";

const post = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ apiClient: { post } }));

const base: Prospect = {
  id: "11111111-1111-4111-8111-111111111111",
  nome: "Padaria Central",
  categoria: "padaria",
  cidade: "Canoinhas",
  estado: "SC",
  telefone: "(49) 99999-0000",
  website: null,
  whatsapp_potencial: true,
  nota: 4.5,
  total_avaliacoes: 10,
  provider: "google_places",
  status_comercial: "novo",
  score: 82,
  contact_id: null,
  lead_id: null,
  do_not_contact: false,
  latitude: null,
  longitude: null,
  endereco: null,
  discovered_at: "2026-10-01T12:00:00.000Z",
  owner_user_id: null,
  proximo_passo: null,
};

const EU = "11111111-1111-4111-8111-111111111111";
const OUTRO = "11111111-1111-4111-8111-999999999999";
const CONVERSA = "99999999-9999-4999-8999-999999999999";

describe("payloadDaConversaDoProspect", () => {
  it("manda origem, metadata e etiquetas do §17 — o mesmo corpo das duas telas", () => {
    const corpo = payloadDaConversaDoProspect(base);
    expect(corpo.source).toBe("prospeccao");
    expect(corpo.source_metadata).toEqual({
      prospect_id: base.id,
      categoria: "padaria",
      cidade: "Canoinhas",
    });
    expect(corpo.conversation_tags).toEqual(["prospeccao"]);
    expect(corpo.tags).toEqual(["padaria", "Canoinhas"]);
    expect(corpo.phone_number).toBe("(49) 99999-0000");
    expect(corpo.name).toBe("Padaria Central");
  });

  it("categoria/cidade nulos não viram tag vazia (união limpa, D16)", () => {
    const corpo = payloadDaConversaDoProspect({ ...base, categoria: null, cidade: null });
    expect(corpo.tags).toEqual([]);
  });
});

describe("abrirConversaDoProspect (FASE 9 — Inbox)", () => {
  beforeEach(() => {
    post.mockReset();
  });

  it("sem telefone → null e nenhuma chamada de API (não abre conversa sem número)", async () => {
    const conversa = await abrirConversaDoProspect({ ...base, telefone: null }, EU);
    expect(conversa).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("se o dono sou eu, abre e assume com claim (best-effort)", async () => {
    post
      .mockResolvedValueOnce({ data: { conversation_id: CONVERSA } })
      .mockResolvedValueOnce({ data: null });
    const comDono = { ...base, owner_user_id: EU };
    const conversa = await abrirConversaDoProspect(comDono, EU);
    expect(conversa).toBe(CONVERSA);
    expect(post).toHaveBeenNthCalledWith(1, "/api/v1/conversations/open-with-contact", payloadDaConversaDoProspect(comDono));
    expect(post).toHaveBeenNthCalledWith(2, `/api/v1/conversations/${CONVERSA}/claim`, {});
  });

  it("dono é outro vendedor → abre sem claim (a fila é dele)", async () => {
    post.mockResolvedValueOnce({ data: { conversation_id: CONVERSA } });
    const conversa = await abrirConversaDoProspect({ ...base, owner_user_id: OUTRO }, EU);
    expect(conversa).toBe(CONVERSA);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("sem conversation_id na resposta → null", async () => {
    post.mockResolvedValueOnce({ data: null });
    expect(await abrirConversaDoProspect(base, EU)).toBeNull();
  });

  it("claim falhou → a conversa continua aberta (assumir é cortesia)", async () => {
    post
      .mockResolvedValueOnce({ data: { conversation_id: CONVERSA } })
      .mockRejectedValueOnce(new Error("403"));
    const conversa = await abrirConversaDoProspect({ ...base, owner_user_id: EU }, EU);
    expect(conversa).toBe(CONVERSA);
  });

  it("erro na abertura propaga para o chamador tratar (sem toast aqui)", async () => {
    post.mockRejectedValueOnce(new Error("rede fora"));
    await expect(abrirConversaDoProspect(base, EU)).rejects.toThrow("rede fora");
  });
});
