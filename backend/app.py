import os
import requests
from dotenv import load_dotenv
from flask import Flask, request, jsonify

load_dotenv()

app = Flask(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

if not GEMINI_API_KEY:
    raise ValueError("Missing GEMINI_API_KEY in .env")

@app.route("/", methods=["GET"])
def home():
    return "Backend is running"

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    return response


def build_contents(selected_text, card_messages, user_question):
    parts = []

    system_like_context = f"""
You are helping a user understand a selected part of an AI chat.

Selected text:
{selected_text}

Instructions:
- Answer clearly and simply.
- Stay focused on the selected text and the branch question.
- Use examples when helpful.
- Keep the answer concise but useful.
""".strip()

    parts.append({
        "role": "user",
        "parts": [{"text": system_like_context}]
    })

    # Add recent conversation history
    for msg in card_messages[-8:]:
        role = msg.get("role", "user")
        content = msg.get("content", "").strip()
        if not content:
            continue

        gemini_role = "model" if role == "assistant" else "user"
        parts.append({
            "role": gemini_role,
            "parts": [{"text": content}]
        })

    # Latest question
    parts.append({
        "role": "user",
        "parts": [{"text": user_question}]
    })

    return parts


@app.route("/chat", methods=["POST", "OPTIONS"])
def chat():
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(force=True)

    selected_text = data.get("selectedText", "").strip()
    card_messages = data.get("messages", [])
    user_question = data.get("question", "").strip()

    if not user_question:
        return jsonify({"error": "Question is required"}), 400

    contents = build_contents(selected_text, card_messages, user_question)

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
    }

    payload = {
        "contents": contents
    }



    try:
        response = requests.post(url, headers=headers, json=payload, timeout=60)
        data = response.json()

        if response.status_code != 200:
            return jsonify({"error": data}), response.status_code

        candidates = data.get("candidates", [])
        if not candidates:
            return jsonify({"error": "No response candidates returned."}), 500

        parts = candidates[0].get("content", {}).get("parts", [])
        answer = ""

        for part in parts:
            if "text" in part:
                answer += part["text"]

        answer = answer.strip()

        if not answer:
            answer = "Sorry, I could not generate a response."

        return jsonify({"answer": answer})

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)