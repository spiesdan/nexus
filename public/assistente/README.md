# Avatar do assistente de ajuda: o bloub

O rosto do ajudante é o **bloub** — a bolota do x.ai recriada em SVG por
[jeremy-prt/bloub](https://github.com/jeremy-prt/bloub), **licença MIT**
(`components/assistente/bloub/LICENCA-bLoub.txt`), renderizada por um motor
próprio que mora versionado no repo:

- `components/assistente/bloub/` — a engine portada sem framework nem
  dependência externa (máquina de estados, expressões, silhueta, olhos,
  anéis e partículas) + a regra de olhar (`gaze.ts`) + o desenho
  (`BloubBot.tsx`);
- `components/assistente/AssistenteAvatar.tsx` — dirige o rosto conforme
  mouse, clique e chat (olhar contínuo, `attentif` com o chat aberto,
  `wink`/`heureux` no clique);
- `components/assistente/bloub/bloub.test.ts` e `gaze.test.ts` — quebram no
  CI se os nomes que o componente usa sumirem da engine.

Nada é baixado em runtime: funciona offline e no self-host.

## Por dentro

A engine é uma função **pura do tempo** (`sample(t)`): o componente só
mantém um relógio de `requestAnimationFrame`, aponta o olhar para o cursor e
desenha o frame em SVG. Isso significa que a mesma data devolve a mesma
imagem — o que torna o rosto testável sem DOM.

Com `prefers-reduced-motion` ou ponteiro grosseiro o loop nem nasce: o botão
renderiza uma imagem fixa (`sample(0)`), sem olhar que segue.

## Trocar de rosto

1. Atualize a engine em `components/assistente/bloub/` a partir do upstream
   (os arquivos são portados quase literais; `pnpm vitest run
   components/assistente/bloub` mostra se a portagem ainda fecha).
2. Se mudarem os nomes de estado/expressão que `AssistenteAvatar.tsx`
   chama, ajuste lá — o teste da guarda aponta o que faltou.
3. Rebuild/redeploy.

## Notas

- O botão e a bolota leem as cores do tema (`--color-bg`/`--color-text`),
  então o rosto acompanha claro/escuro sozinho.
- Sem fallback: a fonte é módulo versionado e determinístico, não há estado
  externo que "recuse" em runtime.
