#!/usr/bin/env python3
"""
Live RU/CIS egress test for Yandex Music public playlist API via check-host.net
public monitoring nodes (diagnostic ONLY — proves/disproves the geo-fence
hypothesis with a real RU datacenter egress, zero credentials).

Targets:
  T1  https://api.music.yandex.net/users/music.partners/playlists/1293   (target)
  T2  https://api.music.yandex.net/genres                                 (control, 200 everywhere)
  T3  https://api.music.yandex.net/playlist/00000000-...                  (dummy uuid, expect 404 if geo passes)

Report: /home/z/my-project/download/ym-research/checkhost_ru_test.json
"""
import json
import os
import time
import urllib.request
import urllib.error
import urllib.parse

API = "https://check-host.net"
OUT = "/home/z/my-project/download/ym-research/checkhost_ru_test.json"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"


def api_get(url, timeout=30):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def get_nodes():
    data = api_get(API + "/nodes/hosts")
    nodes = data.get("nodes", {})
    ru, cis, other = [], [], []
    for name, meta in nodes.items():
        loc = meta.get("location", ["", "", ""])
        item = {"node": name, "ip": meta.get("ip", ""),
                "cc": loc[0] if loc else "", "country": loc[1] if len(loc) > 1 else "",
                "city": loc[2] if len(loc) > 2 else "", "asn": meta.get("asn", "")}
        cc = (loc[0] or "").lower()
        if cc == "ru":
            ru.append(item)
        elif cc in ("by", "kz", "am", "ge", "az", "kg", "uz", "md", "tj"):
            cis.append(item)
        else:
            other.append(item)
    return ru, cis, other


def check_http(target_url, node_names):
    q = urllib.parse.urlencode([("host", target_url)] + [("node", n) for n in node_names])
    data = api_get(f"{API}/check-http?{q}")
    return data


def poll_result(request_id, node_names, timeout=120):
    deadline = time.time() + timeout
    results = {}
    while time.time() < deadline:
        time.sleep(7)
        try:
            data = api_get(f"{API}/check-result/{request_id}")
        except Exception as e:
            print(f"  poll error: {e}")
            continue
        done = 0
        for node, res in data.items():
            if res is not None and len(res) > 0:
                results[node] = res
                done += 1
        print(f"  poll: {done}/{len(node_names)} nodes ready")
        if done >= len(node_names):
            break
    return results


def main():
    print("== getting check-host node list ==")
    ru, cis, other = get_nodes()
    print(f"RU nodes: {[n['node'] + ' (' + n['city'] + ', ' + n['asn'] + ')' for n in ru]}")
    print(f"CIS nodes: {[n['node'] + ' (' + n['city'] + ', ' + n['asn'] + ')' for n in cis]}")
    print(f"Other nodes total: {len(other)}; using as controls: "
          f"{[n['node'] + ' (' + n['country'] + ')' for n in other[:4]]}")

    ru_names = [n["node"] for n in ru]
    cis_names = [n["node"] for n in cis]
    # controls: a few non-RU nodes for contrast
    ctrl_names = [n["node"] for n in other][:4]

    targets = {
        "T1_playlist_target": "https://api.music.yandex.net/users/music.partners/playlists/1293",
        "T2_genres_control": "https://api.music.yandex.net/genres",
        "T3_dummy_uuid": "https://api.music.yandex.net/playlist/00000000-0000-0000-0000-000000000000",
    }

    report = {"nodes": {"ru": ru, "cis": cis, "other_used": other[:4]},
              "targets": {}, "raw": {}}

    for tname, turl in targets.items():
        node_names = ru_names + cis_names + ctrl_names
        if not node_names:
            print("no nodes!")
            break
        print(f"\n== check-http {tname}: {turl}")
        print(f"   nodes: {node_names}")
        try:
            data = check_http(turl, node_names)
        except Exception as e:
            print(f"  start check error: {e}")
            continue
        rid = data.get("request_id")
        report["raw"][tname] = {"request_id": rid, "start": data}
        if not rid:
            print(f"  no request_id: {data}")
            continue
        print(f"  request_id={rid}; polling results...")
        res = poll_result(rid, node_names)
        report["targets"][tname] = {"url": turl,
                                    "results": res}
        for node, r in sorted(res.items()):
            print(f"   {node:32s} -> {r}")

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\nreport: {OUT}")

    # verdict
    print("\n=== VERDICT (RU/CIS nodes on T1 playlist target) ===")
    t1 = report["targets"].get("T1_playlist_target", {}).get("results", {})
    ru_cis = {**{n["node"]: "ru" for n in ru}, **{n["node"]: "cis" for n in cis}}
    for node, r in t1.items():
        if node in ru_cis:
            print(f"  {ru_cis[node].upper():4s} {node:32s} -> {r}")


if __name__ == "__main__":
    main()
