---
impacto: nada_mudou
secao: corrigido
titulo: Promoção da tag `stable` tenta de novo quando o registro ainda não serve a imagem
---

A `v2.0.5` falhou em `promover-stable` com `ghcr.io/spiesdan/nexus-ocr:2.0.5: not found` minutos depois de a imagem ter sido publicada — as outras cinco já tinham sido reapontadas. Reexecutar o job, sem mudar nenhuma linha, passou: é propagação do registro, não defeito de build. Agora a promoção tenta cinco vezes com espera crescente e só falha quando a tag realmente não aparece. Sem isso, `stable` fica na versão anterior — e quem instala no default (ou roda `update.sh --to stable`) recebe código velho sobre banco já migrado.
