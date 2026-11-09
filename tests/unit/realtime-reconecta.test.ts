import { readFileSync } from "node:fs";

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRealtimeChannel } from "@/hooks/realtime/useRealtimeChannel";

/**
 * O CANAL QUE CAIU TEM DE VOLTAR SOZINHO.
 *
 * ─── O defeito, relatado olhando a tela ─────────────────────────────────────
 *
 * "Às vezes preciso atualizar para a mensagem aparecer." Aconteceu com uma
 * mensagem mandada do próprio celular: ela chegou ao banco pelo webhook e não
 * apareceu na conversa aberta até o F5.
 *
 * ─── Três coisas somadas, e nenhuma delas gritava ──────────────────────────
 *
 * 1. O callback do `subscribe` ANOTAVA o estado e não fazia mais nada. Em
 *    `CHANNEL_ERROR`, `TIMED_OUT` ou `CLOSED` o canal ficava morto — e o efeito
 *    só re-roda quando a topologia muda, então nada o ressuscitava.
 * 2. `refetchOnWindowFocus` é `false` no padrão do repo (certo para o resto do
 *    app), então voltar para a aba também não buscava nada.
 * 3. O Realtime NÃO guarda o que passou enquanto o canal esteve fora. Mesmo
 *    reassinando, o evento perdido não chega — só o PRÓXIMO.
 *
 * Somadas: a única recuperação era a pessoa recarregar. Que foi o sintoma.
 *
 * ─── Por que canal NOVO, e não `subscribe()` de novo ───────────────────────
 *
 * Um canal que entrou em erro não volta: o socket derrubou a topologia dele, e
 * reassinar o mesmo objeto responde SUBSCRIBED sem nunca mais entregar. Morte
 * silenciosa — a mesma classe de defeito que a memo de auth deste arquivo já
 * tinha, e pela qual o cabeçalho dele já pagou.
 */

const FONTE = readFileSync("hooks/realtime/useRealtimeChannel.ts", "utf8");

describe("o canal volta sozinho", () => {
  it("uma falha AGENDA nova tentativa — antes só anotava o estado", () => {
    expect(FONTE).toMatch(/CHANNEL_ERROR" \|\| s === "TIMED_OUT" \|\| s === "CLOSED"/);
    expect(FONTE, "a falha não agenda retomada").toMatch(/retomada = setTimeout\(/);
  });

  it("com recuo exponencial e TETO — rajada contra socket caído piora tudo", () => {
    expect(FONTE).toMatch(/Math\.min\(30_000, 1_000 \* 2 \*\* tentativas\)/);
  });

  it("monta canal NOVO a cada tentativa", () => {
    // Reassinar o mesmo objeto devolve SUBSCRIBED e não entrega nada.
    expect(FONTE, "a remoção do canal velho não é aguardada").toMatch(
      /await supabase\.removeChannel\(velho\)/,
    );
    expect(FONTE, "o canal novo não tem nome próprio por tentativa").toMatch(
      /supabase\.channel\(`\$\{channelName\}#\$\{geracao\+\+\}`\)/,
    );
  });

  it("o nome do canal NÃO usa o contador que zera no SUBSCRIBED", () => {
    /**
     * ⚠️ ESTE É O DEFEITO QUE DERRUBOU O APP EM 09/11/2026.
     *
     * O nome era `#${tentativas}`, e `tentativas` volta a zero no SUBSCRIBED.
     * A retomada então pedia `channel("#1")` — e o supabase-js DEVOLVE o canal
     * existente quando o nome repete. Como `removeChannel` é assíncrono, o
     * objeto ainda estava na lista: o `subscribe()` nele respondia CLOSED na
     * hora, o que agendava outra retomada de 1s. Laço eterno, um por canal,
     * cada volta invalidando as queries da tela.
     *
     * O nome passou a sair de `geracao`, que NUNCA volta a zero.
     */
    expect(FONTE, "o nome do canal voltou a usar o contador que zera").not.toMatch(
      /channelName\}#\$\{tentativas\}/,
    );
    expect(FONTE).toMatch(/let geracao = 0;/);
  });

  it("ao voltar, FORÇA uma busca — o que passou não chega sozinho", () => {
    // Esta é a parte que fecha o buraco de verdade. Sem ela o canal volta a
    // funcionar para o PRÓXIMO evento e a tela segue sem o anterior.
    expect(FONTE).toMatch(/handler\(\{ tipo: "reassinado" \}\)/);
  });

  it("só força quando VEIO de uma queda — a primeira assinatura não busca à toa", () => {
    expect(FONTE).toMatch(/if \(tentativas > 0\) \{/);
  });

  it("descarta o canal velho que responde tarde", () => {
    // Duas tentativas em voo: sem a comparação, a que chega atrasada
    // sobrescreve o estado da que já está de pé.
    // Dentro do callback do subscribe, não em qualquer lugar: a guarda também
    // existe no `then` da auth, e a primeira versão deste caso passava verde com
    // a do subscribe removida.
    expect(FONTE).toMatch(/novo\.subscribe\(\(s\) => \{\s*\n\s*if \(cancelado \|\| active !== novo\) return;/);
  });

  it("o timer é cancelado na saída — senão remonta canal de tela fechada", () => {
    // No CLEANUP, não no agendamento: a mesma linha existe nos dois lugares, e
    // a primeira versão deste caso passava com a do cleanup removida — que é
    // justamente a que impede remontar canal de tela já fechada.
    expect(FONTE).toMatch(/cancelado = true;\s*\n\s*if \(retomada\) clearTimeout\(retomada\);/);
  });
});

describe("o token atrasado: o defeito foi eliminado, não afrouxado", () => {
  /**
   * ESTE BLOCO GUARDAVA QUATRO CASOS QUE NÃO EXISTEM MAIS, e a razão de terem
   * saído importa mais que os casos.
   *
   * Eles cobriam uma corrida: o hook buscava o token, dava `setAuth` e assinava,
   * com teto de 4s e remontagem quando o token chegava atrasado. Toda essa
   * engenharia existia para compensar o supabase-js não enxergar a sessão
   * (cookie httpOnly).
   *
   * ⚠️ E ELA PAROU DE FUNCIONAR NUM BUMP DE DEPENDÊNCIA, com os testes verdes.
   * Do realtime-js 2.112.x em diante a callback `accessToken` do client vence o
   * token manual, e a callback padrão sem sessão visível devolve a ANON KEY.
   * Medido no socket: o token do usuário durava ~2ms; o join seguinte ia
   * anônimo. Os testes não viram porque exercitavam um cliente FAKE e
   * afirmavam que `setAuth` fora CHAMADO — o que morreu foi o EFEITO.
   *
   * A fonte do token passou a ser a callback, em `lib/supabase/browser.ts`, que
   * o socket resolve ANTES de emitir o join. Sem corrida, não há teto a vencer
   * nem canal a remontar por atraso: a classe inteira de defeito deixou de ser
   * representável. Quem a vigia agora é `realtime-token-do-socket.test.ts`.
   */
  it("a corrida com teto não voltou ao hook", () => {
    expect(FONTE, "voltou a esperar token antes de assinar").not.toMatch(/esperarAuth/);
    expect(FONTE, "voltou o teto da corrida de auth").not.toMatch(/AUTH_TIMEOUT_MS/);
  });

  it("o subscribe é direto — nada bloqueia o join", () => {
    // Se o join voltar a depender de uma promessa nossa, a corrida volta junto.
    expect(FONTE).toMatch(/novo\.subscribe\(\(s\) => \{/);
  });
});

describe("a rede de segurança do inbox", () => {
  /**
   * O board e a linha do tempo já tinham; o inbox não. Com o canal morto e a
   * aba EM FOCO, `refetchOnWindowFocus` nunca dispara — e o inbox é a tela em
   * que se fica parado olhando. Ficava congelada até o F5, que foi o sintoma.
   */
  it("a lista de conversas tem rede, e devolve o sinal de perda", () => {
    const fonte = readFileSync("hooks/inbox/useConversationsRealtime.ts", "utf8");
    expect(fonte, "a lista ficou sem rede de segurança").toMatch(/useRefetchDeSeguranca</);
    expect(fonte, "o sinal de perda não sai do hook").toMatch(/return \{[^}]*\bseguranca\b[^}]*\}/);
  });

  it("a conversa aberta também", () => {
    const fonte = readFileSync("hooks/inbox/useMessagesRealtime.ts", "utf8");
    expect(fonte, "a conversa aberta ficou sem rede de segurança").toMatch(/useRefetchDeSeguranca</);
    expect(fonte, "o sinal de perda não sai do hook").toMatch(/return \{[^}]*\bseguranca\b[^}]*\}/);
  });

  it("o estado do canal chega à TELA — senão a morte dele segue invisível", () => {
    // O dossiê do lead já publicava este par; o inbox não publicava nada.
    // ⚠️ `data-realtime-status` tem de vir do STATUS do canal, não de um objeto
    // que existe sempre: a primeira versão desta linha diria `ativo` inclusive
    // com o canal morto — controle decorativo, que mente com cara de instrumento.
    const tela = readFileSync("components/inbox/InboxLayout.tsx", "utf8");
    expect(tela, "o inbox não publica o estado do canal").toMatch(
      /data-realtime-status=\{listQ\.realtimeStatus\}/,
    );
    expect(tela, "o inbox não publica a contagem de perdas").toMatch(
      /data-refetch-divergencias=\{listQ\.seguranca/,
    );
  });

  it("a rede consome o carimbo de entrega do canal — senão só sabe reprovar", () => {
    // Sem `ultimaEntrega`, divergência é indistinguível de "nada aconteceu no
    // intervalo": a verificação perde a capacidade de APROVAR.
    for (const f of ["hooks/inbox/useConversationsRealtime.ts", "hooks/inbox/useMessagesRealtime.ts"]) {
      const fonte = readFileSync(f, "utf8");
      expect(fonte, `${f} não passa ultimaEntrega para a rede`).toMatch(
        /const \{[^}]*\bultimaEntrega\b[^}]*\} = useRealtimeChannel\(/,
      );
    }
  });
});

describe("a segunda rede: voltar para a aba", () => {
  it("o hilo de mensagens ressincroniza ao focar", () => {
    const fonte = readFileSync("hooks/inbox/useMessagesRealtime.ts", "utf8");
    expect(fonte).toMatch(/refetchOnWindowFocus: true/);
  });

  it("a lista de conversas também", () => {
    const fonte = readFileSync("hooks/inbox/useConversationsRealtime.ts", "utf8");
    expect(fonte).toMatch(/refetchOnWindowFocus: true/);
  });

  it("useConversationsRealtime monta UMA vez na árvore do inbox — duplicar dobra refetch", () => {
    const layout = readFileSync("components/inbox/InboxLayout.tsx", "utf8");
    const lista = readFileSync("components/inbox/ConversationList.tsx", "utf8");
    expect(layout.match(/useConversationsRealtime\(/g)?.length).toBe(1);
    expect(lista).not.toMatch(/useConversationsRealtime\(/);
    expect(lista).toMatch(/listQuery/);
  });

  it("e o padrão GLOBAL segue desligado — isto é exceção, não virada de chave", () => {
    // Recarregar tudo a cada troca de aba é gasto sem retorno numa tela que
    // muda devagar. O inbox é o oposto, e só ele.
    const fonte = readFileSync("lib/query/client.ts", "utf8");
    expect(fonte).toMatch(/refetchOnWindowFocus: false/);
  });
});

// ─── A PROVA COMPORTAMENTAL DO LAÇO ────────────────────────────────────────
//
// As asserções acima leem o texto do hook. A que segue o EXECUTA contra um
// dublê que imita a semântica real do supabase-js (`channel(nome)` devolve o
// canal existente; `removeChannel` responde depois). Foi essa combinação — e
// não uma linha isolada — que produziu o laço de 1 Hz.

const fake = vi.hoisted(() => {
  type Bruto = { topic: string; removido: boolean; cb: ((s: string) => void) | null };
  const criados: Bruto[] = [];
  const eventos: string[] = [];

  function objeto(bruto: Bruto) {
    const canal = {
      topic: bruto.topic,
      on() {
        return canal;
      },
      subscribe(cb: (s: string) => void) {
        bruto.cb = cb;
        return canal;
      },
    };
    return canal;
  }

  const client = {
    channel(topic: string) {
      const existente = criados.find((c) => c.topic === topic && !c.removido);
      if (existente) {
        eventos.push(`reuso:${topic}`);
        return objeto(existente);
      }
      const bruto: Bruto = { topic, removido: false, cb: null };
      criados.push(bruto);
      eventos.push(`cria:${topic}`);
      return objeto(bruto);
    },
    async removeChannel(canal: { topic: string }) {
      eventos.push(`remove:inicio:${canal.topic}`);
      await Promise.resolve(); // o leave responde depois, como no cliente real
      const alvo = criados.find((c) => c.topic === canal.topic);
      if (alvo) alvo.removido = true;
      eventos.push(`remove:fim:${canal.topic}`);
    },
  };

  return { criados, eventos, client };
});

vi.mock("@/lib/supabase/browser", () => ({ createClient: () => fake.client }));

describe("três quedas seguidas não podem virar um laço de 1 Hz", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fake.criados.length = 0;
    fake.eventos.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cada retomada cria um canal com nome PRÓPRIO e só depois de remover o anterior", async () => {
    renderHook(() =>
      useRealtimeChannel({
        name: "teste",
        postgresChanges: { event: "*", table: "messages" },
        onChange: () => {},
      }),
    );

    const atual = () => fake.criados.at(-1)!;
    act(() => atual().cb!("SUBSCRIBED"));

    for (let i = 0; i < 3; i++) {
      act(() => atual().cb!("CLOSED"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      act(() => atual().cb!("SUBSCRIBED"));
    }

    const nomes = fake.criados.map((c) => c.topic);
    expect(fake.criados, "a remoção não recriou o canal").toHaveLength(4);
    expect(new Set(nomes).size, `nome repetido: ${nomes.join(", ")}`).toBe(4);
    expect(
      fake.eventos.filter((e) => e.startsWith("reuso:")),
      "o cliente reaproveitou um canal — é isto que devolve CLOSED na hora",
    ).toEqual([]);

    for (let i = 1; i < nomes.length; i++) {
      const fimDaRemocao = fake.eventos.indexOf(`remove:fim:${nomes[i - 1]}`);
      const criacao = fake.eventos.indexOf(`cria:${nomes[i]}`);
      expect(
        fimDaRemocao,
        `o canal ${nomes[i]} nasceu antes de ${nomes[i - 1]} terminar de sair`,
      ).toBeLessThan(criacao);
    }
  });
});

