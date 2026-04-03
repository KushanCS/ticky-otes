import os
import json
import requests
from dotenv import load_dotenv
from flask import Flask, request, jsonify

load_dotenv()

app = Flask(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

if not GEMINI_API_KEY:
    raise ValueError("Missing GEMINI_API_KEY in .env")


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    return response


@app.route("/", methods=["GET"])
def home():
    return "Backend is running"


def call_gemini(contents):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
    }

    payload = {
        "contents": contents
    }

    response = requests.post(url, headers=headers, json=payload, timeout=60)
    data = response.json()

    if response.status_code != 200:
        raise Exception(json.dumps(data))

    candidates = data.get("candidates", [])
    if not candidates:
        raise Exception("No response candidates returned.")

    parts = candidates[0].get("content", {}).get("parts", [])
    answer = ""

    for part in parts:
        if "text" in part:
            answer += part["text"]

    return answer.strip()


@app.route("/summarize-card-context", methods=["POST", "OPTIONS"])
def summarize_card_context():
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(force=True)

    selected_text = data.get("selectedText", "").strip()
    parent_context = data.get("parentContext", "").strip()

    if not selected_text:
        return jsonify({"error": "Selected text is required"}), 400

    prompt = f"""
You are generating context for a child branch card from an AI conversation.

Selected text:
{selected_text}

Parent chat context:
{parent_context}

Return ONLY valid JSON in this exact format:
{{
  "title": "short title",
  "summary": "2-3 sentence summary",
  "keyPoints": ["point 1", "point 2", "point 3"]
}}

Rules:
- Keep title short
- Keep summary simple and useful
- keyPoints should have 3 to 5 short points
- Focus only on what helps understand the selected text
- Return JSON only, no markdown
""".strip()

    try:
        answer = call_gemini([
            {
                "role": "user",
                "parts": [{"text": prompt}]
            }
        ])

        parsed = json.loads(answer)

        return jsonify({
            "title": parsed.get("title", "New Branch Card"),
            "summary": parsed.get("summary", ""),
            "keyPoints": parsed.get("keyPoints", [])
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/chat", methods=["POST", "OPTIONS"])
def chat():
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(force=True)

    selected_text = data.get("selectedText", "").strip()
    parent_summary = data.get("parentSummary", "").strip()
    key_points = data.get("keyPoints", [])
    card_messages = data.get("messages", [])
    user_question = data.get("question", "").strip()

    if not user_question:
        return jsonify({"error": "Question is required"}), 400

    key_points_text = "\n".join([f"- {point}" for point in key_points])

    contents = [
        {
            "role": "user",
            "parts": [{
                "text": f"""
You are helping a user understand part of an AI conversation.

Selected text:
{selected_text}

Parent summary:
{parent_summary}

Important points:
{key_points_text}

Instructions:
- Answer clearly and simply
- Stay focused on the selected text
- Use examples if helpful
- Keep it concise
""".strip()
            }]
        }
    ]

    for msg in card_messages[-6:]:
        role = msg.get("role", "user")
        content = msg.get("content", "").strip()
        if not content:
            continue

        gemini_role = "model" if role == "assistant" else "user"
        contents.append({
            "role": gemini_role,
            "parts": [{"text": content}]
        })

    contents.append({
        "role": "user",
        "parts": [{"text": user_question}]
    })

    try:
        answer = call_gemini(contents)
        return jsonify({"answer": answer})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)