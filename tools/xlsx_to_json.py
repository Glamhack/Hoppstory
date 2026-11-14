"""Convert data/Data.xlsx (sheets Event, Austragung, Medien, Personen) to data/data.json.

Usage (from the project folder):
    python tools/xlsx_to_json.py [data/Data.xlsx] [data/data.json]

Only the Python standard library is used. The script prints warnings for data
problems it finds (duplicate IDs, links to missing records, unreadable values)
but still writes the file.

Output structure (field names as used by js/events.js):
    events:       id, name, beschreibung, sportart
    austragungen: id, eventId, name, datumStart, datumEnde, start {lat,lng} | null,
                  ende {lat,lng} | null, location, rangliste, siegerIds [Personen IDs]
    medien:       id, eventId, austragungId, datum, typ, url, titel, legende, credits, urheber
    personen:     id, name, land, gnd, wikidata, foto, austragungIds [Austragung IDs]
Dates are ISO strings ("1957-08-25"), or just the year ("1957") if only that is known.
The "(DON'T EDIT)" helper columns in the sheet are ignored; links use the IDs only.
"""
import datetime
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
WARNINGS = []


def warn(msg):
    WARNINGS.append(msg)


# --- minimal .xlsx reader -------------------------------------------------------

class ExcelDate(float):
    """A numeric cell formatted as a date (Excel serial day number)."""


def _col_index(ref):
    n = 0
    for ch in re.match(r'[A-Z]+', ref).group():
        n = n * 26 + ord(ch) - 64
    return n - 1


def read_xlsx(path):
    """{sheet name: [row dict keyed by the header row]}; empty rows are skipped."""
    z = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS):
            shared.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
    styles = ET.fromstring(z.read('xl/styles.xml'))
    custom = {int(f.get('numFmtId')): f.get('formatCode') for f in styles.findall('m:numFmts/m:numFmt', NS)}
    xf_fmt = [int(x.get('numFmtId', 0)) for x in styles.findall('m:cellXfs/m:xf', NS)]

    def is_date_style(s):
        if s is None or s >= len(xf_fmt):
            return False
        f = xf_fmt[s]
        if 14 <= f <= 22 or 45 <= f <= 47:
            return True
        code = re.sub(r'"[^"]*"|\[[^\]]*\]', '', custom.get(f, ''))
        return bool(re.search(r'[dy]', code, re.I))

    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    out = {}
    for sh in wb.findall('m:sheets/m:sheet', NS):
        target = rels[sh.get('{%s}id' % NS['r'])].lstrip('/')
        root = ET.fromstring(z.read(target if target.startswith('xl/') else 'xl/' + target))
        rows = []
        for row in root.findall('m:sheetData/m:row', NS):
            vals = {}
            for c in row.findall('m:c', NS):
                t, s, v = c.get('t'), c.get('s'), c.find('m:v', NS)
                if t == 's':
                    val = shared[int(v.text)] if v is not None else None
                elif t == 'inlineStr':
                    val = ''.join(x.text or '' for x in c.iter('{%s}t' % NS['m']))
                elif t in ('str', 'e'):  # formula text result / error
                    val = v.text if v is not None else None
                elif t == 'b':
                    val = v.text == '1' if v is not None else None
                elif v is None:
                    val = None
                else:
                    num = float(v.text)
                    if is_date_style(int(s) if s else None):
                        val = ExcelDate(num)
                    else:
                        val = int(num) if num.is_integer() else num
                vals[_col_index(c.get('r'))] = val
            rows.append(vals)
        if not rows:
            out[sh.get('name')] = []
            continue
        header = {i: str(v).strip() for i, v in rows[0].items() if v not in (None, '')}
        records = []
        for r in rows[1:]:
            rec = {name: r.get(i) for i, name in header.items()}
            if any(clean(v) is not None for v in rec.values()):
                records.append(rec)
        out[sh.get('name')] = records
    return out


# --- value cleaning -------------------------------------------------------------

def clean(v):
    """Strings trimmed (empty -> None); line breaks normalised to \\n."""
    if isinstance(v, str):
        v = v.replace('\r\n', '\n').replace('\r', '\n').strip()
        return v or None
    return v


def date_value(v, where):
    """Excel date -> "YYYY-MM-DD"; a plain year -> "YYYY"; text dates kept if readable."""
    v = clean(v)
    if v is None:
        return None
    if isinstance(v, ExcelDate):
        return (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(v))).isoformat()
    if isinstance(v, (int, float)) and 1800 <= v <= 2100:
        return str(int(v))
    s = str(v)
    if re.fullmatch(r'\d{4}(-\d{2}(-\d{2})?)?', s):
        return s
    m = re.fullmatch(r'(\d{1,2})\.(\d{1,2})\.(\d{4})', s)  # 25.08.1957
    if m:
        return f'{m[3]}-{int(m[2]):02d}-{int(m[1]):02d}'
    warn(f'{where}: Datum "{s}" nicht erkannt, unverändert übernommen')
    return s


def coords(v, where):
    """"46.66, 9.58" -> {"lat": 46.66, "lng": 9.58}"""
    v = clean(v)
    if v is None:
        return None
    m = re.fullmatch(r'\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*', str(v))
    if not m:
        warn(f'{where}: Koordinaten "{v}" nicht erkannt')
        return None
    return {'lat': float(m[1]), 'lng': float(m[2])}


def text(v):
    v = clean(v)
    return None if v is None else str(v)


# --- conversion -----------------------------------------------------------------

def convert(wb):
    events = [{
        'id': text(r.get('Event ID')),
        'name': text(r.get('Name Event')),
        'beschreibung': text(r.get('Beschreibung')),
        'sportart': text(r.get('Sportart')),
    } for r in wb.get('Event', [])]

    personen = []
    for r in wb.get('Personen', []):
        wins = text(r.get('Gewinn Austragung')) or ''
        personen.append({
            'id': text(r.get('ID')),
            'name': text(r.get('Sieger')),
            'land': text(r.get('Ursprungsland')),
            'gnd': text(r.get('GND')),
            'wikidata': text(r.get('Wikidata')),
            'foto': text(r.get('Photo')),
            # "Grand Prix Bern 1949 (A031), Grand Prix Bern 1953 (A034)" -> ["A031", "A034"]
            'austragungIds': re.findall(r'\b(A\d+)\b', wins),
        })

    austragungen = []
    for r in wb.get('Austragung', []):
        aid = text(r.get('Austragung ID'))
        where = f'Austragung {aid}'
        austragungen.append({
            'id': aid,
            'eventId': text(r.get('Event ID')),
            'name': text(r.get('Name Austragung')),
            'datumStart': date_value(r.get('Datum Start'), where),
            'datumEnde': date_value(r.get('Datum Ende'), where),
            'start': coords(r.get('Koordinaten Start'), where),
            'ende': coords(r.get('Koordinaten Ende'), where),
            'location': text(r.get('Name Location')),
            'rangliste': text(r.get('Rangliste')),
            'siegerIds': [],
            '_sieger': text(r.get('Sieger')),  # name from the sheet, only for checking
        })

    medien = []
    for r in wb.get('Medien', []):
        mid = text(r.get('Media ID'))
        url = text(r.get('File (URL)'))
        if not mid and not url:
            continue  # empty template row
        medien.append({
            'id': mid,
            'eventId': text(r.get('Event ID')),
            'austragungId': text(r.get('Austragung ID')),
            'datum': date_value(r.get('Datum'), f'Medium {mid}'),
            'typ': text(r.get('Typ')),
            'url': url,
            'titel': text(r.get('Titel')),
            'legende': text(r.get('Legende')),
            'credits': text(r.get('Credits')),
            'urheber': text(r.get('FotografIn / UrheberIn')),
        })

    # --- links and checks
    for name, items in (('Event', events), ('Austragung', austragungen), ('Medium', medien), ('Person', personen)):
        for i, x in enumerate(items):
            if not x['id']:
                warn(f'{name} in Zeile {i + 2} hat keine ID')
        for k, n in Counter(x['id'] for x in items if x['id']).items():
            if n > 1:
                warn(f'{name}-ID {k} kommt {n}-mal vor')

    event_ids = {e['id'] for e in events}
    by_aid = {a['id']: a for a in austragungen}
    for a in austragungen:
        if a['eventId'] not in event_ids:
            warn(f'Austragung {a["id"]}: Event {a["eventId"]} gibt es nicht')
    for m in medien:
        a = by_aid.get(m['austragungId'])
        if m['austragungId'] and not a:
            warn(f'Medium {m["id"]}: Austragung {m["austragungId"]} gibt es nicht')
        if a and m['eventId'] and m['eventId'] != a['eventId']:
            warn(f'Medium {m["id"]}: Event {m["eventId"]} passt nicht zu Austragung {a["id"]} (Event {a["eventId"]})')
        if not m['eventId'] and a:
            m['eventId'] = a['eventId']
        if m['eventId'] and m['eventId'] not in event_ids:
            warn(f'Medium {m["id"]}: Event {m["eventId"]} gibt es nicht')
        if not m['url']:
            warn(f'Medium {m["id"]}: keine URL')

    # Winners: the Personen sheet lists the Austragung IDs each person won.
    for p in personen:
        for aid in p['austragungIds']:
            if aid in by_aid:
                by_aid[aid]['siegerIds'].append(p['id'])
            else:
                warn(f'Person {p["id"]} ({p["name"]}): Austragung {aid} gibt es nicht')
    names = {p['id']: p['name'] for p in personen}
    for a in austragungen:
        sheet_name = a.pop('_sieger')
        linked = [names[i] for i in a['siegerIds']]
        if sheet_name and sheet_name not in linked:
            warn(f'Austragung {a["id"]}: Sieger "{sheet_name}" steht nicht im Blatt Personen'
                 + (f' (dort: {", ".join(linked)})' if linked else ''))

    return {
        'quelle': 'Data.xlsx',
        'exportiert': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'events': events,
        'austragungen': austragungen,
        'medien': medien,
        'personen': personen,
    }


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'data/Data.xlsx'
    dst = sys.argv[2] if len(sys.argv) > 2 else 'data/data.json'
    data = convert(read_xlsx(src))
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'{dst}: {len(data["events"])} Events, {len(data["austragungen"])} Austragungen, '
          f'{len(data["medien"])} Medien, {len(data["personen"])} Personen')
    for w in WARNINGS:
        print('WARNUNG:', w)


if __name__ == '__main__':
    main()
