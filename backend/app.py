import importlib.util
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def resolve_backend_file() -> Path:
    preferred_backend = os.getenv("AI_BRANCH_BACKEND", "").strip().lower()

    if preferred_backend == "openai":
        return BASE_DIR / "openai-app.py"

    if preferred_backend == "gemini":
        return BASE_DIR / "gemini-app.py"

    if os.getenv("OPENAI_API_KEY", "").strip():
        return BASE_DIR / "openai-app.py"

    return BASE_DIR / "gemini-app.py"


def load_backend_app():
    backend_file = resolve_backend_file()
    spec = importlib.util.spec_from_file_location("ai_branch_backend", backend_file)
    module = importlib.util.module_from_spec(spec)

    if spec.loader is None:
        raise RuntimeError(f"Could not load backend from {backend_file}")

    spec.loader.exec_module(module)
    return module.app


app = load_backend_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
