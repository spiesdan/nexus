import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

import {
  ConfirmacaoProvider,
  useConfirmar,
} from "@/components/nexus-ui/forms/ConfirmacaoProvider";
import { NexusConfirmDialog } from "@/components/nexus-ui/forms/NexusConfirmDialog";

function Probe() {
  const confirmar = useConfirmar();
  const [resultado, setResultado] = React.useState("?");
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const ok = await confirmar({ title: "Apagar tudo?" });
          setResultado(ok ? "sim" : "nao");
        }}
      >
        abrir
      </button>
      <span data-testid="resultado">{resultado}</span>
    </>
  );
}

function SemProvider() {
  useConfirmar();
  return null;
}

async function abrirEConfirmar(nomeDoBotao: string) {
  fireEvent.click(screen.getByRole("button", { name: "abrir" }));
  expect(await screen.findByText("Apagar tudo?")).toBeInTheDocument();
  const dialog = screen.getByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: nomeDoBotao }));
}

describe("ConfirmacaoProvider (o substituto do window.confirm)", () => {
  it("fora do provider, useConfirmar lança — um call site órfão penduraria o handler", () => {
    expect(() => render(<SemProvider />)).toThrow(/ConfirmacaoProvider/);
  });

  it("confirma: abre com a mensagem como título e resolve true", async () => {
    render(
      <ConfirmacaoProvider>
        <Probe />
      </ConfirmacaoProvider>,
    );
    await abrirEConfirmar("Excluir");

    await waitFor(() => expect(screen.getByTestId("resultado")).toHaveTextContent("sim"));
    expect(screen.queryByText("Apagar tudo?")).not.toBeInTheDocument();
  });

  it("cancela: o botão padrão resolve false", async () => {
    render(
      <ConfirmacaoProvider>
        <Probe />
      </ConfirmacaoProvider>,
    );
    await abrirEConfirmar("Cancelar");

    await waitFor(() => expect(screen.getByTestId("resultado")).toHaveTextContent("nao"));
  });
});

describe("NexusConfirmDialog controlado", () => {
  it("confirma e devolve o controle pelo aoFechar(false)", async () => {
    const onConfirm = vi.fn();
    const aoFechar = vi.fn();
    render(
      <NexusConfirmDialog
        aberto
        aoFechar={aoFechar}
        title="Excluir regra?"
        description="Some da lista."
        confirmLabel="Excluir regra"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Excluir regra" }),
    );

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(aoFechar).toHaveBeenCalledWith(false);
  });

  it("erro em onConfirm mantém a dialog ABERTA (o retry é do chamador)", async () => {
    const aoFechar = vi.fn();
    render(
      <NexusConfirmDialog
        aberto
        aoFechar={aoFechar}
        title="Excluir regra?"
        onConfirm={() => Promise.reject(new Error("boom"))}
      />,
    );
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(screen.getByText("Excluir regra?")).toBeInTheDocument());
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it("busy troca o rótulo pelo busyLabel, desliga os botões e congela o fechamento", () => {
    const aoFechar = vi.fn();
    render(
      <NexusConfirmDialog
        aberto
        aoFechar={aoFechar}
        title="Excluir?"
        busy
        busyLabel="Excluindo…"
        onConfirm={() => {}}
      />,
    );
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByRole("button", { name: "Excluindo…" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeDisabled();
  });

  it("description é opcional: só o título abre a dialog", () => {
    render(
      <NexusConfirmDialog aberto aoFechar={() => {}} title="Só o título" onConfirm={() => {}} />,
    );
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Só o título")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Excluir" })).toBeInTheDocument();
  });

  it("children entra entre o cabeçalho e o rodapé (resumo de diff etc.)", () => {
    render(
      <NexusConfirmDialog aberto aoFechar={() => {}} title="Publicar v2?" onConfirm={() => {}}>
        <div>resumo do diff</div>
      </NexusConfirmDialog>,
    );
    expect(screen.getByText("resumo do diff")).toBeInTheDocument();
  });
});
