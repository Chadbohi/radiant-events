/* Radiant Central Coast: upcoming events from Church Center.
   Owned by Radiant (github.com/Chadbohi/radiant-events). Data: events.json,
   refreshed every 30 minutes by the "Sync Church Center events" workflow.

   This script is added once to the whole site (Squarespace: Settings >
   Developer tools > Code Injection > Footer). Then put one of these in a
   Code Block wherever events should show:
     <div data-radiant-events="slider"></div>
     <div data-radiant-events="grid" data-count="3"></div>
     <div data-radiant-events="full"></div>   (tabs for upcoming and past, Show more, Subscribe)

   Options (attributes on the div, all optional):
     data-count="9"            how many events to show
     data-exclude="Espanol"    hide events whose title contains any of these (comma-separated)
     data-include=""           show only events whose title contains one of these
     data-featured="true"      only events starred as Featured in Planning Center
     data-heading=""           a heading above the events
     data-full-width="false"   slider: stay inside the section instead of edge to edge
*/
(function () {
  "use strict";
  if (window.__radiantEvents) { window.__radiantEvents.scan(); return; }

  var FEED = "https://chadbohi.github.io/radiant-events/events.json";
  var ICS = "chadbohi.github.io/radiant-events/events.ics";
  var CHURCH_CENTER = "https://radiantcentralcoast.churchcenter.com/calendar";
  var TZ = "America/Los_Angeles";
  var STALE_HOURS = 36;
  var DEFAULTS = { slider: 9, grid: 3, full: 12 };

  var CSS = [
    ".re{--re-ink:#474D47;--re-cream:#FCF2BF;--re-muted:rgba(71,77,71,.8);--re-line:rgba(190,173,147,.7);--re-ph:rgba(190,173,147,.35);",
    "--re-font:aktiv-grotesk-condensed,'Archivo Narrow','Arial Narrow',sans-serif;--re-head:span-semiboldcomp,aktiv-grotesk-condensed,'Archivo Narrow',serif;",
    "font-family:var(--re-font);color:var(--re-ink);max-width:1100px;margin:0 auto;}",
    ".re *{box-sizing:border-box;}",
    ".re__heading{font-family:var(--re-head);text-align:center;margin:0 0 24px;}",
    ".re__msg{color:var(--re-muted);text-align:center;margin:12px 0;}",
    ".re__stale{font-size:.9rem;color:var(--re-muted);text-align:center;margin:0 0 16px;}",
    ".re__stale a{color:inherit;}",
    /* pills */
    ".re__line{display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px;}",
    ".re__pills{display:flex;flex-wrap:wrap;gap:10px;position:relative;}",
    ".re-pill{display:inline-flex;align-items:center;font:inherit;font-size:15px;line-height:1;padding:10px 18px;border-radius:300px;border:1px solid var(--re-ink);cursor:pointer;text-decoration:none!important;white-space:nowrap;background:transparent;color:var(--re-ink)!important;}",
    ".re-pill--solid{background:var(--re-ink);color:var(--re-cream)!important;}",
    ".re-pill:hover{opacity:.88;}",
    ".re-pill:focus-visible,.re__arrow:focus-visible{outline:2px solid var(--re-ink);outline-offset:3px;}",
    ".re__menu{position:fixed;z-index:10000;max-width:none;margin:0;min-width:190px;background:#FAF6F5;border:1px solid var(--re-line);box-shadow:0 8px 24px rgba(58,63,58,.12);padding:6px 0;display:none;}",
    ".re__menu a{display:block;padding:10px 16px;color:var(--re-ink)!important;text-decoration:none!important;font-size:15px;}",
    ".re__menu a:hover{background:rgba(190,173,147,.18);}",
    /* grid */
    ".re--grid{padding-bottom:56px;}",
    ".re--grid .re__list{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:48px 60px;}",
    ".re-card{display:flex;flex-direction:column;}",
    ".re-card__media{position:relative;display:block;aspect-ratio:16/9;background:var(--re-ph);overflow:hidden;}",
    ".re-card__media img{width:100%;height:100%;object-fit:cover;display:block;}",
    ".re-card__tag{position:absolute;top:14px;right:14px;background:#fff;color:var(--re-ink);text-align:center;padding:8px 10px 7px;min-width:58px;line-height:1;}",
    ".re-card__mon{display:block;font-size:15px;text-transform:uppercase;letter-spacing:.04em;}",
    ".re-card__day{display:block;font-size:30px;margin-top:4px;}",
    ".re-card__title{font-family:var(--re-font);font-weight:700;font-size:22.4px;line-height:1.15;text-transform:uppercase;margin:16px 0 6px;}",
    ".re-card__title a{color:inherit!important;text-decoration:none!important;}",
    ".re-card__date{font-size:16px;color:var(--re-muted);margin:0 0 12px;}",
    /* full: tabs, show more, subscribe */
    ".re__tabs{display:flex;gap:28px;margin:0 0 28px;flex-wrap:wrap;}",
    ".re__tab{background:none;border:0;border-bottom:2px solid transparent;padding:0 0 6px;font:inherit;font-size:16px;letter-spacing:.06em;text-transform:uppercase;color:var(--re-muted);cursor:pointer;}",
    ".re__tab.is-active{color:var(--re-ink);border-color:var(--re-ink);font-weight:700;}",
    ".re__more{display:flex;margin:40px auto 0;}",
    ".re__foot{text-align:center;margin-top:36px;}",
    ".re__foot .re-pill{display:inline-flex;}",
    /* slider */
    ".re--slider{max-width:none;width:calc(100vw - var(--re-sb,0px));position:relative;left:50%;margin-left:calc((100vw - var(--re-sb,0px)) / -2)!important;}",
    ".re--slider.re--contained{width:auto;left:auto;margin-left:auto!important;}",
    ".re__viewport{overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch;}",
    ".re__viewport::-webkit-scrollbar{display:none;}",
    ".re__track{display:flex;gap:24px;padding:0 max(16px,calc((100% - 900px)/2));}",
    ".re-slide{flex:0 0 min(900px,88%);scroll-snap-align:center;text-align:center;}",
    ".re-slide__media{display:block;aspect-ratio:16/9;background:var(--re-ph);overflow:hidden;}",
    ".re-slide__media img{width:100%;height:100%;object-fit:cover;display:block;}",
    ".re-slide__title{font-family:var(--re-head);font-size:26px;line-height:1.15;text-transform:uppercase;margin:22px 0 10px;font-weight:400;}",
    ".re-slide__title a{color:inherit!important;text-decoration:none!important;}",
    ".re-slide .re__line{justify-content:center;}",
    ".re-slide__date{font-size:16px;text-transform:uppercase;}",
    ".re__arrows{display:flex;justify-content:center;gap:22px;margin-top:22px;}",
    ".re__arrow{width:48px;height:48px;border-radius:50%;border:0;background:var(--re-ink);color:var(--re-cream);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;}",
    ".re__arrow svg{width:22px;height:22px;}",
    "@media (max-width:640px){.re-slide__title{font-size:22px}.re-pill{font-size:14px;padding:9px 15px}}"
  ].join("");

  /* -- helpers ---------------------------------------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  // The site's heading font shows a "DEMO" mark for straight apostrophes.
  function curly(s) { return String(s || "").replace(/(\w)'(\w)/g, "$1\u2019$2").replace(/'/g, "\u2019"); }
  function parts(iso, opts) {
    var o = { timeZone: TZ };
    for (var k in opts) o[k] = opts[k];
    var out = {};
    new Intl.DateTimeFormat("en-US", o).formatToParts(new Date(iso)).forEach(function (p) { out[p.type] = p.value; });
    return out;
  }
  function when(ev) {
    var d = parts(ev.start, { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    var date = d.month + " " + d.day + ", " + d.year;
    if (ev.all_day) return date;
    return date + " \u00b7 " + d.hour + ":" + d.minute + " " + d.dayPeriod;
  }
  function fold(s) { s = String(s || "").toLowerCase(); return s.normalize ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : s; }
  function list(s) { return String(s || "").split(",").map(function (x) { return fold(x.trim()); }).filter(Boolean); }

  function gcalLink(ev) {
    var f = function (iso) { return iso.replace(/[-:]/g, "").replace(/\.\d+/, ""); };
    var dates = ev.all_day
      ? ev.start.slice(0, 10).replace(/-/g, "") + "/" + ev.end.slice(0, 10).replace(/-/g, "")
      : f(ev.start) + "/" + f(ev.end);
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(ev.title) +
      "&dates=" + dates + "&details=" + encodeURIComponent((ev.description ? ev.description + "\n\n" : "") + ev.details_url) +
      "&location=" + encodeURIComponent(ev.location || ev.location_name || "");
  }
  function icsLink(ev) {
    var f = function (iso) { return iso.replace(/[-:]/g, "").replace(/\.\d+/, ""); };
    var esc = function (s) { return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); };
    var lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Radiant Central Coast//Events//EN", "BEGIN:VEVENT",
      "UID:" + ev.id + "@radiantcentralcoast.com", "DTSTAMP:" + f(new Date().toISOString()),
      ev.all_day ? "DTSTART;VALUE=DATE:" + ev.start.slice(0, 10).replace(/-/g, "") : "DTSTART:" + f(ev.start),
      ev.all_day ? "DTEND;VALUE=DATE:" + ev.end.slice(0, 10).replace(/-/g, "") : "DTEND:" + f(ev.end),
      "SUMMARY:" + esc(ev.title), "DESCRIPTION:" + esc((ev.description ? ev.description + "\n\n" : "") + ev.details_url),
      "LOCATION:" + esc(ev.location || ev.location_name), "URL:" + ev.details_url, "END:VEVENT", "END:VCALENDAR"
    ];
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(lines.join("\r\n"));
  }

  function link(href, cls, text) {
    var a = el("a", cls, text);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  // One shared "Add to calendar" menu, placed over the page so the slider can't clip it.
  var menu = null, menuFor = null;
  function closeMenus() {
    if (menu) menu.style.display = "none";
    if (menuFor) menuFor.setAttribute("aria-expanded", "false");
    menuFor = null;
  }
  function openMenu(btn, ev, items) {
    if (!menu) {
      menu = el("div", "re re__menu");
      menu.setAttribute("role", "menu");
      menu.addEventListener("click", function (e) { e.stopPropagation(); setTimeout(closeMenus, 0); });
      document.body.appendChild(menu);
    }
    menu.innerHTML = "";
    if (!items) {
      var ics = link(icsLink(ev), "", "Apple / Outlook");
      ics.removeAttribute("target");
      ics.setAttribute("download", ev.title.replace(/[^\w\- ]+/g, "").trim() + ".ics");
      items = [link(gcalLink(ev), "", "Google Calendar"), ics];
    }
    var g = items[0];
    items.forEach(function (a) { a.setAttribute("role", "menuitem"); menu.appendChild(a); });
    menu.style.display = "block";
    var r = btn.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
    var left = Math.max(8, Math.min(r.left, window.innerWidth - mw - 8));
    var top = r.bottom + 6 + mh > window.innerHeight ? r.top - mh - 6 : r.bottom + 6;
    menu.style.left = left + "px";
    menu.style.top = top + "px";
    menuFor = btn;
    btn.setAttribute("aria-expanded", "true");
    g.focus({ preventScroll: true });
  }
  document.addEventListener("click", closeMenus);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenus(); });
  window.addEventListener("scroll", closeMenus, true);
  window.addEventListener("resize", closeMenus);

  function pills(ev, past) {
    var box = el("div", "re__pills");
    if (ev.registration_url && !past) box.appendChild(link(ev.registration_url, "re-pill re-pill--solid", "Register"));
    else box.appendChild(link(ev.details_url, "re-pill re-pill--solid", "Details"));
    if (past) return box;
    var b = el("button", "re-pill", "Add to calendar");
    b.type = "button";
    b.setAttribute("aria-haspopup", "menu");
    b.setAttribute("aria-expanded", "false");
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      if (menuFor === b) { closeMenus(); return; }
      closeMenus();
      openMenu(b, ev);
    });
    box.appendChild(b);
    return box;
  }

  function media(ev, cls) {
    var a = link(ev.registration_url || ev.details_url, cls);
    a.setAttribute("aria-label", curly(ev.title));
    if (ev.image) {
      var img = el("img");
      img.src = ev.image;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      a.appendChild(img);
    }
    return a;
  }

  /* -- layouts ---------------------------------------- */
  function card(ev, past) {
    var c = el("article", "re-card");
    var m = media(ev, "re-card__media");
    var tag = el("span", "re-card__tag");
    var d = parts(ev.start, { month: "short", day: "numeric" });
    tag.appendChild(el("span", "re-card__mon", d.month));
    tag.appendChild(el("span", "re-card__day", d.day));
    tag.setAttribute("aria-hidden", "true");
    m.appendChild(tag);
    c.appendChild(m);
    var h = el("h3", "re-card__title");
    h.appendChild(link(ev.registration_url || ev.details_url, "", curly(ev.title)));
    c.appendChild(h);
    c.appendChild(el("p", "re-card__date", when(ev)));
    c.appendChild(pills(ev, past));
    return c;
  }

  function slide(ev) {
    var s = el("article", "re-slide");
    s.appendChild(media(ev, "re-slide__media"));
    var h = el("h3", "re-slide__title");
    h.appendChild(link(ev.registration_url || ev.details_url, "", curly(ev.title)));
    s.appendChild(h);
    var line = el("div", "re__line");
    line.appendChild(el("span", "re-slide__date", when(ev)));
    line.appendChild(pills(ev));
    s.appendChild(line);
    return s;
  }

  var ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6"/></svg>';

  function buildSlider(root, events) {
    var vp = el("div", "re__viewport");
    vp.tabIndex = 0;
    vp.setAttribute("aria-label", "Upcoming events");
    var track = el("div", "re__track");
    events.forEach(function (ev) { track.appendChild(slide(ev)); });
    vp.appendChild(track);
    root.appendChild(vp);
    if (events.length < 2) return;
    var nav = el("div", "re__arrows");
    var prev = el("button", "re__arrow");
    prev.type = "button";
    prev.setAttribute("aria-label", "Previous event");
    prev.innerHTML = ARROW.replace("<svg", '<svg style="transform:scaleX(-1)"');
    var next = el("button", "re__arrow");
    next.type = "button";
    next.setAttribute("aria-label", "Next event");
    next.innerHTML = ARROW;
    nav.appendChild(prev);
    nav.appendChild(next);
    root.appendChild(nav);
    function current() {
      var slides = track.children, mid = vp.scrollLeft + vp.clientWidth / 2, best = 0, dist = Infinity;
      for (var i = 0; i < slides.length; i++) {
        var c = slides[i].offsetLeft + slides[i].offsetWidth / 2, dd = Math.abs(c - mid);
        if (dd < dist) { dist = dd; best = i; }
      }
      return best;
    }
    function go(i) {
      var slides = track.children, n = slides.length;
      i = (i + n) % n;
      var s = slides[i];
      vp.scrollTo({ left: s.offsetLeft - (vp.clientWidth - s.offsetWidth) / 2, behavior: "smooth" });
    }
    prev.addEventListener("click", function () { go(current() - 1); });
    next.addEventListener("click", function () { go(current() + 1); });
    vp.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); go(current() + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(current() - 1); }
    });
  }

  function buildFull(root, data, opts) {
    var tabs = el("div", "re__tabs");
    tabs.setAttribute("role", "tablist");
    var body = el("div");
    var views = [["upcoming", "Upcoming"], ["past", "Past events"]];
    var buttons = views.map(function (v, i) {
      var b = el("button", "re__tab" + (i === 0 ? " is-active" : ""), v[1]);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(i === 0));
      b.addEventListener("click", function () { show(v[0]); });
      tabs.appendChild(b);
      return b;
    });
    root.appendChild(tabs);
    root.appendChild(body);
    var foot = el("div", "re__foot");
    var sub = el("button", "re-pill", "Subscribe to this calendar");
    sub.type = "button";
    sub.setAttribute("aria-haspopup", "menu");
    sub.addEventListener("click", function (e) {
      e.stopPropagation();
      if (menuFor === sub) { closeMenus(); return; }
      closeMenus();
      var apple = link("webcal://" + ICS, "", "Apple / Outlook");
      apple.removeAttribute("target");
      openMenu(sub, null, [apple, link("https://calendar.google.com/calendar/r?cid=" + encodeURIComponent("webcal://" + ICS), "", "Google Calendar")]);
    });
    foot.appendChild(sub);
    root.appendChild(foot);

    function show(view) {
      var past = view === "past";
      buttons.forEach(function (b, i) {
        var on = views[i][0] === view;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", String(on));
      });
      foot.style.display = past ? "none" : "";
      var all = pick(data, { include: opts.include, exclude: opts.exclude, featured: opts.featured, all: true }, past);
      body.innerHTML = "";
      if (!all.length) {
        body.appendChild(el("p", "re__msg", past ? "No past events yet." : "No upcoming events right now. Check back soon."));
        return;
      }
      var grid = el("div", "re__list"), shown = 0;
      body.appendChild(grid);
      var more = el("button", "re-pill re__more", "Show more");
      more.type = "button";
      function page() {
        all.slice(shown, shown + opts.count).forEach(function (ev) { grid.appendChild(card(ev, past)); });
        shown = Math.min(all.length, shown + opts.count);
        more.style.display = shown < all.length ? "" : "none";
      }
      more.addEventListener("click", page);
      body.appendChild(more);
      page();
    }
    root.className += " re--grid";
    show("upcoming");
    if (root.getAttribute("data-seo") !== "false") seo(pick(data, { exclude: opts.exclude, include: opts.include, all: true }).slice(0, 20));
  }

  // Lets Google show upcoming events in search results.
  function seo(events) {
    if (!events.length || document.getElementById("re-seo")) return;
    var s = document.createElement("script");
    s.type = "application/ld+json";
    s.id = "re-seo";
    s.textContent = JSON.stringify(events.map(function (ev) {
      var o = {
        "@context": "https://schema.org", "@type": "Event", name: ev.title, startDate: ev.start, endDate: ev.end,
        eventStatus: "https://schema.org/EventScheduled", eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        url: ev.details_url, description: ev.description || undefined, image: ev.image ? [ev.image] : undefined,
        organizer: { "@type": "Organization", name: "Radiant Central Coast", url: "https://radiantcentralcoast.com" }
      };
      if (ev.location || ev.location_name) o.location = { "@type": "Place", name: ev.location_name || ev.location, address: ev.location || ev.location_name };
      return o;
    })).replace(/[<]/g, "\\u003c");
    document.head.appendChild(s);
  }

  /* -- data ---------------------------------------- */
  var feed = null;
  function load() {
    if (!feed) {
      feed = fetch(FEED, { cache: "no-cache" }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
    }
    return feed;
  }

  function pick(data, opts, past) {
    var now = Date.now(), seen = {}, out = [];
    var inc = list(opts.include), exc = list(opts.exclude);
    var all = (data.events || []).slice();
    if (past) all.reverse();                                         // most recent first
    all.forEach(function (ev) {
      var over = new Date(ev.end || ev.start).getTime() < now;
      if (over !== !!past) return;
      var t = fold(ev.title);
      if (exc.some(function (x) { return t.indexOf(x) !== -1; })) return;
      if (inc.length && !inc.some(function (x) { return t.indexOf(x) !== -1; })) return;
      if (opts.featured && !ev.featured) return;
      if (seen[ev.event_id]) return;                                   // next date of each event only
      seen[ev.event_id] = true;
      out.push(ev);
    });
    return opts.all ? out : out.slice(0, opts.count);
  }

  function render(root) {
    root.setAttribute("data-re-ready", "1");
    var layout = (root.getAttribute("data-radiant-events") || "grid").toLowerCase();
    if (layout !== "slider" && layout !== "full") layout = "grid";
    var opts = {
      count: parseInt(root.getAttribute("data-count"), 10) || DEFAULTS[layout],
      exclude: root.hasAttribute("data-exclude") ? root.getAttribute("data-exclude") : "Espa\u00f1ol",
      include: root.getAttribute("data-include") || "",
      featured: root.getAttribute("data-featured") === "true"
    };
    root.className = (root.className ? root.className + " " : "") + "re re--" + layout +
      (root.getAttribute("data-full-width") === "false" ? " re--contained" : "");
    var heading = root.getAttribute("data-heading");
    root.innerHTML = "";
    if (heading) root.appendChild(el("h2", "re__heading", heading));
    var msg = el("p", "re__msg", "Loading events\u2026");
    root.appendChild(msg);
    load().then(function (data) {
      root.removeChild(msg);
      var age = (Date.now() - new Date(data.generated_at).getTime()) / 36e5;
      if (age > STALE_HOURS) {
        var st = el("p", "re__stale", "This list may be out of date. ");
        st.appendChild(link(CHURCH_CENTER, "", "See the latest on Church Center."));
        root.appendChild(st);
      }
      var events = pick(data, opts);
      if (!events.length && layout !== "full") {
        root.appendChild(el("p", "re__msg", "No upcoming events right now. Check back soon."));
        return;
      }
      if (layout === "full") { buildFull(root, data, opts); return; }
      if (layout === "slider") buildSlider(root, events);
      else {
        var grid = el("div", "re__list");
        events.forEach(function (ev) { grid.appendChild(card(ev)); });
        root.appendChild(grid);
      }
    }).catch(function () {
      msg.textContent = "";
      msg.appendChild(document.createTextNode("Events couldn\u2019t load right now. "));
      msg.appendChild(link(CHURCH_CENTER, "", "See them on Church Center."));
    });
  }

  // Edge-to-edge slider: 100vw includes the scrollbar on computers, so subtract it.
  function measure() {
    document.documentElement.style.setProperty("--re-sb", (window.innerWidth - document.documentElement.clientWidth) + "px");
  }
  window.addEventListener("resize", measure);

  function scan() {
    measure();
    if (!document.getElementById("re-style")) {
      var st = document.createElement("style");
      st.id = "re-style";
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    var roots = document.querySelectorAll("[data-radiant-events]:not([data-re-ready])");
    for (var i = 0; i < roots.length; i++) render(roots[i]);
  }

  window.__radiantEvents = { scan: scan };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
  else scan();
})();
