/**
 * O QUE O ANDROID PODE LEVAR EMBORA DO APARELHO.
 *
 * O app guarda em SQLite (`crm-offline`) o catálogo de clientes — nome, cidade
 * e **CPF/CNPJ** — e a fila de pedidos. O template do Capacitor nasce com
 * `android:allowBackup="true"`, então o banco subia para o Google Drive do
 * usuário sem ninguém decidir isso. E `allowBackup="false"` sozinho **não**
 * bloqueia a transferência aparelho→aparelho no Android 12+ (targetSdk 36):
 * é o `dataExtractionRules` que fecha essa porta.
 *
 * Não há backup como funcionalidade no produto, logo não há recurso a
 * preservar. Este gate impede que um `cap sync`/template futuro devolva o
 * default silencioso.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const MANIFESTO = readFileSync(
  join(RAIZ, "android/app/src/main/AndroidManifest.xml"),
  "utf8",
);
const REGRAS = readFileSync(
  join(RAIZ, "android/app/src/main/res/xml/data_extraction_rules.xml"),
  "utf8",
);

describe("AndroidManifest — dados no aparelho", () => {
  it("desliga o backup do aplicativo", () => {
    expect(MANIFESTO).toMatch(/android:allowBackup="false"/);
    expect(MANIFESTO).not.toMatch(/android:allowBackup="true"/);
  });

  it("aponta para as regras de extração de dados", () => {
    expect(MANIFESTO).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
    expect(MANIFESTO).toContain('android:fullBackupContent="false"');
  });

  it("exclui banco e preferências do backup e da transferência entre aparelhos", () => {
    // As duas portas: nuvem e aparelho→aparelho. Só a primeira era coberta por
    // `allowBackup`.
    for (const porta of ["cloud-backup", "device-transfer"]) {
      const bloco = REGRAS.split(`<${porta}>`)[1]?.split(`</${porta}>`)[0] ?? "";
      expect(bloco, `${porta} não exclui o banco`).toMatch(/domain="database"/);
      expect(bloco, `${porta} não exclui as preferências`).toMatch(/domain="sharedpref"/);
    }
  });
});
