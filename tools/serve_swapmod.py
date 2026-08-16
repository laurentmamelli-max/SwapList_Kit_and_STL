#!/usr/bin/env python3
import argparse
import contextlib
import http.server
import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


DEFAULT_ROOT_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = Path(os.environ.get("SWAPMOD_ROOT_DIR", str(DEFAULT_ROOT_DIR))).resolve()
WEB_DIR = ROOT_DIR / "web"
RUNTIME_DIR = Path(
    os.environ.get("SWAPMOD_RUNTIME_DIR", str(ROOT_DIR / ".runtime"))
).resolve()
PID_FILE = RUNTIME_DIR / "swapmod_web_server.json"
LOG_FILE = RUNTIME_DIR / "swapmod_web_server.log"


def ensure_runtime_dir():
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)


def load_state():
    if not PID_FILE.exists():
        return None

    try:
        return json.loads(PID_FILE.read_text())
    except Exception:
        return None


def save_state(pid, port):
    ensure_runtime_dir()
    PID_FILE.write_text(json.dumps({"pid": pid, "port": port, "root": str(ROOT_DIR)}))


def clear_state_if_matches(pid):
    state = load_state()
    if state and state.get("pid") == pid:
        with contextlib.suppress(FileNotFoundError):
            PID_FILE.unlink()


def is_process_alive(pid):
    if not pid:
        return False

    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def port_is_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.25)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def choose_port(preferred):
    if preferred and not port_is_open(preferred):
        return preferred

    for port in range(4173, 4200):
        if not port_is_open(port):
            return port

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_server(port, timeout=10):
    deadline = time.time() + timeout
    url = f"http://127.0.0.1:{port}/"

    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=0.5) as response:
                if response.status == 200:
                    return True
        except Exception:
            time.sleep(0.15)

    return False


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return


def run_server(port):
    if not WEB_DIR.exists():
        raise SystemExit(f"Web directory not found: {WEB_DIR}")

    os.chdir(WEB_DIR)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), QuietHandler)
    save_state(os.getpid(), port)

    def handle_exit(signum, frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, handle_exit)
    signal.signal(signal.SIGINT, handle_exit)

    print(f"Serving Swapmod Local on http://127.0.0.1:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        clear_state_if_matches(os.getpid())


def launch_server(open_browser=True, preferred_port=4173):
    state = load_state()
    if state and is_process_alive(state.get("pid")) and port_is_open(state.get("port")):
        url = f"http://127.0.0.1:{state['port']}/"
        print(f"Server already running on {url}")
        if open_browser:
            open_url(url)
        return 0

    port = choose_port(preferred_port)
    ensure_runtime_dir()

    with LOG_FILE.open("ab") as log_file:
        process = subprocess.Popen(
            [sys.executable, str(Path(__file__).resolve()), "serve", "--port", str(port)],
            cwd=str(ROOT_DIR),
            stdout=log_file,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )

    if not wait_for_server(port):
        raise SystemExit(
            "Le serveur ne s'est pas lance correctement. Regarde le log: "
            + str(LOG_FILE)
        )

    save_state(process.pid, port)
    url = f"http://127.0.0.1:{port}/"
    print(f"Server launched on {url}")
    if open_browser:
        open_url(url)
    return 0


def stop_server():
    state = load_state()
    if not state:
        print("No running server found.")
        return 0

    pid = state.get("pid")
    if not is_process_alive(pid):
        clear_state_if_matches(pid)
        print("Stale server state cleared.")
        return 0

    os.kill(pid, signal.SIGTERM)
    deadline = time.time() + 5
    while time.time() < deadline:
        if not is_process_alive(pid):
            clear_state_if_matches(pid)
            print("Server stopped.")
            return 0
        time.sleep(0.1)

    print("Server did not stop cleanly.")
    return 1


def print_status():
    state = load_state()
    if not state:
        print("Server status: stopped")
        return 0

    pid = state.get("pid")
    port = state.get("port")
    running = is_process_alive(pid) and port_is_open(port)
    print("Server status:", "running" if running else "stopped")
    print("PID:", pid)
    print("Port:", port)
    print("URL:", f"http://127.0.0.1:{port}/")
    print("Log:", LOG_FILE)
    return 0 if running else 1


def open_url(url):
    subprocess.run(["open", url], check=False)


def build_parser():
    parser = argparse.ArgumentParser(description="Launch and manage the local Swapmod KIT/STL web app.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    serve_parser = subparsers.add_parser("serve", help="Run the local HTTP server in the foreground.")
    serve_parser.add_argument("--port", type=int, default=4173)

    launch_parser = subparsers.add_parser("launch", help="Start the server in the background and open the browser.")
    launch_parser.add_argument("--port", type=int, default=4173)
    launch_parser.add_argument("--no-browser", action="store_true")

    subparsers.add_parser("stop", help="Stop the background server.")
    subparsers.add_parser("status", help="Show server status.")
    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "serve":
        run_server(args.port)
        return 0
    if args.command == "launch":
        return launch_server(open_browser=not args.no_browser, preferred_port=args.port)
    if args.command == "stop":
        return stop_server()
    if args.command == "status":
        return print_status()

    parser.error("Unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
