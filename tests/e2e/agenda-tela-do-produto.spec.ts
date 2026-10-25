import { expect, test, type Page } from "@playwright/test";

import { irParaASemanaDoCompromisso } from "./helpers/agenda-semana-integra";
import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import { execNpx } from "./utils/npx";

/**
 * A PROVA NA TELA DO PRODUTO — e ela existe porque a outra estava na tela errada.
 *
 * `agenda-kit-visual.spec.ts` prova os componentes na VITRINE
 * (`/vitrine-agenda`), com dado sintético. Isso foi a decisão certa enquanto a
 * API não existia: o desenho precisava ser julgável antes de haver o que exibir.
 *
 * Mas o efeito líquido era que TUDO estava provado na tela que o cliente nunca
 * abre. Medido pelo maestro: dez dos dez itens do pedido, parciais, por essa
 * única razão. Esta spec é a outra metade — o que o dono do produto realmente vê.
 *
 * A diferença que mais importa está no primeiro caso: chegar em `/app/agenda`
 * **clicando no menu**, não por `goto`. `goto` prova que a rota responde;
 * clicar prova que a tela é ALCANÇÁVEL, que é outra coisa e é a que o usuário
 * exercita. Ter tela e ter porta são propriedades diferentes — o repo já tem um
 * gate para isso no nível do registro, e aqui ela é exercida pelo clique.
 */
const ESPERA = 60_000;
test.describe.configure({ mode: "serial", timeout: 180_000 });

/**
 * Cria UM compromisso pelo caminho da API, com a sessão já aberta, e devolve o
 * instante e o id do que criou.
 *
 * Por que isto passou a ser necessário: `HistoricoDaAgenda` devolve `null`
 * quando não há agendamento nenhum — decisão registrada no próprio componente
 * (as quatro abas zeradas + a faixa de "nada marcado" empurrariam o calendário
 * para baixo, que é o motivo de a pessoa ter aberto a Agenda). A spec afirmava
 * o contrário, "aparece mesmo sem dado", e ficou vermelha quando a decisão
 * entrou: o teste estava velho, não a tela.
 *
 * O horário NÃO é fixo, e isso é o que impede a spec de virar um caso de uso
 * único: cada corrida consome a vaga que escolheu, então um `10:00 de amanhã`
 * cravado passaria na primeira execução e reprovaria com 422
 * (`agenda_horario_indisponivel`) em todas as seguintes — inclusive no CI, que
 * compartilha o banco com outras specs de agenda. A pergunta "qual é o primeiro
 * horário livre?" é feita à rota que a TELA usa, então o que a spec marca é o
 * que o produto oferece.
 *
 * O `owner_user_id` NÃO é enfeite: a jornada publicada pelo seed é do atendente
 * (`users.agent`), e a rota recusa com 422 de disponibilidade quando o dono do
 * compromisso não publicou horário.
 */
async function criarUmAgendamento(page: Page): Promise<{ id: string; instante: string }> {
  const { agenda } = lerCreds();
  if (!agenda?.tipo_id || !agenda.dono_user_id) {
    throw new Error(
      "`.e2e-creds.json` sem o bloco `agenda` — rode `scripts/seed-e2e-agenda.ts` antes.",
    );
  }

  const de = new Date();
  const ate = new Date(de.getTime() + 14 * 86_400_000);
  const busca = new URLSearchParams({
    event_type_id: agenda.tipo_id,
    owner_user_id: agenda.dono_user_id,
    de: de.toISOString(),
    ate: ate.toISOString(),
  });
  const respostaDosHorarios = await page.request.get(`/api/v1/agenda/horarios-livres?${busca}`);
  if (!respostaDosHorarios.ok()) {
    throw new Error(
      `GET /agenda/horarios-livres → ${respostaDosHorarios.status()}: ` +
        `${await respostaDosHorarios.text()}`,
    );
  }
  const corpo = (await respostaDosHorarios.json()) as {
    data?: { slots?: Array<{ inicio: string }> };
    slots?: Array<{ inicio: string }>;
  };
  const slots = (corpo.data ?? corpo).slots ?? [];
  const primeiro = slots[0];
  if (!primeiro) {
    throw new Error(
      "a rota não ofereceu nenhum horário livre em 14 dias — o seed da agenda não publicou jornada",
    );
  }
  const instante = primeiro.inicio;

  const r = await page.request.post("/api/v1/agenda/agendamentos", {
    data: {
      event_type_id: agenda.tipo_id,
      starts_at: instante,
      owner_user_id: agenda.dono_user_id,
      title: "Compromisso do histórico",
    },
  });
  if (r.status() !== 201) {
    throw new Error(`POST /agenda/agendamentos → ${r.status()}: ${await r.text()}`);
  }
  const criado = (await r.json()) as { data?: { id?: string }; id?: string };
  const id = (criado.data ?? criado).id;
  if (!id) throw new Error(`POST /agenda/agendamentos não devolveu id: ${JSON.stringify(criado)}`);
  return { id, instante };
}

test.describe("a Agenda como o dono do produto a usa", () => {
  let page: Page;
  /** O que a spec criou, para apagar no fim: cada corrida não pode consumir vaga. */
  let criado: { id: string; instante: string } | null = null;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    // O seed é idempotente e cada spec que precisa dele o chama por si — a
    // regra do repo para não depender da ordem em que a outra rodou.
    execNpx(["tsx", "scripts/seed-e2e-agenda.ts"], { stdio: "inherit" });
    page = await browser.newPage();
    await loginComoAdmin(page, lerCreds());
  });

  test.afterAll(async () => {
    if (criado) {
      // LIMPEZA, como as irmãs: sem isto cada corrida consome uma vaga da agenda.
      const apagou = await page.request.delete("/api/v1/agenda/agendamentos", {
        data: { id: criado.id, reason: "limpeza da spec da tela do produto" },
      });
      expect(apagou.ok(), `a spec não conseguiu cancelar o que criou (${apagou.status()})`).toBe(true);
    }
    await page.close();
  });

  test("chego na Agenda CLICANDO no menu, não digitando a URL", async () => {
    await page.goto("/app");
    // O item vive no grupo "Atendimento", junto do Inbox — decisão registrada
    // no `registry.ts`: a Agenda é onde o dia acontece, não onde se configura.
    const item = page.getByRole("link", { name: "Agenda", exact: true }).first();
    await expect(item).toBeVisible({ timeout: ESPERA });
    await item.click();

    await expect(page).toHaveURL(/\/app\/agenda/, { timeout: ESPERA });
    await expect(page.getByTestId("tela-agenda")).toBeVisible();
    // `exact` NÃO é adorno aqui, e a linha do link acima já sabia disso. Sem ele
    // o nome casa por substring e o estado VAZIO da agenda ("Sua agenda está
    // livre esta semana") vira um segundo heading — dois elementos, strict mode,
    // vermelho. E o estado vazio é justamente o da INSTALAÇÃO FRESCA: esta spec
    // passava só porque outra spec deixava agendamentos no banco antes dela.
    // Medido nas duas direções: com 3 linhas passa, com 0 linhas falha.
    await expect(page.getByRole("heading", { name: "Agenda", exact: true })).toBeVisible();
  });

  test("as pessoas da equipe são REAIS — o filtro deixou de ser invisível", async () => {
    // `FiltroDePessoas` devolve `null` com menos de duas pessoas. Enquanto a
    // tela do produto passava lista vazia, o filtro existia, estava provado na
    // vitrine, e NINGUÉM o via aqui. Componente provado e não montado é o mesmo
    // que componente ausente, do ponto de vista de quem usa.
    await page.goto("/app/agenda");
    await expect(page.getByTestId("tela-agenda")).toBeVisible({ timeout: ESPERA });

    const filtro = page.getByTestId("filtro-de-pessoas");
    const avatares = page.locator('[data-testid^="avatar-pessoa-"]');

    // O seed do E2E tem admin, manager, agent, viewer e dono — mais de uma
    // pessoa, então o filtro TEM de aparecer.
    await expect(filtro).toBeVisible({ timeout: ESPERA });
    const quantas = await avatares.count();
    expect(quantas, "o filtro apareceu mas sem avatares").toBeGreaterThan(1);

    // Cada pessoa tem trilha de cor, e trilhas diferentes entre si: a cor vem do
    // `user_id` e não de um índice, então duas pessoas não colidem por estarem
    // na mesma posição da lista.
    const trilhas = await avatares.evaluateAll((els) =>
      els.map((e) => (e as HTMLElement).dataset.trilha),
    );
    expect(trilhas.every((t) => t && Number(t) >= 1 && Number(t) <= 8)).toBe(true);

    // ⚠️ O INTERVALO SOZINHO É PARCIALMENTE VÁCUO, e o comentário acima já
    // AFIRMAVA o que ele não media: "trilhas diferentes entre si". Se
    // `trilhaPadraoDoMembro` devolvesse 1 para todo mundo, o `every` acima
    // passaria — e a agenda desenharia a equipe inteira na mesma cor, que é
    // exatamente o que o sistema de cores existe para impedir.
    // ⚠️ POR PESSOA, e não por ELEMENTO — minha primeira versão comparou
    // `new Set(trilhas).size` com `trilhas.length` e reprovou dizendo "19 contra
    // 4". Medido: a organização tem CINCO pessoas e o locator casa 19 avatares,
    // porque a mesma pessoa aparece no filtro E em cada card da grade. Repetir a
    // trilha ali é o comportamento CERTO — é a mesma pessoa.
    //
    // A propriedade que importa é: duas pessoas DIFERENTES não compartilham
    // trilha. O `data-testid` carrega o id, então dá para parear.
    const porPessoa = await avatares.evaluateAll((els) =>
      els.map((e) => ({
        pessoa: (e as HTMLElement).dataset.testid?.replace("avatar-pessoa-", "") ?? "",
        trilha: (e as HTMLElement).dataset.trilha ?? "",
      })),
    );
    const trilhaDe = new Map<string, string>();
    const colisoes: string[] = [];
    for (const { pessoa, trilha } of porPessoa) {
      for (const [outra, t] of trilhaDe) {
        if (outra !== pessoa && t === trilha) colisoes.push(`${outra} e ${pessoa} → trilha ${t}`);
      }
      trilhaDe.set(pessoa, trilha);
    }
    expect(
      trilhaDe.size,
      "o filtro tem menos de duas pessoas distintas — o teste de colisão mede o vazio",
    ).toBeGreaterThan(1);
    expect(
      [...new Set(colisoes)],
      "duas pessoas DIFERENTES ganharam a mesma trilha de cor — na grade elas viram " +
        "uma só, e quem olha não distingue de quem é o compromisso",
    ).toEqual([]);
  });

  test("o histórico está NA TELA DO PRODUTO, com as quatro abas", async () => {
    // Estava provado só na vitrine. O cenário agora CRIA o compromisso: com
    // zero agendamento o componente devolve `null` de propósito (ver
    // `criarUmAgendamento` acima) — e a spec antiga, que exigia o histórico no
    // vazio, era a metade errada da mudança.
    criado = await criarUmAgendamento(page);
    await page.goto("/app/agenda");
    await expect(page.getByTestId("tela-agenda")).toBeVisible({ timeout: ESPERA });

    // A grade — e o `useAgendamentos` que alimenta o histórico — é escopada ao
    // período VISÍVEL (`recorteDaGrade`). Marcar por API não escolhe a semana:
    // o primeiro horário livre pode cair na seguinte, e sem navegar até ela o
    // histórico recebe lista vazia e devolve `null` — a falha leria "o
    // histórico não existe", que é a acusação errada.
    await irParaASemanaDoCompromisso(page, criado.instante);

    const hist = page.getByTestId("historico-da-agenda");
    await expect(hist).toBeVisible({ timeout: ESPERA });
    for (const aba of ["proximos", "aguardando", "passados", "cancelados"]) {
      await expect(page.getByTestId(`aba-${aba}`)).toBeVisible();
    }
  });

  test("a tela declara de onde veio o que ela mostra — e nunca de mentira", async () => {
    // ESTE TESTE JÁ FOI UM DESLIGADOR. Ele cobrava `data-fonte="vazio-ate-a-api"`,
    // o marcador de quando a leitura não existia. A leitura passou a existir
    // (`_client.tsx` emite "api" / "api-sem-dado"), a dívida foi paga — e a
    // asserção ficou, cobrando um estado que o produto já tinha superado. Só não
    // reprovou antes porque a falha do teste anterior abortava o bloco.
    //
    // O que importa NÃO é o valor de ontem: é que a tela declare uma fonte REAL
    // e jamais dado de mentira (decisão 18 — o relato de quem vê não é "tem dado
    // de teste na tela", é "estou vendo paciente de outra clínica na minha
    // agenda", e o time queima horas caçando um furo de RLS que não existe).
    const fonte = await page.getByTestId("tela-agenda").getAttribute("data-fonte");
    expect(fonte, "a tela precisa declarar sua fonte no DOM").not.toBeNull();
    expect(
      fonte,
      `data-fonte="${fonte}" não é fonte real — a tela do cliente lê o banco, ` +
        "e qualquer outro valor aqui significa que ela voltou a inventar",
    ).toMatch(/^api(-sem-dado)?$/);

    // O par que o valor sozinho não prova: sem dado, a grade não pode exibir
    // NOME nenhum. É o formato do defeito da decisão 18, medido em vez de suposto.
    if (fonte === "api-sem-dado") {
      await expect(page.getByText("Marina Alves")).toHaveCount(0);
      await expect(page.getByText("Pedro Lima")).toHaveCount(0);
    }
  });

  test("as três visões desenham, e a régua do agora existe — NO PRODUTO", async () => {
    // ⚠️ Isto estava provado só em `agenda-kit-visual`, que roda contra
    // `/vitrine-agenda` — página de demonstração com dado de mentira. A vitrine
    // prova o DESENHO; ela não prova que a tela que o cliente abre desenha.
    //
    // A página é COMPARTILHADA entre os casos (`serial`, um `page` só) e o caso
    // anterior navega até a semana do compromisso que criou. A régua do agora
    // só existe na coluna de HOJE (`ehHoje && <ReguaDoAgora>`), então sem
    // voltar para a semana corrente este caso reprova acusando "sem régua" —
    // quando o que faltava era a tela estar na semana certa.
    await page.getByRole("button", { name: "Hoje", exact: true }).click();
    await expect(page.getByTestId("grade-da-agenda")).toBeVisible({ timeout: ESPERA });

    const alternador = page.getByTestId("alternador-de-visao");
    for (const visao of ["Dia", "Mês", "Semana"]) {
      await alternador.getByRole("button", { name: visao, exact: true }).click();
      await expect(
        page.getByTestId("grade-da-agenda"),
        `a grade sumiu ao trocar para "${visao}"`,
      ).toBeVisible({ timeout: ESPERA });
      await expect(
        alternador.getByRole("button", { name: visao, exact: true }),
        `"${visao}" foi clicado e não ficou marcado como a visão atual`,
      ).toHaveAttribute("aria-pressed", "true");
    }

    // A régua do agora só existe quando o instante cabe na faixa desenhada
    // (07h–21h). Fora dela a ausência é CORRETA, e exigir presença faria a spec
    // ficar vermelha de madrugada — que é o defeito que este repo já pagou nos
    // invariantes de turno.
    const hora = new Date().getHours();
    const regua = page.getByTestId("regua-do-agora");
    if (hora >= 7 && hora <= 21) {
      await expect(regua, "dentro da faixa 07h–21h e sem régua do agora").toBeVisible();
    } else {
      await expect(regua, "fora da faixa e a régua apareceu mesmo assim").toHaveCount(0);
    }
  });

  test("o filtro por pessoa ISOLA de verdade — clicando, no produto", async () => {
    // O isolamento era assertado só na vitrine. Aqui o teste é sobre o efeito:
    // clicar numa pessoa muda o que a grade mostra, e "Todos" desfaz.
    const filtro = page.getByTestId("filtro-de-pessoas");
    await expect(filtro).toBeVisible({ timeout: ESPERA });

    const cartoes = () => page.getByTestId("grade-da-agenda").getByRole("button", { name: /\d{2}:\d{2} às \d{2}:\d{2}/ });
    const todos = await cartoes().count();

    const primeira = filtro.getByRole("button").first();
    await primeira.click();
    const isolado = await cartoes().count();
    expect(
      isolado,
      "isolar uma pessoa não pode mostrar MAIS do que a agenda inteira",
    ).toBeLessThanOrEqual(todos);
    await expect(primeira, "cliquei na pessoa e ela não ficou marcada").toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByTestId("botao-todos").click();
    await expect
      .poll(() => cartoes().count(), { message: "\"Todos\" não desfez o isolamento" })
      .toBe(todos);
  });

  test("evidência visual da tela do produto", async () => {
    // As três fotos que existiam eram todas da VITRINE. Esta é a primeira da
    // tela que o cliente abre.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/app/agenda");
    await expect(page.getByTestId("tela-agenda")).toBeVisible({ timeout: ESPERA });
    await page.screenshot({ path: "evidence/calendario/tela-do-produto-claro.png", fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("tela-agenda")).toBeVisible();
    await page.screenshot({ path: "evidence/calendario/tela-do-produto-celular.png", fullPage: true });

    const estouro = await page.evaluate(
      // ⚠️ `body.scrollWidth`, NÃO `documentElement`. `app/globals.css` põe
      // `overflow-x: hidden` em `html` E em `body` (linhas 422 e 440), e sob isso
      // o `scrollWidth` do `documentElement` é GRAMPEADO no `clientWidth`: a
      // conta dá zero mesmo com um filho de 3000px dentro. Medido com o chromium
      // do repo, viewport 390x844, filho de 3000px — `visible` → 2610,
      // `hidden` → 0, e `body.scrollWidth` = 3000 nos DOIS casos.
      //
      // A asserção existia e era incapaz de falhar. Trocar a medida é o conserto;
      // o caso de sabotagem ao lado é o que prova que a nova consegue.
      () => document.body.scrollWidth - document.documentElement.clientWidth,
    );
    // Quem estoura, nomeado. Uma asserção que só diz "67" manda a próxima pessoa
    // caçar o elemento na mão — e essa caçada já custou uma sessão.
    const culpados = await page.evaluate(() => {
      const limite = document.documentElement.clientWidth;
      const fora: string[] = [];
      document.querySelectorAll("*").forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.right > limite + 1 && b.width > 0) {
          const e = el as HTMLElement;
          const id = e.getAttribute("data-testid");
          fora.push(
            `${e.tagName.toLowerCase()}${id ? `[${id}]` : ""} right=${Math.round(b.right)} w=${Math.round(b.width)} cls=${String(e.className).slice(0, 60)}`,
          );
        }
      });
      return fora.slice(0, 5);
    });
    expect(
      estouro,
      `a tela do produto estourou a largura no celular. Quem passa da borda:\n${culpados.join("\n") || "  (nenhum elemento individual — veja margem/transform)"}`,
    ).toBeLessThanOrEqual(0);
  });
});
