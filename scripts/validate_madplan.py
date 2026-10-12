#!/usr/bin/env python3
"""Fail closed on invalid published meal plans."""
import json
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parents[1]
plan = json.loads((root / "public/data/madplan.json").read_text(encoding="utf-8"))
prefs = json.loads((root / ".automation/preferences.json").read_text(encoding="utf-8"))
errors = []
def check(ok, msg):
    if not ok:
        errors.append(msg)
selected = prefs.get("selectedDays")
check(isinstance(selected, list) and bool(selected), "Missing selectedDays")
days = plan.get("days", [])
check([d.get("day") for d in days] == selected, "Published days differ from selectedDays")
check(bool(re.fullmatch(r"20\d\d-W\d\d", plan.get("week", ""))), "Invalid week")
requests = prefs.get("dayRequests") or {}
for d in days:
    recipe = d.get("recipe") or {}
    for key in ("day", "dish", "type", "offer"):
        check(bool(d.get(key)), f"Missing {key}: {d.get('day')}")
    for key in ("servings", "childNote", "ingredients", "steps"):
        check(bool(recipe.get(key)), f"Missing recipe.{key}: {d.get('day')}")
    if d.get("type") == "leftovers":
        check(bool(recipe.get("useFromBefore")), f"Missing useFromBefore: {d.get('day')}")
    if d.get("type") == "cook" and any(x.get("recipe", {}).get("useFromBefore") == d.get("day") for x in days):
        check(bool(recipe.get("leftovers")), f"Missing leftovers: {d.get('day')}")
    request = requests.get(d.get("day"))
    if isinstance(request, str) and request.strip():
        check(request.casefold() in d.get("dish", "").casefold(), f"Day request not fulfilled: {d.get('day')}")
ids = set()
allowed = {"produce", "bread", "meat", "fish", "pantry", "dairy", "frozen", "household", "other"}
rank = {v: i for i, v in enumerate(allowed)}
rank = dict(zip(["produce","bread","meat","fish","pantry","dairy","frozen","household","other"],range(9)))
for group in plan.get("shopping", []):
    store = group.get("store")
    check(store in ("Valgfri butik", "REMA 1000", "Netto", "365discount", "SuperBrugsen"), f"Invalid store: {store}")
    categories = []
    for item in group.get("items", []):
        for field in ("id", "name", "amount", "category", "note"):
            check(bool(item.get(field)), f"Missing shopping field {field}: {item}")
        check(item.get("id") not in ids, f"Duplicate item id: {item.get('id')}")
        ids.add(item.get("id"))
        check(item.get("category") in allowed, f"Invalid category: {item.get('id')}")
        categories.append(rank.get(item.get("category"), 99))
        if store != "Valgfri butik":
            check(bool(item.get("offerImage")), f"Unverified store item without offerImage: {item.get('id')}")
            check(bool(re.search(r"\d+[,.]?\d*\s*kr", item.get("note", ""), re.I)), f"Store item lacks offer price: {item.get('id')}")
        else:
            check(not any(k in item for k in ("offerImage", "offerPage", "offerUrl")), f"Non-offer item has offer metadata: {item.get('id')}")
    check(categories == sorted(categories), f"Unsorted categories: {store}")
check({x.get("store") for x in plan.get("offers", [])} == {"REMA 1000","Netto","365discount","SuperBrugsen"}, "Missing flyer sources")
if errors:
    print("\n".join("ERROR: " + e for e in errors))
    sys.exit(1)
print("Meal plan structural checks passed. Flyer image content must also be visually verified before publishing.")
