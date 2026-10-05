/**
 * Diagnóstico rápido: quais modelos Gemini desta chave respondem AGORA, com
 * UMA chamada mínima por modelo. Só imprime status/latência — sem logar a chave.
 *
 * Run: npx tsx --env-file=.env.local scripts/dev-testa-modelos-gemini.ts
 */
const chave = process.env.GEMINI_API_KEY?.trim();
if (!chave) throw new Error("GEMINI_API_KEY ausente (.env.local)");

const CATALOGO: string[] = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.8-flash",
  "gemini-3.0-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
];

async function listar(): Promise<void> {
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", {
    headers: { "x-goog-api-key": chave },
  });
  const j = (await r.json()) as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> };
  const gera = (j.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => (m.name ?? "").replace(/^models\//, ""));
  console.info(`[modelos] ${gera.length} com generateContent: ${gera.join(", ")}`);
}

async function ping(modelo: string): Promise<void> {
  const t0 = Date.now();
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": chave, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "responda apenas: ok" }] }] }),
    });
    const corpo = (await r.text()).slice(0, 200);
    console.info(`[ping] ${modelo} -> HTTP ${r.status} em ${Date.now() - t0}ms ${r.ok ? "" : corpo}`);
  } catch (err) {
    console.info(`[ping] ${modelo} -> ERRO ${err instanceof Error ? err.message : err}`);
  }
}

async function main(): Promise<void> {
  await listar();
  for (const m of CATALOGO) {
    await ping(m);
    await new Promise((r) => setTimeout(r, 2500));
  }
}

main().catch((err) => {
  console.error(`[testa-modelos] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
