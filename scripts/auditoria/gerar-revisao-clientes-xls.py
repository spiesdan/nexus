#!/usr/bin/env python3
"""
Gera a lista de revisão dos clientes do XLS cujo nome bate com contato já
existente no CRM e que não tem documento para confirmar a identidade.

SOMENTE LEITURA: lê o XLS local e um CSV exportado de produção com SELECT.
Não escreve no banco, não mescla nada e não publica a lista na UI.

Uso:
  python3 scripts/auditoria/gerar-revisao-clientes-xls.py \
    <xlsx> <contatos.csv> <saida.md> <saida.csv>
"""
import collections
import csv
import re
import sys
import unicodedata

import openpyxl


def texto(valor):
    if valor is None:
        return ""
    if isinstance(valor, float) and valor.is_integer():
        return str(int(valor))
    return str(valor).strip()


def normalizar(valor):
    sem_acento = unicodedata.normalize("NFKD", valor).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", sem_acento).strip().upper()


def digitos(valor):
    return re.sub(r"\D", "", valor or "")


def main():
    xlsx, contatos_csv, saida_md, saida_csv = sys.argv[1:5]

    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    linhas_xls = []
    for linha in ws.iter_rows(min_row=4, values_only=True):
        if not linha or linha[6] is None:
            continue
        linhas_xls.append({
            "id_xls": texto(linha[0]),
            "nome": texto(linha[6]),
            "fantasia": texto(linha[7]),
            "telefone": texto(linha[8]) or texto(linha[9]),
            "cnpj": texto(linha[13]),
            "cidade": texto(linha[23]),
            "uf": texto(linha[24]),
        })

    with open(contatos_csv, newline="", encoding="utf-8") as arquivo:
        todos = list(csv.DictReader(arquivo))
    # A importação de ontem criou 1044 contatos com source=xls; esses NÃO são
    # "o que já existe" — são o resultado da importação.
    preexistentes = [c for c in todos if c["source"] != "xls"]
    indice = collections.defaultdict(list)
    for contato in preexistentes:
        if contato["cnpj"] or contato["tem_cpf"] == "t":
            continue  # tem documento: não é o caso "sem documento"
        for chave in (contato["nome"], contato["nome_ficha"]):
            if chave:
                indice[normalizar(chave)].append(contato)

    registros = []
    vistos = set()
    for x in linhas_xls:
        candidatos = indice.get(normalizar(x["nome"]), [])
        if not candidatos:
            continue
        # Um contato por linha: escolhe o que tem mais sinais de ser o mesmo.
        def pontuacao(c):
            return (
                (normalizar(c["cidade"]) == normalizar(x["cidade"]) and bool(x["cidade"])) * 2
                + (digitos(c["telefone"]) == digitos(x["telefone"]) and bool(digitos(x["telefone"]))) * 4
                + (c["tem_pedido"] == "t") * 1
            )
        c = sorted(candidatos, key=pontuacao, reverse=True)[0]
        chave = (x["id_xls"], c["id"])
        if chave in vistos:
            continue
        vistos.add(chave)

        nome_igual = normalizar(c["nome"]) == normalizar(x["nome"])
        cidade_igual = bool(x["cidade"]) and normalizar(c["cidade"]) == normalizar(x["cidade"])
        tel_igual = bool(digitos(x["telefone"])) and digitos(c["telefone"]) == digitos(x["telefone"])
        veredito = "provável mesmo" if nome_igual and cidade_igual and tel_igual else "revisar"
        registros.append({
            "id_xls": x["id_xls"],
            "nome_xls": x["nome"],
            "cnpj_xls": x["cnpj"],
            "cidade_xls": x["cidade"],
            "telefone_xls": x["telefone"],
            "contato_id": c["id"],
            "nome_crm": c["nome"],
            "cidade_crm": c["cidade"],
            "telefone_crm": c["telefone"],
            "tem_pedido": "sim" if c["tem_pedido"] == "t" else "não",
            "nome_igual": "sim" if nome_igual else "não",
            "cidade_igual": "sim" if cidade_igual else "não",
            "telefone_igual": "sim" if tel_igual else "não",
            "veredito": veredito,
        })

    total = len(registros)
    provaveis = sum(r["veredito"] == "provável mesmo" for r in registros)
    telefone_igual = sum(r["telefone_igual"] == "sim" for r in registros)
    so_nome = sum(
        r["telefone_igual"] != "sim" and r["cidade_igual"] != "sim" for r in registros
    )
    com_pedido = sum(r["tem_pedido"] == "sim" for r in registros)

    with open(saida_csv, "w", newline="", encoding="utf-8") as arquivo:
        campos = list(registros[0].keys()) if registros else ["id_xls"]
        escritor = csv.DictWriter(arquivo, fieldnames=campos)
        escritor.writeheader()
        escritor.writerows(registros)

    with open(saida_md, "w", encoding="utf-8") as arquivo:
        arquivo.write("# 74 — Clientes do XLS com nome idêntico: lista para revisão\n\n")
        arquivo.write(
            "> **Somente leitura.** Nenhum merge foi aplicado. Esta lista é insumo "
            "de decisão do dono; não vai para a tela.\n\n"
        )
        arquivo.write("## O que dá para afirmar\n\n")
        arquivo.write(f"- **{total}** linhas do XLS têm nome normalizado idêntico a um contato pré-existente sem documento.\n")
        arquivo.write(f"- **{telefone_igual}** têm telefone idêntico (prova forte).\n")
        arquivo.write(f"- **{so_nome}** têm só o nome em comum — risco de falsa identidade.\n")
        arquivo.write(f"- **{com_pedido}** têm pedido no CRM: o endereço atual importa mais nesses.\n")
        arquivo.write(f"- **{provaveis}** são `provável mesmo` (nome + cidade + telefone). Os demais ficam `revisar`.\n\n")
        arquivo.write("## Critério conservador\n\n")
        arquivo.write(
            "`provável mesmo` exige nome normalizado (maiúsculas, sem acento, espaços colapsados), "
            "cidade e telefone (só dígitos) iguais. Qualquer campo faltante cai em `revisar`. "
            "Nenhuma atribuição automática e nenhuma sugestão por IA.\n\n"
        )
        arquivo.write("A lista completa, com os dados de cada lado, está em `74-clientes-xls-revisao.csv`.\n\n")
        arquivo.write("| Veredito | Linhas |\n|---|---:|\n")
        contagem = collections.Counter(r["veredito"] for r in registros)
        for chave, valor in contagem.most_common():
            arquivo.write(f"| {chave} | {valor} |\n")
        arquivo.write("\n## Primeiras 30 linhas\n\n")
        arquivo.write("| XLS | Nome (XLS) | CNPJ (XLS) | Cidade/UF | Tel. igual | Pedido | Veredito |\n")
        arquivo.write("|---|---|---|---|---|---|---|\n")
        for r in registros[:30]:
            arquivo.write(
                f"| {r['id_xls']} | {r['nome_xls']} | {r['cnpj_xls'] or '—'} | "
                f"{r['cidade_xls']}/{r['uf'] if 'uf' in r else ''} | {r['telefone_igual']} | "
                f"{r['tem_pedido']} | {r['veredito']} |\n"
            )
    print(f"total={total} provaveis={provaveis} revisar={total - provaveis} telefone_igual={telefone_igual} so_nome={so_nome} com_pedido={com_pedido}")


if __name__ == "__main__":
    main()
