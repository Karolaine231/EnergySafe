from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone

import models
import schemas
from database import get_db

router = APIRouter(prefix="/alertas", tags=["Alertas"])


@router.get("/", response_model=List[schemas.AlertaOut])
def listar_alertas(
    canal_id:  Optional[int]  = Query(None),
    nivel:     Optional[str]  = Query(None),   # info, aviso, critico
    tipo:      Optional[str]  = Query(None),   # sobrecorrente, consumo_fora_horario, queda_brusca
    resolvido: Optional[bool] = Query(None),
    skip:  int = Query(0, ge=0),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
):
    """
    Lista alertas gerados pelos triggers do PostgreSQL.
    Filtre por canal, nível, tipo ou status de resolução.
    """
    query = db.query(models.Alerta)

    if canal_id is not None:
        query = query.filter(models.Alerta.canal_id == canal_id)
    if nivel:
        query = query.filter(models.Alerta.nivel == nivel.lower())
    if tipo:
        query = query.filter(models.Alerta.tipo == tipo.lower())
    if resolvido is not None:
        query = query.filter(models.Alerta.resolvido == resolvido)

    return query.order_by(models.Alerta.timestamp.desc()).offset(skip).limit(limit).all()


@router.get("/{alerta_id}", response_model=schemas.AlertaOut)
def obter_alerta(alerta_id: int, db: Session = Depends(get_db)):
    alerta = db.query(models.Alerta).filter(models.Alerta.id == alerta_id).first()
    if not alerta:
        raise HTTPException(status_code=404, detail="Alerta não encontrado.")
    return alerta


@router.patch("/{alerta_id}/resolver", response_model=schemas.AlertaOut)
def resolver_alerta(alerta_id: int, db: Session = Depends(get_db)):
    alerta = db.query(models.Alerta).filter(models.Alerta.id == alerta_id).first()
    if not alerta:
        raise HTTPException(status_code=404, detail="Alerta não encontrado.")
    if alerta.resolvido:
        raise HTTPException(status_code=400, detail="Alerta já foi resolvido.")
    alerta.resolvido = True
    db.commit()
    db.refresh(alerta)
    return alerta


@router.post("/", response_model=schemas.AlertaOut, status_code=201)
def criar_alerta_manual(alerta: schemas.AlertaCreate, db: Session = Depends(get_db)):
    """
    Criação manual de alerta (os triggers já fazem isso automaticamente).
    Use apenas para casos que não são cobertos pelos triggers.
    """
    canal = db.query(models.CanalMedicao).filter(
        models.CanalMedicao.id == alerta.canal_id
    ).first()
    if not canal:
        raise HTTPException(status_code=404, detail="Canal de medição não encontrado.")

    db_alerta = models.Alerta(**alerta.model_dump())
    db.add(db_alerta)
    db.commit()
    db.refresh(db_alerta)
    return db_alerta


@router.delete("/{alerta_id}", status_code=204)
def deletar_alerta(alerta_id: int, db: Session = Depends(get_db)):
    alerta = db.query(models.Alerta).filter(models.Alerta.id == alerta_id).first()
    if not alerta:
        raise HTTPException(status_code=404, detail="Alerta não encontrado.")
    db.delete(alerta)
    db.commit()