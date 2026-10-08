---
impacto: nada_mudou
secao: corrigido
titulo: As fotos dos produtos voltam a aparecer no catálogo
---

As imagens dos produtos estavam cadastradas e continuam no banco, mas a coluna
de fotos aparecia vazia na tela do catálogo. Nada indicava a causa: todas as
consultas respondiam normalmente.

O motivo era o pedido da imagem. O aplicativo pedia as fotos por um endereço de
serviço que só existe na versão hospedada do Supabase; em uma instalação própria
esse endereço não existe e a imagem não carregava. Agora o aplicativo usa o
arquivo como ele está, e a imagem aparece.

Enviar uma foto nova também passa a funcionar em instalações próprias.