# Evidência — o rosto novo do assistente (bloub)

O FAB do assistente com o rosto novo, fotografado em `1280×720` no Chromium
(build e2e local, Supabase local, organização e2e, tema escuro):

- `evidence/assistente-bloub/1-fab-bloub-1280.png` — recorte do canto inferior
  direito: a bolota branca com os dois olhos (furos até o fundo do botão) e o
  pingo verde de status;
- `evidence/assistente-bloub/2-tela-com-fab-1280.png` — a tela inteira com o
  FAB no lugar, provando que ele sobrevive ao fluxo autenticado sem erro de
  console (a captura do run não registrou `pageerror` nem `console.error`).

O olhar segue o cursor: nesta execução o mouse estava em (700, 300) e o botão
no canto oposto, com o morph de 0,24 s já assentado antes do disparo.
