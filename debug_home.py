import sys
sys.path.insert(0, '.')

from starlette.testclient import TestClient
from main import app

client = TestClient(app)
response = client.get("/")
print(f"Status: {response.status_code}")
print(f"Response: {response.text[:500]}")

if response.status_code != 200:
    # Mostrar o traceback completo
    import json
    try:
        data = json.loads(response.text)
        if "detail" in data:
            print(f"\nDetail: {data['detail']}")
    except:
        pass
