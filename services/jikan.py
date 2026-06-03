import requests


def search_anime(query: str) -> list[dict]:
    url = "https://api.jikan.moe/v4/anime"
    params = {"q": query, "limit": 5}

    try:
        response = requests.get(url, params=params, timeout=8)
        response.raise_for_status()
        data = response.json()
    except requests.RequestException:
        return []

    results = []
    for anime in data.get("data", []):
        # FIX: prefere título em inglês; cai para japonês/romanizado se não tiver
        title = anime.get("title_english") or anime.get("title")
        if not title:
            continue

        images = anime.get("images", {}).get("jpg", {})

        # FIX: type capitalizado e consistente com o resto do sistema
        # FIX: salva year
        year = str(anime.get("year") or "")

        results.append({
            "title": title,
            "poster": images.get("large_image_url") or images.get("image_url") or "",
            "type": "Anime",
            "year": year,
        })

    return results