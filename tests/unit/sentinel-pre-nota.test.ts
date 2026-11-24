import { describe, expect, it } from "vitest";

import { decidirCorrecaoUf } from "@/lib/contacts/correcao-uf-sentinel";
import { clientesSemEnderecoFiscal, ufDivergenteDoIbge } from "@/lib/sentinel/regras-fiscal";
import { snapshotVazio, type ContatoEndereco } from "@/lib/sentinel/tipos";

function contato(id: string, cidade: string, uf: string, extras: Partial<ContatoEndereco> = {}): ContatoEndereco {
  return {
    id, cidade, uf,
    logradouro: "Rua das Palmeiras", numero_end: "123", complemento: null,
    bairro: "Centro", cep: "89300-000", ...extras,
  };
}

describe("Sentinel — fiscal pré-emissão", () => {
  it("Campo do Tenente/SC é detectado e corrigido para PR (única UF possível)", () => {
    const s = snapshotVazio("org-1", Date.now());
    s.contatosEndereco = [contato("c1", "Campo do Tenente", "SC")];
    const achados = ufDivergenteDoIbge(s);
    expect(achados).toHaveLength(1);
    expect(achados[0]?.evidencia.uf_correta).toBe("PR");
    const decisao = decidirCorrecaoUf("Campo do Tenente", "SC");
    expect(decisao).toMatchObject({ pode: true, ufCorreta: "PR", ufAtual: "SC" });
  });

  it("Irati/XX é detectado mas NÃO corrigido (homônimo PR e SC)", () => {
    const s = snapshotVazio("org-1", Date.now());
    s.contatosEndereco = [contato("c2", "Irati", "XX")];
    const achados = ufDivergenteDoIbge(s);
    expect(achados).toHaveLength(1);
    expect(achados[0]?.evidencia.ufs_possiveis).toEqual(["PR", "SC"]);
    expect(decidirCorrecaoUf("Irati", "XX")).toMatchObject({ pode: false });
  });

  it("pedido faturável sem nota e sem bairro abre ocorrência de alta antes da emissão", () => {
    const s = snapshotVazio("org-1", Date.now());
    s.contatosEndereco = [contato("c3", "Mafra", "SC", { bairro: null })];
    s.pedidos = [{
      id: "ped-1", numero: 19720, status: "faturado", exige_nf: true,
      total_cents: 1000, subtotal_cents: 1000, desconto_cents: 0, frete_cents: 0,
      contact_id: "c3", cliente_documento: null, created_by: null,
      created_at: "2026-11-23T12:00:00Z", updated_at: "2026-11-23T12:00:00Z",
    }];
    const achados = clientesSemEnderecoFiscal(s);
    const doPedido = achados.filter((a) => a.entidadeTipo === "orders");
    expect(doPedido).toHaveLength(1);
    expect(doPedido[0]?.severidade).toBe("alta");
    expect(doPedido[0]?.evidencia.faltando).toContain("bairro");
  });

  it("par cidade/UF que resolve não gera ocorrência", () => {
    const s = snapshotVazio("org-1", Date.now());
    s.contatosEndereco = [contato("c4", "Mafra", "SC")];
    expect(ufDivergenteDoIbge(s)).toHaveLength(0);
  });
});
