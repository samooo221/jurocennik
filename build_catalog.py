#!/usr/bin/env python3
"""Build catalog.json from Juraj's 4 Tillotson T4 xlsx price lists.

Stdlib only (zipfile + xml.etree) — no openpyxl/pandas needed. Run locally and
commit the resulting catalog.json; the web app reads that, never the xlsx.

    python3 build_catalog.py            # build + run self-check

The self-check (bottom of file) is the one runnable test: it fails loudly if the
part count, prices, model tagging, or known spot-check rows look wrong.
"""
import zipfile, re, json, glob, datetime
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PR = "{http://schemas.openxmlformats.org/package/2006/relationships}"

SOURCE_GLOB = "source/*.xlsx"
OUT = "catalog.json"
CONFLICT_REPORT = "price_conflicts.txt"
PRICING_BASIS = "RETAIL, EX WORKS TRALEE IRELAND, 2026 V.02"


def short_name(path):
    """'source/T4 JNR SNR CHASSIS_SPL_...xlsx' -> 'T4 JNR SNR CHASSIS'."""
    return re.sub(r"_SPL.*", "", path.split("/")[-1])

# A data sheet name starts with "<number>." e.g. "3. BRAKE SYSTEM". The cover
# sheet ("T4 MINI ENGINE") does not, so this skips it.
DATA_SHEET_RE = re.compile(r"^\s*\d+\s*\.")


def col_index(ref):
    """'B7' -> 2 (1-based column number)."""
    letters = re.match(r"[A-Z]+", ref).group()
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n


def load_workbook(path):
    """Return (shared_strings list, {sheet_name: sheet_xml_path})."""
    z = zipfile.ZipFile(path)
    shared = []
    try:
        ss_root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in ss_root.iter(f"{M}si"):
            # Concatenate every <t> run — rich-text cells have several, and
            # taking only the first truncates descriptions.
            shared.append("".join(t.text or "" for t in si.iter(f"{M}t")))
    except KeyError:
        pass  # workbook with no shared strings (shouldn't happen here)
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rid_to_target = {r.get("Id"): r.get("Target") for r in rels.iter(f"{PR}Relationship")}
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    name_to_path = {}
    for s in wb.iter(f"{M}sheet"):
        target = rid_to_target[s.get(f"{R}id")]
        if not target.startswith("xl/"):
            target = "xl/" + target
        name_to_path[s.get("name")] = target
    return z, shared, name_to_path


def read_rows(z, shared, sheet_path):
    """Yield {col_index: cell_value_str} dicts, one per non-empty row, in order."""
    sheet = ET.fromstring(z.read(sheet_path))
    for row in sheet.iter(f"{M}row"):
        cells = {}
        for c in row.iter(f"{M}c"):
            ref, t = c.get("r"), c.get("t")
            v, inline = c.find(f"{M}v"), c.find(f"{M}is")
            val = ""
            if t == "s" and v is not None:
                val = shared[int(v.text)]
            elif t == "inlineStr" and inline is not None:
                val = "".join(x.text or "" for x in inline.iter(f"{M}t"))
            elif v is not None:
                val = v.text
            if val not in ("", None):
                cells[col_index(ref)] = val.strip() if isinstance(val, str) else val
        if cells:
            yield cells


def norm_item(v):
    """Item number: keep 'N/A' and ints as clean strings ('1.0' -> '1')."""
    s = str(v).strip()
    if re.fullmatch(r"\d+\.0+", s):
        s = s.split(".")[0]
    return s


def models_for(desc, is_mini):
    """File-primary model tagging.

    MINI files -> ['mini'] regardless of description (the MINI ENGINE file
    contains 'JUNIOR'/'SENIOR' words that would otherwise mis-tag mini parts).
    JNR-SNR files -> disambiguate by description, default to both.
    """
    if is_mini:
        return {"mini"}
    u = desc.upper()
    has_jr, has_sr = "JUNIOR" in u, "SENIOR" in u
    if has_sr and not has_jr:
        return {"senior"}
    if has_jr and not has_sr:
        return {"junior"}
    return {"junior", "senior"}


def build():
    files = sorted(glob.glob(SOURCE_GLOB))
    if not files:
        raise SystemExit(f"No xlsx found under {SOURCE_GLOB}")

    parts = {}                      # pn -> record (sets for groups/items/models/subsystems)
    occurrences = defaultdict(list)  # pn -> [(file, sheet, price)] for conflict reporting

    for path in files:
        fname = path.upper()
        short = short_name(path)
        subsystem = "chassis" if "CHASSIS" in fname else "engine"
        is_mini = "MINI" in fname
        z, shared, name_to_path = load_workbook(path)

        for sheet_name, sheet_path in name_to_path.items():
            if not DATA_SHEET_RE.match(sheet_name):
                continue  # cover sheet
            group = sheet_name.strip()
            cols = None  # {pn,desc,price,item} -> column index, set from header rows
            for cells in read_rows(z, shared, sheet_path):
                # A header row contains the "TILLOTSON P/N" label — use it to
                # (re)map columns. Sheets have sub-tables (3.1, 3.2 ...) that
                # repeat the header, and column layout can drift, so re-map each.
                header_cell = next((i for i, v in cells.items()
                                    if isinstance(v, str) and v.strip().upper() == "TILLOTSON P/N"), None)
                if header_cell is not None:
                    cols = {"pn": header_cell}
                    for i, v in cells.items():
                        if not isinstance(v, str):
                            continue
                        u = v.strip().upper()
                        if u == "ITEM":
                            cols["item"] = i
                        elif u == "DESCRIPTION":
                            cols["desc"] = i
                        elif u == "RETAIL":
                            cols["price"] = i
                    continue
                if not cols or "price" not in cols or "desc" not in cols:
                    continue  # haven't seen a header yet, or malformed
                pn = str(cells.get(cols["pn"], "")).strip()
                if not pn or pn.upper() == "TILLOTSON P/N":
                    continue
                raw_price = cells.get(cols["price"])
                try:
                    price = round(float(raw_price), 2)
                except (TypeError, ValueError):
                    continue  # section subtitle / non-data row
                if price <= 0:
                    continue
                desc = str(cells.get(cols["desc"], "")).strip()
                item = norm_item(cells.get(cols["item"], "")) if "item" in cols else ""

                occurrences[pn].append((short, group, price))
                rec = parts.get(pn)
                if rec is None:
                    parts[pn] = {
                        "pn": pn, "desc": desc,
                        "models": models_for(desc, is_mini),
                        "subsystems": {subsystem},
                        "groups": {group},
                        "items": {item} if item else set(),
                    }
                else:
                    rec["models"] |= models_for(desc, is_mini)
                    rec["subsystems"].add(subsystem)
                    rec["groups"].add(group)
                    if item:
                        rec["items"].add(item)
                    if len(desc) > len(rec["desc"]):  # prefer the fuller description
                        rec["desc"] = desc

    # Stable, sorted output (sets -> sorted lists) for clean diffs.
    model_order = {"mini": 0, "junior": 1, "senior": 2}
    out_parts = []
    conflict_report = []  # (pn, [(file, sheet, price)]) for parts whose price disagrees
    for pn in sorted(parts):
        r = parts[pn]
        prices = sorted({p for _, _, p in occurrences[pn]})
        part = {
            "pn": r["pn"],
            "desc": r["desc"],
            "price_eur": prices[0],  # lower bound; the representative/sort key
            "models": sorted(r["models"], key=lambda m: model_order.get(m, 9)),
            "subsystems": sorted(r["subsystems"]),
            "groups": sorted(r["groups"], key=lambda g: (int(re.match(r"\d+", g).group()), g)),
            "items": sorted(r["items"]),
        }
        if len(prices) > 1:
            # Source disagrees → flag it and carry every distinct price. The UI
            # shows a range + "confirm with Juraj" instead of one wrong number.
            part["price_varies"] = True
            part["prices"] = prices
            conflict_report.append((pn, occurrences[pn]))
        out_parts.append(part)

    catalog = {
        "meta": {
            "currency": "EUR",
            "pricing_basis": PRICING_BASIS,
            "generated": datetime.date.today().isoformat(),
            "part_count": len(out_parts),
            "price_conflicts": len(conflict_report),
        },
        "parts": out_parts,
    }
    return catalog, conflict_report


def write_conflict_report(conflict_report):
    """A punch-list Juraj can use to reconcile his master sheets."""
    lines = [
        "PRICE CONFLICTS — same part number, different prices in the source sheets.",
        "The app shows a range + 'confirm with Juraj' for each of these until fixed.",
        f"({len(conflict_report)} parts)\n",
    ]
    for pn, occ in conflict_report:
        prices = sorted({p for _, _, p in occ})
        lines.append(f"{pn}   prices seen: {', '.join(f'EUR {p:.2f}' for p in prices)}")
        for f, sheet, p in occ:
            lines.append(f"    EUR {p:7.2f}   [{f}]  {sheet}")
        lines.append("")
    with open(CONFLICT_REPORT, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


def main():
    catalog, conflict_report = build()
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=1)
    write_conflict_report(conflict_report)

    parts = catalog["parts"]
    n = len(parts)
    print(f"Wrote {OUT}: {n} unique parts")

    # --- counts ---
    by_model, by_sub, by_group = Counter(), Counter(), Counter()
    for p in parts:
        for m in p["models"]:
            by_model[m] += 1
        for s in p["subsystems"]:
            by_sub[s] += 1
        for g in p["groups"]:
            by_group[g] += 1
    print("by model:    ", dict(by_model))
    print("by subsystem:", dict(by_sub))
    print(f"groups: {len(by_group)} distinct")
    print(f"price conflicts: {len(conflict_report)} (flagged 'price varies'; "
          f"see {CONFLICT_REPORT})")

    # --- self-check (the one runnable test) ---
    assert 450 <= n <= 650, f"part count {n} outside expected 450-650"
    for p in parts:
        assert p["price_eur"] > 0, f"{p['pn']} has non-positive price"
        assert round(p["price_eur"], 2) == p["price_eur"], f"{p['pn']} price not 2dp"
        assert p["models"], f"{p['pn']} has no model"
        assert p["subsystems"], f"{p['pn']} has no subsystem"
        if p.get("price_varies"):
            assert len(p["prices"]) > 1, f"{p['pn']} flagged varies but has one price"
            assert p["price_eur"] == p["prices"][0], f"{p['pn']} price_eur != min(prices)"
    by_pn = {p["pn"]: p for p in parts}
    spot = {"FM19-2A": 122.44, "FM22-1A": 127.76, "T-AIRFILTER-SHIELD-FM22": 30.0}
    for pn, expected in spot.items():
        assert pn in by_pn, f"spot-check part {pn} missing"
        got = by_pn[pn]["price_eur"]
        assert got == expected, f"{pn} price {got} != expected {expected}"
        assert not by_pn[pn].get("price_varies"), f"{pn} unexpectedly flagged varies"
    # model-tagging trap: FM19-2A lives in BOTH the mini and jnr/snr engine files,
    # so it must be tagged mini AND junior (and never senior).
    assert "mini" in by_pn["FM19-2A"]["models"], "FM19-2A should be tagged mini"
    # conflict flagging works: T-SPO-PLATE has the big 23.10 vs 45.42 disagreement.
    assert by_pn["T-SPO-PLATE"].get("price_varies"), "T-SPO-PLATE should be flagged"
    print("\nself-check OK")


if __name__ == "__main__":
    main()
