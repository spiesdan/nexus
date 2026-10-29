/**
 * A AUDIÊNCIA DA CAMPANHA SE LÊ EM FATIAS — NUNCA NUMA URL SÓ.
 *
 * O mesmo defeito apareceu TRÊS vezes, em três arquivos que ninguém ligou um ao
 * outro, sempre com a mesma assinatura: uma lista de ids de campanha ido direto
 * para `.in(...)`, que o PostgREST põe na query string. Medido na VPS:
 *
 *   400 UUIDs ≈ 15 KB → HTTP 414 {"code":"PGRST103","details":"URI too long"}
 *   500 UUIDs = 18.499 bytes → idem
 *
 * Na tela isso nunca aparece como "URL grande": aparece como
 *
 *   "Erro ao validar as empresas da campanha"  (criação — 1.35.3)
 *   "Não foi possível abrir a campanha"        (controle  — 1.35.4)
 *   "Erro ao listar prospects"                 (aba Empresas)
 *
 * sempre com o banco são. O usuário mandou uma campanha de 500 empresas e o
 * produto quebrou nas três telas por causa de um número.
 *
 * Este gate trava a REGRA, não a rota: o caminho da audiência (campanha →
 * contatos/prospects → envio) precisa usar `porFatias`/`FATIA_DE_IDS`, e o lote
 * local de 400 — o número que estourou — não pode voltar.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const raiz = join(__dirname, "..", "..");

/**
 * Arquivos que leem a audiência de uma campanha. Cada um já mandou ids demais
 * numa URL uma vez (ou lê a mesma lista que os outros). Entrar aqui é assumir a
 * régua: lista de ids sai em fatias.
 */
const ARQUIVOS_DA_AUDIENCIA = [
  "app/api/v1/prospecting/campaigns/[id]/controle/route.ts",
  "app/api/v1/prospecting/campaigns/[id]/painel/route.ts",
  "app/api/v1/prospecting/prospects/route.ts",
  "app/api/v1/prospecting/prospects/categorias/route.ts",
  "app/api/v1/prospecting/prospects/disparar/route.ts",
  "app/api/v1/prospecting/mercado/route.ts",
  "lib/prospeccao/agendado.ts",
  "lib/prospeccao/funil-lote.ts",
  "lib/prospeccao/reserva-de-campanha.ts",
] as const;

function ler(caminho: string): string {
  return readFileSync(join(raiz, caminho), "utf8");
}

describe("audiência da campanha em fatias", () => {
  it.each(ARQUIVOS_DA_AUDIENCIA)("%s lê ids em fatias", (caminho) => {
    const fonte = ler(caminho);
    // A fatia canônica é o helper; a reserva usa a constante + um `lotes()`
    // local. As duas formas passam pela MESMA régua de 100 ids.
    expect(fonte).toMatch(/porFatias|FATIA_DE_IDS/);
    expect(fonte).toMatch(/from "@\/lib\/db\/por-fatias"/);
  });

  it("nenhum arquivo de app/lib volta a fixar lote de 400 ids", () => {
    // O `const LOTE = 400` local foi o defeito: 400 UUIDs = ~15 KB e 414. A
    // régua é `FATIA_DE_IDS` (100, ~3,8 KB), importada — não um número solto.
    // O regex olha CÓDIGO (`const LOTE = 400`), não a prosa que documenta o bug.
    for (const caminho of ARQUIVOS_DA_AUDIENCIA) {
      expect(ler(caminho)).not.toMatch(/^\s*const\s+LOTE\s*=\s*400\b/m);
    }
  });

  it("FATIA_DE_IDS continua sendo 100 — o número medido", async () => {
    const { FATIA_DE_IDS } = await import("@/lib/db/por-fatias");
    // Se este número mudar, a medição em `lib/db/por-fatias.ts` muda junto.
    // 500 UUIDs = 18.499 bytes; 100 ids ≈ 3,8 KB, folga confortável.
    expect(FATIA_DE_IDS).toBe(100);
  });
});
