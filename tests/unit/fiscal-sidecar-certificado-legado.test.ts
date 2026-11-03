/**
 * O CERTIFICADO A1 LEGADO PRECISA DO PROVEDOR `legacy` DO OPENSSL.
 *
 * ─── O defeito, medido em produção (03/11/2026) ─────────────────────────────
 *
 * `invoices` da org real, primeira tentativa de NF-e:
 *
 *   status  erro
 *   erro    SEFAZ/sidecar [EXCECAO]: Impossivel ler o certificado, ocorreu o
 *           seguinte erro: (error:0308010C:digital envelope routines::unsupported)
 *
 * O `.pfx` estava no volume, a senha estava gravada e `fiscal_settings` estava
 * preenchida — e `fiscal_certificates` com `titular`/`validade` vazios, porque
 * o mesmo erro já tinha derrubado o registro de metadados no upload.
 *
 * A causa é o PKCS#12 cifrado com RC2-40-CBC (comum em A1 brasileiro): no
 * OpenSSL 3 o algoritmo saiu do provedor padrão. Reproduzido dentro do próprio
 * contêiner com um PKCS#12 gerado por `openssl pkcs12 -legacy`:
 *
 *   PHP sem a configuração → bool(false) + 0308010C…unsupported
 *   PHP com OPENSSL_CONF   → bool(true)
 *
 * ─── O que este teste trava ─────────────────────────────────────────────────
 *
 * Não é "existe um arquivo de configuração": é que a IMAGEM carrega os dois
 * provedores e aponta o `OPENSSL_CONF` para ele. Se alguém remover o `ENV`, o
 * arquivo fica inerte e a emissão volta a falhar — e o sintoma aparece só na
 * primeira nota de um cliente com certificado legado, que é tarde.
 *
 * Vai na imagem, e não no `docker-compose.prod.yml`, porque correção de
 * instalação existente não pode exigir edição de arquivo na VPS — doutrina de
 * packaging.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const DIR = path.join(process.cwd(), "fiscal", "sidecar");

describe("sidecar fiscal — certificado A1 legado", () => {
  it("a imagem aponta OPENSSL_CONF para a configuração com legacy", () => {
    const dockerfile = readFileSync(path.join(DIR, "Dockerfile"), "utf8");
    expect(dockerfile).toMatch(/COPY\s+openssl-legacy\.cnf\s+\/etc\/ssl\/nexus-openssl\.cnf/);
    expect(dockerfile).toMatch(/ENV\s+OPENSSL_CONF=\/etc\/ssl\/nexus-openssl\.cnf/);
  });

  it("a configuração ativa default E legacy — só legacy derrubaria TLS", () => {
    const cnf = readFileSync(path.join(DIR, "openssl-legacy.cnf"), "utf8");
    expect(cnf).toMatch(/^default\s*=\s*default_sect$/m);
    expect(cnf).toMatch(/^legacy\s*=\s*legacy_sect$/m);
    expect(cnf).toMatch(/^\[default_sect\][\s\S]*?^activate\s*=\s*1$/m);
    expect(cnf).toMatch(/^\[legacy_sect\][\s\S]*?^activate\s*=\s*1$/m);
  });
});
