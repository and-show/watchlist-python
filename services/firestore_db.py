import os
import json
import firebase_admin

from firebase_admin import credentials
from firebase_admin import firestore

if not firebase_admin._apps:

    firebase_credentials = os.getenv("FIREBASE_CREDENTIALS")

    if firebase_credentials:
        cred_dict = json.loads(firebase_credentials)
        cred = credentials.Certificate(cred_dict)
    else:
        cred = credentials.Certificate("firebase.json")

    firebase_admin.initialize_app(cred)

db = firestore.client()