import requests


def search_anime(query):
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
        title = anime.get("title")
        images = anime.get("images", {}).get("jpg", {})

        if not title:
            continue

        results.append({
            "title": title,
            "poster": images.get("image_url", ""),
            "type": "anime",
        })

    return results
