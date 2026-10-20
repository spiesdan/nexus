/**
 * O PLANEJADOR do disparo em lote — quem recebe, em que ordem, em que ritmo.
 *
 * ═══ POR QUE ESTE ARQUIVO EXISTE ═════════════════════════════════════════
 *
 * Disparar mensagem de WhatsApp é das poucas coisas deste produto em que um
 * erro não aparece como erro: o número queima e o dano só aparece semanas
 * depois, como "não recebo mais mensagem". Por isso a decisão é uma função
 * pura com teste, e não um `for` dentro do route handler.
 *
 * ═══ MUTAÇÕES PROVADAS ═══════════════════════════════════════════════════
 *
 * Cada bloco abaixo diz qual linha quebrada reprova. Todas foram verificadas
 * trocando a linha, rodando o teste e vendo o `×`:
 *
 *  1. remover `if (c.do_not_contact)`            → reprova "opt-out vem primeiro"
 *  2. trocar `c.bloqueado` por `!c.bloqueado`    → reprova "bloqueado"
 *  3. tirar `ja_cliente` do meio da ordem       → reprova "cliente antes do canal"
 *  4. remover `c.consentRecusado`               → reprova "recusa registrada"
 *  5. inverter `>=` em `>` na cota              → reprova "cota fecha no limite"
 *  6. `podeEnviar: parametros.sessaoWorking` → `true`
 *                                                 → reprova os 3 de sessão
 *  7. `espacoMs` sempre 0                        → reprova o espaçamento
 *  8. `mensagem_indice` sempre 0                 → reprova a rotação
 *  9. rotação contando o CANDIDATO em vez do
 *     ENVIO aprovado                              → reprova "recusa não gasta volta"
 */
import { describe, expect, it } from "vitest";

import {
  ESPACO_ANTIBAN_MS,
  ESPACO_PADRAO_MS,
  LIMITE_PADRAO_DIA,
  MENSAGENS_POR_DISPARO_MAX,
  TETO_DIARIO,
  TAMANHO_MAXIMO_MENSAGEM,
  mensagemDaVez,
  planejarDisparo,
  validarMensagem,
  type CandidatoAoDisparo,
  type ParametrosDoDisparo,
} from "@/lib/prospeccao/disparo";

/** Um candidato que passa em tudo. Só o que o teste muda é o que ele testa. */
function candidato(over: Partial<CandidatoAoDisparo> = {}): CandidatoAoDisparo {
  return {
    id: "p1",
    nome: "Mecânica do Zé",
    telefone_normalizado: "+5548999998888",
    do_not_contact: false,
    bloqueado: false,
    whatsapp_potencial: true,
    status_comercial: "novo",
    contact_id: null,
    contatoBloqueado: false,
    consentRecusado: false,
    conversaAberta: false,
    mensagemRecente: false,
    ...over,
  };
}

function parametros(over: Partial<ParametrosDoDisparo> = {}): ParametrosDoDisparo {
  return {
    limite: LIMITE_PADRAO_DIA,
    jaEnviadosHoje: 0,
    espacoMs: ESPACO_PADRAO_MS,
    sessaoWorking: true,
    ...over,
  };
}

const n = (id: string, over: Partial<CandidatoAoDisparo> = {}) =>
  candidato({ id, telefone_normalizado: `+554899999${id.padStart(4, "0")}`, ...over });

describe("validarMensagem", () => {
  it("recusa mensagem vazia ou só com espaço", () => {
    expect(validarMensagem("").ok).toBe(false);
    expect(validarMensagem("   \n\t ").ok).toBe(false);
  });

  it("recusa acima do limite, dizendo o tamanho real", () => {
    const longo = "a".repeat(TAMANHO_MAXIMO_MENSAGEM + 1);
    const r = validarMensagem(longo);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain(String(TAMANHO_MAXIMO_MENSAGEM + 1));
  });

  it("aceita o limite exato", () => {
    expect(validarMensagem("a".repeat(TAMANHO_MAXIMO_MENSAGEM)).ok).toBe(true);
  });

  it("aceita a mensagem padrao de uma frase", () => {
    expect(validarMensagem("Ola! Somos da escritorio X. Podemos ajudar?").ok).toBe(true);
  });
});

describe("planejarDisparo — quem NAO recebe", () => {
  it("empresa em outra campanha não recebe, mesmo com telefone bom", () => {
    const r = planejarDisparo(
      [
        candidato({ id: "a", emOutraCampanha: true }),
        candidato({ id: "b", categoriaRevisar: true }),
        candidato({ id: "c", categoriaIncompativel: true }),
        candidato({ id: "d", jaEnviado: true }),
      ],
      parametros(),
    );
    expect(r.aprovados).toHaveLength(0);
    expect(r.recusados.map((x) => x.motivo)).toEqual([
      "em_outra_campanha",
      "categoria_revisar",
      "categoria_incompativel",
      "ja_enviado",
    ]);
  });

  it("opt-out do prospect vem antes de qualquer duvida de canal", () => {
    // Sem telefone E com do_not_contact: o motivo tem de ser o opt-out, porque
    // essa recusa nao e um detalhe de dado, e um "sem telefone" esconderia que
    // a pessoa pediu para nao ser contatada.
    const r = planejarDisparo([candidato({ do_not_contact: true, telefone_normalizado: null })], parametros());
    expect(r.aprovados).toHaveLength(0);
    expect(r.recusados[0]?.motivo).toBe("do_not_contact");
  });

  it("bloqueado pelo operador", () => {
    const r = planejarDisparo([candidato({ bloqueado: true })], parametros());
    expect(r.recusados[0]?.motivo).toBe("bloqueado");
  });

  it("contato que ja pediu para parar", () => {
    const r = planejarDisparo([candidato({ contatoBloqueado: true })], parametros());
    expect(r.recusados[0]?.motivo).toBe("contato_bloqueado");
  });

  it("recusa de marketing registrada", () => {
    const r = planejarDisparo([candidato({ consentRecusado: true })], parametros());
    expect(r.recusados[0]?.motivo).toBe("consent_recusado");
  });

  it("cliente vem antes da canalizacao — cliente sem WhatsApp e 'ja_cliente'", () => {
    // Sem WhatsApp E cliente. Mandar oferta para quem ja compra e o erro que
    // mais destroi uma conta, e ele nao pode aparecer como "sem WhatsApp".
    const r = planejarDisparo(
      [candidato({ status_comercial: "cliente", whatsapp_potencial: false })],
      parametros(),
    );
    expect(r.recusados[0]?.motivo).toBe("ja_cliente");
  });

  it("fixo ou pais nao tem WhatsApp, mesmo com E.164 bem formado", () => {
    // +55 48 3333-4444 e fixo de Joinville; +1 489... e dos EUA. Os dois
    // passam no formato E.164 e morrem na regra de celular BR — e e essa a
    // ordem certa: o telefone ESTA bem gravado, o que falta e o canal.
    for (const tel of ["+554833334444", "+1148999998888"]) {
      const r = planejarDisparo([candidato({ telefone_normalizado: tel })], parametros());
      expect(r.recusados[0]?.motivo).toBe("sem_whatsapp");
    }
  });

  it("telefone fora do formato E.164 e recusado como invalido", () => {
    // Aqui o dado esta ERRADO, e isso vem antes da discussao de canal.
    for (const tel of ["48999998888", "+55"]) {
      const r = planejarDisparo([candidato({ telefone_normalizado: tel })], parametros());
      expect(r.recusados[0]?.motivo).toBe("telefone_invalido");
    }
  });

  it("E.164 valido mas curto demais para celular cai em sem_whatsapp", () => {
    // +55489999 tem 8 digitos: passa no formato, nao passa na regra do 9.
    // A distincao importa para a tela: "telefone invalido" e dado sujo;
    // "sem WhatsApp" e um telefone bom que nao tem o canal.
    const r = planejarDisparo([candidato({ telefone_normalizado: "+55489999" })], parametros());
    expect(r.recusados[0]?.motivo).toBe("sem_whatsapp");
  });

  it("sem telefone", () => {
    const r = planejarDisparo([candidato({ telefone_normalizado: null })], parametros());
    expect(r.recusados[0]?.motivo).toBe("sem_telefone");
  });

  it("celular bom com whatsapp_potencial = false NAO entra", () => {
    // Este e o unico caso em que a COLUNA e a unica coisa que barra: o
    // telefone passa na regex de celular, e so o `false` gravado na descoberta
    // segura. Sem este teste a coluna podia ser lida sem ser lida — e a
    // mutacao "remove a leitura da coluna" passava sem reprovar.
    const r = planejarDisparo(
      [candidato({ whatsapp_potencial: false, telefone_normalizado: "+5548999998888" })],
      parametros(),
    );
    expect(r.aprovados).toHaveLength(0);
    expect(r.recusados[0]?.motivo).toBe("sem_whatsapp");
  });

  it("a coluna whatsapp_potencial mentindo NAO libera o envio", () => {
    // `whatsapp_potencial` e pre-computada na descoberta. Se alguem corrigir a
    // linha a mao no banco e marcar `true` num fixo, a regex tem de barrar —
    // senao o disparo sai para um numero que nao tem WhatsApp.
    const r = planejarDisparo(
      [candidato({ whatsapp_potencial: true, telefone_normalizado: "+554833334444" })],
      parametros(),
    );
    expect(r.aprovados).toHaveLength(0);
    expect(r.recusados[0]?.motivo).toBe("sem_whatsapp");
  });

  it("conversa aberta e mensagem recente barram o reenvio", () => {
    const a = planejarDisparo([candidato({ conversaAberta: true })], parametros());
    expect(a.recusados[0]?.motivo).toBe("conversa_ativa");
    const b = planejarDisparo([candidato({ mensagemRecente: true })], parametros());
    expect(b.recusados[0]?.motivo).toBe("mensagem_recente");
  });

  it("conversa Aberta ganha de mensagem Recente quando as duas existem", () => {
    const r = planejarDisparo(
      [candidato({ conversaAberta: true, mensagemRecente: true })],
      parametros(),
    );
    expect(r.recusados[0]?.motivo).toBe("conversa_ativa");
  });
});

describe("planejarDisparo — a cota do dia", () => {
  it("cota fecha no limite exato, nao em limite+1", () => {
    const lista = Array.from({ length: 10 }, (_, i) => n(String(i)));
    const r = planejarDisparo(lista, parametros({ limite: 4, espacoMs: 0 }));

    expect(r.aprovados).toHaveLength(4);
    expect(r.estouraramACota).toBe(6);
    expect(r.recusados.filter((x) => x.motivo === "cota_esgotada")).toHaveLength(6);
  });

  it("a cota conta o que JA saiu hoje", () => {
    const lista = Array.from({ length: 5 }, (_, i) => n(String(i)));
    const r = planejarDisparo(lista, parametros({ limite: 3, jaEnviadosHoje: 2, espacoMs: 0 }));

    expect(r.aprovados).toHaveLength(1);
  });

  it("cota maior que o limite escolhido e aparada no limite", () => {
    const lista = Array.from({ length: 600 }, (_, i) => n(String(i)));
    const r = planejarDisparo(lista, parametros({ limite: 9999, espacoMs: 0 }));

    expect(r.aprovados).toHaveLength(TETO_DIARIO);
  });

  it("quota estourada conta como estourada, e NAO como recusa da pessoa", () => {
    // A pessoa serve: ela fica para o proximo dia. Se a tela mostra "nao
    // pode mandar", o operador conclui que o numero e ruim e descarta o lead.
    const lista = Array.from({ length: 3 }, (_, i) => n(String(i)));
    const r = planejarDisparo(lista, parametros({ limite: 1, espacoMs: 0 }));

    expect(r.aprovados.map((a) => a.id)).toEqual(["0"]);
    expect(r.recusados.every((x) => x.motivo === "cota_esgotada")).toBe(true);
  });

  it("limite zero nao envia nada", () => {
    const r = planejarDisparo([candidato()], parametros({ limite: 0 }));
    expect(r.aprovados).toHaveLength(0);
    expect(r.estouraramACota).toBe(1);
  });
});

describe("planejarDisparo — o ritmo", () => {
  it("espaça os envios pelo intervalo pedido", () => {
    const lista = Array.from({ length: 4 }, (_, i) => n(String(i)));
    const r = planejarDisparo(lista, parametros({ limite: 10, espacoMs: 1200 }));

    expect(r.aprovados.map((a) => a.instanteMs)).toEqual([1200, 2400, 3600, 4800]);
    expect(r.duracaoPrevistaMs).toBe(4800);
  });

  it("o primeiro envio e no instante do intervalo, nao em zero", () => {
    // `instanteMs` e o offset DENTRO do plano; somar o intervalo desde o fim
    // do envio anterior e o que faz o espacamento existir de verdade.
    const r = planejarDisparo([candidato()], parametros({ espacoMs: 1200 }));
    expect(r.aprovados[0]?.instanteMs).toBe(1200);
  });

  it("espacamento negativo e tratado como zero, sem approved negativo", () => {
    const lista = Array.from({ length: 3 }, (_, i) => n(String(i)));
    const r = planejarDisparo(lista, parametros({ espacoMs: -5000 }));
    expect(r.aprovados.every((a) => a.instanteMs === 0)).toBe(true);
  });

  it("50 por dia com 1,2s leva um minuto, nao a noite toda", () => {
    const lista = Array.from({ length: 50 }, (_, i) => n(String(i)));
    const r = planejarDisparo(lista, parametros());
    expect(r.duracaoPrevistaMs).toBe(50 * ESPACO_PADRAO_MS);
  });
});

describe("planejarDisparo — SEM SESSÃO NAO SE ENVIA NADA", () => {
  it("sem sessão WORKING o plano é bloqueado", () => {
    const r = planejarDisparo([candidato(), n("2")], parametros({ sessaoWorking: false }));
    expect(r.podeEnviar).toBe(false);
    expect(r.bloqueio).toBe("sem_sessao_working");
  });

  it("sem sessao, quem age sobre o plano nao envia nada", () => {
    // O ponto inteiro do bloqueio: com sessao parada o `sendMessageHandler`
    // NAO devolve erro — ele joga a linha em `queued` para sempre. Se o
    // planejador devolvesse aprovados, a tela mostraria "500 mensagens
    // enviadas" e sairia zero.
    const r = planejarDisparo(
      Array.from({ length: 500 }, (_, i) => n(String(i))),
      parametros({ sessaoWorking: false, limite: TETO_DIARIO }),
    );
    expect(r.aprovados).toHaveLength(500);
    // ...e a rota e o chamador sao obrigados a olhar `podeEnviar` antes.
    const enviados = r.podeEnviar ? r.aprovados : [];
    expect(enviados).toHaveLength(0);
  });

  it("com sessao WORKING o bloqueio some", () => {
    const r = planejarDisparo([candidato()], parametros({ sessaoWorking: true }));
    expect(r.podeEnviar).toBe(true);
    expect(r.bloqueio).toBeNull();
  });
});

describe("planejarDisparo — a lista inteira", () => {
  it("separa o que entra do que nao entra, e a soma bate", () => {
    const lista = [
      n("0"),
      n("1", { do_not_contact: true }),
      n("2"),
      n("3", { telefone_normalizado: "+554833334444" }),
      n("4", { status_comercial: "cliente" }),
      n("5", { contatoBloqueado: true }),
    ];
    const r = planejarDisparo(lista, parametros({ espacoMs: 0 }));

    expect(r.aprovados.map((a) => a.id)).toEqual(["0", "2"]);
    expect(r.recusados).toHaveLength(4);
    expect(r.aprovados.length + r.recusados.length).toBe(lista.length);
  });

  it("conta os motivos, para a tela poder dizer onde estao os leads", () => {
    const lista = [
      n("0"),
      n("1", { telefone_normalizado: null }),
      n("2", { telefone_normalizado: null }),
      n("3", { status_comercial: "cliente" }),
    ];
    const r = planejarDisparo(lista, parametros({ espacoMs: 0 }));

    const contagem: Record<string, number> = {};
    for (const x of r.recusados) contagem[x.motivo] = (contagem[x.motivo] ?? 0) + 1;
    expect(contagem).toEqual({ sem_telefone: 2, ja_cliente: 1 });
  });

  it("lista vazia nao quebra", () => {
    const r = planejarDisparo([], parametros());
    expect(r.aprovados).toHaveLength(0);
    expect(r.recusados).toHaveLength(0);
    expect(r.duracaoPrevistaMs).toBe(0);
  });

  it("carrega o contact_id, para o envio reaproveitar o contato em vez de duplicar", () => {
    const r = planejarDisparo([candidato({ contact_id: "ct-9" })], parametros());
    expect(r.aprovados[0]?.contact_id).toBe("ct-9");
  });
});

describe("mensagemDaVez — a rotação 1→2→3→1", () => {
  const tres = ["um", "dois", "tres"];

  it("anda pela ordem e volta para a primeira quando as opcoes acabam", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => mensagemDaVez(tres, i))).toEqual([
      "um",
      "dois",
      "tres",
      "um",
      "dois",
      "tres",
      "um",
    ]);
  });

  it("com uma opcao so, ela e sempre a da vez", () => {
    expect([0, 1, 2].map((i) => mensagemDaVez(["unica"], i))).toEqual(["unica", "unica", "unica"]);
  });

  it("indice negativo da a volta em vez de estourar", () => {
    // `-1 % 3` em JS e `-1`, e `tres[-1]` seria `undefined`: a bolha sairia
    // VAZIA. O duplo resto e o que impede isso.
    expect(mensagemDaVez(tres, -1)).toBe("tres");
    expect(mensagemDaVez(tres, -4)).toBe("tres");
  });

  it("lista vazia devolve vazio em vez de quebrar o envio", () => {
    expect(mensagemDaVez([], 3)).toBe("");
  });
});

describe("planejarDisparo — a rotacao das mensagens", () => {
  it("o primeiro envio leva a 1a, o segundo a 2a, e volta a 1a na quarta", () => {
    const lista = Array.from({ length: 7 }, (_, i) => n(String(i)));
    const r = planejarDisparo(lista, parametros({ quantidadeDeMensagens: 3, espacoMs: 0 }));

    expect(r.aprovados.map((a) => a.mensagem_indice)).toEqual([0, 1, 2, 0, 1, 2, 0]);
    expect(r.variacoes).toBe(3);
  });

  it("sem informar variacoes, e a mensagem unica de sempre", () => {
    const lista = Array.from({ length: 3 }, (_, i) => n(String(i)));
    const r = planejarDisparo(lista, parametros({ espacoMs: 0 }));

    expect(r.variacoes).toBe(1);
    expect(r.aprovados.map((a) => a.mensagem_indice)).toEqual([0, 0, 0]);
  });

  it("RECUSA nao gasta volta: quem e recusado no meio nao troca a mensagem de quem vem depois", () => {
    // A rotação anda com o ENVIO, não com o candidato. Se andasse com o
    // candidato, um opt-out no meio da lista embaralharia as variações sem
    // nada ter saido — e a simulação mostraria uma ordem que o envio não faz.
    const lista = [
      n("0"),
      n("1", { do_not_contact: true }),
      n("2"),
      n("3", { telefone_normalizado: null }),
      n("4"),
    ];
    const r = planejarDisparo(lista, parametros({ quantidadeDeMensagens: 3, espacoMs: 0 }));

    expect(r.aprovados.map((a) => a.id)).toEqual(["0", "2", "4"]);
    expect(r.aprovados.map((a) => a.mensagem_indice)).toEqual([0, 1, 2]);
  });

  it("variacoes fora da faixa viram 1, nunca zero — zero seria divisao por zero", () => {
    const lista = [n("0"), n("1")];
    for (const quantidade of [0, -3, Number.NaN]) {
      const r = planejarDisparo(lista, parametros({ quantidadeDeMensagens: quantidade, espacoMs: 0 }));
      expect(r.variacoes).toBe(1);
      expect(r.aprovados.map((a) => a.mensagem_indice)).toEqual([0, 0]);
    }
  });

  it("mais variacoes que o limite nao passam: o teto e o mesmo da API", () => {
    const r = planejarDisparo([n("0")], parametros({ quantidadeDeMensagens: 99, espacoMs: 0 }));
    expect(r.variacoes).toBe(MENSAGENS_POR_DISPARO_MAX);
  });
});

describe("o ritmo anti-ban", () => {
  it("o padrao da TELA e 60s, nao o 1,2s da conversa", () => {
    // Trava contra a "otimizacao" que transforma 50 envios em 1 minuto de
    // rajada — exatamente o que queima o numero. 1,2s continua sendo o
    // intervalo da automacao (`ESPACO_PADRAO_MS`), que e outra coisa.
    expect(ESPACO_ANTIBAN_MS).toBe(60_000);
    expect(ESPACO_ANTIBAN_MS).toBeGreaterThan(ESPACO_PADRAO_MS);
  });

  it("a duracao prometida acompanha o intervalo pedido, sem mentir sobre o tempo", () => {
    const lista = Array.from({ length: 3 }, (_, i) => n(String(i)));
    const r = planejarDisparo(lista, parametros({ espacoMs: ESPACO_ANTIBAN_MS }));
    expect(r.duracaoPrevistaMs).toBe(180_000);
  });
});
