/**
 * MERGE DAS FATIAS — o artefato final fica com o total real, não o da última fatia.
 *
 * Cada fatia grava `varredura-<de>-<ate>.json`. Este script junta todas,
 * desduplica por `rota|tema|largura` (a última medição vence) e grava
 * `varredura.json` com `rotas`, `validas`, `invalidas`, `porModulo` e `resumo`
 * recalculados sobre o CONJUNTO — nunca sobre a fatia que rodou por último.
 *
 *   node scripts/auditoria/mesclar-varredura.mjs --entrada docs/.../fatia
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const args = new Map();
for (const a of process.argv.slice(2)) {
  if (a.startsWith("--")) args.set(a, process.argv[process.argv.indexOf(a) + 1]);
}
const dir = path.resolve(args.get("--entrada") ?? "docs/auditoria/capturas/varredura-app");
const arquivos = readdirSync(dir)
  .filter((f) => /^varredura-\d+-\d+\.json$/.test(f))
  .sort((a, b) => {
    const [da, aa] = a.match(/\d+/g).map(Number);
    const [db, ab] = b.match(/\d+/g).map(Number);
    return da - db || aa - ab;
  });
if (arquivos.length === 0) throw new Error("nenhuma fatia encontrada");

const registros = [];
const porChave = new Map();
for (const f of arquivos) {
  const d = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
  for (const r of d.registros ?? []) {
    porChave.set(`${r.rota}|${r.tema}|${r.largura}`, r);
  }
}
const todas = [...porChave.values()];

const resumo = [...new Set(todas.map((r) => r.rota))].map((rota) => {
  const da = todas.filter((r) => r.rota === rota);
  const validas = da.filter((r) => r.valida);
  const invalidas = da.filter((r) => !r.valida);
  const contraste = validas.reduce((n, r) => n + (r.medida?.contrasteReprovados ?? 0), 0);
  const consoleErros = validas.reduce(
    (n, r) => n + (r.consoleErros?.length ?? 0) + (r.errosDePagina?.length ?? 0),
    0,
  );
  const alvos = Math.max(0, ...validas.map((r) => r.medida?.alvosPequenos ?? 0));
  const axe = validas.reduce((n, r) => n + (r.axe?.critica ?? 0) + (r.axe?.seria ?? 0), 0);
  return {
    rota,
    modulo: validas[0]?.modulo ?? da[0]?.modulo ?? null,
    redirecionaPara: [...new Set(da.map((r) => r.redirecionaPara).filter(Boolean))][0] ?? null,
    combinacoes: da.length,
    validas: validas.length,
    invalidas: invalidas.length,
    motivo: invalidas.map((r) => r.motivo).filter(Boolean)[0] ?? null,
    status: [...new Set(validas.map((r) => r.status))],
    contraste,
    overflow: Math.max(0, ...validas.map((r) => r.medida?.overflow ?? 0)),
    consoleErros,
    alvosPequenos: alvos,
    axeCritica: validas.reduce((n, r) => n + (r.axe?.critica ?? 0), 0),
    axeSeria: validas.reduce((n, r) => n + (r.axe?.seria ?? 0), 0),
    defeitos: {
      contraste: contraste > 0,
      overflow: resumoOverflow(validas),
      console: consoleErros > 0,
      alvo: alvos > 0,
      axe: axe > 0,
      http: validas.some((r) => (r.status ?? 200) >= 400),
    },
  };
});
function resumoOverflow(validas) {
  return validas.some((r) => (r.medida?.overflow ?? 0) > 0);
}

const porModulo = {};
for (const r of resumo) {
  const m = (porModulo[r.modulo ?? "sem-grupo"] ??= {
    rotas: 0,
    medidas: 0,
    ok: 0,
    contraste: 0,
    overflow: 0,
    console: 0,
    alvo: 0,
    axe: 0,
    http: 0,
  });
  m.rotas += 1;
  if (r.validas > 0) m.medidas += 1;
  if (r.invalidas === 0 && !Object.values(r.defeitos).some(Boolean)) m.ok += 1;
  for (const d of Object.keys(r.defeitos)) if (r.defeitos[d]) m[d] += 1;
}

const saida = path.join(dir, "varredura.json");
writeFileSync(
  saida,
  JSON.stringify(
    {
      geradoEm: new Date().toISOString(),
      fatias: arquivos,
      rotas: resumo.length,
      medidas: todas.length,
      validas: todas.filter((r) => r.valida).length,
      invalidas: todas.filter((r) => !r.valida).length,
      porModulo,
      resumo,
      registros: todas,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `mesclado: ${arquivos.length} fatias · ${resumo.length} rotas · ${todas.length} medidas → ${saida}`,
);
