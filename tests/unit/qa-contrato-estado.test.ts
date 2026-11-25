import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ler = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("QA local — contrato e estado", () => {
  it("billing lê plano do contrato, não snapshot da assinatura", () => {
    const tela = ler("app/app/settings/billing/_client.tsx");
    expect(tela).toContain("plano?.configurado");
    expect(tela).toContain("planoResumo.nome");
    expect(tela).toContain("planoResumo.intervalo");
  });

  it("publicar atualiza estado local sem reload", () => {
    const fonte = ler("app/app/expedicao/[id]/_roteirizador.tsx");
    const trecho = fonte.slice(fonte.indexOf("async function publicarRota"), fonte.indexOf("async function publicarRota") + 2600);
    expect(trecho).toContain("await recarregar()");
    expect(trecho).toContain("ordem");
  });

  it("pendência fiscal não repete UF dentro de cidade/UF", () => {
    const fonte = ler("lib/fiscal/destinatario-da-nota.ts");
    expect(fonte).toContain("if (municipio && uf.length !== 2) faltando.push(\"UF\")");
  });
});
