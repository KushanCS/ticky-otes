import json
import os
from pathlib import Path
from typing import Any, Dict, List

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

app = Flask(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "message": "AI Branch Cards backend is running",
        "model": GEMINI_MODEL
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model": GEMINI_MODEL,
        "geminiConfigured": bool(GEMINI_API_KEY)
    })


def require_gemini_api_key():
    if GEMINI_API_KEY:
        return

    raise Exception("Missing GEMINI_API_KEY in backend/.env")


def parse_json_response(raw_text: str) -> Dict[str, Any]:
    cleaned = raw_text.strip()

    if cleaned.startswith("```") and cleaned.endswith("```"):
        lines = cleaned.splitlines()
        if len(lines) >= 3:
            cleaned = "\n".join(lines[1:-1]).strip()

    return json.loads(cleaned)


def gemini_generate(contents):
    require_gemini_api_key()

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent"
    )

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
    }

    payload = {
        "contents": contents
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=60)
        try:
            data = response.json()
        except ValueError:
            data = {}

        if response.status_code != 200:
            error_msg = data.get("error", {}).get("message", "") or response.text.strip()

            if response.status_code == 429:
                raise Exception(
                    "⚠️ Your API quota is exhausted. Please check your plan or wait and try again."
                )

            if response.status_code == 401:
                raise Exception("🔑 Invalid API key. Please check your API key.")

            if "quota" in error_msg.lower():
                raise Exception("⚠️ You have reached your API limit.")

            raise Exception("⚠️ AI service error. Please try again later.")

        candidates = data.get("candidates", [])
        if not candidates:
            raise Exception("⚠️ No response from AI.")

        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(part.get("text", "") for part in parts).strip()

        if not text:
            raise Exception("⚠️ Empty response from AI.")

        return text

    except requests.exceptions.ConnectionError:
        raise Exception("🌐 Cannot connect to AI server.")

    except requests.exceptions.Timeout:
        raise Exception("⏳ Request timed out. Try again.")

    except Exception as e:
        raise Exception(str(e))


@app.route("/summarize-card-context", methods=["POST", "OPTIONS"])
def summarize_card_context():
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(force=True)

    selected_text = (data.get("selectedText") or "").strip()
    parent_context = (data.get("parentContext") or "").strip()

    if not selected_text:
        return jsonify({"error": "Selected text is required"}), 400

    prompt = f"""
You are generating context for a branch card created from an AI conversation.

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
- Keep the title short
- Keep the summary simple and useful
- keyPoints must have 3 to 5 short points
- Focus only on what helps explain the selected text
- Return JSON only
""".strip()

    try:
        answer = gemini_generate([
            {
                "role": "user",
                "parts": [{"text": prompt}]
            }
        ])

        parsed = parse_json_response(answer)

        return jsonify({
            "title": parsed.get("title", "New Branch Card"),
            "summary": parsed.get("summary", ""),
            "keyPoints": parsed.get("keyPoints", [])
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/chat", methods=["POST", "OPTIONS"])
def chat():
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(force=True)

    selected_text = (data.get("selectedText") or "").strip()
    parent_summary = (data.get("parentSummary") or "").strip()
    key_points = data.get("keyPoints") or []
    card_messages = data.get("messages") or []
    user_question = (data.get("question") or "").strip()

    if not user_question:
        return jsonify({"error": "Question is required"}), 400

    key_points_text = "\n".join(f"- {point}" for point in key_points)

    system_context = f"""
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
- Use examples only when helpful
- Keep the answer concise
""".strip()

    contents: List[Dict[str, Any]] = [
        {
            "role": "user",
            "parts": [{"text": system_context}]
        }
    ]

    for msg in card_messages[-6:]:
        role = msg.get("role", "user")
        content = (msg.get("content") or "").strip()

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
        answer = gemini_generate(contents)
        return jsonify({"answer": answer})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
