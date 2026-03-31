from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

import models
import schemas
from database import get_db

router = APIRouter(prefix="/medicoes", tags=["Medições"])

# ── limites configuráveis ────────────────────────────────────────────────────
LIMITE_SOBRECORRENTE = 40.0   # Amperes
LIMITE_FORA_HORARIO  = 10.0   # Amperes (acima disso fora do horário = alerta)
HORA_INICIO          = 6      # início do horário permitido
HORA_FIM             = 22     # fim do horário permitido
QUEDA_FATOR          = 0.3    # queda abaixo de 30% da leitura anterior = alerta


def _verificar_alertas(db: Session, medicao: models.Medicao):
    """
    Verifica as 3 regras de alerta após uma medição ser inserida.
    Equivale às triggers removidas do PostgreSQL.
    """
    alertas_novos = []

    corrente  = medicao.corrente
    canal_id  = medicao.canal_id
    timestamp = medicao.timestamp

    if corrente is None:
        return

    # 1. Sobrecorrente
    if corrente > LIMITE_SOBRECORRENTE:
        alertas_novos.append(models.Alerta(
            canal_id  = canal_id,
            tipo      = "sobrecorrente",
            nivel     = "critico",
            mensagem  = "Corrente acima do limite",
            valor     = corrente,
            limite    = LIMITE_SOBRECORRENTE,
            timestamp = timestamp,
        ))

    # 2. Consumo fora do horário
    hora = timestamp.hour
    if corrente > LIMITE_FORA_HORARIO and (hora < HORA_INICIO or hora >= HORA_FIM):
        alertas_novos.append(models.Alerta(
            canal_id  = canal_id,
            tipo      = "consumo_fora_horario",
            nivel     = "aviso",
            mensagem  = "Consumo detectado fora do horário",
            valor     = corrente,
            limite    = LIMITE_FORA_HORARIO,
            timestamp = timestamp,
        ))

    # 3. Queda brusca de corrente (compara com a leitura anterior do mesmo canal)
    anterior = (
        db.query(models.Medicao)
        .filter(
            models.Medicao.canal_id  == canal_id,
            models.Medicao.id        != medicao.id,
            models.Medicao.corrente  != None,
        )
        .order_by(models.Medicao.timestamp.desc())
        .first()
    )

    if anterior and anterior.corrente and corrente < anterior.corrente * QUEDA_FATOR:
        alertas_novos.append(models.Alerta(
            canal_id  = canal_id,
            tipo      = "queda_brusca",
            nivel     = "aviso",
            mensagem  = "Queda brusca de corrente detectada",
            valor     = corrente,
            limite    = anterior.corrente,
            timestamp = timestamp,
        ))

    for alerta in alertas_novos:
        db.add(alerta)

    if alertas_novos:
        db.commit()


# ── endpoints ────────────────────────────────────────────────────────────────

@router.post("/", response_model=schemas.MedicaoOut, status_code=201)
def criar_medicao(medicao: schemas.MedicaoCreate, db: Session = Depends(get_db)):
    if medicao.canal_id:
        canal = db.query(models.CanalMedicao).filter(
            models.CanalMedicao.id == medicao.canal_id
        ).first()
        if not canal:
            raise HTTPException(status_code=404, detail="Canal de medição não encontrado.")

    dados = medicao.model_dump()

    # Calcula potência automaticamente se não enviada (P = I × V)
    if dados.get("potencia") is None and dados.get("corrente") and dados.get("tensao"):
        dados["potencia"] = dados["corrente"] * dados["tensao"]

    db_medicao = models.Medicao(**dados)
    db.add(db_medicao)
    db.commit()
    db.refresh(db_medicao)

    # Verifica regras de alerta após inserção
    _verificar_alertas(db, db_medicao)

    return db_medicao


@router.get("/", response_model=List[schemas.MedicaoOut])
def listar_medicoes(
    canal_id: Optional[int]      = Query(None),
    inicio:   Optional[datetime] = Query(None),
    fim:      Optional[datetime] = Query(None),
    valido:   Optional[bool]     = Query(None),
    skip:     int                = Query(0, ge=0),
    limit:    int                = Query(100, le=1000),
    db: Session = Depends(get_db),
):
    query = db.query(models.Medicao)

    if canal_id is not None:
        query = query.filter(models.Medicao.canal_id == canal_id)
    if inicio:
        query = query.filter(models.Medicao.timestamp >= inicio)
    if fim:
        query = query.filter(models.Medicao.timestamp <= fim)
    if valido is not None:
        query = query.filter(models.Medicao.valido == valido)

    return query.order_by(models.Medicao.timestamp.desc()).offset(skip).limit(limit).all()


@router.get("/{medicao_id}", response_model=schemas.MedicaoOut)
def obter_medicao(medicao_id: int, db: Session = Depends(get_db)):
    medicao = db.query(models.Medicao).filter(models.Medicao.id == medicao_id).first()
    if not medicao:
        raise HTTPException(status_code=404, detail="Medição não encontrada.")
    return medicao


@router.delete("/{medicao_id}", status_code=204)
def deletar_medicao(medicao_id: int, db: Session = Depends(get_db)):
    medicao = db.query(models.Medicao).filter(models.Medicao.id == medicao_id).first()
    if not medicao:
        raise HTTPException(status_code=404, detail="Medição não encontrada.")
    db.delete(medicao)
    db.commit()