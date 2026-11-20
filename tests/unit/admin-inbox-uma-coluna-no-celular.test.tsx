import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let caminho = "/admin/inbox";

vi.mock("next/navigation", () => ({
  usePathname: () => caminho,
}));

// A lista real puxa react-query/realtime; aqui o alvo é o CASCO (quem aparece).
vi.mock("@/app/admin/(protected)/inbox/_components/InboxList", () => ({
  InboxList: () => <div>lista-de-conversas</div>,
}));

import { AdminInboxShell } from "@/app/admin/(protected)/inbox/_components/AdminInboxShell";

/**
 * A 390 px o layout antigo deixava 30 px para o fio: lista fixa de 360 px +
 * painel de 320 px, ambos sempre visíveis. O casco agora mostra UMA coluna por
 * vez, decidida pela URL — deep-link e botão "voltar" do navegador continuam
 * corretos.
 */
describe("Inbox da plataforma — uma coluna no celular", () => {
  beforeEach(() => {
    caminho = "/admin/inbox";
  });

  const classes = (id: string): string[] =>
    screen.getByTestId(id).className.split(/\s+/).filter(Boolean);

  it("sem conversa escolhida: a lista aparece e o conteúdo não", () => {
    render(
      <AdminInboxShell>
        <p>conversa</p>
      </AdminInboxShell>,
    );

    expect(classes("admin-inbox-lista")).toContain("flex");
    expect(classes("admin-inbox-lista")).not.toContain("hidden");
    // `overflow-hidden` contém "hidden" como substring — comparar TOKEN, não texto.
    expect(classes("admin-inbox-conteudo")).toContain("hidden");
    expect(classes("admin-inbox-conteudo")).toContain("md:flex");
  });

  it("com conversa na URL: a lista sai e o conteúdo aparece", () => {
    caminho = "/admin/inbox/00000000-0000-4000-8000-000000000001";

    render(
      <AdminInboxShell>
        <p>conversa</p>
      </AdminInboxShell>,
    );

    expect(classes("admin-inbox-lista")).toContain("hidden");
    expect(classes("admin-inbox-conteudo")).toContain("flex");
    expect(classes("admin-inbox-conteudo")).not.toContain("hidden");
  });

  it("a rota do inbox vazio não engole a de conversa por prefixo", () => {
    caminho = "/admin/inbox-antigo";
    render(
      <AdminInboxShell>
        <p>conversa</p>
      </AdminInboxShell>,
    );
    expect(classes("admin-inbox-lista")).toContain("flex");
  });
});
