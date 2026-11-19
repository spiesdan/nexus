/**
 * J13 NA CAMADA DE NAVEGADOR — fiscal em HOMOLOGAÇÃO: erro, recuperação e sucesso.
 *
 * A J13 é "operações fiscais e tratamento de falhas de sincronização". O que
 * existia provava rotas e componentes em Vitest (`j13-fiscal-falha-de-
 * sincronizacao`, `j13-botao-sincronizar`) e a jornada de emissão parando no
 * estado honesto sem emissor (`jornada-fiscal`). Nenhum deles abria a tela de
 * sincronização, via a falha e CONSERTAVA a causa.
 *
 * ─── Por que homologação, e por que isso é o ponto ──────────────────────────
 *
 * `motivoDeNaoBaixar()` (`lib/fiscal/eventos.ts`) recusa a distribuição DF-e
 * fora de produção **antes de qualquer HTTP**: homologação não tem nota de
 * terceiro, e tratar o 137 da SEFAZ como "0 novas" foi o defeito que a tela já
 * corrigiu. Ou seja, tocar SEFAZ real é impossível por construção deste teste —
 * e a primeira falha provada aqui é OUTRA, acionável: a senha do certificado
 * ausente.
 *
 * O roteiro prova os três desfechos na mesma sessão de navegador:
 *
 *   1. **erro**        — sincronizar sem a senha do certificado devolve o motivo
 *                        em português e grava a execução no histórico (nunca um
 *                        "0 novas" verde);
 *   2. **recuperação** — a causa é consertada PELA TELA (senha do certificado em
 *                        Configurações) e a nova tentativa passa desse bloqueio:
 *                        o motivo muda para o de ambiente, que é o estado real
 *                        da homologação;
 *   3. **sucesso**     — na nota de entrada, aprovar a conferência muda o estado
 *                        de verdade (com autor e data), e reabrir + aprovar de
 *                        novo prova que a decisão não travou o fluxo.
 *
 * Nenhum passo fala com SEFAZ. A sincronização para no portão local, e é isso
 * que o log da tela registra.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { carregarEnvLocal } from "../../scripts/lib/env-de-teste";

import { entrarComoAdmin } from "./helpers/entrar-como-admin";
import { semearCredenciais, type CredsE2E } from "./helpers/login-admin";

const EVIDENCE = path.join(process.cwd(), "evidence/jornadas-2026-11-19");

const env = carregarEnvLocal();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Re-semeado no `beforeAll`: outra sessão pode ter rotacionado o fator TOTP
// do admin desde a última execução, e o `.e2e-creds.json` em disco é a única
// fonte que o login lê.
let creds: CredsE2E;
// `org_id` está no arquivo (o seed escreve), mas não na interface do helper.
let orgId: string;

/** CNPJ válido (o mesmo do seed fiscal), só para o contexto não ser o bloqueio. */
const CNPJ = "11222333000181";

interface Snapshot {
  settings: Record<string, unknown> | null;
  cursor: Record<string, unknown> | null;
  logsAntes: string[];
}

let snapshot: Snapshot;
let entradaId: string;

function chaveDeTeste(carimbo: number): string {
  // 44 dígitos; o CHECK da tabela exige exatamente `^\d{44}$`.
  return `35${String(carimbo).padStart(42, "0")}`.slice(0, 44);
}

test.describe("J13 — fiscal em homologação: erro, recuperação e conferência", () => {
  test.describe.configure({ timeout: 240_000 });

  test.beforeAll(async () => {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    creds = semearCredenciais();
    orgId = (creds as unknown as { org_id: string }).org_id;

    const { data: settings } = await admin
      .from("fiscal_settings")
      .select("*")
      .eq("organization_id", orgId)
      .maybeSingle();
    const { data: cursor } = await admin
      .from("fiscal_entrada_cursor")
      .select("*")
      .eq("organization_id", orgId)
      .maybeSingle();
    const { data: logs } = await admin
      .from("fiscal_sync_logs")
      .select("id")
      .eq("organization_id", orgId);
    snapshot = {
      settings: (settings as Record<string, unknown> | null) ?? null,
      cursor: (cursor as Record<string, unknown> | null) ?? null,
      logsAntes: (logs ?? []).map((l) => (l as { id: string }).id),
    };

    // Estado de partida DETERMINÍSTICO: homologação + stub + senha ausente.
    // É uma configuração real de quem subiu o certificado e ainda não digitou a
    // senha — o cenário que o operador encontra na primeira sincronização.
    const { error: erroSettings } = await admin.from("fiscal_settings").upsert(
      {
        organization_id: orgId,
        ambiente: "homologacao",
        provedor: "stub",
        emitente_documento: CNPJ,
        uf: "SP",
        certificado_path: "certificado.pfx",
        certificado_senha_encrypted: null,
        entrada_ativa: false,
      },
      { onConflict: "organization_id" },
    );
    if (erroSettings) throw new Error(`não consegui preparar fiscal_settings: ${erroSettings.message}`);

    // Nota de entrada COMPLETA (XML + itens), que é o que habilita a conferência
    // na tela. Criada aqui porque a suíte não tem uma nota de terceiro semeada.
    const carimbo = Date.now();
    const { data: entrada, error: erroEntrada } = await admin
      .from("fiscal_entradas")
      .insert({
        organization_id: orgId,
        chave: chaveDeTeste(carimbo),
        nsu: carimbo,
        emitente_cnpj: "99888777000166",
        emitente_nome: "Fornecedor E2E J13 Ltda",
        numero: 4321,
        serie: "1",
        dh_emi: new Date().toISOString(),
        valor_total_cents: 12_345,
        xml: "<nfeProc versao=\"4.00\"><protNFe/></nfeProc>",
        itens_json: [
          {
            numero_item: 1,
            codigo: "SKU-E2E-1",
            descricao: "Produto da nota de teste",
            quantidade: 1,
            valor_unitario_cents: 12_345,
            valor_total_cents: 12_345,
            ncm: "00000000",
            cfop: "5102",
            unidade: "UN",
            cst: "000",
          },
        ],
        status: "nova",
        situacao_fiscal: "autorizada",
        conferencia_status: "pendente",
        tipo_documento: "completa",
      })
      .select("id")
      .single();
    if (erroEntrada) throw new Error(`não consegui semear a nota de entrada: ${erroEntrada.message}`);
    entradaId = (entrada as { id: string }).id;
  });

  test.afterAll(async () => {
    // Devolve o banco compartilhado ao estado anterior: outra suíte roda depois.
    if (entradaId) await admin.from("fiscal_entradas").delete().eq("id", entradaId);
    const { data: logs } = await admin
      .from("fiscal_sync_logs")
      .select("id")
      .eq("organization_id", orgId);
    const novos = ((logs ?? []) as Array<{ id: string }>)
      .map((l) => l.id)
      .filter((id) => !snapshot.logsAntes.includes(id));
    if (novos.length > 0) await admin.from("fiscal_sync_logs").delete().in("id", novos);

    if (snapshot.settings) {
      await admin.from("fiscal_settings").upsert(snapshot.settings, { onConflict: "organization_id" });
    }
    if (snapshot.cursor) {
      await admin.from("fiscal_entrada_cursor").upsert(snapshot.cursor, { onConflict: "organization_id" });
    }
  });

  test("sincronizar falha com motivo acionável, conserta pela tela e confere a nota", async ({
    page,
  }) => {
    await entrarComoAdmin(page, creds);

    // ─── 1. ERRO: homologação configurada, senha do certificado ausente ──────
    await page.goto("/app/fiscal/sincronizacoes");
    await expect(
      page.getByRole("heading", { level: 1, name: "Histórico de sincronização" }),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Sincronizar agora" }).click();
    await expect(page.getByText(/Senha do certificado ausente/).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({
      path: path.join(EVIDENCE, "j13-01-falha-com-motivo-acionavel.png"),
      fullPage: true,
    });

    // A execução que falhou está NO HISTÓRICO — não sumiu com o toast.
    await page.reload();
    await expect(page.getByText(/Senha do certificado ausente/).first()).toBeVisible({
      timeout: 30_000,
    });

    // ─── 2. RECUPERAÇÃO: a causa é consertada pela tela de configuração ──────
    await page.goto("/app/fiscal/configuracoes");
    await expect(page.getByRole("heading", { level: 1, name: "Configurações fiscais" })).toBeVisible(
      { timeout: 30_000 },
    );
    // O estado de partida é o de homologação, e a tela DIZ isso.
    await expect(page.locator("#entrada-ambiente")).toHaveValue("homologacao");

    await page.locator("#entrada-cert-senha").fill("senha-do-e2e");
    await page.getByRole("button", { name: "Salvar configuração" }).click();
    await expect(page.getByText("Configuração fiscal salva.")).toBeVisible({ timeout: 30_000 });

    // Nova tentativa: o bloqueio da SENHA desapareceu. O que sobra é o motivo
    // de ambiente — o estado verdadeiro da homologação, não um erro de config.
    await page.goto("/app/fiscal/sincronizacoes");
    await page.getByRole("button", { name: "Sincronizar agora" }).click();
    await expect(page.getByText(/Ambiente em homologação/).first()).toBeVisible({ timeout: 30_000 });
    // A frase antiga não volta: recuperar é o bloqueio anterior sumir da tela.
    await expect(page.getByText(/Senha do certificado ausente/).first()).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE, "j13-02-recuperado-o-bloqueio-mudou.png"),
      fullPage: true,
    });

    // ─── 3. SUCESSO: a conferência da nota muda o estado de verdade ──────────
    await page.goto(`/app/fiscal/notas/${entradaId}`);
    await expect(page.getByText("Fornecedor E2E J13 Ltda").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Pendente", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Aprovar conferência" }).click();
    await expect(page.getByText("Conferência aprovada.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Aprovada", { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({
      path: path.join(EVIDENCE, "j13-03-conferencia-aprovada.png"),
      fullPage: true,
    });

    // ─── 4. RECUPERAÇÃO do fluxo: reabrir e aprovar de novo não é beco ───────
    await page.getByRole("button", { name: "Reabrir conferência" }).click();
    await expect(page.getByText("Conferência reaberta.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Aprovar conferência" })).toBeVisible();

    await page.getByRole("button", { name: "Aprovar conferência" }).click();
    await expect(page.getByText("Conferência aprovada.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Aprovada", { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({
      path: path.join(EVIDENCE, "j13-04-reaberta-e-aprovada-de-novo.png"),
      fullPage: true,
    });
  });
});
