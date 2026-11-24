---
impacto: nada_mudou
secao: corrigido
titulo: Worker do mapa da expedição acompanha a versão do MapLibre
---

O bump automático levou o `maplibre-gl` para 6.19 e o worker servido em `public/` ficou na versão anterior — o teste que compara byte a byte com `node_modules` reprovou e travou a release. O arquivo foi atualizado e a dependência passou a ser **pinada exata** (`6.19.0`): o worker é asset vendorizado, então versão flutuante aqui quebra de um jeito mudo — o worker sobe, recebe mensagens de outro protocolo e não responde.
