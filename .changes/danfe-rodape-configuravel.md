---
impacto: nada_mudou
secao: alterado
titulo: Rodapé do DANFE é configurável — e sem marca embutida no código
---

O PDF do DANFE imprimia o crédito padrão da biblioteca que o gera
("Powered by NFePHP"). Quem revende o produto não tinha como pôr a própria
marca, e a alternativa — escrever um nome fixo no código — é justamente o que a
doutrina de marca própria proíbe: o DANFE chega ao cliente final, e o nome do
produto resolve da configuração da instalação, não do repositório.

O rodapé passa a ler `FISCAL_DANFE_CREDITO`. **Vazio significa sem crédito** —
nenhum nome é impresso por padrão. Quem quiser creditar alguém configura a
própria frase no `.env`, sem editar código.
