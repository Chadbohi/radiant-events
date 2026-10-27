#!/usr/bin/env python3
"""Copies Radiant's public Church Center calendar into events.json.

Runs on GitHub Actions (see .github/workflows/sync.yml). It reads only what
anyone can see on radiantcentralcoast.churchcenter.com/calendar, so it needs
no password or key. Standard library only.
"""
import html, json, re, sys, time, urllib.request
from datetime import datetime, timezone, timedelta

SUBDOMAIN = "radiantcentralcoast"
CAL_PAGE = f"https://{SUBDOMAIN}.churchcenter.com/calendar?view=list"
API = "https://api.churchcenter.com/calendar/v2/events"
DAYS_AHEAD = 365
UA = "Mozilla/5.0 (compatible; RadiantEventsSync/1.0; +https://radiantcentralcoast.com)"


def get(url, headers=None, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json, text/html", **(headers or {})})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8")
        except Exception as e:  # network hiccup: wait and retry
            if i == tries - 1:
                raise
            print("retrying after:", e, file=sys.stderr)
            time.sleep(5 * (i + 1))


def visitor_token():
    """Church Center gives every visitor a short-lived read-only token in the page."""
    page = get(CAL_PAGE)
    m = re.search(r'\\"token\\",\\"([A-Za-z0-9._\-]{20,})\\"', page) or re.search(r'"token"\s*:\s*"([A-Za-z0-9._\-]{20,})"', page)
    if not m:
        raise SystemExit("Couldn't find the Church Center visitor token; the page layout may have changed.")
    return m.group(1)


def text_of(desc_html):
    t = re.sub(r"<(br|/div|/p|/li)[^>]*>", "\n", desc_html or "")
    t = html.unescape(re.sub(r"<[^>]+>", "", t))
    return re.sub(r"\n\s*\n+", "\n\n", t).strip()


def main():
    token = visitor_token()
    auth = {"Authorization": "Bearer " + token}
    url = API + "?include=location,event_registration_url&filter=upcoming&order=visible_starts_at&per_page=100"
    until = datetime.now(timezone.utc) + timedelta(days=DAYS_AHEAD)
    raw, places, regs = [], {}, {}
    while url:
        d = json.loads(get(url, auth))
        for inc in d.get("included", []):
            if inc["type"] == "Location":
                places[inc["id"]] = inc["attributes"]
            elif inc["type"] == "EventRegistrationUrl":
                regs[inc["id"]] = inc["attributes"].get("url")
        raw.extend(d.get("data", []))
        url = (d.get("links") or {}).get("next")
        if raw and raw[-1]["attributes"]["starts_at"] > until.strftime("%Y-%m-%dT%H:%M:%SZ"):
            break

    events = []
    for e in raw:
        a, rel = e["attributes"], e.get("relationships", {})
        if a["starts_at"] > until.strftime("%Y-%m-%dT%H:%M:%SZ"):
            continue
        loc = places.get(((rel.get("location") or {}).get("data") or {}).get("id"), {})
        reg = regs.get(((rel.get("event_registration_url") or {}).get("data") or {}).get("id"))
        events.append({
            "id": e["id"],
            "event_id": str(a.get("event_group") or e["id"]),
            "title": (a.get("name") or "").strip(),
            "description": text_of(a.get("description"))[:400],
            "start": a["starts_at"],
            "end": a.get("ends_at") or a["starts_at"],
            "all_day": bool(a.get("all_day_event")),
            "multi_day": bool(a.get("multi_day_event")),
            "location_name": loc.get("name") or "",
            "location": (loc.get("full_formatted_address") or "").replace("\n", ", ") if loc.get("display_on_church_center", True) else "",
            "recurring": bool(a.get("recurring")),
            "recurrence": a.get("recurrence_description") or "",
            "image": a.get("image_url") or "",
            "featured": bool(a.get("featured")),
            "registration_url": reg,
            "details_url": a.get("public_url") or f"https://{SUBDOMAIN}.churchcenter.com/calendar/event/{e['id']}",
        })
    events.sort(key=lambda x: (x["start"], x["title"]))
    if not events:
        raise SystemExit("Church Center returned no upcoming events; keeping the last good file.")

    out = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": CAL_PAGE.split("?")[0],
        "timezone": "America/Los_Angeles",
        "count": len(events),
        "events": events,
    }
    # Unchanged since the last save and saved under 6 hours ago: leave the file
    # alone, so the repository only records real changes (plus a 6-hourly check-in).
    try:
        with open("events.json", encoding="utf-8") as f:
            old = json.load(f)
        age = datetime.now(timezone.utc) - datetime.strptime(old["generated_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        if old.get("events") == events and age < timedelta(hours=6):
            print(f"no change ({len(events)} events)")
            return
    except (OSError, ValueError, KeyError):
        pass
    with open("events.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {len(events)} events")


if __name__ == "__main__":
    main()
