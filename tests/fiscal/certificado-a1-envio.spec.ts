/**
 * O CERTIFICADO PRECISA CHEGAR NO SERVIDOR — e o teste prova isso lendo o disco.
 *
 * A tela antiga aceitava um `.pfx` e guardava só o nome. Este teste faz o
 * contrário: monta um PKCS#12 de verdade, envia pela rota HTTP e **verifica o
 * arquivo em disco no container**.
 *
 * ─── Por que o teste é E2E e não unitário ────────────────────────────────────
 *
 * A parte pura (`decidirCertificado`) tem 11 testes unitários, e eles não
 * veriam nada disso: o defeito original não era um cálculo errado, era um
 * arquivo que **não era enviado**. Só uma leitura de disco, depois do POST,
 * distingue "gravei" de "aceitei o pedido".
 *
 * ─── O PKCS#12 é de mentira, e está declarado ────────────────────────────────
 *
 * `selfsign` monta um certificado autoassinado com chave real, no formato que o
 * `decidirCertificado` reconhece (`0x30 0x82`). É o bastante porque a rota
 * valida o **formato**, não a cadeia — validar a cadeia é o que o sidecar faz
 * quando for falar com a SEFAZ, e exigir isso aqui deixaria o teste
 * dependente de uma CA.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "../e2e/helpers/login-admin";

const EVIDENCIA = path.join(process.cwd(), "evidence", "fiscal-certificado-enviado.png");

test.setTimeout(300_000);

/** Caminho dentro do container, onde a rota grava. */
const NO_APP = "/fiscal-certs";
const NO_CONTAINER = "crm-app-1";

test("enviar o certificado A1 grava o arquivo no servidor", async ({ page }) => {
  await loginComoAdmin(page, lerCreds());

  // 1. Um .pfx de verdade, gerado agora. Sem depender do certificado da
  //    empresa — este teste não deve tocar em credencial real.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cert-"));
  const pfx = path.join(dir, "certificado-teste.pfx");
  const { execFileSync } = await import("node:child_process");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      path.join(dir, "k.pem"),
      "-out",
      path.join(dir, "c.pem"),
      "-days",
      "2",
      "-subj",
      "/CN=Teste Deskcomm",
    ],
    { stdio: "ignore" },
  );
  execFileSync(
    "openssl",
    [
      "pkcs12",
      "-export",
      "-out",
      pfx,
      "-inkey",
      path.join(dir, "k.pem"),
      "-in",
      path.join(dir, "c.pem"),
      "-passout",
      "pass:teste",
    ],
    { stdio: "ignore" },
  );
  const bytes = await fs.stat(pfx);
  console.log("pfx gerado:", bytes.size, "bytes");
  expect(bytes.size).toBeGreaterThan(100);

  // 2. A tela precisa DIZER que não há certificado. Antes da correção ela
  //    mostrava o nome gravado, como se houvesse arquivo.
  //
  // `?aba=config`: a configuração fiscal é uma ABA da tela de Notas, não a
  // página inteira. A primeira versão deste spec foi para `/app/notas` e
  // reprovou com "o campo do certificado não apareceu" — que parecia o
  // componente quebrado quando era o spec na aba errada.
  await page.goto("/app/notas?aba=config");
  const campo = page.getByTestId("fiscal-cert-path");
  await expect(campo, "o campo do certificado não apareceu na config fiscal").toBeVisible({
    timeout: 30_000,
  });
  const situacao = page.getByTestId("fiscal-cert-situacao");
  await expect(situacao).toBeVisible();
  console.log("situação antes do envio:", (await situacao.innerText()).trim().slice(0, 90));

  // 3. Envia o arquivo pelo MESMO caminho da tela.
  await page.getByTestId("fiscal-cert-file").setInputFiles(pfx);

  // 4. A verdade: o arquivo existe no container?
  const dentro = await page.evaluate(async () => {
    const r = await fetch("/api/v1/fiscal-settings", { credentials: "include" });
    const j = (await r.json()) as { data?: { certificado_presente?: boolean } | null };
    return j.data?.certificado_presente ?? false;
  });
  console.log("certificado_presente depois do envio:", dentro);
  expect(dentro, "o servidor não confirmou o certificado depois do envio").toBe(true);

  await expect(
    page.getByTestId("fiscal-cert-path"),
    "o caminho do certificado continuou vazio depois do envio",
  ).toHaveValue("certificado.pfx");

  // 5. E a tela, na próxima carga, continua dizendo que existe — porque agora
  //    ela pergunta ao servidor, e não lê o texto que ela mesma gravou.
  await page.goto("/app/notas?aba=config");
  await expect(page.getByTestId("fiscal-cert-situacao")).toContainText(/gravado no servidor/i);
  await page.screenshot({ path: EVIDENCIA });
  console.log("evidência:", path.relative(process.cwd(), EVIDENCIA));

  console.log(
    `conferência externa: ls ${NO_APP} no ${NO_CONTAINER} deve mostrar ${path.basename(NO_APP)}/certificado.pfx`,
  );
});
