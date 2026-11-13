"""Testes do solver VRPTW do servico Python (F5).

Cobrem: contrato valido, solver com matriz injetada, resposta estruturada,
sem solucao quando nao ha paradas ou quando a capacidade e insuficiente, e o
endpoint HTTP (POST /rota/otimizar) com solver stubbed.
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.contract import SolverRequest, SolverResponse  # noqa: E402
from app import solver as S  # noqa: E402

PONTOS = [
    {"node_id": "p1", "latitude": -22.9068, "longitude": -43.1729, "peso_kg": 10.0, "volume_m3": 0.5},
    {"node_id": "p2", "latitude": -22.9068, "longitude": -43.1829, "peso_kg": 12.0, "volume_m3": 0.6},
]


def _resolver_matriz(pontos, num_nodes):
    return S._resolver_matriz(pontos, num_nodes)


async def _rota_stub(seq):
    return {"distancia_m": 1000.0, "duracao_s": 2000.0, "geometria": [[10.0, -20.0]], "provedor": "osrm"}


def test_solver_retorna_resposta_valida_sem_veiculos():
    req = SolverRequest(
        org_id="org-teste",
        pontos=PONTOS,
        veiculos=[],
        tempo_parada_min=30,
    )
    resposta = asyncio.run(S.otimizar_vrptw(req, matriz_fn=_resolver_matriz, rota_fn=_rota_stub))
    assert isinstance(resposta, SolverResponse)
    assert resposta.org_id == "org-teste"
    assert resposta.status == "otimizado"
    assert resposta.erro is None
    assert len(resposta.veiculos) >= 1
    assert resposta.total_paradas >= 1


def test_solver_rejeita_request_sem_pontos_ou_origem():
    import pydantic

    try:
        SolverRequest(org_id="org-teste", pontos=[], veiculos=[])
    except pydantic.ValidationError:
        return
    raise AssertionError("esperava validacao falhar sem pontos/origem")


def test_solver_retorna_sem_solucao_com_capacidade_insuficiente():
    req = SolverRequest(
        org_id="org-teste",
        pontos=[
            {"node_id": "p1", "latitude": -22.9068, "longitude": -43.1729, "peso_kg": 10.0, "volume_m3": 0.5},
            {"node_id": "p2", "latitude": -22.9068, "longitude": -43.1829, "peso_kg": 12.0, "volume_m3": 0.6},
        ],
        veiculos=[{"veiculo_id": "v1", "capacidade_kg": 1, "capacidade_m3": 5}],
        tempo_parada_min=30,
    )
    resposta = asyncio.run(S.otimizar_vrptw(req, matriz_fn=_resolver_matriz, rota_fn=_rota_stub))
    assert resposta.status == "sem_solucao"
    assert resposta.erro == "solver_nao_encontrou_solucao"


def test_solver_multi_veiculo_devolve_distribuicao_por_veiculo():
    req = SolverRequest(
        org_id="org-teste",
        pontos=[
            {"node_id": "p1", "latitude": -22.9068, "longitude": -43.1729, "peso_kg": 10.0, "volume_m3": 0.5},
            {"node_id": "p2", "latitude": -22.9068, "longitude": -43.1829, "peso_kg": 12.0, "volume_m3": 0.6},
        ],
        veiculos=[
            {"veiculo_id": "v1", "capacidade_kg": 100000, "capacidade_m3": 5},
            {"veiculo_id": "v2", "capacidade_kg": 100000, "capacidade_m3": 5},
        ],
        tempo_parada_min=30,
    )
    resposta = asyncio.run(S.otimizar_vrptw(req, matriz_fn=_resolver_matriz, rota_fn=_rota_stub))
    assert resposta.status == "otimizado"
    assert len(resposta.veiculos) == 2
    ids_entregas = {p for r in resposta.veiculos for p in r.paradas}
    assert ids_entregas == {"p2"}


def test_endpoint_rota_otimizar_retorna_contrato_valido(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app

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
                    "custo": 0.0,
                    "geometria": [[10.0, -20.0]],
                }
            ],
            total_paradas=1,
        )

    monkeypatch.setattr("app.solver.otimizar_vrptw", fake_otimizar)

    client = TestClient(app)
    resp = client.post(
        "/rota/otimizar",
        json={
            "org_id": "org-teste",
            "pontos": [
                {"node_id": "p1", "latitude": -22.9068, "longitude": -43.1729, "peso_kg": 10.0, "volume_m3": 0.5},
                {"node_id": "p2", "latitude": -22.9068, "longitude": -43.1829, "peso_kg": 12.0, "volume_m3": 0.6},
            ],
            "veiculos": [{"veiculo_id": "v1", "capacidade_kg": 100, "capacidade_m3": 5}],
            "tempo_parada_min": 30,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["org_id"] == "org-teste"
    assert data["status"] == "otimizado"
    assert data["total_paradas"] == 1
    assert len(data["veiculos"]) == 1
