/**
 * CONFIGURAÇÃO DE FORMAS DE PAGAMENTO — o contrato que a tela e a migration
 * precisam cumprir juntas.
 *
 * A lista antiga misturava prazo com forma e não havia tela nenhuma. Este teste
 * trava que a 0334 separou as duas coisas, que a RLS e a semente chegaram ao
 * baseline que o self-host aplica, e que os códigos fiscais vêm da tabela
 * oficial já versionada no repo — não de palpite no frontend.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { FORMAS_DE_PAGAMENTO, ROTULO_DA_FORMA_DE_PAGAMENTO } from "@/lib/schemas/fiscal";
import { NAV_DESTINATIONS } from "@/lib/navigation/registry";

const migration = readFileSync(
  "supabase/migrations/20261124110000_0334_payment_methods.sql",
  "utf8",
);
const baseline = readFileSync("supabase/baseline.sql", "utf8");
const manifest = readFileSync("supabase/migrations/MANIFEST.md", "utf8");

describe("0334 — formas de pagamento configuráveis", () => {
  it("separa forma (tpag) de prazo (dias_prazo) no modelo", () => {
    expect(migration).toMatch(/tipo text not null check \(tipo in \('forma', 'prazo'\)\)/);
    expect(migration).toContain("tpag text");
    expect(migration).toContain("dias_prazo integer");
  });

  it("tem RLS tenant-aware e escrita restrita a manager", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("fn_user_org_ids()");
    expect(migration).toContain("fn_role_at_least(organization_id, 'manager')");
    expect(migration).toContain("revoke all on public.payment_methods from anon");
  });

  it("semeia as três formas e os três prazos atuais de forma idempotente", () => {
    expect(migration).toContain("('dinheiro', 'Dinheiro', '01')");
    expect(migration).toContain("('pix', 'PIX', '17')");
    expect(migration).toContain("('boleto', 'Boleto bancário', '15')");
    expect(migration).toContain("('a_vista', 'À vista', 0)");
    expect(migration).toContain("('agendado_30'");
    expect(migration).toContain("('agendado_45'");
    expect(migration).toContain("on conflict (organization_id, codigo) do nothing");
  });

  it("os códigos semeados existem na tabela oficial versionada (NT 2020.006)", () => {
    for (const codigo of ["01", "17", "15"]) {
      expect(FORMAS_DE_PAGAMENTO).toContain(codigo);
      expect(
        ROTULO_DA_FORMA_DE_PAGAMENTO[codigo as keyof typeof ROTULO_DA_FORMA_DE_PAGAMENTO],
      ).toBeTruthy();
    }
    expect(migration).toContain("NT 2020.006");
  });

  it("chega ao baseline do self-host e ao MANIFEST", () => {
    expect(baseline).toContain("create table if not exists public.payment_methods");
    expect(baseline).toContain("payment_methods_select");
    expect(manifest).toContain("0334_payment_methods");
  });

  it("a tela existe na navegação com porte de gestão", () => {
    const entrada = NAV_DESTINATIONS.find((r) => r.href === "/app/settings/tenant/formas-pagamento");
    expect(entrada).toBeDefined();
    expect(entrada?.minRole).toBe("manager");
    expect(entrada?.section).toBe("Sua empresa");
  });
});
