#!/usr/bin/env python3
"""Discover publisher-provided pages; publish only complete, decoded image sets.

No guessed asset names, forged image signatures, scraped third-party crops or
HTML viewers. Uses the same published page metadata and signed images as the retailer web clients.
See AUTOMATION.md for publisher terms and the permission request.
"""
import datetime as dt
import hashlib
import html
import io
import json
import os
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCES = {
    'REMA 1000': 'https://rema1000.dk/avis/',
    'Netto': 'https://netto.dk/netto-avisen/',
    '365discount': 'https://365discount.coop.dk/365avisen-pdf/',
    'SuperBrugsen': 'https://superbrugsen.coop.dk/avis-pdf/',
}
NOW = dt.datetime.now(dt.timezone.utc)


def get(url, key=None):
    headers = {'User-Agent': 'Madplan/1.0 (family meal planner)', 'Accept': '*/*'}
    if key:
        headers['X-Api-Key'] = key
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=35) as response:
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def api(path, key):
    return json.loads(get('https://squid-api.tjek.com' + path, key))


def active(catalog):
    return dt.datetime.fromisoformat(catalog['run_from']) <= NOW <= dt.datetime.fromisoformat(catalog['run_till'])


def netto_leaflets(source):
    for chunk in re.findall(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', source):
        text = json.loads(chunk)
        if '"leaflets":' in text:
            return json.JSONDecoder().raw_decode(text.split('"leaflets":', 1)[1])[0]
    raise ValueError('Netto: official page no longer exposes its leaflet list')


def discover(store, url):
    key = os.environ.get('TJEK_API_KEY')
    source = get(url).decode('utf-8')
    if store == 'Netto':
        candidates = [x for x in netto_leaflets(source) if active(x['catalog']) and x['catalog'].get('offer_count', 0)]
        if len(candidates) != 1:
            raise ValueError('Netto: expected exactly one current grocery flyer')
        c, pages = candidates[0]['catalog'], candidates[0]['pages']
        offers = []  # Netto currently exposes pages without structured offer evidence.
    else:
        if store == 'REMA 1000':
            key = key or re.search(r'tjek:\{api_key:"([^"]+)"', source)[1]
            dealer = re.search(r'tjek:\{[^}]*business_id:"([^"]+)"', source)[1]
            candidates = [c for c in api('/v2/catalogs?' + urllib.parse.urlencode({'dealer_id': dealer}), key) if active(c) and c.get('offer_count', 0)]
            if len(candidates) != 1:
                raise ValueError('REMA: expected exactly one current grocery flyer')
            c = candidates[0]
        else:
            key = key or re.search(r"_shopgunApiKey='([^']+)'", source)[1]
            catalog_id = re.search(r'data-publication-id=["\']?([^ >"\']+)', source)[1]
            c = api('/v2/catalogs/' + catalog_id, key)
            if not active(c):
                raise ValueError(store + ': official PDF flyer is not current')
        pages = api('/v2/catalogs/' + c['id'] + '/pages', key)
        offers = []
        for offset in range(0, c['offer_count'], 100):
            params = {'dealer_id': c['dealer_id'], 'catalog_id': c['id'], 'types': 'paged', 'order_by': 'page', 'offset': offset, 'limit': 100}
            offers.extend(api('/v2/offers?' + urllib.parse.urlencode(params), key))
        if len({o['id'] for o in offers}) != c['offer_count']:
            raise ValueError(store + ': incomplete publisher product data')
    if len(pages) != c['page_count'] or not pages:
        raise ValueError(store + ': incomplete publisher page list')
    evidence = []
    for o in offers:
        if not isinstance(o.get('catalog_page'), int) or not 1 <= o['catalog_page'] <= len(pages):
            continue
        evidence.append({k: o[k] for k in ('id', 'heading', 'description', 'pricing', 'quantity', 'run_from', 'run_till', 'catalog_page')})
    return {'store': store, 'catalogId': c['id'], 'label': c['label'], 'sourceUrl': url,
            'validFrom': c['run_from'], 'validTo': c['run_till'], 'pageCount': c['page_count'],
            '_pages': pages, 'products': evidence}


def verify_page(job):
    store, catalog_id, number, page = job
    url = html.unescape(page['zoom'])
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname != 'image-transformer-api.tjek.com':
        raise ValueError(store + ': unexpected page host')
    data = get(url)
    with Image.open(io.BytesIO(data)) as im:
        im.load()
        width, height = im.size
    if width < 1200 or height < 800:
        raise ValueError(f'{store} page {number}: image too small ({width}x{height})')
    return {'number': number, 'url': url, 'width': width, 'height': height,
            'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}


def main():
    flyers = []
    for store, url in SOURCES.items():
        print('Discovering ' + store, flush=True)
        flyers.append(discover(store, url))
    jobs = [(f['store'], f['catalogId'], i, p) for f in flyers for i, p in enumerate(f['_pages'], 1)]
    with ThreadPoolExecutor(max_workers=8) as executor:
        verified = list(executor.map(verify_page, jobs))
    offset = 0
    for f in flyers:
        f['pages'] = verified[offset:offset + f['pageCount']]
        offset += f['pageCount']
        del f['_pages']
        f['complete'] = True
        print(f"Verified {f['store']}: {f['pageCount']} readable pages", flush=True)
    result = {'schemaVersion': 1, 'verifiedAt': NOW.isoformat(), 'flyers': flyers}
    archive = ROOT / 'public/data/flyer-editions'
    archive.mkdir(exist_ok=True)
    for flyer in flyers:
        (archive / (flyer['catalogId'] + '.json')).write_text(json.dumps(flyer, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    target = ROOT / 'public/data/flyers.json'
    staging = target.with_suffix('.tmp')
    staging.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    staging.replace(target)  # Replace only after every store and page succeeds.


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        sys.exit('FLYER UPDATE FAILED; previous manifest preserved: ' + str(error))
