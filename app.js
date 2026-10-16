/* Event kit - renders every section from data/event.json. Vanilla JS, no build step.
   Sections render in the order listed in data.sections; set "on": false to hide one. */
(function () {
  "use strict";

  var D = null;              // event data
  var state = { tzMode: "event", tier: null };
  var USER_TZ = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ""; } })();

  // ---------- helpers ----------
  function esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  // [PLACEHOLDER] markers get a visible tag so draft copy is obvious on the page.
  function copy(v) { return esc(v).replace(/\[PLACEHOLDER\]\s?/g, '<span class="ph">Placeholder</span> '); }
  function $(id) { return document.getElementById(id); }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function trackIndex(id) { for (var i = 0; i < D.tracks.length; i++) if (D.tracks[i].id === id) return i + 1; return 0; }

  // ---------- time zones ----------
  function tzOffsetMs(date, tz) {
    var p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(date).forEach(function (x) { p[x.type] = x.value; });
    var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return asUtc - Math.floor(date.getTime() / 1000) * 1000;
  }
  // "2026-11-14" + "09:00" in the event time zone -> a real Date.
  function zoned(dateStr, timeStr) {
    var d = dateStr.split("-"), t = timeStr.split(":");
    var guess = Date.UTC(+d[0], +d[1] - 1, +d[2], +t[0], +t[1]);
    var off = tzOffsetMs(new Date(guess), D.meta.timezone);
    var res = guess - off;
    var off2 = tzOffsetMs(new Date(res), D.meta.timezone);
    if (off2 !== off) res = guess - off2;
    return new Date(res);
  }
  function viewTz() { return state.tzMode === "local" && USER_TZ ? USER_TZ : D.meta.timezone; }
  function fmtTime(date) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: viewTz() });
  }
  function tzShort(tz, date) {
    try {
      var part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(date)
        .filter(function (x) { return x.type === "timeZoneName"; })[0];
      return part ? part.value : tz;
    } catch (e) { return tz; }
  }
  function sessionTimes(day, s) {
    var a = zoned(day.date, s.start), b = zoned(day.date, s.end);
    return { start: a, end: b, label: fmtTime(a) + " - " + fmtTime(b) };
  }

  // ---------- calendar (.ics) ----------
  function icsStamp(d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
  function icsText(v) { return String(v || "").replace(/\[PLACEHOLDER\]\s?/g, "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
  function downloadIcs(days, filename) {
    var loc = [D.meta.venue, D.meta.address].filter(Boolean).join(", ");
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Event Kit//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
    days.forEach(function (day) {
      day.sessions.forEach(function (s) {
        var t = sessionTimes(day, s);
        lines.push("BEGIN:VEVENT", "UID:" + s.id + "-" + D.meta.year + "@event-kit", "DTSTAMP:" + icsStamp(new Date()),
          "DTSTART:" + icsStamp(t.start), "DTEND:" + icsStamp(t.end), "SUMMARY:" + icsText(D.meta.name + ": " + s.title),
          "DESCRIPTION:" + icsText(s.detail), "LOCATION:" + icsText(loc), "END:VEVENT");
      });
    });
    lines.push("END:VCALENDAR");
    var blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- shared bits ----------
  function sectionShell(id, title, inner, extraClass) {
    return '<section class="section sec-' + id + (extraClass ? " " + extraClass : "") + '" id="' + id + '" aria-labelledby="' + id + '-title">' +
      '<div class="wrap"><h2 class="section-title" id="' + id + '-title">' + copy(title) + "</h2>" + inner + "</div></section>";
  }
  function initials(name) { return name.split(/\s+/).map(function (w) { return w.charAt(0); }).join("").slice(0, 2).toUpperCase(); }
  function speakerSessions() {
    var map = {};
    D.schedule.days.forEach(function (day) {
      day.sessions.forEach(function (s) {
        (s.speakers || []).forEach(function (sp) { (map[sp] = map[sp] || []).push({ day: day, s: s }); });
      });
    });
    return map;
  }

  // ---------- hero ----------
  function renderHero() {
    var h = D.hero, m = D.meta;
    $("hero").innerHTML =
      '<p class="hero-when">' + esc(m.dates) + '<span class="sep" aria-hidden="true">/</span>' + esc(m.venue) + ", " + esc(m.city) + "</p>" +
      '<h1 id="hero-title">' + h.title.map(function (l) { return "<span>" + esc(l) + "</span>"; }).join("") + "</h1>" +
      '<p class="hero-sub">' + copy(h.sub) + "</p>" +
      '<div class="hero-ctas">' +
        '<a class="btn btn-primary" href="' + esc(h.primaryCta.href) + '">' + esc(h.primaryCta.label) + ' <span class="arrow" aria-hidden="true">&rarr;</span></a>' +
        '<a class="btn" href="' + esc(h.secondaryCta.href) + '">' + esc(h.secondaryCta.label) + "</a>" +
      "</div>" +
      (h.facts && h.facts.length ? '<ul class="hero-facts" aria-label="At a glance">' + h.facts.map(function (f) {
        return '<li><span class="n">' + esc(f.value) + '</span><span class="l">' + esc(f.label) + "</span></li>";
      }).join("") + "</ul>" : "");
  }

  // ---------- sections ----------
  var R = {};

  R.about = function () {
    var a = D.about;
    return sectionShell("about", a.heading, '<div class="about-copy">' + a.paragraphs.map(function (p, i) {
      return "<p" + (i === 0 ? ' class="lede"' : "") + ">" + copy(p) + "</p>";
    }).join("") + "</div>");
  };

  R.speakers = function () {
    var sp = D.speakers, map = speakerSessions();
    function sessionLinks(id) {
      var list = map[id] || [];
      if (!list.length) return "";
      return '<ul class="sp-sessions" aria-label="Sessions">' + list.map(function (x) {
        var t = sessionTimes(x.day, x.s);
        return '<li><a href="#session-' + x.s.id + '"><span class="t" data-start="' + x.day.id + "|" + x.s.id + '">' + esc(x.day.label) + ", " + esc(fmtTime(t.start)) + "</span> " + esc(x.s.title) + "</a></li>";
      }).join("") + "</ul>";
    }
    function photo(p, cls) {
      return p.photo
        ? '<img class="' + cls + '" src="' + esc(p.photo) + '" alt="' + esc(p.name) + '" loading="lazy">'
        : '<div class="' + cls + ' sp-initials" aria-hidden="true">' + esc(initials(p.name)) + "</div>";
    }
    var first = sp.items[0], rest = sp.items.slice(1);
    var featured = first ? '<article class="sp-featured" id="speaker-' + first.id + '">' + photo(first, "sp-photo") +
      '<div class="sp-body"><h3 class="sp-name">' + esc(first.name) + '</h3><p class="sp-role">' + esc(first.role) + "</p>" +
      '<p class="sp-bio">' + copy(first.bio) + "</p>" + sessionLinks(first.id) + "</div></article>" : "";
    var grid = '<ul class="sp-grid">' + rest.map(function (p) {
      return '<li class="sp-card" id="speaker-' + p.id + '">' + photo(p, "sp-photo") +
        '<h3 class="sp-name">' + (p.link ? '<a href="' + esc(p.link) + '">' + esc(p.name) + "</a>" : esc(p.name)) + "</h3>" +
        '<p class="sp-role">' + esc(p.role) + "</p>" + sessionLinks(p.id) + "</li>";
    }).join("") + "</ul>";
    return sectionShell("speakers", sp.heading, (sp.intro ? '<p class="lede">' + copy(sp.intro) + "</p>" : "") + featured + grid);
  };

  R.schedule = function () {
    var s = D.schedule;
    var showTz = USER_TZ && USER_TZ !== D.meta.timezone;
    var refDate = zoned(s.days[0].date, "12:00");
    var tzBar = '<div class="tz-bar"><p class="tz-label" id="tz-label">Times in ' + esc(tzShort(viewTz(), refDate)) + "</p>" +
      (showTz ? '<button type="button" class="btn btn-small" id="tz-toggle" aria-pressed="' + (state.tzMode === "local") + '">' +
        (state.tzMode === "local" ? "Show event time (" + esc(tzShort(D.meta.timezone, refDate)) + ")" : "Show my time (" + esc(tzShort(USER_TZ, refDate)) + ")") + "</button>" : "") +
      "</div>";
    var legend = '<ul class="track-legend" aria-label="Tracks">' + D.tracks.map(function (t, i) {
      return '<li class="track-' + (i + 1) + '"><span class="swatch" aria-hidden="true"></span>' + esc(t.name) + "</li>";
    }).join("") + "</ul>";
    var single = s.days.length === 1;
    var tabs = single ? "" : '<div class="day-tabs" role="tablist" aria-label="Event days">' + s.days.map(function (day, i) {
      return '<button class="day-tab" role="tab" type="button" id="tab-' + day.id + '" aria-controls="panel-' + day.id +
        '" aria-selected="' + (i === 0) + '" tabindex="' + (i === 0 ? 0 : -1) + '"><span class="dt-label">' + esc(day.label) +
        '</span><span class="dt-title">' + esc(day.title) + "</span></button>";
    }).join("") + "</div>";
    var panels = s.days.map(function (day, i) {
      var sorted = day.sessions.slice().sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
      return (single ? '<div class="day-panel" id="panel-' + day.id + '"><h3 class="day-single">' + esc(day.title) + "</h3>"
        : '<div class="day-panel" role="tabpanel" id="panel-' + day.id + '" aria-labelledby="tab-' + day.id + '"' + (i ? " hidden" : "") + ' tabindex="0">') +
        '<ol class="sessions">' + sorted.map(function (x) {
          var t = sessionTimes(day, x), tr = byId(D.tracks, x.track);
          var spk = (x.speakers || []).map(function (id) {
            var p = byId(D.speakers.items, id);
            return p ? '<a href="#speaker-' + id + '">' + esc(p.name) + "</a>" : "";
          }).filter(Boolean).join(", ");
          return '<li class="session track-' + trackIndex(x.track) + '" id="session-' + x.id + '">' +
            '<span class="s-time"><time datetime="' + t.start.toISOString() + '">' + esc(t.label) + "</time></span>" +
            '<div class="s-body"><h3 class="s-title">' + esc(x.title) + "</h3>" +
              (spk ? '<p class="s-speakers">' + spk + "</p>" : "") +
              (x.detail ? '<p class="s-detail">' + copy(x.detail) + "</p>" : "") + "</div>" +
            (tr ? '<span class="s-track">' + esc(tr.name) + "</span>" : "") +
          "</li>";
        }).join("") + "</ol>" +
        '<button type="button" class="btn btn-small ics-btn" data-ics-day="' + day.id + '">Add ' + esc(day.label) + " to calendar</button>" +
      "</div>";
    }).join("");
    return sectionShell("schedule", s.heading, (s.note ? '<p class="note">' + copy(s.note) + "</p>" : "") + tzBar + legend + tabs + panels);
  };

  function rowPreviewItems(row) {
    if (!row.from) return null;
    var parts = row.from.split(":"), kind = parts[0], key = parts[1], out = [];
    D.schedule.days.forEach(function (day) {
      day.sessions.forEach(function (s) {
        if ((kind === "day" && day.id === key) || (kind === "track" && s.track === key) || (kind === "session" && s.id === key)) out.push({ day: day, s: s });
      });
    });
    return out;
  }
  function rowPreviewHtml(row) {
    var t = D.tickets, items = rowPreviewItems(row);
    var incl = t.tiers.filter(function (tier) { var v = row.tiers[tier.id]; return v && v !== "no"; }).map(function (x) { return x.name; });
    var body = items && items.length
      ? '<ul class="pv-list">' + items.map(function (x) {
          var tm = sessionTimes(x.day, x.s);
          return '<li><span class="t">' + esc(x.day.label) + ", " + esc(fmtTime(tm.start)) + "</span> " + esc(x.s.title) + "</li>";
        }).join("") + "</ul>"
      : '<p>' + copy(row.detail || "") + "</p>";
    return '<p class="pv-title">' + esc(row.label) + "</p>" + body +
      '<p class="pv-incl">Included in: ' + (incl.length ? esc(incl.join(", ")) : "none") + "</p>";
  }
  function cell(v) {
    if (v === "yes") return '<span class="yes"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.2"/></svg><span class="sr">Included</span></span>';
    if (!v || v === "no") return '<span class="no" aria-hidden="true">-</span><span class="sr">Not included</span>';
    return '<span class="val">' + esc(v) + "</span>";
  }
  function priceNum(p) { var m = String(p).replace(/,/g, "").match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; }

  R.tickets = function () {
    var t = D.tickets;
    state.tier = state.tier || t.recommended || t.tiers[0].id;
    var head = '<thead><tr><td class="m-corner"></td>' + t.tiers.map(function (tier) {
      return '<th scope="col" class="m-col c-' + tier.id + (tier.id === t.recommended ? " is-rec" : "") + '"><label class="m-pick">' +
        '<input type="radio" name="tier" value="' + tier.id + '"' + (tier.id === state.tier ? " checked" : "") + ">" +
        (tier.id === t.recommended ? '<span class="m-rec">Most picked</span>' : "") +
        '<span class="m-name">' + esc(tier.name) + '</span><span class="m-price">' + esc(tier.price) + '</span><span class="m-note">' + esc(tier.note || "") + "</span></label></th>";
    }).join("") + "</tr></thead>";
    var lastGroup = null, body = "";
    t.rows.forEach(function (row) {
      if (row.group && row.group !== lastGroup) {
        body += '<tr class="m-group"><th scope="rowgroup" colspan="' + (t.tiers.length + 1) + '">' + esc(row.group) + "</th></tr>";
        lastGroup = row.group;
      }
      body += '<tr class="m-row" data-row="' + row.id + '"><th scope="row"><button type="button" class="m-label" aria-expanded="false" aria-controls="detail-' + row.id + '">' +
        esc(row.label) + '<span class="m-more" aria-hidden="true">+</span></button></th>' +
        t.tiers.map(function (tier) { return '<td class="c-' + tier.id + '" data-tier="' + esc(tier.name) + '">' + cell(row.tiers[tier.id]) + "</td>"; }).join("") + "</tr>" +
        '<tr class="m-detail" id="detail-' + row.id + '" hidden><td colspan="' + (t.tiers.length + 1) + '"><div class="pv">' + rowPreviewHtml(row) + "</div></td></tr>";
    });
    var nums = t.tiers.map(function (x) { return priceNum(x.price); });
    var perDay = nums.every(function (n, i) { return n !== null && t.tiers[i].days; })
      ? '<tfoot><tr><th scope="row">Cost per day</th>' + t.tiers.map(function (tier, i) {
          return '<td class="c-' + tier.id + '" data-tier="' + esc(tier.name) + '">$' + Math.round(nums[i] / tier.days) + "</td>";
        }).join("") + "</tr></tfoot>" : "";
    var table = '<table class="matrix" id="matrix" style="--tiers:' + t.tiers.length + '"><caption class="sr">What each ticket includes</caption>' + head + "<tbody>" + body + "</tbody>" + perDay + "</table>";
    var preview = '<aside class="preview" id="preview" aria-live="polite" aria-label="Row preview"><p class="pv-empty">Hover or focus a row to see exactly what it covers.</p></aside>';
    return sectionShell("tickets", t.heading,
      (t.intro ? '<p class="lede">' + copy(t.intro) + "</p>" : "") +
      '<fieldset class="matrix-wrap"><legend class="sr">Choose a ticket</legend><div class="matrix-layout">' + table + preview + "</div></fieldset>" +
      '<div class="matrix-cta"><a class="btn btn-primary" href="#register" id="tier-cta"></a>' +
      (t.footnote ? '<p class="note">' + copy(t.footnote) + "</p>" : "") + "</div>");
  };

  R.sponsors = function () {
    var s = D.sponsors;
    return sectionShell("sponsors", s.heading, s.tiers.map(function (tier, i) {
      return '<div class="sponsor-tier' + (i === 0 ? " is-top" : "") + '"><h3 class="tier-name">' + esc(tier.name) + '</h3><ul class="sponsor-list">' +
        tier.items.map(function (x) {
          var inner = x.logo ? '<img src="' + esc(x.logo) + '" alt="' + esc(x.name) + '" loading="lazy">' : '<span class="wordmark">' + esc(x.name) + "</span>";
          return "<li>" + (x.link ? '<a href="' + esc(x.link) + '">' + inner + "</a>" : inner) + "</li>";
        }).join("") + "</ul></div>";
    }).join(""));
  };

  R.venue = function () {
    var v = D.venue;
    return sectionShell("venue", v.heading,
      (v.intro ? '<p class="lede">' + copy(v.intro) + "</p>" : "") +
      '<dl class="ruled">' + v.items.map(function (x) { return "<div><dt>" + esc(x.title) + "</dt><dd>" + copy(x.body) + "</dd></div>"; }).join("") + "</dl>" +
      (v.mapLink ? '<a class="btn btn-small" href="' + esc(v.mapLink) + '">Open in maps</a>' : ""));
  };

  R.register = function () {
    var r = D.registration, t = D.tickets;
    var opts = t.tiers.map(function (x) { return '<option value="' + x.id + '">' + esc(x.name) + " - " + esc(x.price) + "</option>"; }).join("");
    var extras = (r.extraFields || []).map(function (f) {
      var hint = f.hint ? '<span class="hint" id="h-' + f.id + '">' + esc(f.hint) + "</span>" : "";
      var desc = f.hint ? ' aria-describedby="h-' + f.id + '"' : "";
      var input = f.type === "textarea"
        ? '<textarea id="f-' + f.id + '" name="' + f.id + '"' + desc + (f.required ? " required" : "") + "></textarea>"
        : '<input type="' + (f.type || "text") + '" id="f-' + f.id + '" name="' + f.id + '"' + desc + (f.required ? " required" : "") + ">";
      return '<div class="field"><label for="f-' + f.id + '">' + esc(f.label) + (f.required ? "" : ' <span class="opt">(optional)</span>') + "</label>" + input + hint + "</div>";
    }).join("");
    return sectionShell("register", r.heading,
      (r.intro ? '<p class="lede">' + copy(r.intro) + "</p>" : "") +
      '<p class="demo" role="note">' + esc(r.demoNotice) + "</p>" +
      '<div id="reg-out"><form class="reg-form" id="reg-form" novalidate>' +
        '<div class="field"><label for="f-tier">Ticket</label><select id="f-tier" name="tier">' + opts + "</select></div>" +
        '<div class="two-col">' +
          '<div class="field"><label for="f-name">Full name</label><input type="text" id="f-name" name="name" autocomplete="name" required aria-describedby="e-name"><span class="error" id="e-name"></span></div>' +
          '<div class="field"><label for="f-email">Email</label><input type="email" id="f-email" name="email" autocomplete="email" inputmode="email" required aria-describedby="e-email"><span class="error" id="e-email"></span></div>' +
        "</div>" + extras +
        '<button type="submit" class="btn btn-primary" id="reg-submit">Register</button>' +
      "</form></div>");
  };

  R.faq = function () {
    var f = D.faq;
    return sectionShell("faq", f.heading, '<div class="faq-list">' + f.items.map(function (x) {
      return '<details class="faq-item"><summary><span>' + copy(x.q) + '</span><span class="q-icon" aria-hidden="true">+</span></summary><div class="a"><p>' + copy(x.a) + "</p></div></details>";
    }).join("") + "</div>");
  };

  // ---------- wiring ----------
  function wireTabs() {
    var root = $("schedule");
    if (!root) return;
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { selectTab(tab, false); });
      tab.addEventListener("keydown", function (e) {
        var n = null;
        if (e.key === "ArrowRight") n = tabs[(i + 1) % tabs.length];
        if (e.key === "ArrowLeft") n = tabs[(i - 1 + tabs.length) % tabs.length];
        if (e.key === "Home") n = tabs[0];
        if (e.key === "End") n = tabs[tabs.length - 1];
        if (n) { e.preventDefault(); selectTab(n, true); }
      });
    });
  }
  function selectTab(tab, focus) {
    var tabs = $("schedule").querySelectorAll('[role="tab"]');
    Array.prototype.forEach.call(tabs, function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
  }

  function setTier(id) {
    state.tier = id;
    var tier = byId(D.tickets.tiers, id);
    var m = $("matrix");
    if (m) {
      Array.prototype.forEach.call(m.querySelectorAll("th.m-col, td[class^='c-']"), function (c) {
        c.classList.toggle("is-sel", c.classList.contains("c-" + id));
      });
      var radio = m.querySelector('input[value="' + id + '"]');
      if (radio) radio.checked = true;
    }
    var cta = $("tier-cta");
    if (cta && tier) cta.innerHTML = "Register with " + esc(tier.name) + ", " + esc(tier.price) + ' <span class="arrow" aria-hidden="true">&rarr;</span>';
    var sel = $("f-tier");
    if (sel) sel.value = id;
  }

  function wireMatrix() {
    var m = $("matrix");
    if (!m) return;
    var preview = $("preview");
    m.addEventListener("change", function (e) { if (e.target.name === "tier") setTier(e.target.value); });
    function show(rowEl) {
      Array.prototype.forEach.call(m.querySelectorAll(".m-row"), function (r) { r.classList.toggle("is-hot", r === rowEl); });
      var row = byId(D.tickets.rows, rowEl.getAttribute("data-row"));
      if (row && preview) preview.innerHTML = rowPreviewHtml(row);
    }
    Array.prototype.forEach.call(m.querySelectorAll(".m-row"), function (rowEl) {
      rowEl.addEventListener("mouseenter", function () { show(rowEl); });
      rowEl.addEventListener("focusin", function () { show(rowEl); });
      var btn = rowEl.querySelector(".m-label");
      btn.addEventListener("click", function () {
        var detail = $(btn.getAttribute("aria-controls"));
        var open = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", String(!open));
        detail.hidden = open;
        show(rowEl);
      });
    });
    setTier(state.tier);
  }

  function wireForm() {
    var form = $("reg-form");
    if (!form) return;
    form.elements.tier.addEventListener("change", function () { setTier(form.elements.tier.value); });
    if (state.tier) form.elements.tier.value = state.tier;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var first = null;
      function check(el, errId, msg) {
        el.setAttribute("aria-invalid", msg ? "true" : "false");
        $(errId).textContent = msg || "";
        if (msg && !first) first = el;
      }
      var name = form.elements.name, email = form.elements.email, ev = email.value.trim();
      check(name, "e-name", name.value.trim() ? "" : "Enter your name.");
      check(email, "e-email", !ev ? "Enter your email." : (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ev) ? "" : "Check the email format, for example name@example.com."));
      if (first) { first.focus(); return; }
      confirm({ name: name.value.trim(), email: ev, tier: byId(D.tickets.tiers, form.elements.tier.value) });
    });
  }

  function daysForTier(tierId) {
    return D.schedule.days.filter(function (day) {
      return day.sessions.some(function (s) { return !s.tiers || s.tiers.indexOf(tierId) > -1; });
    });
  }

  function confirm(rec) {
    var r = D.registration, days = daysForTier(rec.tier.id);
    $("reg-out").innerHTML =
      '<div class="confirm" role="status" tabindex="-1" id="reg-confirm">' +
        '<p class="confirm-kicker">Demo confirmation</p><h3>You\'re registered.</h3>' +
        '<dl class="confirm-dl"><dt>Name</dt><dd>' + esc(rec.name) + "</dd><dt>Email</dt><dd>" + esc(rec.email) +
        "</dd><dt>Ticket</dt><dd>" + esc(rec.tier.name) + ", " + esc(rec.tier.price) + "</dd></dl>" +
        "<p>" + copy(r.confirmation) + "</p>" +
        '<div class="confirm-actions">' + days.map(function (d) {
          return '<button type="button" class="btn btn-small" data-ics-day="' + d.id + '" data-ics-tier="' + rec.tier.id + '">Add ' + esc(d.label) + " to calendar</button>";
        }).join("") + '<button type="button" class="btn btn-small" id="reg-again">Register someone else</button></div>' +
      "</div>";
    $("reg-confirm").focus();
    $("reg-again").addEventListener("click", function () {
      var sec = $("register");
      sec.outerHTML = R.register();
      wireForm();
      $("f-name").focus();
    });
  }

  function rerenderTimes() {
    // Re-render the time-dependent sections in place, keeping the selected day.
    var sel = document.querySelector('#schedule [role="tab"][aria-selected="true"]');
    var selId = sel ? sel.id : null;
    ["schedule", "speakers", "tickets"].forEach(function (id) {
      var old = $(id);
      if (old && R[id]) old.outerHTML = R[id]();
    });
    wireTabs(); wireMatrix();
    if (selId && $(selId)) selectTab($(selId), false);
  }

  function wireGlobal() {
    document.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target : null;
      if (!t) return;
      var tz = t.closest("#tz-toggle");
      if (tz) { state.tzMode = state.tzMode === "local" ? "event" : "local"; rerenderTimes(); var b = $("tz-toggle"); if (b) b.focus(); return; }
      var ics = t.closest("[data-ics-day]");
      if (ics) {
        var day = byId(D.schedule.days, ics.getAttribute("data-ics-day"));
        var tier = ics.getAttribute("data-ics-tier");
        var copyDay = { id: day.id, date: day.date, label: day.label, sessions: day.sessions.filter(function (s) { return !tier || !s.tiers || s.tiers.indexOf(tier) > -1; }) };
        downloadIcs([copyDay], (D.meta.shortName || "event") + "-" + day.id + ".ics");
        return;
      }
      // Links into a hidden schedule day switch the tab first.
      var a = t.closest('a[href^="#session-"]');
      if (a) {
        var target = $(a.getAttribute("href").slice(1));
        if (target) {
          var panel = target.closest('[role="tabpanel"]');
          if (panel && panel.hidden && $(panel.getAttribute("aria-labelledby"))) selectTab($(panel.getAttribute("aria-labelledby")), false);
          e.preventDefault();
          target.scrollIntoView({ block: "center" });
          target.classList.add("is-flash");
          setTimeout(function () { target.classList.remove("is-flash"); }, 1600);
          history.replaceState(null, "", "#" + target.id);
        }
      }
    });
  }

  function renderChrome() {
    var m = D.meta, on = D.sections.filter(function (s) { return s.on && R[s.id]; });
    document.title = m.pageTitle || m.name;
    var md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute("content", String(m.description || "").replace(/\[PLACEHOLDER\]\s?/g, ""));
    if (m.placeholderNotice) { $("notice").textContent = m.placeholderNotice; $("notice").hidden = false; }
    $("brand").innerHTML = '<span class="brand-mark" aria-hidden="true">' + esc(m.shortName) + '</span><span class="brand-name">' + esc(m.name) + "</span>";
    $("brand").setAttribute("aria-label", m.name + ", back to top");
    $("nav").innerHTML = on.filter(function (s) { return s.id !== "register"; }).map(function (s) {
      return '<li><a href="#' + s.id + '">' + esc(s.label) + "</a></li>";
    }).join("");
    var hasTickets = on.some(function (s) { return s.id === "tickets"; });
    $("header-cta").setAttribute("href", hasTickets ? "#tickets" : "#register");
    $("header-cta").textContent = hasTickets ? "Tickets" : "Register";
    $("sections").innerHTML = on.map(function (s) { return R[s.id](); }).join("");
    $("footer").innerHTML = '<div class="wrap footer-inner"><p class="footer-word" aria-hidden="true">' + esc(m.name) + "</p>" +
      '<nav aria-label="Footer"><ul class="footer-links">' + on.map(function (s) { return '<li><a href="#' + s.id + '">' + esc(s.label) + "</a></li>"; }).join("") + "</ul></nav>" +
      '<p class="footer-small">' + esc(m.dates) + " / " + esc(m.venue) + ", " + esc(m.city) + "</p>" +
      '<p class="footer-small">' + esc(m.footerLine || "") + "</p></div>";
  }

  function showError(err) {
    $("notice").hidden = false;
    $("notice").classList.add("is-error");
    $("notice").textContent = "Content failed to load from data/event.json.";
    $("hero").innerHTML = '<h1 id="hero-title">Content did not load</h1><p>Open this page from a web server (GitHub Pages, or python3 -m http.server), not straight from disk. Detail: ' + esc(err && err.message) + "</p>";
  }

  fetch("data/event.json", { cache: "no-cache" })
    .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
    .then(function (data) {
      D = data;
      renderHero();
      renderChrome();
      wireTabs(); wireMatrix(); wireForm(); wireGlobal();
      if (location.hash.length > 1) {
        var target = $(location.hash.slice(1));
        if (target) target.scrollIntoView();
      }
    })
    .catch(showError);
})();
