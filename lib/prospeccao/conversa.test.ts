import { describe, expect, it } from "vitest";

import type { Prospect } from "@/lib/schemas/prospeccao";
import { payloadDaConversaDoProspect } from "@/lib/prospeccao/conversa";

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
