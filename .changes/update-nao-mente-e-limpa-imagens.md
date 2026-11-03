---
impacto: nada_mudou
secao: corrigido
titulo: Atualização não diz "já está na versão mais recente" com o parque na versão antiga — e limpa imagens
---

Dois defeitos que se encontraram no meio de uma atualização real, em 03/11/2026:

1. **O disco encheu** (96%, 56 GB em imagens antigas). O `docker pull` da versão
   nova morreu com "no space left on device" **depois** de gravar a versão no
   `.env` e depois de baixar a imagem do app — mas antes de baixar worker,
   mercos e ocr.
2. **A atualização seguinte disse "Você já está na versão mais recente"**, com
   os seis contêineres rodando a versão anterior. A checagem comparava só a
   imagem do app com o registro; ela estava baixada, então "em dia". A única
   saída era `--force`, que ninguém adivinha.

Agora a checagem compara o **parque inteiro**: se qualquer imagem que o compose
espera não está entre as que estão rodando, a atualização acontece. E, ao final
de uma atualização bem-sucedida, saem as imagens que nenhum contêiner usa — a
versão no ar fica, e a anterior continua no registro para um `--force` de
rollback.
