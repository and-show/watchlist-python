from firebase_config import db

db.collection("teste").add({
    "nome": "Antonio",
    "status": "funcionando"
})

print("Documento criado com sucesso!")