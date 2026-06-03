from datetime import datetime
from typing import Optional
import random

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, field_validator

from services.firestore_db import db
from services.jikan import search_anime
from services.tmdb import search_movies

app = FastAPI(title="Lero-Lero & Nhenhenhe", version="2.0")

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


# ── CONSTANTS ─────────────────────────────────────────────────────────────────

VALID_USERS = {"and", "lelet"}
VALID_TYPES = {"Filme", "Série", "Anime"}


# ── MODELS ────────────────────────────────────────────────────────────────────

class AddItemRequest(BaseModel):
    title: str
    poster: str = ""
    type: str = "Filme"
    year: str = ""
    added_by: str = "and"

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Título não pode ser vazio")
        return v

    @field_validator("added_by")
    @classmethod
    def normalize_user(cls, v: str) -> str:
        normalized = (v or "").strip().lower()
        return normalized if normalized in VALID_USERS else "and"

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        return v if v in VALID_TYPES else "Filme"


class WatchItemRequest(BaseModel):
    title: str

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Título não pode ser vazio")
        return v.strip()


class UnwatchItemRequest(BaseModel):
    title: str


class UpdateItemRequest(BaseModel):
    title: str
    rating: Optional[float] = None

    @field_validator("rating")
    @classmethod
    def rating_range(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and not (1 <= v <= 5):
            raise ValueError("Nota deve ser entre 1 e 5")
        return v


class DeleteItemRequest(BaseModel):
    title: str


# ── HELPERS ───────────────────────────────────────────────────────────────────

def item_key(title: str) -> str:
    """Normalised Firestore document key from title."""
    return (title or "").strip().lower()


def raise_err(message: str, code: int = 400):
    raise HTTPException(status_code=code, detail={"status": "error", "message": message})


# ── ROUTES ────────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")


@app.get("/search")
def search(q: str = Query(..., min_length=1)):
    """
    Busca TMDB (filmes + séries) e Jikan (anime) simultaneamente.
    Deduplica por título normalizado para evitar duplicatas.
    """
    results = search_movies(q) + search_anime(q)
    seen, deduped = set(), []
    for r in results:
        key = item_key(r.get("title", ""))
        if key and key not in seen:
            seen.add(key)
            deduped.append(r)
    return deduped


@app.get("/list")
def get_list():
    """Retorna todos os itens ainda não assistidos, do mais recente ao mais antigo."""
    docs = db.collection("watchlist").stream()
    items = [doc.to_dict() for doc in docs]
    items.sort(key=lambda x: x.get("added_at") or "", reverse=True)
    return items


@app.get("/watched")
def get_watched():
    """Retorna todos os itens assistidos, do mais recente ao mais antigo."""
    docs = db.collection("watched").stream()
    items = [doc.to_dict() for doc in docs]
    items.sort(key=lambda x: x.get("watched_at") or "", reverse=True)
    return items


@app.get("/stats")
def get_stats():
    """Agrega estatísticas para os contadores do dashboard."""
    watchlist = [d.to_dict() for d in db.collection("watchlist").stream()]
    watched   = [d.to_dict() for d in db.collection("watched").stream()]
    rated     = [w for w in watched if w.get("rating") is not None]
    avg_rating = (
        round(sum(w["rating"] for w in rated) / len(rated), 1) if rated else None
    )
    by_type: dict[str, int] = {}
    for item in watchlist + watched:
        t = item.get("type", "Outro")
        by_type[t] = by_type.get(t, 0) + 1

    by_user: dict[str, int] = {}
    for item in watchlist + watched:
        u = item.get("added_by", "?")
        by_user[u] = by_user.get(u, 0) + 1

    return {
        "pending":    len(watchlist),
        "watched":    len(watched),
        "avg_rating": avg_rating,
        "by_type":    by_type,
        "by_user":    by_user,
    }


@app.get("/random")
def get_random_item(
    type:     Optional[str] = Query(None),
    added_by: Optional[str] = Query(None),
):
    """
    Sorteia um item não assistido.
    Filtros opcionais: ?type=Anime  |  ?added_by=lelet
    """
    docs  = db.collection("watchlist").stream()
    items = [doc.to_dict() for doc in docs]

    if type:
        items = [i for i in items if i.get("type") == type]
    if added_by:
        items = [i for i in items if i.get("added_by") == added_by]

    if not items:
        raise_err("Nenhum item para sortear com esses filtros", 404)

    return {"status": "ok", "item": random.choice(items)}


@app.post("/add", status_code=201)
def add(req: AddItemRequest):
    """
    Adiciona um item à watchlist.
    Retorna erro se o título já existir em qualquer coleção.
    """
    key = item_key(req.title)

    if db.collection("watchlist").document(key).get().exists:
        raise_err("Já está na lista para assistir")
    if db.collection("watched").document(key).get().exists:
        raise_err("Já foi assistido")

    now = datetime.now().isoformat()
    item_data = {
        "title":      req.title,
        "poster":     req.poster,
        "type":       req.type,
        "year":       req.year,
        "added_by":   req.added_by,
        "added_at":   now,
        "watched":    False,
        "watched_at": None,
        "rating":     None,
    }

    db.collection("watchlist").document(key).set(item_data)
    return {"status": "ok", "item": item_data}


@app.post("/watch")
def mark_watched(req: WatchItemRequest):
    """Move um item de watchlist → watched."""
    key = item_key(req.title)
    doc = db.collection("watchlist").document(key).get()

    if not doc.exists:
        raise_err("Item não encontrado na lista", 404)

    data = doc.to_dict()
    data["watched"]    = True
    data["watched_at"] = datetime.now().isoformat()

    db.collection("watched").document(key).set(data)
    db.collection("watchlist").document(key).delete()

    return {"status": "ok", "item": data}


@app.post("/unwatch")
def unmark_watched(req: UnwatchItemRequest):
    """Move um item de watched → watchlist (desfaz o 'assistido')."""
    key = item_key(req.title)
    doc = db.collection("watched").document(key).get()

    if not doc.exists:
        raise_err("Item não encontrado nos assistidos", 404)

    data = doc.to_dict()
    data["watched"]    = False
    data["watched_at"] = None

    db.collection("watchlist").document(key).set(data)
    db.collection("watched").document(key).delete()

    return {"status": "ok", "item": data}


@app.post("/update")
def update_item(req: UpdateItemRequest):
    """
    Atualiza campos mutáveis (atualmente: rating).
    FIX: não altera 'watched' — use /watch e /unwatch para isso.
    """
    key = item_key(req.title)

    doc        = db.collection("watchlist").document(key).get()
    collection = "watchlist"
    if not doc.exists:
        doc        = db.collection("watched").document(key).get()
        collection = "watched"
    if not doc.exists:
        raise_err("Item não encontrado", 404)

    item = doc.to_dict()
    if req.rating is not None:
        item["rating"] = req.rating

    db.collection(collection).document(key).set(item)
    return {"status": "ok", "item": item}


@app.post("/delete")
def delete_item(req: DeleteItemRequest):
    """Remove um item de ambas as coleções (seguro mesmo se ausente)."""
    key = item_key(req.title)
    db.collection("watchlist").document(key).delete()
    db.collection("watched").document(key).delete()
    return {"status": "ok"}