/**
 * ESCREVER E ERRAR — o que só o comportamento prova.
 *
 * ─── POR QUE ESTE INSTRUMENTO EXISTE ───────────────────────────────────────
 *
 * Todo o resto desta auditoria mediu LEITURA: abre a tela, olha o que está lá.
 * O prompt da Fase 2 pede mais: "formulários: rótulos, validação, erros no
 * campo, dados preservados, salvamento, cancelamento e confirmação". Nada disso
 * aparece numa captura — só submetendo.
 *
 * Aqui a pergunta é sempre a mesma, e a resposta tem de ser observável no DOM:
 *
 *   SUBMETI UM FORMULÁRIO INVÁLIDO. O PRODUTO DISSE O QUE ESTAVA ERRADO,
 *   ONDE, E SEM GRAVAR NADA?
 *
 * ─── O QUE ELE **NÃO** FAZ ─────────────────────────────────────────────────
 *
 * Não submete formulário VÁLIDO. Criar registro de teste em telas de produção é
 * como sujar o banco de quem instalou; para isso existe a suíte E2E, que roda
 * contra banco semeado e limpa o que cria. Aqui só se exercita o caminho de
 * RECUSA — e recusa, por definição, não grava.
 *
 * Se o produto GRAVAR mesmo assim, isso é o achado: o instrumento detecta
 * (diálogo fecha, toast de sucesso, URL muda) e reporta `gravouApesarDeInvalido`.
 *
 * ─── OS TRÊS CASOS, E POR QUE ELES ─────────────────────────────────────────
 *
 *  1. `/app/settings/api-tokens` — token com nome vazio. Recusa esperada:
 *     `required` no campo + erro de escopo no `FormField`.
 *  2. `/app/webhooks` — fonte de captação com nome vazio. Recusa esperada:
 *     `required` + funil obrigatório.
 *  3. `/app/team/invite` — convite sem e-mail. Recusa esperada: erro do
 *     `FormField` (`erro={erroLocal}`), que é o caminho de validação próprio,
 *     e não o `required` do HTML.
 *
 * Os três têm em comum: um registro inválido não teria efeito colateral real se
 * escapasse (um token sem nome, uma fonte sem nome, um convite sem destinatário).
 * Telas em que a recusa errada apagaria dado — configuração do tenant, marca,
 * pipeline padrão — NÃO entram: testar validação não justifica risco.
 *
 * Uso:
 *   node scripts/auditoria/escrita-e-validacao.mjs --estado /tmp/sessao-dono.json
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

const RAIZ = process.cwd();
const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3001";
const SAIDA = path.join(RAIZ, "docs", "auditoria", "capturas");
const LARGURA = Number(process.env.AUDIT_LARGURA ?? 1440);
const ALTURA = Number(process.env.AUDIT_ALTURA ?? 900);

const args = new Map();
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) args.set(argv[i], argv[i + 1]?.startsWith("--") ? true : argv[++i]);
  }
}
const estado = args.get("--estado");
if (!estado || !existsSync(estado)) {
  console.error("falta --estado <storageState.json>");
  process.exit(2);
}

/**
 * Um caso = um formulário, um gatilho, um botão de enviar.
 *
 * `campo` é o rótulo do campo que se espera ver citado no erro — não é usado
 * para digitar (o teste é o caminho VAZIO), e sim para conferir que a mensagem
 * aponta para o campo certo em vez de um "erro inesperado" genérico.
 */
const CASOS = [
  {
    id: "token-sem-nome",
    rota: "/app/settings/api-tokens",
    abrir: /criar token/i,
    enviar: /^criar$/i,
    cancelar: /cancelar/i,
    campo: /nome/i,
    porque: "token com nome vazio",
  },
  {
    id: "fonte-sem-nome",
    rota: "/app/webhooks",
    abrir: /nova fonte/i,
    enviar: /criar|criar fonte|salvar/i,
    cancelar: /cancelar/i,
    campo: /nome/i,
    porque: "fonte de captação com nome vazio",
  },
  {
    id: "convite-sem-email",
    rota: "/app/team/invite",
    abrir: null, // o formulário já está na página
    enviar: /convidar|enviar convite/i,
    cancelar: null,
    campo: /email/i,
    porque: "convite sem nenhum e-mail",
  },
];

const navegador = await chromium.launch();
const contexto = await navegador.newContext({
  storageState: estado,
  viewport: { width: LARGURA, height: ALTURA },
  locale: "pt-BR",
});
const resultados = [];

for (const caso of CASOS) {
  const pagina = await contexto.newPage();
  const consoleErros = [];
  pagina.on("console", (m) => {
    if (m.type() === "error") consoleErros.push(m.text().slice(0, 160));
  });

  const registro = { id: caso.id, rota: caso.rota, porque: caso.porque };
  try {
    const resp = await pagina.goto(`${BASE}${caso.rota}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    registro.status = resp?.status() ?? 0;
    await pagina.waitForTimeout(1_800);

    if (caso.abrir) {
      const gatilho = pagina.getByRole("button", { name: caso.abrir }).first();
      if ((await gatilho.count()) === 0) {
        registro.erro = "gatilho do formulário não encontrado";
        resultados.push(registro);
        await pagina.close();
        continue;
      }
      await gatilho.click();
      await pagina.waitForTimeout(900);
    }

    // Quantos campos o formulário exige — é o denominador do "recusou".
    registro.camposObrigatorios = await pagina.evaluate(
      () => document.querySelectorAll("form [required]").length,
    );
    const urlAntes = pagina.url();

    const enviar = pagina.getByRole("button", { name: caso.enviar }).first();
    if ((await enviar.count()) === 0) {
      registro.erro = "botão de enviar não encontrado";
      resultados.push(registro);
      await pagina.close();
      continue;
    }
    await enviar.click().catch(() => undefined);
    await pagina.waitForTimeout(1_400);

    const depois = await pagina.evaluate(() => {
      const dialogoAberto = Boolean(
        document.querySelector('[role="dialog"]:not([aria-hidden="true"])'),
      );
      const invalidos = document.querySelectorAll("form :invalid").length;
      const ariaInvalid = document.querySelectorAll('[aria-invalid="true"]').length;
      // Mensagens DENTRO do formulário — e não da página.
      //
      // A primeira versão varria o documento inteiro e capturou "Revogado", um
      // toast de uma ação antiga que nada tinha a ver com o erro. Mensagem de
      // validação mora no formulário ou no diálogo; ler o resto é ruído que
      // parece achado.
      const raiz =
        document.querySelector('[role="dialog"]:not([aria-hidden="true"]) form') ??
        document.querySelector("form") ??
        document.body;
      const textos = [
        ...raiz.querySelectorAll(
          '[role="alert"], [aria-live="polite"], [aria-live="assertive"], .text-error-fg',
        ),
      ]
        .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
        .filter((t) => t.length > 2 && t.length < 220);
      const corpo = (document.body.innerText || "").replace(/\s+/g, " ").toLowerCase();
      const sucesso =
        /criad|salv|enviad|criad[oa] com sucesso|token criado|convite enviado/.test(corpo) &&
        !/erro|inválid|obrigat/.test(corpo);
      return {
        dialogoAberto,
        invalidos,
        ariaInvalid,
        mensagens: [...new Set(textos)].slice(0, 6),
        pareceSucesso: sucesso,
      };
    });

    registro.formularioAberto = caso.abrir ? depois.dialogoAberto : true;
    registro.html5Invalido = depois.invalidos;
    registro.ariaInvalid = depois.ariaInvalid;
    registro.mensagens = depois.mensagens;
    registro.urlMudou = pagina.url() !== urlAntes;
    // Recusa = nada foi gravado E alguma coisa explicou o motivo.
    registro.recusou = !depois.pareceSucesso && !registro.urlMudou;
    registro.explicou =
      depois.mensagens.length > 0 || depois.invalidos > 0 || depois.ariaInvalid > 0;
    registro.gravouApesarDeInvalido = depois.pareceSucesso || registro.urlMudou;
    registro.citaOCampo = depois.mensagens.some((m) => caso.campo.test(m));
    registro.console = [...consoleErros];

    // Cancelar: o formulário tem de fechar sem gravar.
    if (caso.cancelar) {
      const cancelar = pagina.getByRole("button", { name: caso.cancelar }).first();
      if ((await cancelar.count()) > 0) {
        await cancelar.click().catch(() => undefined);
        await pagina.waitForTimeout(700);
        registro.cancelarFecha = await pagina.evaluate(
          () => !document.querySelector('[role="dialog"]:not([aria-hidden="true"])'),
        );
      }
    }
  } catch (e) {
    registro.erro = String(e).slice(0, 200);
  }

  resultados.push(registro);
  await pagina.close();
}

await contexto.close();
await navegador.close();

const arquivo = path.join(SAIDA, `escrita-${LARGURA}.json`);
writeFileSync(
  arquivo,
  JSON.stringify({ geradoEm: new Date().toISOString(), base: BASE, largura: LARGURA, resultados }, null, 2) +
    "\n",
);

for (const r of resultados) {
  const marca = r.erro
    ? "ERRO"
    : r.gravouApesarDeInvalido
      ? "GRAVOU"
      : r.recusou && r.explicou
        ? "recusou e explicou"
        : r.recusou
          ? "recusou em silêncio"
          : "indefinido";
  process.stdout.write(`  ${r.id.padEnd(20)} ${marca.padEnd(20)} ${(r.erro ?? "").slice(0, 60)}\n`);
}
process.stdout.write(`→ ${arquivo.replace(RAIZ + "/", "")}\n`);
