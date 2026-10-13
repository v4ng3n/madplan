#!/usr/bin/env python3
"""Validate a complete plan against preferences and publisher offer evidence."""
import argparse
import datetime as dt
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DAYS = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag']
CATEGORIES = ['produce', 'bread', 'meat', 'fish', 'pantry', 'dairy', 'frozen', 'household', 'other']
STORES = ['REMA 1000', 'Netto', '365discount', 'SuperBrugsen']


def validate(plan, prefs, manifest):
    errors = []
    def check(ok, message):
        if not ok:
            errors.append(message)
    selected = prefs.get('selectedDays')
    check(prefs.get('configured') is True and bool(prefs.get('updatedAt')), 'Preferences have not been fetched successfully')
    check(isinstance(selected, list) and bool(selected) and selected == [d for d in DAYS if d in selected], 'Invalid selectedDays')
    days = plan.get('days', [])
    check([d.get('day') for d in days] == selected, 'Published days differ from selectedDays')
    check(bool(re.fullmatch(r'20\d\d-W(?:0[1-9]|[1-4]\d|5[0-3])', plan.get('week', ''))), 'Invalid week')
    try:
        year, week = plan['week'].split('-W'); dt.date.fromisocalendar(int(year), int(week), 1)
        generated = dt.datetime.fromisoformat(plan['generated_at'])
        check(generated.tzinfo is not None, 'generated_at needs a timezone')
    except (KeyError, ValueError, TypeError):
        check(False, 'Invalid generated_at or ISO week')
    requests = prefs.get('dayRequests') or {}
    for d in days:
        r = d.get('recipe') or {}
        for k in ('day', 'dish', 'offer'):
            check(bool(d.get(k)), f'Missing {k}: {d.get("day")}')
        check(d.get('type') in ('cook', 'leftovers'), 'Unknown day type')
        for k in ('servings', 'childNote', 'ingredients', 'steps'):
            check(bool(r.get(k)), f'Missing recipe.{k}: {d.get("day")}')
        if d.get('type') == 'leftovers':
            previous = next((x for x in days if x.get('day') == r.get('useFromBefore')), None)
            check(bool(previous and previous.get('type') == 'cook' and previous['recipe'].get('leftovers')), 'Missing source of leftovers')
            check(previous is not None and DAYS.index(previous['day']) < DAYS.index(d['day']), 'Leftovers must come from an earlier day')
        request = requests.get(d.get('day'))
        if isinstance(request, str) and request.strip():
            check(request.casefold() in d.get('dish', '').casefold(), f'Day request not fulfilled: {d.get("day")}')
    flyers = manifest.get('flyers', [])
    check({f.get('store') for f in flyers} == set(STORES), 'Missing flyer sources')
    for f in flyers:
        check(f.get('complete') is True and len(f.get('pages', [])) == f.get('pageCount'), f'Incomplete flyer: {f.get("store")}')
    ids = set()
    for group in plan.get('shopping', []):
        store = group.get('store')
        check(store in ['Valgfri butik'] + STORES, 'Invalid store')
        categories = []
        for item in group.get('items', []):
            for field in ('id', 'name', 'amount', 'category', 'note'):
                check(bool(item.get(field)), f'Missing shopping field {field}: {item.get("id")}')
            check(item.get('id') not in ids, 'Duplicate shopping id'); ids.add(item.get('id'))
            check(item.get('category') in CATEGORIES, 'Invalid shopping category')
            categories.append(CATEGORIES.index(item['category']) if item.get('category') in CATEGORIES else 99)
            if store == 'Valgfri butik':
                check(not any(k in item for k in ('offer', 'offerImage', 'offerPage', 'offerUrl')), 'Non-offer item has offer metadata')
                continue
            e = item.get('offer') or {}
            f = next((f for f in flyers if f.get('store') == store and f.get('catalogId') == e.get('catalogId')), None)
            if f is None and re.fullmatch(r'[A-Za-z0-9_-]{1,32}', e.get('catalogId', '')):
                archive = ROOT / 'public/data/flyer-editions' / (e['catalogId'] + '.json')
                if archive.exists():
                    saved = json.loads(archive.read_text())
                    if saved.get('store') == store and saved.get('catalogId') == e['catalogId'] and saved.get('complete'):
                        f = saved
            product = next((p for p in f.get('products', []) if p['id'] == e.get('productId')), None) if f else None
            if not product:
                check(False, 'No publisher offer evidence: ' + str(item.get('id'))); continue
            check(e.get('heading') == product['heading'], 'Product heading differs from publisher')
            check(bool(e.get('variant')) and e.get('variant', '').casefold() in product['heading'].casefold(), 'Variant not supported by publisher heading')
            check(item.get('name') == e.get('variant'), 'Shopping name differs from verified variant')
            check(e.get('price') == product['pricing']['price'] and product['pricing']['currency'] == 'DKK', 'Incorrect offer price')
            check(e.get('quantity') == product['quantity'], 'Incorrect offer pack quantity')
            check(e.get('validFrom') == product['run_from'] and e.get('validTo') == product['run_till'], 'Incorrect offer validity')
            check(e.get('page') == product['catalog_page'], 'Incorrect offer page')
            try:
                bought = dt.datetime.fromisoformat(plan['purchaseAt'])
                check(dt.datetime.fromisoformat(e['validFrom']) <= bought <= dt.datetime.fromisoformat(e['validTo']), 'Offer not valid at intended shopping time')
            except (KeyError, ValueError, TypeError):
                check(False, 'Missing or invalid purchaseAt')
            check(not any(k in item for k in ('offerImage', 'offerPage', 'offerUrl')), 'Legacy unverified offer metadata')
        check(categories == sorted(categories), f'Unsorted categories: {store}')
    check(bool(ids), 'Empty shopping list')
    check({o.get('store') for o in plan.get('offers', [])} == set(STORES), 'Missing store references')
    return errors


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--plan', type=pathlib.Path, default=ROOT / 'public/data/madplan.json')
    parser.add_argument('--preferences', type=pathlib.Path, default=ROOT / '.automation/preferences.json')
    args = parser.parse_args()
    try:
        errors = validate(json.loads(args.plan.read_text()), json.loads(args.preferences.read_text()), json.loads((ROOT / 'public/data/flyers.json').read_text()))
    except Exception as error:
        sys.exit('VALIDATION FAILED: ' + str(error))
    if errors:
        sys.exit('\n'.join('ERROR: ' + e for e in errors))
    print('Complete plan, day requests and publisher offer evidence validated.')
