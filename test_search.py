#!/usr/bin/env python3
import sys
sys.path.insert(0, '.')

from services.tmdb import search_movies
from services.jikan import search_anime

print("Testing TMDB search...")
try:
    result = search_movies("test")
    print(f"✓ TMDB result: {result}")
except Exception as e:
    print(f"✗ TMDB error: {type(e).__name__}: {e}")

print("\nTesting Jikan search...")
try:
    result = search_anime("test")
    print(f"✓ Jikan result: {result}")
except Exception as e:
    print(f"✗ Jikan error: {type(e).__name__}: {e}")

print("\nTesting combined search...")
try:
    result = search_movies("test") + search_anime("test")
    print(f"✓ Combined result count: {len(result)}")
except Exception as e:
    print(f"✗ Combined error: {type(e).__name__}: {e}")
