from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

import models
import schemas
from database import get_db

router = APIRouter(prefix="/locais", tags=["Locais"])


@router.get("/", response_model=List[schemas.LocalOut])
def listar_locais(db: Session = Depends(get_db)):
    return db.query(models.Local).order_by(models.Local.nome).all()


@router.get("/{local_id}", response_model=schemas.LocalOut)
def obter_local(local_id: int, db: Session = Depends(get_db)):
    local = db.query(models.Local).filter(models.Local.id == local_id).first()
    if not local:
        raise HTTPException(status_code=404, detail="Local não encontrado.")
    return local


@router.post("/", response_model=schemas.LocalOut, status_code=201)
def criar_local(local: schemas.LocalCreate, db: Session = Depends(get_db)):
    db_local = models.Local(**local.model_dump())
    db.add(db_local)
    db.commit()
    db.refresh(db_local)
    return db_local


@router.delete("/{local_id}", status_code=204)
def deletar_local(local_id: int, db: Session = Depends(get_db)):
    local = db.query(models.Local).filter(models.Local.id == local_id).first()
    if not local:
        raise HTTPException(status_code=404, detail="Local não encontrado.")
    db.delete(local)
    db.commit()