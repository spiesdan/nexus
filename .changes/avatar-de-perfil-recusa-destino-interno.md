---
impacto: nada_mudou
secao: corrigido
titulo: Foto de perfil não busca destino interno
---

O cron que mantém a foto dos contatos baixava a URL devolvida pelo canal sem
conferir para onde ela aponta. Uma URL apontando para o endereço de metadata da
nuvem ou para um serviço interno da instalação faria o servidor buscar de
dentro da rede e guardar a resposta num bucket que a empresa lê.

A busca agora passa pela mesma barreira das chamadas de saída: esquema e host
validados, nome resolvido e julgado contra faixas internas, e redirecionamento
não é seguido. Destino recusado não é baixado nem gravado.
