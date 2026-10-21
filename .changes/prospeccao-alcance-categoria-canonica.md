---
impacto: nada_mudou
secao: corrigido
titulo: A campanha e a tela alcançam a categoria pelo rótulo em português
---

Metade da base não recebia campanha nenhuma. Medido em 21/10/2026: das 26.136
empresas não bloqueadas da instalação, **12.856 (49%)** não eram alcançadas por
campanha alguma. Não era a fila de `categoria_revisar` (1.708 linhas): era a
empresa já resolvida carregar o rótulo em PORTUGUÊS, e a régua da campanha só
comparar o INGLÊS.

O caso mais claro é a ótica: o catálogo chama de "Ótica"; o Google traduz
"Optician" para "Óptica". As duas grafias não casavam por substring, e as 234
óticas da base não entravam em campanha nenhuma. O mesmo buraco em "Loja de
autopeças" (285), "Agricultura e pecuária" (253), "Serviço de revisão e
manutenção de veículos" (239) e "Serviços jurídicos" (201).

Agora os DOIS lados do rótulo entram na régua: a campanha aceita o cru e o
canônico, e o filtro de Empresas olha a coluna canônica também — antes a tela
ficava vazia para o termo certo enquanto a campanha já alcançava a empresa. O
veto de revisão continua de pé, e o café corrigido dentro do posto segue sem
voltar na lista de posto.

Medido depois: empresas alcançáveis por alguma campanha sobem de 11.572 para
21.950; os órfãos caem de 12.856 para 2.478. O que sobra fica de fora de
propósito — "Indústria", "Explorador florestal", "Loja de saúde e beleza",
"Floricultura", "Órgão público" não têm categoria servida, e adivinhar mandaria
mensagem para quem não é cliente.
