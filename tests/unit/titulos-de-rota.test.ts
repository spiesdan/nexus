import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { NAV_DESTINATIONS } from "@/lib/navigation/registry";
import { normalizarCaminho, tituloDaRota } from "@/lib/navigation/titulos";

/**
 * O GATE DO TÍTULO — a aba do navegador tem nome, e ele é único por tela.
 *
 * A medida que originou isto, em 15/11/2026: **36 de 40** páginas capturadas
 * tinham exatamente o mesmo `<title>` (o padrão do layout raiz). Toda aba se
 * chamava igual. Sem gate, o próximo `page.tsx` nasce mudo e ninguém percebe,
 * porque nada quebra — só a experiência piora de um jeito que não gera erro.
 *
 * O teste tem duas metades, e a segunda é a que importa:
 *
 *  1. o resolvedor responde o esperado para os casos que ele mesmo declara;
 *  2. **toda** `page.tsx` do repositório resolve para um título não vazio —
 *     lendo o disco, não uma lista escrita à mão. Tela nova reprova aqui.
 */

const RAIZ = process.cwd();

/**
 * Páginas cujo título nunca é lido, com o porquê. Lista fechada: acrescentar
 * linha exige justificativa, igual à `NAV_ALLOWLIST`.
 */
const SEM_TITULO_PORQUE: Record<string, string> = {
  "/": "não renderiza: redireciona para /app na primeira linha",
};

/**
 * Rota de arquivo → caminho público, no formato que o `proxy.ts` publica.
 * Devolve também o texto do arquivo: quem mede precisa saber se a página declara
 * metadata própria ou se é só um redirect.
 */
function paginasDoDisco(): Array<{ rota: string; fonte: string; dir: string }> {
  const saida: Array<{ rota: string; fonte: string; dir: string }> = [];
  const andar = (dir: string): void => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, item.name);
      if (item.isDirectory()) {
        andar(completo);
        continue;
      }
      if (item.name !== "page.tsx") continue;
      const rel = path.relative(RAIZ, path.dirname(completo)).split(path.sep).join("/");
      // Grupos de rota `(nome)` não entram na URL.
      const url = rel
        .split("/")
        .filter((p) => !/^\(.+\)$/.test(p))
        .join("/");
      saida.push({
        rota: "/" + url.replace(/^app\/?/, ""),
        fonte: fs.readFileSync(completo, "utf8"),
        dir: path.dirname(completo),
      });
    }
  };
  andar(path.join(RAIZ, "app"));
  return saida.sort((a, b) => a.rota.localeCompare(b.rota));
}

/**
 * A MESMA regra de `scripts/auditoria/inventario.ts`: `page.tsx` com JSX é tela;
 * sem JSX é resolver (redireciona e não renderiza). Duas definições divergentes
 * de "tela" foi o que fez um inventário anterior contar 125 em vez de 155.
 */
function temJsx(fonte: string): boolean {
  return /\breturn\s*\(?\s*</.test(fonte) || /\.jsx\s*\(/.test(fonte);
}

function declaraMetadataPropria(fonte: string): boolean {
  return (
    /export\s+const\s+metadata\b/.test(fonte) ||
    /export\s+async\s+function\s+generateMetadata/.test(fonte)
  );
}

/**
 * Um layout ancestral que declara metadata já dá nome à página — é o caso de
 * `/design`, coberto por `app/design/layout.tsx`. Sem isto o teste acusaria
 * página coberta, que é o tipo de falso positivo que ensina a ignorar o gate.
 */
function cobertaPorLayout(pastaDaPagina: string): boolean {
  const raizDoApp = path.join(RAIZ, "app");
  let atual = pastaDaPagina;
  while (true) {
    // O layout RAIZ não conta: o título dele é o padrão genérico, e depender
    // dele é exatamente o defeito medido (36 de 40 abas com o mesmo nome).
    if (atual !== raizDoApp) {
      const layout = path.join(atual, "layout.tsx");
      if (fs.existsSync(layout) && declaraMetadataPropria(fs.readFileSync(layout, "utf8"))) {
        return true;
      }
    }
    if (atual === raizDoApp) return false;
    atual = path.dirname(atual);
  }
}

describe("título de rota", () => {
  it("normaliza consulta, hash e barra final", () => {
    expect(normalizarCaminho("/app/pedidos/?x=1")).toBe("/app/pedidos");
    expect(normalizarCaminho("/app/pedidos#topo")).toBe("/app/pedidos");
    expect(normalizarCaminho("/")).toBe("/");
  });

  it.each(NAV_DESTINATIONS.map((d) => [d.href, d.label] as const))(
    "destino do menu %s vira o título %s",
    (href, label) => {
      expect(tituloDaRota(href)).toBe(label);
    },
  );

  it("tela de detalhe herda o nome da porta mais específica", () => {
    // Nenhuma destas rotas existe como arquivo: são detalhes por id.
    expect(tituloDaRota("/app/pedidos/3f2a1b")).toBe("Pedidos");
    expect(tituloDaRota("/app/contacts/9c8b7a")).toBe("Clientes");
  });

  it("sub-fluxo tem nome próprio, não o da lista de onde saiu", () => {
    expect(tituloDaRota("/app/pedidos/novo")).toBe("Novo pedido");
    expect(tituloDaRota("/app/pedidos")).toBe("Pedidos");
  });

  it("passo do onboarding usa o rótulo da peça, da definição única", () => {
    expect(tituloDaRota("/onboarding")).toBe("Configuração inicial");
    expect(tituloDaRota("/onboarding/welcome")).toContain("Seu negócio");
  });

  it("admin e convite resolvem sem depender do menu do tenant", () => {
    expect(tituloDaRota("/admin")).toBe("Admin Plataforma");
    expect(tituloDaRota("/admin/tenants/123")).toBe("Tenant");
    expect(tituloDaRota("/team/accept-invite/tok")).toBe("Aceitar convite");
  });

  it("a raiz não é tela e devolve null", () => {
    expect(tituloDaRota("/")).toBeNull();
  });

  it("NENHUMA tela fica sem título — lido do disco, não de uma lista", () => {
    const semTitulo: string[] = [];
    for (const { rota, fonte, dir } of paginasDoDisco()) {
      if (SEM_TITULO_PORQUE[rota]) continue;
      // Duas saídas legítimas: declarar metadata própria, ou ser resolvida por
      // `tituloDaRota` (que é o que os layouts chamam). Resolver/redirect não
      // renderiza título — mesma regra do inventário.
      if (declaraMetadataPropria(fonte) || cobertaPorLayout(dir)) continue;
      if (!temJsx(fonte)) continue;
      if (!tituloDaRota(rota)) semTitulo.push(rota);
    }
    expect(semTitulo).toEqual([]);
  });

  it("títulos não se repetem entre telas distintas do app do tenant", () => {
    // Exceção declarada: telas que são ABAS do mesmo assunto podem repetir
    // (ex.: financeiro e suas seções). O que não pode é a página inteira do
    // produto colapsar num nome só — foi o defeito medido. Resolvers ficam de
    // fora: redirecionam e o título nunca chega a ser lido.
    const vistos = new Map<string, string>();
    const repetidos: Array<[string, string]> = [];
    for (const { rota, fonte } of paginasDoDisco()) {
      if (!rota.startsWith("/app/")) continue;
      if (SEM_TITULO_PORQUE[rota] || declaraMetadataPropria(fonte) || !temJsx(fonte)) continue;
      // Página de detalhe (`[id]`) herda o nome da porta de propósito.
      if (rota.includes("[")) continue;
      const titulo = tituloDaRota(rota);
      if (!titulo) continue;
      const anterior = vistos.get(titulo);
      if (anterior && anterior !== rota) repetidos.push([anterior, rota]);
      else vistos.set(titulo, rota);
    }
    expect(repetidos).toEqual([]);
  });
});
