/**
 * O RAIO-X DO SITE — e, principalmente, o que ele se recusa a buscar.
 *
 * ─── O lado caro deste arquivo ──────────────────────────────────────────────
 *
 * O servidor faz request para URL que veio do banco (qualquer prospect). Sem
 * trava, `website=http://169.254.169.254/` leria metadados da nuvem. Cada
 * bloqueio abaixo é um teste porque cada um é uma forma diferente de apontar
 * o servidor para dentro — e "a função valida URL" sem dizer quais é a frase
 * que passa na revisão e falha no ataque.
 */
import { describe, expect, it } from "vitest";

import {
  analisarSite,
  motivoDeBloqueio,
  pesoDoSite,
  type DepsDoRaioX,
} from "@/lib/prospeccao/raio-x-site";

const SITE_BOM = `<!doctype html><html><head><title>Posto Central</title>
<meta name="description" content="Combustível 24h">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head><body>
<a href="https://wa.me/5547999990000">chamar</a>
<a href="mailto:contato@posto.com">email</a>
<a href="tel:+554733333333">fone</a>
</body></html>`;

const SITE_WIX = `<!doctype html><html><head><title>Loja</title>
<meta name="viewport" content="width=device-width">
<script src="https://static.wixstatic.com/x.js"></script>
</head><body>oi</body></html>`;

function deps(
  over: Partial<DepsDoRaioX> & {
    html?: string;
    status?: number;
    falha?: string;
    ips?: string[];
  } = {},
): DepsDoRaioX {
  let agora = 1_000_000;
  return {
    buscar: async (_url: string) => {
      if (over.falha) throw new Error(over.falha);
      agora += 300;
      return {
        status: over.status ?? 200,
        cabecalhos: {},
        corpo: async () => over.html ?? SITE_BOM,
      };
    },
    resolver: async (_host: string) => over.ips ?? ["93.184.216.34"],
    agoraMs: () => agora,
  };
}

describe("o bloqueio SSRF", () => {
  const resolverPublico = async () => ["93.184.216.34"];

  it("barra IP interno literal sem nem resolver", async () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data/",
      "http://127.0.0.1:3000/admin",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://[::1]/",
    ]) {
      // O resolver nem é chamado: o literal já condena. Se fosse preciso
      // resolver para saber, um DNS lento seria um atraso — e atraso em
      // validação de segurança é janela.
      let resolveu = false;
      const motivo = await motivoDeBloqueio(url, async () => {
        resolveu = true;
        return [];
      });
      expect(motivo, url).not.toBeNull();
      expect(resolveu, url).toBe(false);
    }
  });

  it("barra nome local", async () => {
    for (const url of ["http://localhost:3000/", "http://srv.internal/", "http://api.lan/"]) {
      expect(await motivoDeBloqueio(url, resolverPublico), url).not.toBeNull();
    }
  });

  it("barra esquema que não é http", async () => {
    expect(await motivoDeBloqueio("javascript:alert(1)", resolverPublico)).not.toBeNull();
    expect(await motivoDeBloqueio("file:///etc/passwd", resolverPublico)).not.toBeNull();
  });

  it("barra porta estranha", async () => {
    expect(await motivoDeBloqueio("http://exemplo.com:8080/", resolverPublico)).not.toBeNull();
    expect(await motivoDeBloqueio("https://exemplo.com/", resolverPublico)).toBeNull();
  });

  it("barra quando o DNS devolve IP interno (DNS rebinding)", async () => {
    // O caso que pega validação que só olha o hostname: o DNS responde um IP
    // bom na primeira consulta e um interno na segunda. Aqui a conferência é
    // DEPOIS de resolver, sempre.
    expect(await motivoDeBloqueio("http://exemplo.com/", async () => ["10.1.2.3"])).not.toBeNull();
  });

  it("domínio que não resolve é `sem_site`, não erro", async () => {
    const r = await analisarSite("http://nao-existe-xyz123.com/", deps({ ips: [] }));
    expect(r.situacao).toBe("sem_site");
  });
});

describe("a classificação", () => {
  it("site bom: https, mobile, whatsapp, rápido", async () => {
    const r = await analisarSite("https://posto.com/", deps());
    expect(r.situacao).toBe("site_ok");
    expect(r.tempoMs).toBe(300);
    const chaves = Object.fromEntries(r.achados.map((a) => [a.chave, a.presente]));
    expect(chaves.mobile).toBe(true);
    expect(chaves.whatsapp).toBe(true);
    expect(chaves.email).toBe(true);
    expect(chaves.telefone).toBe(true);
  });

  it("http sem s cai para ruim — dado sem criptografia não é presença cuidada", async () => {
    const r = await analisarSite("http://posto.com/", deps());
    expect(r.situacao).toBe("site_ruim");
  });

  it("lento cai para ruim", async () => {
    let agora = 0;
    const r = await analisarSite("https://posto.com/", {
      buscar: async () => {
        agora += 9500;
        return { status: 200, cabecalhos: {}, corpo: async () => SITE_BOM };
      },
      resolver: async () => ["93.184.216.34"],
      agoraMs: () => agora,
    });
    expect(r.situacao).toBe("site_ruim");
    expect(r.tempoMs).toBe(9500);
  });

  it("Wix é simples, não ruim — existe e funciona", async () => {
    const r = await analisarSite("https://loja.com/", deps({ html: SITE_WIX }));
    expect(r.situacao).toBe("site_simples");
    expect(r.achados.some((a) => a.chave === "construtor_simples" && a.detalhe === "Wix")).toBe(
      true,
    );
  });

  it("sem viewport mobile é simples", async () => {
    const r = await analisarSite(
      "https://loja.com/",
      deps({ html: "<html><head><title>L</title></head><body>oi</body></html>" }),
    );
    expect(r.situacao).toBe("site_simples");
  });

  it("conexão recusada é sem_site — e não joga exceção para fora", async () => {
    const r = await analisarSite("https://posto.com/", deps({ falha: "connect ECONNREFUSED" }));
    expect(r.situacao).toBe("sem_site");
    expect(r.statusHttp).toBeNull();
  });

  it("500 é ruim; 404 é ruim (alguém paga esse domínio)", async () => {
    expect((await analisarSite("https://a.com/", deps({ status: 500 }))).situacao).toBe(
      "site_ruim",
    );
    expect((await analisarSite("https://a.com/", deps({ status: 404 }))).situacao).toBe(
      "site_ruim",
    );
  });

  it("sem esquema, assume https", async () => {
    let buscada = "";
    const r = await analisarSite("posto.com", {
      ...deps(),
      buscar: async (url: string) => {
        buscada = url;
        return { status: 200, cabecalhos: {}, corpo: async () => SITE_BOM };
      },
    });
    expect(buscada).toBe("https://posto.com");
    expect(r.situacao).toBe("site_ok");
  });
});

describe("o peso no score", () => {
  it("ok=10, simples=6, ruim=2, sem=0", () => {
    expect(pesoDoSite("site_ok", true)).toBe(10);
    expect(pesoDoSite("site_simples", true)).toBe(6);
    expect(pesoDoSite("site_ruim", true)).toBe(2);
    expect(pesoDoSite("sem_site", true)).toBe(0);
  });

  it("não verificado não tira ponto de ninguém", () => {
    expect(pesoDoSite("nao_verificado", true)).toBe(5);
    expect(pesoDoSite(null, true)).toBe(5);
    expect(pesoDoSite(null, false)).toBe(0);
  });

  it("a soma continua 100 no teto", async () => {
    const { scoreDeProspect } = await import("@/lib/prospeccao/score");
    const base = {
      temTelefone: true,
      temWebsite: true,
      whatsappPotencial: true,
      nota: 5,
      totalAvaliacoes: 500,
      bonusCategoria: 15,
      distanciaKm: 0,
      raioKm: 10,
    };
    // Com o melhor site possível, o teto continua 100 — o peso graduado
    // substitui o booleano, não soma com ele.
    expect(scoreDeProspect({ ...base, situacaoSite: "site_ok" })).toBe(100);
    expect(scoreDeProspect(base)).toBe(100);
  });
});
