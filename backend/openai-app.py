import json
import os
from pathlib import Path
from typing import Any, Dict, List

from dotenv import load_dotenv
from flask import Flask, request, jsonify
from openai import OpenAI

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

app = Flask(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5-mini").strip()

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "message": "AI Branch Cards backend (OpenAI) running",
        "model": OPENAI_MODEL
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model": OPENAI_MODEL,
        "openaiConfigured": bool(OPENAI_API_KEY)
    })


def get_client() -> OpenAI:
    if not OPENAI_API_KEY:
        raise Exception("Missing OPENAI_API_KEY in backend/.env")

    return OpenAI(api_key=OPENAI_API_KEY)


def parse_json_response(raw_text: str) -> Dict[str, Any]:
    cleaned = raw_text.strip()

    if cleaned.startswith("```") and cleaned.endswith("```"):
        lines = cleaned.splitlines()
        if len(lines) >= 3:
            cleaned = "\n".join(lines[1:-1]).strip()

    return json.loads(cleaned)


def openai_generate(prompt: str) -> str:
    client = get_client()
    response = client.responses.create(
        model=OPENAI_MODEL,
        input=prompt
    )

    return response.output_text.strip()

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
- Keep title short
- Summary simple and useful
- keyPoints = 3 to 5 points
- Focus only on explaining selected text
- Return JSON ONLY
""".strip()

    try:
        answer = openai_generate(prompt)

        parsed = parse_json_response(answer)

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

    selected_text = (data.get("selectedText") or "").strip()
    parent_summary = (data.get("parentSummary") or "").strip()
    key_points = data.get("keyPoints") or []
    messages = data.get("messages") or []
    question = (data.get("question") or "").strip()

    if not question:
        return jsonify({"error": "Question required"}), 400

    key_points_text = "\n".join(f"- {p}" for p in key_points)

    context_prompt = f"""
You are helping a user understand part of an AI conversation.

Selected text:
{selected_text}

Parent summary:
{parent_summary}

Important points:
{key_points_text}

Instructions:
- Answer clearly
- Keep it simple
- Stay focused on selected text
- Use examples if helpful
- Be concise
""".strip()

    try:
        history_text = ""
        for msg in messages[-6:]:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            history_text += f"{role.upper()}: {content}\n"

        final_prompt = f"""
{context_prompt}

Conversation:
{history_text}

User question:
{question}
""".strip()

        answer = openai_generate(final_prompt)

        return jsonify({"answer": answer})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
