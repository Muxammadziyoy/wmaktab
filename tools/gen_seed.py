"""Builds data/db.json by running the ORIGINAL wMaktab seeder (database.py) and dumping SQLite to JSON.
Usage: python tools/gen_seed.py path/to/database.py   (standard library only)"""
import hashlib, importlib.util, json, secrets, sqlite3, sys, types
from datetime import date

src = sys.argv[1]
fl = types.ModuleType("flask"); fl.g = {}
ws = types.ModuleType("werkzeug"); wss = types.ModuleType("werkzeug.security")
wss.generate_password_hash = lambda p: "plain:" + p
sys.modules.update({"flask": fl, "werkzeug": ws, "werkzeug.security": wss})
spec = importlib.util.spec_from_file_location("database", src)
dbm = importlib.util.module_from_spec(spec); spec.loader.exec_module(dbm)

SEED_TODAY = date(2026, 11, 20)
class FakeDate(date):
    @classmethod
    def today(cls): return cls(SEED_TODAY.year, SEED_TODAY.month, SEED_TODAY.day)
dbm.date = FakeDate

conn = sqlite3.connect(":memory:"); conn.row_factory = sqlite3.Row
conn.executescript(dbm.SCHEMA); dbm.seed_demo(conn)

def rows(table): return [dict(r) for r in conn.execute(f"SELECT * FROM {table} ORDER BY 1")]
out = {"meta": {"seed_today": SEED_TODAY.isoformat(), "version": 1}}
for t in ["classes","subjects","users","teaching","grades","attendance","timetable","homework","homework_status","announcements"]:
    out[t] = rows(t)
for u in out["users"]:
    pw = u.pop("password_hash").replace("plain:", "")
    salt = secrets.token_hex(8)
    u["pw"] = salt + "$" + hashlib.sha256((salt + pw).encode()).hexdigest()
json.dump(out, open("data/db.json", "w"), separators=(",", ":"))
print({k: len(v) for k, v in out.items() if isinstance(v, list)})
