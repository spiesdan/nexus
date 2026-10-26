# Marca do assistente: o símbolo do Grok Bot

O gatilho da TopBar e o cabeçalho do painel usam o **símbolo do Grok Bot**
(xAI) redesenhado em SVG — `components/assistente/IconeAssistente.tsx`: uma
bola cheia com dois olhos de cápsula **vazados** (`fillRule="evenodd"`),
chapada em `currentColor`.

- Medidas tiradas do material de lançamento do produto
  (`x.ai/news/introducing-grok-bot`, imagem OG) e conferidas com o ícone do
  app para macOS: mesma bola, mesmos dois olhos.
- Sem fundo, sombra ou gradiente: é um ícone, não um mascote — herda a cor do
  botão (cinza em repouso, texto no hover, branco no `bg-accent` do painel).
- Os olhos são **buracos**, não tinta: aparecem como o fundo em qualquer
  superfície (TopBar, cabeçalho colorido, claro/escuro).
- `aria-hidden` no SVG; o nome acessível vem do botão ("Abrir/Fechar
  assistente").

## O que ficou de fora

O rosto animado do **bloub** (engine portada em
`components/assistente/bloub/`, licença MIT em `LICENCA-bLoub.txt`) não é mais
renderizado: olhos que seguem o cursor e expressões faziam o ajudante parecer
um mascote no meio de ícones de linha. A engine **continua no repo**, com
`bloub.test.ts`/`gaze.test.ts` guardando a portagem — histórico. Se ela não
voltar, apagar a pasta e os dois testes numa limpeza; nada depende dela.

## O pulo

O clique no gatilho remonta o SVG (`key={pulos}`) para reanimar
`assistente-pulo` (0,38s, em `app/globals.css`). Com `prefers-reduced-motion`
o pulo não roda (`motion-reduce:animate-none`) e o painel entra direto.

## Trocar a marca

`IconeAssistente.tsx` é o único lugar a mudar: um `<path>` com a bola e os
olhos. O `viewBox` é 24×24 e o desenho ocupa o quadrado inteiro — `tamanho` é
o tamanho desenhado, sem padding interno.

> Marca de terceiro. Para uso interno/experimental tudo bem; se o produto for
> vendido com essa cara, o caminho é desenhar um mark próprio com a mesma
> geometria.
