/**
 * A REGRA do cron `recover-stuck-messages` (issue #129).
 *
 * O `CLAUDE.md` (§WAHA) e o PRD 03 prometiam este cron desde o começo — regra
 * de negócio W-12 — e ele não existia: o `git grep` só achava a promessa. Sem
 * ele, mensagem outbound cujo envio nunca acontece fica `status='sending'` para
 * sempre, e o self-hoster vê no inbox uma mensagem eternamente "enviando":
 * sinal de progresso para algo que não vai acontecer.
 *
 * O que se guarda aqui é o COMPORTAMENTO, com um dublê do client que registra as
 * chamadas — não a existência da rota. Cada propriedade existe porque errar
 * nela recria um defeito diferente:
 *
 *   1. só mexe no que passou do prazo, medido por `created_at` — marcar cedo
 *      demais falha mensagem que estava a caminho, e medir por `sent_at` (que o
 *      caminho de envio reescreve) deixa a mensagem rejuvenescer;
 *   2. o UPDATE carrega `status='sending'` como condição — sem esse claim, um
 *      ack que chega entre o SELECT e o UPDATE vira "falha" numa mensagem que o
 *      cliente recebeu;
 *   3. emite `message.failed`, como manda a regra W-12 — o trigger não emite,
 *      porque é AFTER INSERT e aqui só muda status;
 *   4. abre aviso na Central — marcar `failed` em silêncio troca uma falha
 *      invisível por outra: a bolha muda de ícone numa conversa que ninguém tem
 *      motivo para reabrir;
 *   5. o que a corrida levou não vira evento nem aviso — anunciar falha que não
 *      houve é o defeito espelhado.
 */
import { describe, expect, it } from "vitest";

import { STUCK_AFTER_MS, recoverStuckMessages } from "@/app/api/v1/cron/recover-stuck-messages/route";

interface Chamada {
  tabela: string;
  op: string;
  filtros: Record<string, unknown>;
  valores?: Record<string, unknown>;
}

/**
 * Dublê mínimo do client: registra o que foi pedido e devolve o que a rodada
 * encontraria. Não imita o PostgREST inteiro — imita só a fatia que a regra usa,
 * e qualquer método não previsto estoura, para o teste não passar por engano
 * sobre um caminho que ele não modela.
 */
function clientDuble(
  presas: Record<string, unknown>[],
  atualizadas?: Record<string, unknown>[],
  opcoes: { avisoAberto?: boolean; avisosAbertos?: string[]; fechados?: Record<string, unknown>[] } = {},
) {
  const chamadas: Chamada[] = [];
  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      chamadas.push({ tabela: `rpc:${fn}`, op: "rpc", filtros: {}, valores: args });
      return Promise.resolve({ error: null });
    },
    from(tabela: string) {
      const filtros: Record<string, unknown> = {};
      let valores: Record<string, unknown> | undefined;
      let op = "select";
      // `agent_inbox_items` responde a coisas diferentes de `messages`: o
      // dublê precisa distinguir, senão a busca de aviso aberto devolveria as
      // mensagens presas e o teste passaria por engano.
      const dados = () => {
        if (tabela === "agent_inbox_items") {
          if (op === "select") {
            if (opcoes.avisosAbertos) return opcoes.avisosAbertos.map((id) => ({ id }));
            return opcoes.avisoAberto ? [{ id: "aviso-ja-aberto" }] : [];
          }
          return opcoes.fechados ?? [];
        }
        // Em `messages`, o SELECT encontra as presas e o UPDATE devolve as que
        // ele realmente pegou — são respostas diferentes de propósito.
        return op === "select" ? presas : (atualizadas ?? presas);
      };
      const cadeia: Record<string, unknown> = {
        select() {
          return cadeia;
        },
        update(v: Record<string, unknown>) {
          op = "update";
          valores = v;
          return cadeia;
        },
        insert(v: Record<string, unknown>) {
          chamadas.push({ tabela, op: "insert", filtros: {}, valores: v });
          return Promise.resolve({ data: null, error: null });
        },
        eq(col: string, val: unknown) {
          filtros[`eq:${col}`] = val;
          return cadeia;
        },
        in(col: string, val: unknown) {
          filtros[`in:${col}`] = val;
          return cadeia;
        },
        lt(col: string, val: unknown) {
          filtros[`lt:${col}`] = val;
          return cadeia;
        },
        limit() {
          chamadas.push({ tabela, op, filtros, valores });
          return Promise.resolve({ data: dados(), error: null });
        },
        then(resolve: (r: unknown) => unknown) {
          chamadas.push({ tabela, op, filtros, valores });
          return Promise.resolve(resolve({ data: dados(), error: null }));
        },
      };
      return cadeia;
    },
  };
  return { client, chamadas };
}

const AGORA = new Date("2026-08-05T12:00:00.000Z");

function presa(over: Partial<Record<string, string | null>> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organization_id: "22222222-2222-4222-8222-222222222222",
    conversation_id: "33333333-3333-4333-8333-333333333333",
    created_at: new Date(AGORA.getTime() - 10 * 60 * 1000).toISOString(),
    sent_via: "ai",
    // `null` por padrão: é o caso em que o transporte nunca aceitou e a
    // mensagem realmente NÃO saiu. Os casos em que ela saiu e só o ack faltou
    // passam `external_id` explicitamente.
    external_id: null as string | null,
    ...over,
  };
}

describe("recover-stuck-messages", () => {
  it("o prazo é o do CLAUDE.md: 5 minutos", () => {
    expect(STUCK_AFTER_MS).toBe(5 * 60 * 1000);
  });

  it("busca só outbound sending mais velha que o prazo", async () => {
    const { client, chamadas } = clientDuble([]);
    await recoverStuckMessages(client as never, AGORA, "req-1");

    const busca = chamadas.find((c) => c.tabela === "messages" && c.op === "select");
    expect(busca).toBeDefined();
    expect(busca?.filtros["eq:direction"]).toBe("outbound");
    expect(busca?.filtros["eq:status"]).toBe("sending");
    // O corte é calculado a partir do `now` INJETADO — se a regra usasse
    // `Date.now()` por dentro, este caso não conseguiria fixá-lo e passaria a
    // medir o relógio da máquina em vez da regra. E é por `created_at`, não
    // `sent_at`: medir idade pela coluna que o caminho de envio reescreve
    // deixaria a mensagem rejuvenescer e escapar do cron para sempre.
    expect(busca?.filtros["lt:created_at"]).toBe(
      new Date(AGORA.getTime() - STUCK_AFTER_MS).toISOString(),
    );
  });

  it("nada preso ⇒ fecha os avisos abertos, e não abre outro", async () => {
    // A condição que abriu o aviso desapareceu: fechar é o efeito disso. Sem
    // esta rodada, uma falha de ontem fica "em aberto" para sempre — foi assim
    // que uma instalação real acumulou 27 avisos idênticos.
    const { client, chamadas } = clientDuble([], undefined, {
      fechados: [{ id: "aviso-1" }, { id: "aviso-2" }],
    });
    const r = await recoverStuckMessages(client as never, AGORA, "req-2");

    expect(r).toEqual({ scanned: 0, failed: 0, organizations: 0, resolved: 2 });
    const fecha = chamadas.find(
      (c) => c.tabela === "agent_inbox_items" && c.op === "update",
    );
    expect(fecha?.valores?.status).toBe("resolved");
    expect(fecha?.filtros["eq:kind"]).toBe("message_send_stuck");
    expect(fecha?.filtros["eq:status"]).toBe("open");
    expect(chamadas.filter((c) => c.op === "insert")).toEqual([]);
  });

  it("marca failed com claim atômico em status=sending", async () => {
    const { client, chamadas } = clientDuble([presa()]);
    const r = await recoverStuckMessages(client as never, AGORA, "req-3");

    const upd = chamadas.find((c) => c.op === "update");
    expect(upd?.valores?.status).toBe("failed");
    expect(upd?.valores?.error_code).toBe("send_timeout");
    // A condição que impede marcar como falha uma mensagem cujo ack chegou
    // entre o SELECT e o UPDATE. Sem ela o cron mente sobre uma entrega real.
    expect(
      upd?.filtros["eq:status"],
      "o UPDATE precisa carregar status=sending como claim — senão uma corrida com o ack vira falso 'failed'",
    ).toBe("sending");
    // Service role bypassa RLS: o filtro de org é programático, não opcional.
    expect(upd?.filtros["eq:organization_id"]).toBe(presa().organization_id);
    expect(r.failed).toBe(1);
  });

  it("abre UM aviso por organização, não um por mensagem", async () => {
    const tres = [
      presa({ id: "aaaaaaaa-0000-4000-8000-000000000001" }),
      presa({ id: "aaaaaaaa-0000-4000-8000-000000000002" }),
      presa({ id: "aaaaaaaa-0000-4000-8000-000000000003" }),
    ];
    const { client, chamadas } = clientDuble(tres);
    const r = await recoverStuckMessages(client as never, AGORA, "req-4");

    // O aviso é UMA escrita: a consulta de dedup não conta como aviso.
    const avisos = chamadas.filter(
      (c) => c.tabela === "agent_inbox_items" && c.op === "insert",
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0]?.valores?.kind).toBe("message_send_stuck");
    expect(avisos[0]?.valores?.severity).toBe("critical");
    expect(String(avisos[0]?.valores?.title)).toContain("3");
    expect(r).toEqual({ scanned: 3, failed: 3, organizations: 1, resolved: 0 });
  });

  it("emite message.failed por mensagem marcada (W-12)", async () => {
    // O trigger `trg_messages_emit_event` é AFTER INSERT: mudar o status não
    // emite nada. Se este cron não emitir, o evento que a regra promete
    // simplesmente não existe — e ninguém notaria, porque o status muda igual.
    const dois = [
      presa({ id: "aaaaaaaa-0000-4000-8000-000000000001" }),
      presa({ id: "aaaaaaaa-0000-4000-8000-000000000002" }),
    ];
    const { client, chamadas } = clientDuble(dois);
    await recoverStuckMessages(client as never, AGORA, "req-6");

    const emitidos = chamadas.filter((c) => c.tabela === "rpc:emit_event");
    expect(emitidos).toHaveLength(2);
    expect(emitidos[0]?.valores?.p_event_type).toBe("message.failed");
    expect(emitidos[0]?.valores?.p_organization_id).toBe(presa().organization_id);
    expect(emitidos.map((e) => e.valores?.p_entity_id).sort()).toEqual(
      dois.map((m) => m.id).sort(),
    );
  });

  it("o UPDATE que não pegou nada não vira evento nem aviso (a corrida perdida é silenciosa)", async () => {
    // presas encontradas, mas o UPDATE devolve zero linhas: outro tick — ou o
    // ack — chegou primeiro. Anunciar aqui assustaria o dono do negócio com uma
    // falha que não houve, e gravaria `message.failed` de uma entrega real.
    const { client, chamadas } = clientDuble([presa()], []);
    const r = await recoverStuckMessages(client as never, AGORA, "req-5");

    // Nenhuma ESCRITA no inbox — a consulta de dedup é leitura e acontece sempre.
    expect(
      chamadas.filter((c) => c.tabela === "agent_inbox_items" && c.op !== "select"),
    ).toEqual([]);
    expect(chamadas.filter((c) => c.tabela === "rpc:emit_event")).toEqual([]);
    expect(r).toEqual({ scanned: 1, failed: 0, organizations: 0, resolved: 0 });
  });

  it("com aviso já aberto, ATUALIZA em vez de abrir outro (o defeito dos 27)", async () => {
    const { client, chamadas } = clientDuble([presa()], undefined, { avisoAberto: true });
    await recoverStuckMessages(client as never, AGORA, "req-7");

    const noInbox = chamadas.filter((c) => c.tabela === "agent_inbox_items");
    expect(noInbox.some((c) => c.op === "insert"), "não pode inserir segundo aviso").toBe(false);
    const atualiza = noInbox.find((c) => c.op === "update");
    expect(atualiza?.filtros["eq:id"]).toBe("aviso-ja-aberto");
    expect(atualiza?.valores?.title).toBeTruthy();
  });

  it("título não afirma 'não chegou' quando o transporte ACEITOU a mensagem", async () => {
    // `external_id` preenchido = o WAHA aceitou e devolveu o id. A mensagem saiu
    // do CRM; o que falta é o ack. Dizer "não chegou" aqui é uma afirmação que o
    // dado não sustenta — e faz o dono reenviar uma mensagem que já chegou.
    const { client, chamadas } = clientDuble([presa({ external_id: "3EB0ABCDEF" })]);
    await recoverStuckMessages(client as never, AGORA, "req-8");

    const aviso = chamadas.find((c) => c.tabela === "agent_inbox_items" && c.op === "insert");
    expect(String(aviso?.valores?.title)).toContain("sem confirmação de entrega");
    expect(String(aviso?.valores?.title)).not.toContain("não chegou");
    expect(String(aviso?.valores?.body)).toContain("é provável que tenha chegado");
  });

  it("distingue as duas causas na mesma rodada", async () => {
    const duas = [
      presa({ id: "aaaaaaaa-0000-4000-8000-000000000001", external_id: null }),
      presa({ id: "aaaaaaaa-0000-4000-8000-000000000002", external_id: "3EB0XYZ" }),
    ];
    const { client, chamadas } = clientDuble(duas);
    await recoverStuckMessages(client as never, AGORA, "req-9");

    const aviso = chamadas.find((c) => c.tabela === "agent_inbox_items" && c.op === "insert");
    const corpo = String(aviso?.valores?.body);
    expect(corpo).toContain("nunca chegou ao WhatsApp");
    expect(corpo).toContain("aceita pelo transporte");
  });

  it("colapsa a pilha que já existe: um aviso atualizado + os duplicados fechados", async () => {
    // O estado medido numa instalação real: 27 abertos do MESMO fato. A rodada
    // nova mantém um (com o estado de agora) e fecha os outros como duplicatas
    // — não porque alguém resolveu, mas porque são o mesmo aviso repetido.
    const { client, chamadas } = clientDuble([presa()], undefined, {
      avisosAbertos: ["aviso-1", "aviso-2", "aviso-3"],
    });
    const r = await recoverStuckMessages(client as never, AGORA, "req-10");

    const atualiza = chamadas.find(
      (c) => c.tabela === "agent_inbox_items" && c.op === "update" && c.filtros["eq:id"],
    );
    expect(atualiza?.filtros["eq:id"]).toBe("aviso-1");
    const fecha = chamadas.find(
      (c) => c.tabela === "agent_inbox_items" && c.op === "update" && c.filtros["in:id"],
    );
    expect(fecha?.valores?.status).toBe("resolved");
    expect(fecha?.filtros["in:id"]).toEqual(["aviso-2", "aviso-3"]);
    expect(r.resolved).toBe(2);
  });

  it("350 mensagens presas: o UPDATE vai em fatias de 100, sem URL longa", async () => {
    const presas350 = Array.from({ length: 350 }, (_, i) =>
      presa({ id: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}` }),
    );
    const { client, chamadas } = clientDuble(presas350);
    await recoverStuckMessages(client as never, AGORA, "req-350");

    const updates = chamadas.filter((c) => c.tabela === "messages" && c.op === "update");
    expect(updates).toHaveLength(4);
    expect(updates.map((c) => (c.filtros["in:id"] as string[]).length)).toEqual([100, 100, 100, 50]);
    // O claim atômico continua em CADA fatia — não basta fatiar e perder o CAS.
    for (const c of updates) expect(c.filtros["eq:status"]).toBe("sending");
  });

});
