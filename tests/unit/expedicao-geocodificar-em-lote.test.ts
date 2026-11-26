import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * P0-2 — O "RESOLVER" GEOCODIFICA EM LOTE, UMA VEZ.
 *
 * O defeito medido (auditoria 89): o painel mostrava "27 de 28 paradas sem
 * coordenada", a carga 052 tinha 4 paradas e 0 pinos, e o único caminho para
 * geocodificar era abrir a carga e procurar o botão na aba de rota. A exceção
 * "sem localização" dava o número e nenhuma ação.
 *
 * Este gate trava três coisas que uma edição de UI desfaria sem quebrar
 * typecheck: o link por carga, o disparo único (ref) e a recusa explícita
 * quando já está tudo no mapa. A contagem em si é testada em
 * `lib/rotas/paradas-sem-coordenada.test.ts`.
 */
const RAIZ = process.cwd();
const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), "utf8");

const rotaPagina = ler("app/app/expedicao/[id]/rota/page.tsx");
const roteirizador = ler("app/app/expedicao/[id]/_roteirizador.tsx");
const despacho = ler("app/app/expedicao/_client.tsx");

describe("P0-2 — geocodificação em lote no painel de despacho", () => {
  it("a página de rota lê ?geocodificar=1 e passa para o cliente", () => {
    expect(rotaPagina).toContain("searchParams");
    expect(rotaPagina).toContain("geocodificar");
    expect(rotaPagina).toContain("geocodificarAoAbrir={geocodificar === \"1\"}");
  });

  it("a linha 'sem localização' abre a rota já no lote, por carga", () => {
    expect(despacho).toContain("resolverLocalizacao");
    expect(despacho).toContain("/rota?geocodificar=1");
    expect(despacho).toContain('{t("Resolver")}');
    expect(despacho).toContain('e.chave === "sem_localizacao"');
  });

  it("o disparo é uma vez só, guardado em ref", () => {
    expect(roteirizador).toContain("geoAutomaticoFeito = React.useRef(false)");
    expect(roteirizador).toMatch(
      /if \(!geocodificarAoAbrir \|\| !podeOperar \|\| !rota \|\| geoAutomaticoFeito\.current\) return;/,
    );
    expect(roteirizador).toContain("geoAutomaticoFeito.current = true;");
    expect(roteirizador).toContain('void geocodificarTudo("geo");');
  });

  it("sem pendentes, NÃO chama o lote e diz que já está no mapa", () => {
    const trecho = roteirizador.slice(roteirizador.indexOf("geoAutomaticoFeito.current = true"));
    const semPendentes = trecho.slice(0, trecho.indexOf('void geocodificarTudo("geo")'));
    expect(semPendentes).toContain("paradasSemCoordenada(rota.paradas).length === 0");
    expect(semPendentes).toContain("return;");
    // A mensagem é derivada de `semCoord` no render (não setState no efeito).
    expect(roteirizador).toContain('t("Todas as paradas desta carga já estão no mapa.")');
    expect(roteirizador).toContain("geocodificarAoAbrir && semCoord.length === 0");
  });

  it("o progresso do lote automático tem lugar visível", () => {
    expect(roteirizador).toContain('data-testid="geocodificacao-automatica"');
    expect(roteirizador).toContain('t("Geocodificação em lote")');
  });

  it("o painel mostra pendentes por carga, não só o total da família", () => {
    expect(ler("app/app/expedicao/page.tsx")).toContain("semCoordenada");
    expect(despacho).toContain("semCoordenada");
    expect(roteirizador).toContain('`${semCoord.length} ${t("sem coordenada")}`');
  });
});
