import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


APP_DIR = Path(__file__).resolve().parent
OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat"
MAX_REQUEST_SIZE = 1_000_000
MAX_MESSAGES = 80
MAX_MESSAGE_LENGTH = 10_000
activity_lock = threading.Lock()
active_chat_requests = 0


class MikaHandler(BaseHTTPRequestHandler):
    def send_bytes(self, status, content_type, body):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; connect-src 'self'; style-src 'self'; "
            "script-src 'self'; object-src 'none'; base-uri 'none'; "
            "frame-ancestors 'none'",
        )
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_bytes(status, "application/json; charset=utf-8", body)

    def do_GET(self):
        if self.path == "/api/activity":
            with activity_lock:
                speaking = active_chat_requests > 0
            self.send_json(200, {"speaking": speaking})
            return

        files = {
            "/": ("index.html", "text/html; charset=utf-8"),
            "/styles.css": ("styles.css", "text/css; charset=utf-8"),
            "/app.js": ("app.js", "text/javascript; charset=utf-8"),
            "/mika-avatar.svg": ("mika-avatar.svg", "image/svg+xml"),
        }
        asset = files.get(self.path)
        if asset is None:
            self.send_json(404, {"error": "Page introuvable."})
            return

        filename, content_type = asset
        body = (APP_DIR / filename).read_bytes()
        self.send_bytes(200, content_type, body)

    def do_POST(self):
        if self.path != "/api/chat":
            self.send_json(404, {"error": "Adresse introuvable."})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_json(400, {"error": "Taille de requête invalide."})
            return

        if content_length <= 0 or content_length > MAX_REQUEST_SIZE:
            self.send_json(413, {"error": "La requête est vide ou trop volumineuse."})
            return

        try:
            payload = json.loads(self.rfile.read(content_length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_json(400, {"error": "Le contenu envoyé n'est pas un JSON valide."})
            return

        messages = payload.get("messages") if isinstance(payload, dict) else None
        if (
            not isinstance(messages, list)
            or not messages
            or len(messages) > MAX_MESSAGES
            or not isinstance(messages[-1], dict)
            or messages[-1].get("role") != "user"
        ):
            self.send_json(400, {"error": "La conversation envoyée est invalide."})
            return

        for message in messages:
            if (
                not isinstance(message, dict)
                or message.get("role") not in ("user", "assistant")
                or not isinstance(message.get("content"), str)
                or not message["content"].strip()
                or len(message["content"]) > MAX_MESSAGE_LENGTH
            ):
                self.send_json(400, {"error": "Un message de la conversation est invalide."})
                return

        request_body = json.dumps(
            {"model": "mika", "messages": messages, "stream": False}
        ).encode("utf-8")
        request = Request(
            OLLAMA_CHAT_URL,
            data=request_body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        global active_chat_requests
        with activity_lock:
            active_chat_requests += 1

        try:
            try:
                with urlopen(request, timeout=180) as response:
                    ollama_result = json.loads(response.read())
            except HTTPError as error:
                try:
                    error_payload = json.loads(error.read())
                    detail = (
                        error_payload.get("error", str(error))
                        if isinstance(error_payload, dict)
                        else str(error)
                    )
                except (json.JSONDecodeError, UnicodeDecodeError):
                    detail = str(error)
                self.send_json(502, {"error": f"Ollama a refusé la requête : {detail}"})
                return
            except (URLError, TimeoutError) as error:
                self.send_json(
                    502,
                    {
                        "error": (
                            "Impossible de joindre Ollama sur cet ordinateur. "
                            "Vérifie qu'Ollama est lancé et que le modèle « mika » "
                            f"est installé. Détail : {error}"
                        )
                    },
                )
                return
            except (json.JSONDecodeError, UnicodeDecodeError):
                self.send_json(502, {"error": "Ollama a renvoyé une réponse illisible."})
                return

            result_message = (
                ollama_result.get("message")
                if isinstance(ollama_result, dict)
                else None
            )
            answer = (
                result_message.get("content")
                if isinstance(result_message, dict)
                else None
            )
            if not isinstance(answer, str) or not answer:
                self.send_json(502, {"error": "Ollama n'a pas renvoyé de réponse."})
                return

            self.send_json(200, {"reply": answer})
        finally:
            with activity_lock:
                active_chat_requests -= 1

    def log_message(self, format_string, *args):
        print(f"[mika-chat] {self.address_string()} - {format_string % args}")


def main():
    parser = argparse.ArgumentParser(description="Lance l'interface locale de Mika.")
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Adresse d'écoute (127.0.0.1 par défaut ; 0.0.0.0 pour le réseau local).",
    )
    parser.add_argument("--port", type=int, default=8000, help="Port web (8000 par défaut).")
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), MikaHandler)
    print(f"Mika est disponible sur http://localhost:{args.port}")
    if args.host == "0.0.0.0":
        print("Accès réseau activé : utilise uniquement un réseau Wi-Fi de confiance.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt du serveur Mika.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
