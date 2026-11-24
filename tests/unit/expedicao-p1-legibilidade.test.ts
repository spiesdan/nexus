/**
 * P1-3/5/6/7/8 da auditoria 72. O que mudou não é gosto: filtro que some com
 * dado real, três nomes para o mesmo desfecho, dinheiro no cartão de quem
 * dirige, aviso morto e dois caminhos para escolher a mesma carga.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

describe("P1-3 — os quatro filtros aparecem com dado real", () => {
  it("a origem inclui placa e motorista legados no mesmo progresso que alimenta filtros e opções", () => {
    const pagina = ler("app/app/expedicao/page.tsx");
    expect(pagina).toContain("p.veiculos.push(carga.placa.trim())");
    expect(pagina).toContain("p.motoristas.push(carga.motorista_nome.trim())");
    const cliente = ler("app/app/expedicao/_client.tsx");
    expect(cliente).toContain("(pr?.veiculos ?? []).includes(filtroVeiculo)");
    expect(cliente).toContain("(pr?.motoristas ?? []).includes(filtroMotorista)");
  });
});

describe("P1-5/6/7 — cabine do entregador", () => {
  const motorista = ler("app/app/expedicao/[id]/_motorista.tsx");

  it("um nome para o desfecho positivo", () => {
    expect(motorista).not.toContain('t("Marcar como entregue")');
    expect(motorista).toContain('t("Entregue")');
  });

  it("dinheiro não é pergunta de quem dirige", () => {
    expect(motorista).not.toContain("comoMoeda");
  });

  it("todo aviso de sincronização tem ação, com texto legível", () => {
    expect(motorista).toContain('data-testid="estado-sync"');
    expect(motorista).toContain("atualizarRota()");
    expect(motorista).toContain('t("Atualizar")');
    expect(motorista).not.toContain("text-[11px]");
  });
});

describe("P1-8 — uma carga, um lugar", () => {
  it("o seletor que duplicava 41 cartões saiu da lista do entregador", () => {
    const lista = ler("app/app/expedicao/_client.tsx");
    expect(lista).not.toContain("Qual carga você está entregando?");
    expect(lista).toContain("carga-linha-${c.numero}");
  });
});
