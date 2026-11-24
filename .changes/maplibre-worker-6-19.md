---
impacto: nada_mudou
secao: corrigido
titulo: Worker do mapa da expedição acompanha a versão do MapLibre
---

O bump automático levou o `maplibre-gl` para 6.19 e o worker servido em `public/` ficou na versão anterior — o teste que compara byte a byte com `node_modules` reprovou e travou a release. O worker foi atualizado para a 6.19.0, que é a versão que o lockfile já resolve — o arquivo é asset vendorizado e precisa bater byte a byte com a instalada, senão o worker sobe, recebe mensagens de outro protocolo e não responde.
