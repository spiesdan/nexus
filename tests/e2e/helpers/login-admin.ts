/**
 * Login de admin com MFA que sobrevive ao banco compartilhado.
 *
 * Duas coisas derrubam bateria inteira aqui, e nenhuma é bug de tela:
 *
 * 1. **O código TOTP não pode ser reusado.** Ele vale pela janela de 30 s, mas o
 *    servidor aceita cada um UMA vez (proteção contra replay). Testes que logam
 *    em sequência caem na mesma janela e mandam o mesmo código; o segundo é
 *    recusado. Por isso o último código enviado fica guardado no módulo.
 *
 * 2. **O segredo pode ter sido rotacionado por outra sessão.**
 *    `seed-e2e-credentials.ts` remove e reenrola o fator TOTP do admin, e várias
 *    frentes compartilham este Supabase local. Quando isso acontece no meio de
 *    uma execução, o `.e2e-creds.json` em disco aponta para um fator que não
 *    existe mais e todo login falha com "MFA falhou" — sintoma que lê como bug
 *    de senha, de relógio ou da tela de MFA. Medido nesta sessão: quatro vezes.
 *    A saída é re-semear UMA vez e tentar de novo, em vez de acusar a tela.
 *
 * 3. **O relógio desta máquina pode não ser o do servidor.** O GoTrue julga o
 *    TOTP pelo tempo do contêiner; o host pode andar à frente (medido: +47 s).
 *    Ver `medirDeslocamentoRelogio` abaixo — o offset é medido por processo,
 *    não configurado.
 */
import { execNpx } from "../utils/npx";
import * as fs from "node:fs";
import * as path from "node:path";

import { expect, type Page } from "@playwright/test";

import { generateTotp, msUntilNextTotpWindow } from "../utils/totp";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");

export interface CredsE2E {
  password: string;
  users: Record<string, { email: string }>;
  admin_totp?: { secret: string; factor_id?: string };
  /**
   * O agente que o seed de credenciais cria. **É um `rag_bot`** — a tela de
   * configuração por papéis é do `mcp_agent`, então não serve para ela.
   */
  default_agent_id?: string;
  /** `mcp_agent` + versão criados por `scripts/seed-e2e-capacidades.ts`. */
  capacidades?: { agent_id: string; version_id: string };
}

export function lerCreds(): CredsE2E {
  if (!fs.existsSync(CREDS_PATH)) semearCredenciais();
  return JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as CredsE2E;
}

/**
 * Re-semeia as credenciais **e reconstitui a cadeia que elas derrubam**.
 *
 * `seed-e2e-credentials.ts` reescreve o `.e2e-creds.json` INTEIRO. Os blocos
 * que os outros seeds acrescentam ao mesmo arquivo (`capacidades`, a credencial
 * de IA e a sessão de canal do follow-up) vão junto — e como este helper roda
 * no MEIO de um login, o efeito aparece longe da causa: um spec que já tinha
 * semeado sua fixture vê o campo sumir e falha dizendo "rode o seed antes",
 * logo depois de um seed que imprimiu sucesso. Medido nesta sessão, duas vezes.
 *
 * `seed-e2e-followup-agent` entra aqui porque é pré-requisito declarado de
 * `seed-e2e-capacidades` (que aborta com "Rode antes: …") e escreve no mesmo
 * arquivo. O bloco `capacidades` NÃO entra: nem todo spec precisa de um
 * `mcp_agent`, e quem precisa já o semeia — e precisa semear depois do login,
 * de qualquer forma.
 */
export function semearCredenciais(): CredsE2E {
  execNpx(["tsx", "scripts/seed-e2e-credentials.ts"], { stdio: "inherit" });
  execNpx(["tsx", "scripts/seed-e2e-followup-agent.ts"], { stdio: "inherit" });
  return JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as CredsE2E;
}

let ultimoCodigoEnviado: string | null = null;

/**
 * Relógio: o GoTrue valida o TOTP contra o tempo do CONTÊINER, e o relógio da
 * máquina de quem roda o e2e pode andar em outra velocidade — medido: +47 s
 * numa máquina local com `w32tm` sem sincronização ("Local CMOS Clock"). Com
 * o relógio errado TODO código é recusado (422 "Invalid TOTP code"), sintoma
 * que lê como bug de senha, de MFA ou da tela. O offset é medido UMA vez por
 * processo pelo header `Date` do `/auth/v1/health` (o tempo do contêiner) e
 * somado ao relógio local SÓ na geração/espera do TOTP. Em CI os dois relógios
 * batem e o offset fica ~0 — a compensação é um no-op lá. Correção definitiva
 * da máquina local: `w32tm /resync` com privilégio de administrador.
 */
let deslocamentoRelogioMs: number | null = null;

async function medirDeslocamentoRelogio(): Promise<number> {
  if (deslocamentoRelogioMs !== null) return deslocamentoRelogioMs;
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
    const resp = await fetch(`${base}/auth/v1/health`, { method: "GET" });
    const servidor = Date.parse(resp.headers.get("date") ?? "");
    deslocamentoRelogioMs = Number.isFinite(servidor) ? servidor - Date.now() : 0;
  } catch {
    deslocamentoRelogioMs = 0;
  }
  return deslocamentoRelogioMs;
}

/** O instante de AGORA no relógio com que o servidor julga o código. */
function agoraNoServidor(): number {
  return Date.now() + (deslocamentoRelogioMs ?? 0);
}

async function tentarMfa(page: Page, secret: string, tentativas: number): Promise<boolean> {
  for (let i = 0; i < tentativas; i++) {
    if (
      msUntilNextTotpWindow(agoraNoServidor()) < 3_000 ||
      generateTotp(secret, agoraNoServidor()) === ultimoCodigoEnviado
    ) {
      await page.waitForTimeout(msUntilNextTotpWindow(agoraNoServidor()) + 300);
    }
    const codigo = generateTotp(secret, agoraNoServidor());
    ultimoCodigoEnviado = codigo;

    const digito = page.locator('input[aria-label="Dígito 1"]');
    await digito.waitFor({ state: "visible", timeout: 15_000 });
    // O campo desabilita enquanto o código anterior é verificado.
    for (let espera = 0; espera < 20 && (await digito.isDisabled()); espera++) {
      await page.waitForTimeout(500);
    }
    await digito.click();
    await page.keyboard.type(codigo, { delay: 40 });
    try {
      await page.waitForURL(/\/app\//, { timeout: 10_000 });
      return true;
    } catch {
      await page.waitForTimeout(msUntilNextTotpWindow(agoraNoServidor()) + 300);
    }
  }
  return false;
}

/**
 * Loga como admin. Devolve as credenciais em vigor — que podem ter sido
 * re-semeadas no meio do caminho, e nesse caso são diferentes das que o chamador
 * tinha em mãos.
 */
export async function loginComoAdmin(page: Page, creds: CredsE2E): Promise<CredsE2E> {
  let atuais = creds;
  await medirDeslocamentoRelogio();

  for (let volta = 0; volta < 2; volta++) {
    await page.goto("/login");
    await page.locator("#email").fill(atuais.users.admin!.email);
    await page.locator("#password").fill(atuais.password);
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.waitForURL(/\/login\/mfa/, { timeout: 30_000 });

    if (await tentarMfa(page, atuais.admin_totp!.secret, 3)) return atuais;

    if (volta === 0) {
      // O segredo em disco não vale mais: outra sessão rodou o seed. Re-semeia
      // UMA vez e tenta de novo — na segunda falha o problema é outro e o teste
      // deve morrer dizendo isso, em vez de re-semear em círculo.
      atuais = semearCredenciais();
      ultimoCodigoEnviado = null;
    }
  }

  expect(
    false,
    "MFA do admin falhou mesmo depois de re-semear as credenciais — o problema não é o fator rotacionado",
  ).toBe(true);
  return atuais;
}
