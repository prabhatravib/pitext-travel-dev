from flask import Flask
from .api.chat import bp_chat     # new import

def create_app():
    app = Flask(__name__)

    app.register_blueprint(bp_chat)
    return app
# This file makes src a Python package
