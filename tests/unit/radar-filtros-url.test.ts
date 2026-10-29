import { describe, expect, it } from "vitest";

import {
  comRecorte,
  filtrosParaUrl,
  lerFiltrosDaUrl,
} from "@/lib/comercial/radar-filtros-url";
import { FILTRO_RADAR_VAZIO } from "@/lib/comercial/radar-score";

function da(query: string) {
  return lerFiltrosDaUrl(new URLSearchParams(query));
}

describe("recorte do Radar na URL", () => {
  it("sem querystring, o recorte é o vazio — endereço limpo significa 'sem filtro'", () => {
    expect(da("")).toEqual(FILTRO_RADAR_VAZIO);
    expect(filtrosParaUrl(FILTRO_RADAR_VAZIO)).toBe("");
  });

  it("ida e volta preserva o recorte que a tela oferece", () => {
    const original = {
      busca: "mercado",
      vendedor: "u-1",
      cidade: "Joinville",
      periodoDias: 60,
      niveis: ["risco", "critico"] as const,
      diasMin: 30,
      ticketMinCents: 15000,
    };
    const url = filtrosParaUrl({ ...original, niveis: [...original.niveis] });
    const voltou = da(url);
    // Os níveis voltam ORDENADOS: a ordem é a da URL, não a do clique — é o
    // que faz dois recortes iguais gerarem o mesmo endereço.
    expect(voltou).toEqual({ ...original, niveis: ["critico", "risco"] });
  });

  it("nível desconhecido não vira 'todos os níveis'", () => {
    // O defeito que isto impede: descartar o valor E manter o filtro vazio
    // mostraria a carteira inteira quando a pessoa pediu um recorte.
    const f = da("niveis=banana,risco");
    expect(f.niveis).toEqual(["risco"]);
    expect(da("niveis=banana").niveis).toEqual([]);
  });

  it("período fora dos três da tela é lixo, não recorte", () => {
    expect(da("periodo=45").periodoDias).toBeNull();
    expect(da("periodo=-30").periodoDias).toBeNull();
    expect(da("periodo=abc").periodoDias).toBeNull();
    expect(da("periodo=90").periodoDias).toBe(90);
  });

  it("número inválido não vira NaN nem negativo", () => {
    expect(da("diasmin=-5&ticketmin=abc").diasMin).toBe(0);
    expect(da("diasmin=-5&ticketmin=abc").ticketMinCents).toBe(0);
    expect(da("diasmin=12.9").diasMin).toBe(12);
  });

  it("texto da URL é cortado — querystring não é campo livre de tamanho ilimitado", () => {
    const f = da(`busca=${"a".repeat(500)}`);
    expect(f.busca).toHaveLength(80);
  });

  it("a ordem das chaves é fixa: o mesmo recorte gera o mesmo endereço", () => {
    const a = filtrosParaUrl({ ...FILTRO_RADAR_VAZIO, niveis: ["risco", "critico"], diasMin: 10 });
    const b = filtrosParaUrl({ ...FILTRO_RADAR_VAZIO, diasMin: 10, niveis: ["critico", "risco"] });
    expect(a).toBe(b);
    expect(a).toBe("niveis=critico%2Crisco&diasmin=10");
  });

  it("comRecorte preserva o parâmetro de destino e acrescenta o recorte", () => {
    expect(comRecorte("/app/radar/oportunidades?situacao=em_risco", {
      ...FILTRO_RADAR_VAZIO,
      niveis: ["risco"],
    })).toBe("/app/radar/oportunidades?situacao=em_risco&niveis=risco");
    expect(comRecorte("/app/radar/risco", FILTRO_RADAR_VAZIO)).toBe("/app/radar/risco");
  });
});
