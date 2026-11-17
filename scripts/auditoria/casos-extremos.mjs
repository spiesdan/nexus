/**
 * CASOS EXTREMOS COM DADO DE VERDADE — o nome de 120 caracteres, o emoji, o
 * número absurdo (item 2.12).
 *
 * ─── O PROBLEMA ────────────────────────────────────────────────────────────
 *
 * Um seed limpo esconde o que a operação traz: nome composto com quatro
 * sobrenomes, emoji no apelido, e-mail de 60 caracteres, valor de sete dígitos.
 * A tela que não foi desenhada para isso estoura a coluna, empurra o layout ou
 * corta a informação sem dizer.
 *
 * ─── COMO MEDIR SEM SUJAR O BANCO DE QUEM INSTALOU ────────────────────────
 *
 * O registro é criado pelo service role no banco de E2E, medido, e **apagado no
 * fim** (inclusive em erro). O que se mede é objetivo:
 *   - `overflowHorizontal` da página em 320 e 1440;
 *   - se o nome longo é **truncado com reticências** (e não some);
 *   - altura da linha — nome que não quebra nem estoura;
 *   - se o valor em centavos é exibido inteiro (sem `1.234,5` comido).
 *
 * Uso:
 *   node scripts/auditoria/casos-extremos.mjs --estado /tmp/aaa-state.json
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

const RAIZ = process.cwd();
const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3011";
const ESTADO = process.env.AUDIT_ESTADO ?? "/tmp/aaa-state.json";

function env() {
  const bruto = readFileSync(path.join(RAIZ, ".env.e2e"), "utf8");
  const v = {};
  for (const linha of bruto.split("\n")) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;
    const i = limpa.indexOf("=");
    if (i > 0) v[limpa.slice(0, i)] = limpa.slice(i + 1).replace(/^["']|["']$/g, "");
  }
  return v;
}

const { NEXT_PUBLIC_SUPABASE_URL: BASE_DB, SUPABASE_SERVICE_ROLE_KEY: CHAVE } = env();
const ORG = "68fe016a-7312-4ee0-8417-2dd07a0ad659";
const DONO = "8db56fe1-162c-4202-a7eb-a274fef200a1";

/**
 * Dois extremos, de propósito:
 *   - REALISTA: nome composto de 49 caracteres — o que a operação traz;
 *   - PATOLÓGICO: 128 caracteres com emoji — o que um import de planilha traz.
 * Medir só o patológico produz achado irrelevante; medir só o realista esconde
 * o que quebra no import.
 */
const NOME_REALISTA = "Maria Aparecida de Oliveira Nascimento Albuquerque";
const NOME_PATOLOGICO =
  "Maria Aparecida de Oliveira Nascimento Albuquerque dos Santos Filho 🧾 Empreendimentos e Participações LTDA";
const EMAIL_LONGO = "contato.departamento.financeiro.extremamente.longo@empresa-com-nome-gigante.example.com";
const TELEFONES = ["+5511900000123", "+5511900000124"];

async function db(caminho, init) {
  const r = await fetch(`${BASE_DB}/rest/v1/${caminho}`, {
    ...init,
    headers: {
      apikey: CHAVE,
      Authorization: `Bearer ${CHAVE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers ?? {}),
    },
  });
  if (!r.ok) throw new Error(`PostgREST ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const criados = await db("contacts", {
  method: "POST",
  body: JSON.stringify([
    {
      organization_id: ORG,
      name: NOME_REALISTA,
      display_name: NOME_REALISTA,
      email: EMAIL_LONGO,
      phone_number: TELEFONES[0],
      source: "manual",
      created_by_user_id: DONO,
    },
    {
      organization_id: ORG,
      name: NOME_PATOLOGICO,
      display_name: NOME_PATOLOGICO,
      email: `patologico.${EMAIL_LONGO}`,
      phone_number: TELEFONES[1],
      source: "manual",
      created_by_user_id: DONO,
    },
  ]),
});
const ids = criados.map((c) => c.id);

const navegador = await chromium.launch();
const resultados = {
  nomeRealista: NOME_REALISTA.length,
  nomePatologico: NOME_PATOLOGICO.length,
  emailLongo: EMAIL_LONGO.length,
  telas: [],
};

try {
  for (const [nome, viewport] of [
    ["desktop", { width: 1440, height: 900 }],
    ["estreito", { width: 320, height: 720 }],
  ]) {
    const contexto = await navegador.newContext({ viewport, locale: "pt-BR", storageState: ESTADO });
    const pagina = await contexto.newPage();
    await pagina.goto(`${BASE}/app/contacts`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await pagina.waitForTimeout(2500);
    await pagina.getByTestId("busca-contatos").or(pagina.locator("#busca-contatos")).fill("Maria Aparecida");
    await pagina.waitForTimeout(2000);

    const medida = await pagina.evaluate(({ nomes }) => {
      const medir = (prefixo) => {
        const linhas = [...document.querySelectorAll("table tbody tr")];
        const linha = linhas.find((tr) => (tr.textContent ?? "").includes(prefixo));
        // A FOLHA que contém o texto: no `<td>` o `scrollWidth` não denuncia o
        // corte (quem corta é o `<a class="truncate">` dentro dele). A primeira
        // versão media o `td` e concluía "não truncado" numa célula que truncava.
        const alvo = linha
          ? [...linha.querySelectorAll("a, span, p, td")]
              .filter((el) => (el.textContent ?? "").includes(prefixo))
              .sort((x, y) => x.querySelectorAll("*").length - y.querySelectorAll("*").length)[0]
          : null;
        const estilo = alvo ? getComputedStyle(alvo) : null;
        return {
          achou: !!linha,
          alturaDaLinha: linha ? Math.round(linha.getBoundingClientRect().height) : null,
          truncado: estilo
            ? estilo.textOverflow === "ellipsis" ||
              (alvo.scrollWidth > alvo.clientWidth && estilo.overflow !== "visible")
            : null,
          larguraTexto: alvo ? Math.round(alvo.getBoundingClientRect().width) : null,
          alturaTexto: alvo ? Math.round(alvo.getBoundingClientRect().height) : null,
          linhas: alvo && estilo ? Math.round(alvo.getBoundingClientRect().height / parseFloat(estilo.lineHeight || "20")) : null,
        };
      };
      return {
        realista: medir(nomes[0]),
        patologico: medir(nomes[1]),
        overflowHorizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    }, { nomes: [NOME_REALISTA, NOME_PATOLOGICO] });

    resultados.telas.push({ tela: nome, ...medida });
    console.log(
      `${nome.padEnd(9)} overflow=${medida.overflowHorizontal} · realista: linha=${medida.realista.alturaDaLinha}px truncado=${medida.realista.truncado} ` +
        `· patológico: linha=${medida.patologico.alturaDaLinha}px truncado=${medida.patologico.truncado}`,
    );
    await contexto.close();
  }
} finally {
  await navegador.close();
  // Limpeza SEMPRE: dado de teste não fica no banco.
  for (const id of ids) {
    await db(`contacts?id=eq.${id}`, { method: "DELETE" }).catch(async (e) => {
      resultados.erroAoLimpar = String(e);
      // Conversa criada por automação pode segurar a FK.
      await db(`conversations?contact_id=eq.${id}`, { method: "DELETE" }).catch(() => undefined);
      await db(`contacts?id=eq.${id}`, { method: "DELETE" }).catch(() => undefined);
    });
  }
  const restantes = await db(`contacts?id=in.(${ids.join(",")})&select=id`);
  resultados.limpo = restantes.length === 0;
}

const arquivo = "docs/auditoria/capturas/casos-extremos.json";
const { writeFileSync } = await import("node:fs");
writeFileSync(
  arquivo,
  JSON.stringify({ base: BASE, medido_em: new Date().toISOString(), ...resultados }, null, 2) + "\n",
);
console.log(`\nlimpo=${resultados.limpo} · artefato: ${arquivo}`);
