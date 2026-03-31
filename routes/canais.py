from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

import models
import schemas
from database import get_db

router = APIRouter(prefix="/canais", tags=["Canais de Medição"])


@router.get("/", response_model=List[schemas.CanalMedicaoOut])
def listar_canais(
    quadro_id: Optional[int] = Query(None),
    dispositivo_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(models.CanalMedicao)

    if dispositivo_id:
        query = query.filter(models.CanalMedicao.dispositivo_id == dispositivo_id)
    elif quadro_id:
        # retorna canais de todos os dispositivos do quadro
        dispositivos = db.query(models.Dispositivo.id).filter(
            models.Dispositivo.quadro_id == quadro_id
        ).subquery()
        query = query.filter(models.CanalMedicao.dispositivo_id.in_(dispositivos))

    return query.order_by(models.CanalMedicao.nome).all()


@router.get("/{canal_id}", response_model=schemas.CanalMedicaoOut)
def obter_canal(canal_id: int, db: Session = Depends(get_db)):
    canal = db.query(models.CanalMedicao).filter(models.CanalMedicao.id == canal_id).first()
    if not canal:
        raise HTTPException(status_code=404, detail="Canal não encontrado.")
    return canal


@router.post("/", response_model=schemas.CanalMedicaoOut, status_code=201)
def criar_canal(canal: schemas.CanalMedicaoCreate, db: Session = Depends(get_db)):
    dispositivo = db.query(models.Dispositivo).filter(
        models.Dispositivo.id == canal.dispositivo_id
    ).first()
    if not dispositivo:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado.")

    db_canal = models.CanalMedicao(**canal.model_dump())
    db.add(db_canal)
    db.commit()
    db.refresh(db_canal)
    return db_canal


@router.delete("/{canal_id}", status_code=204)
def deletar_canal(canal_id: int, db: Session = Depends(get_db)):
    canal = db.query(models.CanalMedicao).filter(models.CanalMedicao.id == canal_id).first()
    if not canal:
        raise HTTPException(status_code=404, detail="Canal não encontrado.")
    db.delete(canal)
    db.commit()