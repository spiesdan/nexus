/**
 * DIÁLOGO E MENU: FOCO PRESO DENTRO, `Esc` FECHA, FOCO VOLTA.
 *
 * ─── POR QUE ISTO MERECE TESTE ────────────────────────────────────────────
 *
 * O produto usa Radix para os dois (`components/ui/dialog.tsx`,
 * `dropdown-menu.tsx`), e é o Radix que implementa as três garantias. O risco
 * não é o Radix: é alguém trocar o primitivo por um `<div>` posicionado, ou
 * passar a montar o conteúdo fora do `Portal` — e aí o foco escapa para a
 * página atrás sem nenhum erro de build. Um diálogo sem foco preso é um
 * labirinto de teclado: o Tab sai do modal, entra no menu lateral e a pessoa
 * fica digitando atrás do overlay.
 *
 * As três asserções são as do critério: (1) ao abrir, o foco cai DENTRO; (2)
 * `Esc` fecha; (3) ao fechar, o foco VOLTA ao gatilho. A quarta (Tab circular
 * dentro) prova o "preso": depois de dar a volta nos controles, o foco não
 * escapa para o `body`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

afterEach(cleanup);

function DialogoDeExemplo() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button">Abrir diálogo</button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Confirmar envio</DialogTitle>
        <DialogDescription>O pedido será enviado ao cliente.</DialogDescription>
        <button type="button">Cancelar</button>
        <button type="button">Enviar</button>
      </DialogContent>
    </Dialog>
  );
}

function MenuDeExemplo() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button">Ações</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Editar</DropdownMenuItem>
        <DropdownMenuItem>Excluir</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("diálogo", () => {
  it("abre com o foco DENTRO do conteúdo", async () => {
    const user = userEvent.setup();
    render(<DialogoDeExemplo />);

    await user.click(screen.getByRole("button", { name: "Abrir diálogo" }));

    const dialogo = await screen.findByRole("dialog");
    await waitFor(() => {
      expect(dialogo.contains(document.activeElement)).toBe(true);
    });
  });

  it("`Esc` fecha e devolve o foco ao gatilho", async () => {
    const user = userEvent.setup();
    render(<DialogoDeExemplo />);
    const gatilho = screen.getByRole("button", { name: "Abrir diálogo" });

    await user.click(gatilho);
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(gatilho);
    });
  });

  it("o foco não escapa do diálogo ao tabular", async () => {
    const user = userEvent.setup();
    render(<DialogoDeExemplo />);

    await user.click(screen.getByRole("button", { name: "Abrir diálogo" }));
    const dialogo = await screen.findByRole("dialog");

    // Dá a volta além do número de controles do diálogo: o foco continua dentro.
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialogo.contains(document.activeElement)).toBe(true);
    }
  });
});

describe("menu", () => {
  it("`Esc` fecha e devolve o foco ao gatilho", async () => {
    const user = userEvent.setup();
    render(<MenuDeExemplo />);
    const gatilho = screen.getByRole("button", { name: "Ações" });

    await user.click(gatilho);
    await screen.findByRole("menu");

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(gatilho);
    });
  });

  it("abre com o foco no primeiro item", async () => {
    const user = userEvent.setup();
    render(<MenuDeExemplo />);

    await user.click(screen.getByRole("button", { name: "Ações" }));
    const menu = await screen.findByRole("menu");

    await waitFor(() => {
      expect(menu.contains(document.activeElement)).toBe(true);
    });
    expect(screen.getByRole("menuitem", { name: "Editar" })).toBeInTheDocument();
  });
});
