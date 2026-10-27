#!/usr/bin/env python3
"""Copies Radiant's public Church Center calendar into events.json.

Runs on GitHub Actions (see .github/workflows/sync.yml). It reads only what
anyone can see on radiantcentralcoast.churchcenter.com/calendar, so it needs
no password or key. Standard library only.
"""
import html, json, os, re, sys, time, urllib.request
from datetime import datetime, timezone, timedelta

SUBDOMAIN = "radiantcentralcoast"
CAL_PAGE = f"https://{SUBDOMAIN}.churchcenter.com/calendar?view=list"
API = "https://api.churchcenter.com/calendar/v2/events"
DAYS_AHEAD = 365
DAYS_BACK = 180      # past events kept for the "Past events" tab
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


def fetch_all(url, auth, places, regs, stop_after=None):
    raw = []
    while url:
        d = json.loads(get(url, auth))
        for inc in d.get("included", []):
            if inc["type"] == "Location":
                places[inc["id"]] = inc["attributes"]
            elif inc["type"] == "EventRegistrationUrl":
                regs[inc["id"]] = inc["attributes"].get("url")
        raw.extend(d.get("data", []))
        url = (d.get("links") or {}).get("next")
        if stop_after and raw and raw[-1]["attributes"]["starts_at"] > stop_after:
            break
    return raw


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def ics(events, now):
    """A calendar people can subscribe to (Apple, Google, Outlook)."""
    def esc(t):
        return str(t or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")
    def fold(line):  # lines longer than 75 bytes continue on the next line, starting with a space
        out, b = [], line.encode("utf-8")
        while len(b) > 75:
            cut = 75
            while (b[cut] & 0xC0) == 0x80:
                cut -= 1
            out.append(b[:cut].decode("utf-8"))
            b = b" " + b[cut:]
        out.append(b.decode("utf-8"))
        return "\r\n".join(out)
    stamp = now.strftime("%Y%m%dT%H%M%SZ")
    t = lambda s: s.replace("-", "").replace(":", "")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Radiant Central Coast//Events//EN", "CALSCALE:GREGORIAN",
             "METHOD:PUBLISH", "X-WR-CALNAME:Radiant Central Coast", "X-WR-TIMEZONE:America/Los_Angeles",
             "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"]
    for e in events:
        lines += ["BEGIN:VEVENT", f"UID:{e['id']}@radiantcentralcoast.churchcenter.com", f"DTSTAMP:{stamp}"]
        if e["all_day"]:
            lines += [f"DTSTART;VALUE=DATE:{e['start'][:10].replace('-', '')}", f"DTEND;VALUE=DATE:{e['end'][:10].replace('-', '')}"]
        else:
            lines += [f"DTSTART:{t(e['start'])}", f"DTEND:{t(e['end'])}"]
        lines += ["SUMMARY:" + esc(e["title"]), "DESCRIPTION:" + esc((e["description"] + "\n\n" if e["description"] else "") + e["details_url"]),
                  "LOCATION:" + esc(e["location"] or e["location_name"]), "URL:" + e["details_url"], "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return "\r\n".join(fold(l) for l in lines) + "\r\n"


def main():
    token = visitor_token()
    auth = {"Authorization": "Bearer " + token}
    now = datetime.now(timezone.utc)
    until, since = iso(now + timedelta(days=DAYS_AHEAD)), iso(now - timedelta(days=DAYS_BACK))
    places, regs = {}, {}
    base = API + "?include=location,event_registration_url&order=visible_starts_at&per_page=100"
    raw = fetch_all(base + "&filter=upcoming", auth, places, regs, stop_after=until)
    raw += fetch_all(base + f"&where%5Bstarts_at%5D%5Bgte%5D={since}&where%5Bstarts_at%5D%5Blt%5D={iso(now)}", auth, places, regs)

    events, seen = [], set()
    for e in raw:
        a, rel = e["attributes"], e.get("relationships", {})
        if e["id"] in seen or a["starts_at"] > until or a["starts_at"] < since:
            continue
        seen.add(e["id"])
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
        "generated_at": iso(now),
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
        if old.get("events") == events and age < timedelta(hours=6) and os.path.exists("events.ics"):
            print(f"no change ({len(events)} events)")
            return
    except (OSError, ValueError, KeyError):
        pass
    with open("events.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    with open("events.ics", "w", encoding="utf-8", newline="") as f:
        f.write(ics(events, now))
    print(f"wrote {len(events)} events")


if __name__ == "__main__":
    main()
