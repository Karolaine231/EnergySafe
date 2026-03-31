from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

import models
import schemas
from database import get_db

router = APIRouter(prefix="/dispositivos", tags=["Dispositivos"])


@router.get("/", response_model=List[schemas.DispositivoOut])
def listar_dispositivos(
    quadro_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(models.Dispositivo)
    if quadro_id:
        query = query.filter(models.Dispositivo.quadro_id == quadro_id)
    return query.order_by(models.Dispositivo.nome).all()


@router.get("/{dispositivo_id}", response_model=schemas.DispositivoOut)
def obter_dispositivo(dispositivo_id: int, db: Session = Depends(get_db)):
    dispositivo = db.query(models.Dispositivo).filter(models.Dispositivo.id == dispositivo_id).first()
    if not dispositivo:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado.")
    return dispositivo


@router.post("/", response_model=schemas.DispositivoOut, status_code=201)
def criar_dispositivo(dispositivo: schemas.DispositivoCreate, db: Session = Depends(get_db)):
    quadro = db.query(models.Quadro).filter(models.Quadro.id == dispositivo.quadro_id).first()
    if not quadro:
        raise HTTPException(status_code=404, detail="Quadro não encontrado.")

    db_dispositivo = models.Dispositivo(**dispositivo.model_dump())
    db.add(db_dispositivo)
    db.commit()
    db.refresh(db_dispositivo)
    return db_dispositivo


@router.patch("/{dispositivo_id}/status", response_model=schemas.DispositivoOut)
def atualizar_status(dispositivo_id: int, ativo: bool, db: Session = Depends(get_db)):
    dispositivo = db.query(models.Dispositivo).filter(models.Dispositivo.id == dispositivo_id).first()
    if not dispositivo:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado.")
    dispositivo.ativo = ativo
    db.commit()
    db.refresh(dispositivo)
    return dispositivo


@router.delete("/{dispositivo_id}", status_code=204)
def deletar_dispositivo(dispositivo_id: int, db: Session = Depends(get_db)):
    dispositivo = db.query(models.Dispositivo).filter(models.Dispositivo.id == dispositivo_id).first()
    if not dispositivo:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado.")
    db.delete(dispositivo)
    db.commit()