import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WA } from "@/components/inbox/whatsapp-theme";

/**
 * O FUNDO DO FIO NÃO PODE VOLTAR A SER UMA COR FIXA.
 *
 * `.wa-chat-bg` nasceu com `#efeae2` — o papel bege do WhatsApp Light —
 * pintava o fio de bege TAMBÉM no tema escuro: era a única área do produto
 * que ignorava o `data-theme` inteiro. O canvas agora é o `--color-bg`
 * corrente, e a trama de pontos tinge pelo texto do tema. Se algum dia a
 * regra voltar para um hex, este teste é quem avisa.
 */
describe("tema da conversa no inbox", () => {
  const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
  const bloco = css.match(/\.wa-chat-bg\s*\{[^}]*\}/)?.[0] ?? "";

  it(".wa-chat-bg usa o canvas do tema, nunca um hex fixo", () => {
    expect(bloco).not.toBe("");
    expect(bloco).toContain("var(--color-bg)");
    expect(bloco).not.toContain("#efeae2");
  });

  it("paleta segue a referência premium: saída verde-pálido, entrada branca, não-lidas na marca", () => {
    // Verde-pálido `#c8e6bb` da referência no lugar do `#d9fdd3` do WhatsApp.
    expect(WA.outgoing).toContain("#c8e6bb");
    // Branca nos DOIS temas — vem do `:root` da referência, não do modo.
    expect(WA.incoming).toContain("bg-white");
    // Contador de não-lidas na cor da marca, como os contadores das abas.
    expect(WA.unread).toContain("bg-accent");
    // Seleção da lista no `--brand-soft`, não num accent genérico.
    expect(WA.selected).toContain("bg-accent-soft");
  });
});
