"""Testes do solver VRPTW do servico Python (F5).

Cobrem defeitos que ja existiram e nao podem voltar:
- a primeira parada virar deposito e DESAPARECER da rota;
- a dimensao de capacidade medir distancia em vez de peso;
- toda entrega elegivel nao aparecer exatamente uma vez;
- `veiculo_id` inventado (`veh-0`) em vez do id que o backend mandou;
- geometria sem a perna de saida da base;
- inviabilidade sem motivo e sem lista de nao alocadas.

A matriz e' injetada (`matriz_fn`) — o teste nao depende de rede. Ela e'
rodoviaria por contrato (nenhum fallback euclidiano existe em producao).
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.contract import SolverRequest, SolverResponse  # noqa: E402
from app import solver as S  # noqa: E402


def _matriz_teste(nos):
    """Matriz deterministica em metros/segundos a partir das coordenadas."""
    n = len(nos)
    dist = [[0.0] * n for _ in range(n)]
    dur = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            dlat = abs(nos[i].latitude - nos[j].latitude)
            dlng = abs(nos[i].longitude - nos[j].longitude)
            metros = int(round((dlat + dlng) * 111_000))
            dist[i][j] = float(metros)
            dur[i][j] = float(metros / 10.0)  # ~36 km/h
    return {"distancias": dist, "duracoes": dur}


async def _rota_stub(pontos):
    return {
        "distancia_m": 0.0,
        "duracao_s": 0.0,
        "geometria": [[p.longitude, p.latitude] for p in pontos],
        "provedor": "teste",
    }


def _req(pontos, veiculos, origem=None, **kwargs):
    return SolverRequest(
        org_id="org-teste",
        origem=origem,
        pontos=pontos,
        veiculos=veiculos,
        tempo_parada_min=30,
        limite_busca_s=2,
        **kwargs,
    )


def _otimizar(req):
    return asyncio.run(S.otimizar_vrptw(req, matriz_fn=_matriz_teste, rota_fn=_rota_stub))


BASE = {"node_id": "base", "latitude": -26.40, "longitude": -51.30}
PONTOS = [
    {"node_id": "p1", "latitude": -26.41, "longitude": -51.31, "peso_kg": 10.0},
    {"node_id": "p2", "latitude": -26.42, "longitude": -51.32, "peso_kg": 12.0},
    {"node_id": "p3", "latitude": -26.43, "longitude": -51.33, "peso_kg": 8.0},
]


def test_contrato_recusa_request_sem_pontos():
    import pydantic

    try:
        SolverRequest(org_id="org-teste", pontos=[], veiculos=[])
    except pydantic.ValidationError:
        return
    raise AssertionError("esperava validacao falhar sem pontos")


def test_todas_as_entregas_aparecem_uma_vez_com_origem():
    resposta = _otimizar(
        _req(PONTOS, [{"veiculo_id": "v1", "capacidade_kg": 100}], origem=BASE)
    )
    assert isinstance(resposta, SolverResponse)
    assert resposta.status == "otimizado"
    paradas = [p for r in resposta.veiculos for p in r.paradas]
    assert sorted(paradas) == ["p1", "p2", "p3"]
    assert resposta.entregas_nao_alocadas == []
    assert resposta.total_paradas == 3


def test_sem_origem_a_primeira_entrega_nao_e_descartada():
    resposta = _otimizar(_req(PONTOS, [{"veiculo_id": "v1", "capacidade_kg": 100}]))
    paradas = [p for r in resposta.veiculos for p in r.paradas]
    assert sorted(paradas) == ["p1", "p2", "p3"], "a 1a parada virou deposito e sumiu"


def test_geometria_comeca_na_base_e_termina_na_ultima_parada():
    resposta = _otimizar(_req(PONTOS, [{"veiculo_id": "v1"}], origem=BASE))
    rota = next(r for r in resposta.veiculos if r.paradas)
    assert rota.geometria, "rota sem geometria nao e' rota desenhada"
    assert rota.geometria[0] == [BASE["longitude"], BASE["latitude"]]
    ultima = rota.paradas[-1]
    ponto = next(p for p in PONTOS if p["node_id"] == ultima)
    assert rota.geometria[-1] == [ponto["longitude"], ponto["latitude"]]


def test_capacidade_de_peso_respeitada_por_veiculo():
    pontos = [
        {"node_id": "p1", "latitude": -26.41, "longitude": -51.31, "peso_kg": 10.0},
        {"node_id": "p2", "latitude": -26.42, "longitude": -51.32, "peso_kg": 10.0},
        {"node_id": "p3", "latitude": -26.43, "longitude": -51.33, "peso_kg": 10.0},
        {"node_id": "p4", "latitude": -26.44, "longitude": -51.34, "peso_kg": 10.0},
    ]
    resposta = _otimizar(
        _req(
            pontos,
            [
                {"veiculo_id": "v1", "capacidade_kg": 20},
                {"veiculo_id": "v2", "capacidade_kg": 20},
            ],
            origem=BASE,
        )
    )
    assert resposta.status == "otimizado"
    assert len(resposta.veiculos) == 2
    for rota in resposta.veiculos:
        assert rota.carga_kg <= 20.0, f"{rota.veiculo_id} acima da capacidade: {rota.carga_kg}"
    assert sorted(p for r in resposta.veiculos for p in r.paradas) == ["p1", "p2", "p3", "p4"]


def test_capacidade_insuficiente_devolve_motivo_e_nao_alocadas():
    resposta = _otimizar(
        _req(PONTOS, [{"veiculo_id": "v1", "capacidade_kg": 1}], origem=BASE)
    )
    assert resposta.status == "sem_solucao"
    assert resposta.motivo == "capacidade_peso"
    assert sorted(resposta.entregas_nao_alocadas) == ["p1", "p2", "p3"]
    assert "capacidade_peso_sem_dados" not in resposta.restricoes_nao_aplicadas


def test_ids_do_veiculo_e_motorista_sao_os_do_request():
    resposta = _otimizar(
        _req(
            PONTOS,
            [{"veiculo_id": "placa-ABC1234", "motorista_id": "mot-9", "capacidade_kg": 100}],
            origem=BASE,
        )
    )
    rota = next(r for r in resposta.veiculos if r.paradas)
    assert rota.veiculo_id == "placa-ABC1234"
    assert rota.motorista_id == "mot-9"


def test_sem_peso_declarado_a_capacidade_nao_e_fingida():
    pontos = [
        {"node_id": "p1", "latitude": -26.41, "longitude": -51.31},
        {"node_id": "p2", "latitude": -26.42, "longitude": -51.32},
    ]
    resposta = _otimizar(
        _req(pontos, [{"veiculo_id": "v1", "capacidade_kg": 10}], origem=BASE)
    )
    assert resposta.status == "otimizado"
    assert "capacidade_peso_sem_dados" in resposta.restricoes_nao_aplicadas
    assert resposta.versao_algoritmo == S.VERSAO_ALGORITMO
    assert resposta.matriz_provedor == "injetada"


def test_janela_impossivel_nao_passa_calada():
    pontos = [
        {
            "node_id": "p1",
            "latitude": -26.41,
            "longitude": -51.31,
            "janela_inicio_min": 0,
            "janela_fim_min": 1,
        },
        {"node_id": "p2", "latitude": -26.6, "longitude": -51.6},
    ]
    resposta = _otimizar(_req(pontos, [{"veiculo_id": "v1"}], origem=BASE))
    assert resposta.status == "sem_solucao"
    assert resposta.erro == "solver_nao_encontrou_solucao"


def test_healthz_e_endpoint_com_contrato_valido(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    saude = client.get("/healthz")
    assert saude.status_code == 200
    assert saude.json()["status"] == "ok"

    async def fake_otimizar(request):
        return SolverResponse(
            org_id=request.org_id,
            status="otimizado",
            veiculos=[
                {
                    "veiculo_id": "v1",
                    "motorista_id": "m1",
                    "paradas": ["p2"],
                    "distancia_m": 1000.0,
                    "duracao_s": 2000.0,
                    "geometria": [[-20.0, 10.0], [-20.1, 10.1]],
                }
            ],
            total_paradas=1,
            versao_algoritmo=S.VERSAO_ALGORITMO,
            matriz_provedor="osrm",
        )

    monkeypatch.setattr("app.solver.otimizar_vrptw", fake_otimizar)

    resp = client.post(
        "/rota/otimizar",
        json={
            "org_id": "org-teste",
            "origem": BASE,
            "pontos": PONTOS,
            "veiculos": [{"veiculo_id": "v1", "capacidade_kg": 100}],
            "retornar_origem": False,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["org_id"] == "org-teste"
    assert data["status"] == "otimizado"
    assert data["total_paradas"] == 1
    assert data["veiculos"][0]["veiculo_id"] == "v1"
