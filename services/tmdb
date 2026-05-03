import requests

API_KEY = "2f42b1038510ec938b171e1b2b909627"


def search_movies(query):
    url = "https://api.themoviedb.org/3/search/multi"
    params = {"api_key": API_KEY, "query": query, "language": "pt-BR"}

    try:
        response = requests.get(url, params=params, timeout=8)
        response.raise_for_status()
        data = response.json()
    except requests.RequestException:
        return []

    results = []
    for item in data.get("results", []):
        title = item.get("title") or item.get("name")
        media_type = item.get("media_type")

        if not title or media_type not in {"movie", "tv"}:
            continue

        poster_path = item.get("poster_path")
        results.append({
            "title": title,
            "poster": f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else "",
            "type": "filme" if media_type == "movie" else "serie",
        })

    return results
