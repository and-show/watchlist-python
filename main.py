from datetime import datetime
import random

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from services.jikan import search_anime
from services.tmdb import search_movies

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Dados em memoria. Ao reiniciar o servidor, a lista volta a ficar vazia.
items_to_watch = {}
items_watched = {}


def item_key(title: str) -> str:
    return (title or "").strip().lower()


def normalize_person(person: str) -> str:
    aliases = {
        "and": "and",
        "lelet": "lelet",
    }
    return aliases.get(person, "and")


def normalize_item(item: dict) -> dict:
    """Mantem itens antigos compativeis com o modelo simples da watchlist."""
    item.setdefault("added_by", "and")
    item.setdefault("added_at", datetime.now().isoformat())
    item["watched"] = bool(item.get("watched"))
    if item["watched"]:
        item.setdefault("watched_at", item.get("added_at"))
    else:
        item["watched_at"] = None
    rating = item.get("rating")
    item["rating"] = rating if isinstance(rating, int) and 1 <= rating <= 5 else None
    return item


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")


@app.get("/search")
def search(q: str):
    return search_movies(q) + search_anime(q)


@app.get("/list")
def get_list():
    return [normalize_item(item) for item in items_to_watch.values()]


@app.get("/watched")
def get_watched():
    return [normalize_item(item) for item in items_watched.values()]


@app.get("/random")
def get_random_item():
    if not items_to_watch:
        return {"status": "error", "message": "Nenhum item para sortear"}

    random_item = random.choice(list(items_to_watch.values()))
    return {"status": "ok", "item": normalize_item(random_item)}


@app.post("/add")
def add(item: dict):
    key = item_key(item.get("title"))
    added_by = normalize_person(item.get("added_by") or item.get("user"))

    if not key:
        return {"status": "error", "message": "Titulo invalido"}

    if key in items_to_watch or key in items_watched:
        return {"status": "error", "message": "Ja esta na lista"}

    item_data = {
        "title": item.get("title"),
        "poster": item.get("poster") or "",
        "type": item.get("type") or "desconhecido",
        "added_at": datetime.now().isoformat(),
        "added_by": added_by,
        "watched": False,
        "watched_at": None,
        "rating": None,
    }

    items_to_watch[key] = item_data
    return {"status": "ok", "item": item_data}


@app.post("/update")
def update_item(data: dict):
    key = item_key(data.get("title"))
    item = items_to_watch.get(key) or items_watched.get(key)

    if not item:
        return {"status": "error", "message": "Item nao encontrado"}

    normalize_item(item)

    if "watched" in data:
        item["watched"] = bool(data.get("watched"))
        item["watched_at"] = datetime.now().isoformat() if item["watched"] else None

        if item["watched"] and key in items_to_watch:
            items_watched[key] = items_to_watch.pop(key)
        elif not item["watched"] and key in items_watched:
            items_to_watch[key] = items_watched.pop(key)

    if "rating" in data:
        rating = data.get("rating")
        item["rating"] = rating if isinstance(rating, int) and 1 <= rating <= 5 else None

    return {"status": "ok", "item": item}


@app.post("/delete")
def delete_item(data: dict):
    key = item_key(data.get("title"))

    if key in items_to_watch:
        del items_to_watch[key]
        return {"status": "ok"}

    if key in items_watched:
        del items_watched[key]
        return {"status": "ok"}

    return {"status": "error", "message": "Item nao encontrado"}


@app.post("/watch")
def mark_watched(item: dict):
    key = item_key(item.get("title"))

    if key in items_to_watch:
        watched_item = normalize_item(items_to_watch.pop(key))
        watched_item["watched"] = True
        watched_item["watched_at"] = datetime.now().isoformat()
        items_watched[key] = watched_item
        return {"status": "ok"}

    return {"status": "error", "message": "Item nao encontrado"}
