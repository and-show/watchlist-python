from datetime import datetime
import random

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from services.firestore_db import db
from services.jikan import search_anime
from services.tmdb import search_movies

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


def item_key(title: str) -> str:
    return (title or "").strip().lower()


def normalize_person(person: str) -> str:
    aliases = {
        "and": "and",
        "lelet": "lelet",
    }
    return aliases.get(person, "and")


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html"
    )


@app.get("/search")
def search(q: str):
    return search_movies(q) + search_anime(q)


@app.get("/list")
def get_list():
    docs = db.collection("watchlist").stream()
    return [doc.to_dict() for doc in docs]


@app.get("/watched")
def get_watched():
    docs = db.collection("watched").stream()
    return [doc.to_dict() for doc in docs]


@app.get("/random")
def get_random_item():
    docs = db.collection("watchlist").stream()
    items = [doc.to_dict() for doc in docs]

    if not items:
        return {
            "status": "error",
            "message": "Nenhum item para sortear"
        }

    return {
        "status": "ok",
        "item": random.choice(items)
    }


@app.post("/add")
def add(item: dict):

    key = item_key(item.get("title"))

    if not key:
        return {
            "status": "error",
            "message": "Título inválido"
        }

    doc_watch = db.collection("watchlist").document(key).get()
    doc_watched = db.collection("watched").document(key).get()

    if doc_watch.exists or doc_watched.exists:
        return {
            "status": "error",
            "message": "Já está na lista"
        }

    item_data = {
        "title": item.get("title"),
        "poster": item.get("poster", ""),
        "type": item.get("type", ""),
        "added_by": normalize_person(
            item.get("added_by") or item.get("user")
        ),
        "added_at": datetime.now().isoformat(),
        "watched": False,
        "watched_at": None,
        "rating": None,
    }

    db.collection("watchlist").document(key).set(item_data)

    return {
        "status": "ok",
        "item": item_data
    }


@app.post("/watch")
def mark_watched(item: dict):

    key = item_key(item.get("title"))

    doc = db.collection("watchlist").document(key).get()

    if not doc.exists:
        return {
            "status": "error",
            "message": "Item não encontrado"
        }

    data = doc.to_dict()

    data["watched"] = True
    data["watched_at"] = datetime.now().isoformat()

    db.collection("watched").document(key).set(data)
    db.collection("watchlist").document(key).delete()

    return {"status": "ok"}


@app.post("/update")
def update_item(data: dict):

    key = item_key(data.get("title"))

    doc = db.collection("watchlist").document(key).get()

    collection = "watchlist"

    if not doc.exists:
        doc = db.collection("watched").document(key).get()
        collection = "watched"

    if not doc.exists:
        return {
            "status": "error",
            "message": "Item não encontrado"
        }

    item = doc.to_dict()

    if "rating" in data:
        item["rating"] = data["rating"]

    db.collection(collection).document(key).set(item)

    return {
        "status": "ok",
        "item": item
    }


@app.post("/delete")
def delete_item(data: dict):

    key = item_key(data.get("title"))

    db.collection("watchlist").document(key).delete()
    db.collection("watched").document(key).delete()

    return {"status": "ok"}
