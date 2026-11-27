# Capturas do Radar — 12 imagens

Donas: QA executa, Design UX julga e assina o parecer, Dr. Eggbot assina o design.
Spec e checklist: `docs/prospeccao-radar-estados.md`.

## 1. Seed (base local)

```
node --env-file=.env.e2e scripts/tmp-semear-radar.mjs
```

Cria seis buscas marcadas com `search_hash='seed-radar-estados'` (apaga antes só
as marcadas): carregando, resultado, parando, parcial, zero, degradada.
Requer as migrations 0366, 0367 e 0368 aplicadas na base.

## 2. Captura (servidor já de pé)

```
E2E_BASE_URL=http://localhost:<porta> \
  pnpm exec playwright test tests/e2e/tmp-captura-radar.spec.ts --project=chromium
```

Salva em `evidence/radar-estados/`: `{estado}-1440.png` e `{estado}-390.png`
para os seis estados, mais a lista inteira nas duas larguras.

## 3. O que a imagem precisa provar

O checklist por estado está na spec, seção "Checklist de aceite (12 imagens)".
Resumo: carregando "0 de N termos" e sem Pausar em `queued`; resultado com
tentativas 0..3; parando com "Procurando" + "Parando…" e 125 s; parcial com
motivo legível; zero com a frase congelada "0 encontrados em {cidade}" e três
saídas; degradada com motivo na íntegra e zero suprimido.
