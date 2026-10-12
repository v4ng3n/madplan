#!/usr/bin/env python3
"""Generate next week's meal plan using live web research and fail-closed validation."""
import datetime as dt
import json
import os
import pathlib
import subprocess
import sys
import urllib.request
from zoneinfo import ZoneInfo

ROOT = pathlib.Path(__file__).resolve().parents[1]
API_KEY = os.environ.get("OPENAI_API_KEY")
if not API_KEY:
    sys.exit("OPENAI_API_KEY GitHub Actions secret is missing; refusing to publish.")
prefs = json.loads((ROOT / ".automation/preferences.json").read_text(encoding="utf-8"))
selected = prefs.get("selectedDays")
if not prefs.get("updatedAt") or not isinstance(selected, list) or not selected:
    sys.exit("Invalid preferences; refusing to publish.")
today = dt.datetime.now(ZoneInfo("Europe/Copenhagen"))
monday = today.date() + dt.timedelta(days=(7-today.weekday()) % 7 or 7)
sunday = monday + dt.timedelta(days=6)
week = f"{monday.isocalendar().year}-W{monday.isocalendar().week:02d}"
existing = json.loads((ROOT / "public/data/madplan.json").read_text(encoding="utf-8"))
system = """You are generating a Danish family dinner plan for 2 adults and a 1.5-year-old child.
MANDATORY: research the CURRENT official flyers for REMA 1000, Netto, 365discount, SuperBrugsen BEFORE choosing meals. Use web search. Never invent prices, products, validity, page numbers or images.
A store-specific shopping item is allowed ONLY if the exact product, variant, size, price, validity and matching image crop are independently verified from the current flyer. If any evidence is missing, put it under 'Valgfri butik' without offerImage, offerPage or offerUrl. No 'Andre varer'.
Prefer Danish comfort food, casseroles, creamy chicken pasta, chili con carne, millionbøf, frikadeller, karbonader, paprikagryde and soup. No mac and cheese, shepherd's pie or lasagne soup. Use leftovers on consecutive days, consistent ingredient quantities, childNote.
For each day include day, dish, type, offer, recipe with servings, childNote, ingredients, steps, and leftovers/useFromBefore as applicable.
Shopping items: id,name,amount,category,note, optional offerImage,offerImageType,offerPage,offerUrl. Category order produce,bread,meat,fish,pantry,dairy,frozen,household,other. Unique ids.
Top-level offers MUST include the four stores and official current flyer URLs.
Return ONLY a complete JSON object with week,label,generated_at,days,shopping,offers. If no offers can be fully verified, all items must go to Valgfri butik. Day requests are absolute requirements."""
payload = {
  "model": os.environ.get("OPENAI_MODEL", "gpt-4.1"),
  "tools": [{"type": "web_search_preview"}],
  "input": [{"role":"system","content":system},{"role":"user","content":json.dumps({"week":week,"monday":str(monday),"sunday":str(sunday),"selectedDays":selected,"dayRequests":prefs.get("dayRequests",{}),"updatedAt":prefs["updatedAt"]},ensure_ascii=False)}],
  "max_output_tokens": 12000
}
req=urllib.request.Request("https://api.openai.com/v1/responses",data=json.dumps(payload).encode(),headers={"Authorization":"Bearer "+API_KEY,"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req,timeout=240) as response:
    result=json.load(response)
parts=[c.get("text","") for item in result.get("output",[]) if item.get("type")=="message" for c in item.get("content",[]) if c.get("type")=="output_text"]
raw="\n".join(parts).strip()
if raw.startswith("```"):
    raw=raw.split("\n",1)[1].rsplit("```",1)[0].strip()
plan=json.loads(raw)
if plan.get("week")!=week or [d.get("day") for d in plan.get("days",[])]!=selected:
    sys.exit("Model output does not match requested week/days.")
plan["generated_at"]=today.isoformat()
path=ROOT/"public/data/madplan.json"
original=path.read_text(encoding="utf-8")
path.write_text(json.dumps(plan,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
validation=subprocess.run([sys.executable,str(ROOT/"scripts/validate_madplan.py")],capture_output=True,text=True)
if validation.returncode:
    path.write_text(original,encoding="utf-8")
    sys.exit("Validation failed; previous plan preserved:\n"+validation.stdout+validation.stderr)
print(f"Validated {week}. Ready for commit.")
