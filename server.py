#!/usr/bin/env python3
"""
Opa Lacho — servidor local (sólo Python, sin instalar nada).

Reemplaza el backend original (TanStack Start + Supabase + Lovable AI):

  GET  /                      -> página (public/index.html)
  POST /api/suscripciones     -> suscripción de la página principal (nombre, correo, dirección, objetivos)
  POST /api/waitlist          -> guarda la lista de espera en SQLite (datos/opalacho.db)
  POST /api/events            -> guarda eventos de analítica en SQLite
  GET  /feria                 -> página corta para ferias (?feria=nombre) ; /feria?modo=stand = tablet
  POST /api/leads             -> registro rápido de la feria (SQLite, tabla leads)
  GET  /admin                 -> panel de administración (pide la clave)
  GET  /api/admin/leads       -> lista de registros (cabecera X-Admin-Key)
  POST /api/admin/leads/update-> cambia estado / notas de un registro
  GET  /admin/lista-espera.csv?clave=...   -> descarga la lista antigua (si define ADMIN_KEY)

Uso:  python server.py     (en Windows: python server.py  o doble clic en iniciar.bat)
"""
from __future__ import annotations

import csv
import hmac
import io
import json
import mimetypes
import os
import re
import sqlite3
import sys
import threading
import time
import unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
DATA_DIR = BASE_DIR / "datos"
DB_PATH = DATA_DIR / "opalacho.db"


# --------------------------------------------------------------------------- #
# Configuración (.env opcional)
# --------------------------------------------------------------------------- #
def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), value)


load_env(BASE_DIR / ".env")

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "3000"))
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")
if not ADMIN_KEY:
    # Si no definió una clave en .env, se crea una sola vez y se guarda en datos/clave_admin.txt
    _kf = BASE_DIR / "datos" / "clave_admin.txt"
    try:
        _kf.parent.mkdir(exist_ok=True)
        if not _kf.exists():
            import secrets
            _kf.write_text(secrets.token_urlsafe(9), encoding="utf-8")
        ADMIN_KEY = _kf.read_text(encoding="utf-8").strip()
    except OSError:
        ADMIN_KEY = ""

MAX_BODY = 20_000  # bytes


# --------------------------------------------------------------------------- #
# Precios (volante del cliente): cosechas con 500 g por producto
# --------------------------------------------------------------------------- #
PLANS = {"semanal": "Semanal", "quincenal": "Quincenal"}  # frecuencia de entrega preferida
COSECHAS = {
    "cosecha1": ("Cosecha #1", "arándanos, fresas, champiñones y agraz", 82000),
    "cosecha2": ("Cosecha #2", "arándanos, fresas y champiñones", 62000),
}


def cop(n: int) -> str:
    return "$" + f"{n:,}".replace(",", ".") + " COP"


# --------------------------------------------------------------------------- #
# Base de datos (SQLite) — reemplaza las tablas de Supabase
# --------------------------------------------------------------------------- #
SCHEMA = """
CREATE TABLE IF NOT EXISTS waitlist_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 255),
  city TEXT NOT NULL CHECK (length(city) BETWEEN 1 AND 100),
  frequency TEXT NOT NULL CHECK (frequency IN ('semanal','quincenal')),
  contact_consent INTEGER NOT NULL CHECK (contact_consent = 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  whatsapp TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  empresa TEXT NOT NULL DEFAULT '',
  personas INTEGER,
  direccion TEXT NOT NULL DEFAULT '',
  interes TEXT NOT NULL DEFAULT 'no_se',
  entrega TEXT NOT NULL DEFAULT '',
  objetivos TEXT NOT NULL DEFAULT '',
  feria TEXT NOT NULL DEFAULT 'web',
  estado TEXT NOT NULL DEFAULT 'nuevo',
  notas TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_feria ON leads(feria);
CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL CHECK (length(session_id) <= 64),
  event_name TEXT NOT NULL CHECK (length(event_name) <= 64),
  properties TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
"""


def db() -> sqlite3.Connection:
    DATA_DIR.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with db() as conn:
        conn.executescript(SCHEMA)
        cols = {r[1] for r in conn.execute("PRAGMA table_info(leads)")}
        if "entrega" not in cols:  # bases creadas con versiones anteriores
            conn.execute("ALTER TABLE leads ADD COLUMN entrega TEXT NOT NULL DEFAULT ''")
        if "objetivos" not in cols:
            conn.execute("ALTER TABLE leads ADD COLUMN objetivos TEXT NOT NULL DEFAULT ''")


# --------------------------------------------------------------------------- #
# Validación (igual que los esquemas zod del original)
# --------------------------------------------------------------------------- #
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def validate_waitlist(d: dict) -> tuple[dict | None, str | None]:
    name = d.get("name").strip() if isinstance(d.get("name"), str) else ""
    email = d.get("email").strip() if isinstance(d.get("email"), str) else ""
    city = d.get("city").strip() if isinstance(d.get("city"), str) else ""
    freq = d.get("frequency")
    if not name:
        return None, "Ingrese su nombre"
    if len(name) > 100:
        return None, "Nombre demasiado largo"
    if not EMAIL_RE.match(email) or len(email) > 255:
        return None, "Correo inválido"
    if not city:
        return None, "Ingrese su ciudad"
    if len(city) > 100:
        return None, "Ciudad demasiado larga"
    if freq not in PLANS:
        return None, "Revise los datos"
    if d.get("contact_consent") is not True:
        return None, "Necesitamos su autorización"
    return {"name": name, "email": email, "city": city, "frequency": freq}, None


ESTADOS = ("nuevo", "contactado", "confirmado", "pagado", "descartado")
INTERESES = ("cosecha1", "cosecha2", "oficina", "comunidad", "comprador", "prueba", "semanal", "quincenal", "no_se")
ENTREGAS = ("feria", "domicilio", "")
SLUG_RE = re.compile(r"[^a-z0-9_-]+")


def norm_whatsapp(raw: str) -> str | None:
    """Deja solo dígitos; un celular colombiano de 10 dígitos (3xx...) recibe el 57."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 10 and digits.startswith("3"):
        digits = "57" + digits
    return digits if 8 <= len(digits) <= 15 else None


def txt(v, n: int) -> str:
    return v.strip()[:n] if isinstance(v, str) else ""


def validate_lead(d: dict) -> tuple[dict | None, str | None]:
    nombre = txt(d.get("nombre"), 100)
    if not nombre:
        return None, "Ingrese su nombre"
    wa = norm_whatsapp(d.get("whatsapp") if isinstance(d.get("whatsapp"), str) else "")
    if wa is None:
        return None, "Revise su número de WhatsApp"
    if d.get("consent") is not True:
        return None, "Necesitamos su autorización para contactarle"
    email = txt(d.get("email"), 255)
    if email and not EMAIL_RE.match(email):
        return None, "Revise su correo"
    personas = d.get("personas")
    if isinstance(personas, str) and personas.strip().isdigit():
        personas = int(personas.strip())
    personas = personas if isinstance(personas, int) and 1 <= personas <= 100000 else None
    interes = d.get("interes") if d.get("interes") in INTERESES else "no_se"
    raw_feria = unicodedata.normalize("NFD", txt(d.get("feria"), 60).lower())
    raw_feria = "".join(ch for ch in raw_feria if not unicodedata.combining(ch))  # quita tildes
    feria = SLUG_RE.sub("-", raw_feria).strip("-") or "web"
    return {
        "nombre": nombre, "whatsapp": wa, "email": email, "objetivos": clean_objetivos(d.get("objetivos")),
        "empresa": txt(d.get("empresa"), 120), "personas": personas,
        "direccion": txt(d.get("direccion"), 200), "interes": interes, "feria": feria,
        "entrega": d.get("entrega") if d.get("entrega") in ENTREGAS else "",
    }, None


# --------------------------------------------------------------------------- #
# Suscripciones (formulario de la página principal)
# --------------------------------------------------------------------------- #
PLANES_SUSCRIPCION = ("comunidad", "comprador", "quincenal", "semanal")
OBJETIVOS = (
    "Energía diaria", "Memoria y enfoque", "Defensas", "Salud cardiovascular",
    "Prevención familiar", "Comer mejor sin dietas",
)


def clean_objetivos(v) -> str:
    """Guarda solo objetivos conocidos (máx. 6), separados por « · »."""
    if not isinstance(v, list):
        return ""
    vistos = [o for o in OBJETIVOS if o in v]
    return " · ".join(vistos)


def validate_suscripcion(d: dict) -> tuple[dict | None, str | None]:
    nombre = txt(d.get("nombre"), 100)
    email = txt(d.get("email"), 255)
    direccion = txt(d.get("direccion"), 200)
    plan = d.get("plan")
    if plan not in PLANES_SUSCRIPCION:
        return None, "Elija un tipo de suscripción"
    if not nombre:
        return None, "Ingrese su nombre"
    if not EMAIL_RE.match(email):
        return None, "Correo inválido"
    if plan != "comunidad" and not direccion:
        return None, "Ingrese su dirección de entrega"
    if d.get("consent") is not True:
        return None, "Necesitamos su autorización"
    return {"nombre": nombre, "email": email, "direccion": direccion, "plan": plan,
            "objetivos": clean_objetivos(d.get("objetivos"))}, None


# Límite simple por IP para frenar abusos
_rate_lock = threading.Lock()
_rate: dict[str, list[float]] = {}


def rate_ok(ip: str, limit: int = 10, window: int = 60) -> bool:
    now = time.time()
    with _rate_lock:
        hits = [t for t in _rate.get(ip, []) if now - t < window]
        if len(hits) >= limit:
            _rate[ip] = hits
            return False
        hits.append(now)
        _rate[ip] = hits
        return True


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #
class Handler(BaseHTTPRequestHandler):
    server_version = "OpaLacho/1.0"

    def log_message(self, fmt, *args):  # log más corto
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    # ---- utilidades ------------------------------------------------------- #
    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict | None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return None
        if length <= 0 or length > MAX_BODY:
            return None
        try:
            data = json.loads(self.rfile.read(length))
        except ValueError:
            return None
        return data if isinstance(data, dict) else None

    # ---- GET -------------------------------------------------------------- #
    def do_GET(self):
        url = urlparse(self.path)
        path = url.path

        if path == "/admin/lista-espera.csv":
            return self.admin_csv(url)
        if path == "/api/admin/leads":
            return self.admin_leads()

        if path == "/":
            path = "/index.html"
        target = (PUBLIC_DIR / path.lstrip("/")).resolve()
        try:
            target.relative_to(PUBLIC_DIR.resolve())
        except ValueError:
            return self.send_json(404, {"error": "No encontrado"})
        if not target.is_file():
            alt = target.with_name(target.name + ".html")  # /feria -> feria.html, /admin -> admin.html
            if target.name and alt.is_file():
                target = alt
            else:
                return self.not_found()

        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def not_found(self):
        page = PUBLIC_DIR / "404.html"
        body = page.read_bytes() if page.is_file() else b"404"
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def admin_csv(self, url):
        if not ADMIN_KEY:
            return self.send_json(404, {"error": "No encontrado"})
        key = parse_qs(url.query).get("clave", [""])[0]
        if not hmac.compare_digest(key, ADMIN_KEY):
            return self.send_json(403, {"error": "Clave incorrecta"})
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(["id", "nombre", "correo", "ciudad", "frecuencia", "fecha"])
        with db() as conn:
            for r in conn.execute(
                "SELECT id,name,email,city,frequency,created_at FROM waitlist_submissions ORDER BY id"
            ):
                w.writerow(list(r))
        body = ("﻿" + out.getvalue()).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", 'attachment; filename="lista-espera.csv"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---- POST ------------------------------------------------------------- #
    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/suscripciones":
            return self.post_suscripcion()
        if path == "/api/waitlist":
            return self.post_waitlist()
        if path == "/api/events":
            return self.post_events()
        if path == "/api/leads":
            return self.post_lead()
        if path == "/api/admin/leads/update":
            return self.admin_update_lead()
        self.send_json(404, {"error": "No encontrado"})

    def post_suscripcion(self):
        if not rate_ok("sub:" + self.client_address[0], limit=60, window=60):
            return self.send_json(429, {"error": "Demasiadas solicitudes. Intente en un minuto."})
        data = self.read_json()
        if data is None:
            return self.send_json(400, {"error": "Revise los datos"})
        sub, err = validate_suscripcion(data)
        if err:
            return self.send_json(400, {"error": err})
        with db() as conn:
            conn.execute(
                "INSERT INTO leads(nombre,email,direccion,interes,objetivos,feria) VALUES (?,?,?,?,?,'web')",
                (sub["nombre"], sub["email"], sub["direccion"], sub["plan"], sub["objetivos"]),
            )
        self.send_json(201, {"ok": True})

    def post_waitlist(self):
        data = self.read_json()
        if data is None:
            return self.send_json(400, {"error": "Revise los datos"})
        clean_data, err = validate_waitlist(data)
        if err:
            return self.send_json(400, {"error": err})
        with db() as conn:
            conn.execute(
                "INSERT INTO waitlist_submissions(name,email,city,frequency,contact_consent) VALUES (?,?,?,?,1)",
                (clean_data["name"], clean_data["email"], clean_data["city"], clean_data["frequency"]),
            )
            # también aparece en el panel de administración como origen «web»
            conn.execute(
                "INSERT INTO leads(nombre,email,direccion,interes,feria) VALUES (?,?,?,?,'web')",
                (clean_data["name"], clean_data["email"], clean_data["city"], clean_data["frequency"]),
            )
        self.send_json(201, {"ok": True})

    def is_admin(self) -> bool:
        key = self.headers.get("X-Admin-Key", "")
        return bool(ADMIN_KEY) and hmac.compare_digest(key.encode(), ADMIN_KEY.encode())

    def post_lead(self):
        if not rate_ok("lead:" + self.client_address[0], limit=120, window=60):
            return self.send_json(429, {"error": "Demasiados registros seguidos. Intente en un minuto."})
        data = self.read_json()
        if data is None:
            return self.send_json(400, {"error": "Revise los datos"})
        lead, err = validate_lead(data)
        if err:
            return self.send_json(400, {"error": err})
        with db() as conn:
            cur = conn.execute(
                "INSERT INTO leads(nombre,whatsapp,email,empresa,personas,direccion,interes,feria,entrega,objetivos) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (lead["nombre"], lead["whatsapp"], lead["email"], lead["empresa"], lead["personas"],
                 lead["direccion"], lead["interes"], lead["feria"], lead["entrega"], lead["objetivos"]),
            )
        self.send_json(201, {"ok": True, "id": cur.lastrowid})

    def admin_leads(self):
        if not self.is_admin():
            return self.send_json(401, {"error": "Clave incorrecta"})
        with db() as conn:
            rows = [dict(r) for r in conn.execute("SELECT * FROM leads ORDER BY id DESC LIMIT 5000")]
        self.send_json(200, {"leads": rows, "estados": list(ESTADOS)})

    def admin_update_lead(self):
        if not self.is_admin():
            return self.send_json(401, {"error": "Clave incorrecta"})
        data = self.read_json() or {}
        lead_id = data.get("id")
        if not isinstance(lead_id, int):
            return self.send_json(400, {"error": "Datos inválidos"})
        sets, vals = [], []
        if "estado" in data:
            if data["estado"] not in ESTADOS:
                return self.send_json(400, {"error": "Estado inválido"})
            sets.append("estado=?"); vals.append(data["estado"])
        if "notas" in data:
            sets.append("notas=?"); vals.append(txt(data["notas"], 1000))
        if not sets:
            return self.send_json(400, {"error": "Nada que actualizar"})
        sets.append("updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')")
        with db() as conn:
            cur = conn.execute(f"UPDATE leads SET {', '.join(sets)} WHERE id=?", (*vals, lead_id))
        self.send_json(200 if cur.rowcount else 404, {"ok": bool(cur.rowcount)})

    def post_events(self):
        data = self.read_json()
        if data is None:
            return self.send_json(400, {"error": "Datos inválidos"})
        sid, name, props = data.get("session_id"), data.get("event_name"), data.get("properties", {})
        if not (isinstance(sid, str) and 0 < len(sid) <= 64 and isinstance(name, str) and 0 < len(name) <= 64):
            return self.send_json(400, {"error": "Datos inválidos"})
        props_json = json.dumps(props if isinstance(props, dict) else {}, ensure_ascii=False)
        if len(props_json.encode()) >= 4000:
            return self.send_json(400, {"error": "Datos inválidos"})
        with db() as conn:
            conn.execute(
                "INSERT INTO analytics_events(session_id,event_name,properties) VALUES (?,?,?)",
                (sid, name, props_json),
            )
        self.send_json(201, {"ok": True})


def main() -> None:
    init_db()
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    httpd.daemon_threads = True
    print("=" * 56)
    print("  Opa Lacho listo ->  http://localhost:%d" % PORT)
    print("  Base de datos:", DB_PATH)
    print("  Panel de registros: http://localhost:%d/admin   clave: %s" % (PORT, ADMIN_KEY or "(sin clave: defina ADMIN_KEY)"))
    print("  (Ctrl+C para detener)")
    print("=" * 56)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")


if __name__ == "__main__":
    main()
