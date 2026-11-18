/**
 * O SINO MUDA DE NÚMERO E O LEITOR DE TELA OUVE.
 *
 * ─── O DEFEITO (medido em 18/11/2026) ─────────────────────────────────────
 *
 * A central de avisos mostrava o total em um `<span>` dentro do botão do sino.
 * O `aria-label` do botão ("Central de avisos — 3 em aberto") só é lido quando
 * o foco PASSA por ele: quem está digitando no inbox recebia um aviso novo e o
 * produto ficava em silêncio. O número mudava na tela e nada era anunciado.
 *
 * ─── AS DUAS REGRAS QUE O ANÚNCIO PRECISA SEGUIR ──────────────────────────
 *
 * 1. **A carga inicial não é novidade.** Anunciar "3 em aberto" junto com o
 *    carregamento da página atropela a leitura do conteúdo — o alerta tem de
 *    existir para o que CHEGA depois, não para o que já estava lá.
 * 2. **Só o aumento anuncia.** Uma recontagem que cai (alguém resolveu o item
 *    em outra aba) é ajuste de estado, não alerta novo.
 *
 * O teste cobre as três situações, porque um `aria-live` que anunciasse tudo
 * seria tão ruim quanto nenhum: ruído constante treina a pessoa a ignorar.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const estado = vi.hoisted(() => ({ contagem: 3, carregando: false }));

vi.mock("@/hooks/ai/useAgentInbox", () => ({
  useAgentInbox: () => ({
    data: { open_count: estado.contagem, items: [] },
    isLoading: estado.carregando,
  }),
}));

vi.mock("@/hooks/i18n/useT", () => ({
  useT: () => (texto: string) => texto,
}));

import { NotificationCenter } from "@/components/shell/NotificationCenter";

afterEach(() => {
  cleanup();
  estado.contagem = 3;
  estado.carregando = false;
});

function regiaoViva(container: HTMLElement): HTMLElement {
  const el = container.querySelector('[role="status"][aria-live="polite"]');
  if (!el) throw new Error("a central de avisos não tem região viva");
  return el as HTMLElement;
}

describe("central de avisos anuncia o que chega", () => {
  it("a carga inicial NÃO vira anúncio", async () => {
    const { container } = render(<NotificationCenter />);
    // Dá tempo de o efeito rodar: `count` já vale 3 no primeiro render.
    await waitFor(() => expect(regiaoViva(container).textContent).toBe(""));
  });

  it("um aviso novo é anunciado com o total", async () => {
    const { container, rerender } = render(<NotificationCenter />);
    await waitFor(() => expect(regiaoViva(container).textContent).toBe(""));

    estado.contagem = 4;
    rerender(<NotificationCenter />);
    await waitFor(() =>
      expect(regiaoViva(container).textContent).toBe("Central de avisos: 4 em aberto"),
    );
  });

  it("recontagem que CAI não anuncia", async () => {
    const { container, rerender } = render(<NotificationCenter />);
    await waitFor(() => expect(regiaoViva(container).textContent).toBe(""));

    estado.contagem = 1;
    rerender(<NotificationCenter />);
    // O anúncio anterior continua vazio: nada de "1 em aberto" por resolução.
    await waitFor(() => expect(regiaoViva(container).textContent).toBe(""));
  });

  it("o total continua no nome acessível do sino", () => {
    render(<NotificationCenter />);
    expect(screen.getByRole("button", { name: /3 em aberto/ })).toBeInTheDocument();
  });
});
