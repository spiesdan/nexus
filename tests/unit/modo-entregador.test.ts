/**
 * MODO ENTREGADOR (0292) — o login que abre só a expedição.
 *
 * A flag esconde casca, não concede permissão: o acesso continua sendo o
 * `role`, que é o que as policies de `shipments` leem. Este teste guarda as
 * três pontas que fazem a experiência existir — o banco, a casca e o convite —
 * para que nenhuma delas seja removida sem que o todo pare de funcionar em
 * silêncio (o entregador cairia no dashboard com menu).
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { signInviteToken, verifyInviteToken } from "@/lib/auth/invite-token";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

describe("modo entregador — banco", () => {
  it("a flag vive em user_organizations, com default false", () => {
    const migracao = ler("supabase/migrations/20261104120000_0292_motorista.sql");
    expect(migracao).toMatch(/add column if not exists motorista boolean not null default false/);
    // Idempotência: a mesma linha precisa rodar em install e em update.
    expect(migracao).toContain("if not exists");

    const baseline = ler("supabase/baseline.sql");
    expect(baseline).toMatch(/add column if not exists motorista boolean not null default false/);
    expect(ler("supabase/migrations/MANIFEST.md")).toContain("0292_motorista");
  });

  it("a coluna NÃO é um sexto role — o CHECK de role fica intacto", () => {
    const baseline = ler("supabase/baseline.sql");
    // Um sexto papel exigiria revisar todas as policies de "o que ele NÃO
    // pode"; a flag não entra no vocabulário de role.
    expect(baseline).not.toMatch(/role_check[^;]*motorista/);
  });
});

describe("modo entregador — a casca", () => {
  it("a home manda o entregador para a expedição", () => {
    const home = ler("app/app/page.tsx");
    expect(home).toMatch(/activeOrg\.motorista[\s\S]{0,80}redirect\("\/app\/expedicao"\)/);
  });

  it("o layout barra /app/* fora da expedição, no servidor", () => {
    const layout = ler("app/app/layout.tsx");
    expect(layout).toContain("x-pathname");
    expect(layout).toMatch(/activeOrg\?\.motorista[\s\S]{0,400}redirect\("\/app\/expedicao"\)/);
  });

  it("a casca do entregador não desenha menu, topbar nem dock", () => {
    const shell = ler("app/app/_components/AppShell.tsx");
    const inicio = shell.indexOf("if (motorista)");
    expect(inicio).toBeGreaterThan(-1);
    const bloco = shell.slice(
      inicio,
      shell.indexOf("</AssistenteProvider>", inicio),
    );
    expect(bloco).not.toContain("<Sidebar");
    expect(bloco).not.toContain("<TopBar");
    expect(bloco).not.toContain("<MobileDock");
    // Mas precisa dar como sair: sessão sem saída é armadilha.
    expect(bloco).toContain("/api/auth/signout");
  });

  it("a lista mostra só as cargas na rua", () => {
    const pagina = ler("app/app/expedicao/page.tsx");
    expect(pagina).toMatch(/c\.status === "em_rota"/);
    const cliente = ler("app/app/expedicao/_client.tsx");
    expect(cliente).toMatch(/if \(motorista\)[\s\S]{0,900}porStatus\.emRota/);
  });

  it("a cabine é tela cheia: mapa 100% e folha por cima", () => {
    const cabine = ler("app/app/expedicao/[id]/_motorista.tsx");
    expect(cabine).toMatch(/mapa\("100%", true\)/);
    expect(cabine).toContain("imersivo");
    expect(cabine).toContain("h-full");
    // A folha reserva a altura do celular, não a do documento.
    expect(cabine).toContain("dvh");
  });
});

describe("modo entregador — convite", () => {
  const base = {
    invite_id: "i-1",
    email: "entregador@empresa.com",
    organization_id: "11111111-1111-4111-8111-111111111111",
    role: "agent",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  it("o token leva a flag e o aceite a lê", () => {
    const token = signInviteToken({ ...base, motorista: true });
    expect(verifyInviteToken(token)?.motorista).toBe(true);
    // Convite antigo (sem a chave) continua válido — e NÃO vira entregador.
    const antigo = verifyInviteToken(signInviteToken(base));
    expect(antigo).not.toBeNull();
    expect(antigo?.motorista).toBeUndefined();
    expect(ler("app/actions/team/acceptInvite.ts")).toContain("payload.motorista === true");
  });

  it("o formulário de convite oferece o modo entregador", () => {
    const form = ler("app/app/team/invite/_components/InviteForm.tsx");
    expect(form).toContain("motorista");
    expect(ler("lib/schemas/team.ts")).toContain("changeMotoristaSchema");
  });
});
