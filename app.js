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
  // "2026-11-20" -> "2026-11-21", for sessions that end after midnight.
  function nextDate(dateStr) {
    var d = dateStr.split("-");
    return new Date(Date.UTC(+d[0], +d[1] - 1, +d[2] + 1)).toISOString().slice(0, 10);
  }
  function sessionTimes(day, s) {
    var a = zoned(day.date, s.start), b = zoned(s.end <= s.start ? nextDate(day.date) : day.date, s.end);
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
      }).join("") + "</ul>" : "") +
      (h.nights ? renderNights(h.nights) : "");
  }
  // "Pick your night": one panel per night, each linking to that night's run-of-show tab.
  function renderNights(n) {
    return '<div class="nights"><h2 class="nights-title" id="nights-title">' + copy(n.heading) + "</h2>" +
      '<div class="nights-grid">' + n.items.map(function (x, i) {
        return '<article class="night night-' + (i + 1) + '" aria-labelledby="night-' + x.day + '">' +
          '<p class="night-date">' + esc(x.date) + '</p><h3 class="night-name" id="night-' + x.day + '">' + esc(x.name) + "</h3>" +
          '<ul class="night-points">' + x.points.map(function (pt) {
            var tr = byId(D.tracks, pt.track);
            return '<li class="track-' + trackIndex(pt.track) + '"><span class="swatch" aria-hidden="true"></span><span>' + copy(pt.text) +
              (tr ? '<span class="sr"> (' + esc(tr.name) + ")</span>" : "") + "</span></li>";
          }).join("") + "</ul>" +
          '<a class="btn btn-small night-link" href="#tab-' + x.day + '">' + esc(x.link) + ' <span class="arrow" aria-hidden="true">&rarr;</span></a>' +
        "</article>";
      }).join("") + "</div>" +
      (n.note ? '<p class="nights-note">' + copy(n.note) + "</p>" : "") + "</div>";
  }

  // ---------- sections ----------
  var R = {};

  R.about = function () {
    var a = D.about;
    return sectionShell("about", a.heading, '<div class="about-copy">' + a.paragraphs.map(function (p) {
      return "<p>" + copy(p) + "</p>";
    }).join("") + "</div>");
  };

  R.speakers = function () {
    var sp = D.speakers, map = speakerSessions();
    function sessionLinks(id) {
      var list = map[id] || [];
      if (!list.length) return "";
      return '<ul class="sp-sessions" aria-label="' + esc(sp.linksLabel || "Sessions") + '">' + list.map(function (x) {
        var t = sessionTimes(x.day, x.s);
        return '<li><a href="#session-' + x.s.id + '"><span class="t" data-start="' + x.day.id + "|" + x.s.id + '">' + esc(x.day.label) + ", " + esc(fmtTime(t.start)) + "</span> " + esc(x.s.title) + "</a></li>";
      }).join("") + "</ul>";
    }
    // Photos are cropped 4:5 at 800x1000. They show in a warm duotone and go full color on hover or focus.
    function photo(p, cls) {
      return p.photo
        ? '<img class="' + cls + (p.plain ? "" : " is-duotone") + '" src="' + esc(p.photo) + '" alt="' + esc(p.alt || p.name) +
          '" width="800" height="1000" loading="lazy" decoding="async">'
        : '<div class="' + cls + ' sp-initials" aria-hidden="true">' + esc(initials(p.name)) + "</div>";
    }
    // Each card opens the artist popup: click anywhere on the card except its set-time links,
    // or use the name button with the keyboard.
    function media(p) {
      return '<div class="sp-media">' + photo(p, "sp-photo") + '<span class="sp-tag" aria-hidden="true">' + esc(sp.viewLabel || "View artist") + "</span></div>";
    }
    function nameButton(p) {
      return '<button type="button" class="sp-open" data-artist="' + esc(p.id) + '" aria-haspopup="dialog">' + esc(p.name) + "</button>";
    }
    var first = sp.items[0], rest = sp.items.slice(1);
    var featured = first ? '<article class="sp-featured sp-hit" data-artist="' + esc(first.id) + '" id="speaker-' + first.id + '">' + media(first) +
      '<div class="sp-body"><h3 class="sp-name">' + nameButton(first) + '</h3><p class="sp-role">' + esc(first.role) + "</p>" +
      '<p class="sp-bio">' + copy(first.bio) + "</p>" + sessionLinks(first.id) + "</div></article>" : "";
    var grid = '<ul class="sp-grid">' + rest.map(function (p) {
      return '<li class="sp-card sp-hit" data-artist="' + esc(p.id) + '" id="speaker-' + p.id + '">' + media(p) +
        '<h3 class="sp-name">' + nameButton(p) + "</h3>" +
        '<p class="sp-role">' + esc(p.role) + "</p>" + sessionLinks(p.id) + "</li>";
    }).join("") + "</ul>";
    return sectionShell("speakers", sp.heading, (sp.intro ? '<p class="lede">' + copy(sp.intro) + "</p>" : "") + featured + grid);
  };

  R.dancecam = function () {
    var c = D.dancecam;
    return sectionShell("dancecam", c.heading,
      '<div class="cam">' +
        (c.intro ? '<p class="lede cam-intro">' + copy(c.intro) + "</p>" : "") +
        '<div class="cam-main">' +
          '<div class="cam-frame" id="cam-frame">' +
            '<canvas class="cam-canvas" id="cam-canvas" width="960" height="540" role="img" aria-label="' + esc(c.demoWho) + '"></canvas>' +
            '<video class="cam-video" id="cam-video" playsinline muted autoplay aria-hidden="true"></video>' +
            '<p class="cam-bug" aria-hidden="true">' + esc(c.bug) + "</p>" +
            '<p class="cam-tally"><span class="cam-dot" aria-hidden="true"></span><span id="cam-tally">' + esc(c.demoTally) + "</span></p>" +
            '<div class="cam-lower"><p class="cam-who" id="cam-who">' + esc(c.demoWho) + '</p><p class="cam-caption" id="cam-caption"></p></div>' +
          "</div>" +
          '<div class="cam-fx" role="group" aria-label="Effects">' + c.effects.map(function (fx, i) {
            return '<button type="button" class="fx-btn" data-fx="' + esc(fx.id) + '" aria-pressed="' + (i === 0) + '">' + esc(fx.label) + "</button>";
          }).join("") + "</div>" +
          '<div class="cam-controls">' +
            '<button type="button" class="btn btn-primary" id="cam-on">' + esc(c.onLabel) + "</button>" +
            '<button type="button" class="btn" id="cam-off" hidden>' + esc(c.offLabel) + "</button>" +
            '<button type="button" class="btn" id="cam-snap">' + esc(c.snapLabel) + "</button>" +
          "</div>" +
          '<p class="cam-privacy">' + copy(c.privacy) + "</p>" +
          '<p class="cam-status" id="cam-status" role="status"></p>' +
        "</div>" +
        '<div class="cam-shot" id="cam-shot" hidden>' +
            '<img class="polaroid" id="cam-shot-img" alt="' + esc(c.snapAlt) + '">' +
            '<div class="cam-shot-actions"><a class="btn btn-primary" id="cam-save" href="#" download="velvet-hour-dance-cam.png">' + esc(c.saveLabel) + "</a>" +
            '<button type="button" class="btn" id="cam-shot-close">' + esc(c.closeLabel) + "</button></div>" +
            '<p class="hint">' + copy(c.saveHint) + "</p>" +
        "</div>" +
      "</div>");
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
    // "from" takes one ref or several, comma separated: "session:a,session:b".
    var refs = row.from.split(",").map(function (r) { var p = r.trim().split(":"); return { kind: p[0], key: p[1] }; }), out = [];
    D.schedule.days.forEach(function (day) {
      day.sessions.forEach(function (s) {
        var hit = refs.some(function (r) {
          return (r.kind === "day" && day.id === r.key) || (r.kind === "track" && s.track === r.key) || (r.kind === "session" && s.id === r.key);
        });
        if (hit) out.push({ day: day, s: s });
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
      ? '<tfoot><tr><th scope="row">' + esc(t.perDayLabel || "Cost per day") + "</th>" + t.tiers.map(function (tier, i) {
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

  // ---------- hero moment: light-up dance floor ----------
  // Diagonal bands of light chase across the floor in the three track colors.
  // Squares under the cursor or finger light up; on phones, scrolling moves the chase.
  // Reduced motion: one still lit frame, no chase, no tracking.
  function danceFloor() {
    var host = $("hero-moment"), hero = $("top");
    if (!host || !hero) return;
    var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var floor = document.createElement("div");
    floor.className = "floor";
    host.appendChild(floor);
    var GAP = 3, cells = [], cols = 0, rows = 0, pitch = 0, tick = 0, scrollStep = 0, timer = null, onScreen = true, lastCell = null, hue = 0;
    // Tiles directly behind hero text stay dim (30% brightness) so the text keeps its contrast.
    var TEXT = ".hero-when, .hero h1 span, .hero-sub, .nights-title, .nights-note";
    function markDim() {
      if (!cells.length) return;
      var box = host.getBoundingClientRect(), rects = [], PAD = 6;
      Array.prototype.forEach.call(document.querySelectorAll(TEXT), function (el) {
        var range = document.createRange();
        range.selectNodeContents(el);
        Array.prototype.forEach.call(range.getClientRects(), function (r) { if (r.width && r.height) rects.push(r); });
      });
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var x = box.left + GAP + c * pitch, y = box.top + GAP + r * pitch, size = pitch - GAP, dim = false;
          for (var k = 0; k < rects.length && !dim; k++) {
            var q = rects[k];
            dim = x < q.right + PAD && x + size > q.left - PAD && y < q.bottom + PAD && y + size > q.top - PAD;
          }
          var el = cells[r * cols + c];
          el._dim = dim;
          el.classList.toggle("dim", dim);
        }
      }
    }
    function cls(el, name) { el.className = name + (el._dim ? " dim" : ""); }

    function build() {
      var size = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell")) || 44;
      pitch = size + GAP;
      var c = Math.ceil(host.clientWidth / pitch) + 1, r = Math.ceil(host.clientHeight / pitch) + 1;
      if (c === cols && r === rows) { markDim(); return; }
      cols = c; rows = r;
      floor.style.setProperty("--cols", cols);
      floor.innerHTML = new Array(cols * rows + 1).join("<i></i>");
      cells = floor.children;
      markDim();
      paint();
    }
    function paint() {
      var phase = tick + scrollStep, now = Date.now();
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var el = cells[r * cols + c];
          if (el._until > now) continue;
          var d = c + r - phase, m = ((d % 7) + 7) % 7, band = Math.floor(d / 7);
          var lit = m === 0 || (still && m === 3) || ((c * 31 + r * 17 + phase * 7) % 23 === 0);
          cls(el, lit ? "l" + ((((band + (m === 3 ? 1 : 0)) % 3) + 3) % 3 + 1) : "");
        }
      }
    }
    function lightAt(x, y) {
      var rect = host.getBoundingClientRect();
      var c = Math.floor((x - rect.left - GAP) / pitch), r = Math.floor((y - rect.top - GAP) / pitch);
      if (c < 0 || r < 0 || c >= cols || r >= rows) return;
      var el = cells[r * cols + c];
      if (el === lastCell) return;
      lastCell = el;
      var h = hue = hue % 3 + 1;
      el._until = Date.now() + 700;
      cls(el, "l" + h + " hot");
      setTimeout(function () { cls(el, "l" + h); }, 120);
    }
    function start() { if (!timer && !still && onScreen && !document.hidden) timer = setInterval(function () { tick++; paint(); }, 560); }
    function stop() { clearInterval(timer); timer = null; }

    build();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(markDim);
    if ("ResizeObserver" in window) new ResizeObserver(function () { markDim(); }).observe($("hero"));
    var resizeT;
    window.addEventListener("resize", function () { clearTimeout(resizeT); resizeT = setTimeout(build, 150); });
    if (still) return;
    start();
    hero.addEventListener("pointermove", function (e) { lightAt(e.clientX, e.clientY); });
    hero.addEventListener("touchmove", function (e) { var t = e.touches[0]; if (t) lightAt(t.clientX, t.clientY); }, { passive: true });
    var queued = false;
    window.addEventListener("scroll", function () {
      if (!onScreen || queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        var s = Math.floor(window.scrollY / 40);
        if (s !== scrollStep) { scrollStep = s; paint(); }
      });
    }, { passive: true });
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) { onScreen = en[0].isIntersecting; if (onScreen) start(); else stop(); }).observe(hero);
    }
  }

  // ---------- scene changes ----------
  // Each section is a scene. When it scrolls into view, a band of its stage light sweeps across the top once.
  // Sections re-rendered later (time zone toggle, form reset) keep their light without sweeping again.
  var litScenes = {}, sceneIO = null;
  function lightScenes() {
    var secs = document.querySelectorAll("#sections > .section");
    if (!("IntersectionObserver" in window)) { Array.prototype.forEach.call(secs, function (s) { s.classList.add("is-lit"); }); return; }
    sceneIO = sceneIO || new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-lit");
        litScenes[e.target.id] = true;
        sceneIO.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -20% 0px" });
    Array.prototype.forEach.call(secs, function (s) {
      if (litScenes[s.id]) s.classList.add("is-lit", "is-held");
      else sceneIO.observe(s);
    });
  }

  // ---------- dance cam ----------
  // A 1970s TV dance show broadcast. Each frame, the camera (mirrored) or the demo dancer is drawn into a
  // canvas and the chosen effect runs on it. Everything happens in this browser: nothing is recorded,
  // uploaded or sent. Snapshots stay on the device unless the visitor saves them, to their own device.
  // Safety: no full-frame flashes, nothing blinks faster than about once a second, and with reduced
  // motion every effect is drawn still and the demo dancer does not bounce.
  function wireDanceCam() {
    var cv = $("cam-canvas"), video = $("cam-video"), sec = $("dancecam");
    if (!cv || !cv.getContext) return;
    var c = D.dancecam, ctx = cv.getContext("2d"), W = cv.width, H = cv.height, K = H / 360;
    var still = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    var css = getComputedStyle(document.documentElement);
    function tok(n) { return css.getPropertyValue(n).trim(); }
    var COL = { bg: tok("--bg"), deep: tok("--bg-deep"), fg: tok("--fg"), chrome: tok("--chrome"), gold: tok("--gold"),
      lights: [tok("--track-1"), tok("--track-2"), tok("--track-3")] };
    var fx = c.effects[0].id, stream = null, live = false, raf = null, onScreen = !("IntersectionObserver" in window);
    var capIndex = 0, shotUrl = null;
    function makeCanvas(w, h) { var x = document.createElement("canvas"); x.width = w; x.height = h; return x; }
    function status(msg) { $("cam-status").textContent = msg || ""; }

    // ----- demo picture: an illustrated performer on a velvet stage -----
    var stage = makeCanvas(W, H), dancer = makeCanvas(W, H), demo = makeCanvas(W, H);
    (function paintStage(g) {
      g.scale(K, K);
      g.fillStyle = COL.bg; g.fillRect(0, 0, 640, 360);
      g.fillStyle = COL.deep;
      for (var x = 6; x < 640; x += 34) g.fillRect(x, 0, 14, 250);   // velvet curtain folds
      g.fillStyle = "rgba(247, 234, 211, 0.12)";                        // follow spot
      g.beginPath(); g.moveTo(296, 0); g.lineTo(344, 0); g.lineTo(440, 300); g.lineTo(200, 300); g.closePath(); g.fill();
      for (var j = 0; j < 3; j++) {                                     // light-up floor
        for (var i = 0; i < 16; i++) {
          g.fillStyle = (i + j) % 3 === 0 ? COL.lights[(i + j * 2) % 3] : COL.deep;
          g.fillRect(i * 40 + 1, 250 + j * 37 + 1, 38, 35);
        }
      }
    })(stage.getContext("2d"));
    (function paintDancer(g) {
      g.scale(K, K);
      var skin = "#8d5a3b";
      g.fillStyle = COL.deep; g.beginPath(); g.arc(320, 104, 44, 0, Math.PI * 2); g.fill();      // hair
      g.fillStyle = skin; g.fillRect(312, 132, 16, 20);                                            // neck
      g.beginPath(); g.arc(320, 122, 22, 0, Math.PI * 2); g.fill();                                // face
      g.fillStyle = COL.deep; g.fillRect(304, 114, 32, 8);                                         // shades
      var suit = new Path2D("M286 148 L354 148 L344 232 L348 300 L360 334 L318 334 L320 262 L316 334 L278 334 L292 300 L296 232 Z");
      g.fillStyle = COL.gold; g.fill(suit);                                                        // jumpsuit
      g.save(); g.clip(suit); g.fillStyle = "rgba(247, 234, 211, 0.75)";
      for (var n = 0; n < 160; n++) { g.beginPath(); g.arc(280 + (n * 37) % 82, 148 + (n * 53) % 188, 1.4, 0, Math.PI * 2); g.fill(); }
      g.restore();
      g.fillStyle = skin; g.beginPath(); g.moveTo(308, 148); g.lineTo(320, 174); g.lineTo(332, 148); g.closePath(); g.fill();
      g.fillStyle = COL.chrome; g.fillRect(296, 224, 48, 8); g.fillRect(276, 334, 44, 10); g.fillRect(318, 334, 44, 10);
      g.strokeStyle = COL.gold; g.lineWidth = 16; g.lineCap = "round"; g.lineJoin = "round";
      g.beginPath(); g.moveTo(350, 158); g.lineTo(374, 122); g.lineTo(392, 86); g.stroke();       // arm up with the mic
      g.beginPath(); g.moveTo(290, 158); g.lineTo(262, 188); g.lineTo(244, 166); g.stroke();      // arm out
      g.fillStyle = skin; g.beginPath(); g.arc(393, 82, 8, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(242, 162, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = COL.deep; g.fillRect(388, 58, 10, 20);
      g.fillStyle = COL.chrome; g.beginPath(); g.arc(393, 56, 8, 0, Math.PI * 2); g.fill();
    })(dancer.getContext("2d"));
    // The demo picture is a lineup photo (dancecam.demoPhoto), cover-cropped around demoFocus with a gentle
    // bounce. The illustrated dancer stands in until the photo loads, or if it cannot load.
    var photo = new Image(), photoReady = false;
    if (c.demoPhoto) {
      photo.onload = function () { photoReady = true; kick(); };
      photo.src = c.demoPhoto;
    }
    function demoFrame(t) {
      var g = demo.getContext("2d"), bounce = still ? 0 : Math.abs(Math.sin(t * 2.6)) * 8 * K;
      if (photoReady) {
        var f = c.demoFocus || [0.5, 0.5];
        var s = Math.max(W / photo.naturalWidth, H / photo.naturalHeight) * 1.04, dw = photo.naturalWidth * s, dh = photo.naturalHeight * s;
        var x = Math.min(0, Math.max(W - dw, W / 2 - dw * f[0]));
        var y = Math.min(0, Math.max(H - dh + 10 * K, H / 2 - dh * f[1]));
        g.fillStyle = COL.deep; g.fillRect(0, 0, W, H);
        g.drawImage(photo, x, y - bounce, dw, dh);
        return demo;
      }
      g.drawImage(stage, 0, 0);
      g.drawImage(dancer, 0, -bounce);
      return demo;
    }

    // Draw the current picture into a rect, cover-fit. The camera is mirrored, like looking in a mirror.
    function drawSource(g, t, dx, dy, dw, dh, zoom) {
      var src, sw, sh, mirror = false;
      if (live && video.readyState >= 2 && video.videoWidth) { src = video; sw = video.videoWidth; sh = video.videoHeight; mirror = true; }
      else { src = demoFrame(t); sw = W; sh = H; }
      var s = Math.max(dw / sw, dh / sh) * (zoom || 1), cw = dw / s, ch = dh / s;
      g.save();
      if (mirror) { g.translate(dx + dw, dy); g.scale(-1, 1); g.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, dw, dh); }
      else g.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, dx, dy, dw, dh);
      g.restore();
    }

    // ----- effects -----
    var scratch = makeCanvas(W, H), red = makeCanvas(W, H), cyan = makeCanvas(W, H), quad = makeCanvas(W / 2, H / 2);
    var scan = makeCanvas(W, H), grain = [];
    (function () {
      var g = scan.getContext("2d");
      g.fillStyle = "rgba(0, 0, 0, 0.22)";
      for (var y = 0; y < H; y += 4) g.fillRect(0, y, W, 2);
      for (var k = 0; k < 4; k++) {
        var gc = makeCanvas(W / 2, H / 2), gg = gc.getContext("2d"), img = gg.createImageData(gc.width, gc.height);
        for (var p = 0; p < img.data.length; p += 4) { var v = Math.random() * 255; img.data[p] = img.data[p + 1] = img.data[p + 2] = v; img.data[p + 3] = 255; }
        gg.putImageData(img, 0, 0);
        grain.push(gc);
      }
    })();
    function heartPath(g, cx, cy, s) {
      g.beginPath();
      g.moveTo(cx, cy + s * 0.36);
      g.bezierCurveTo(cx - s * 0.72, cy - s * 0.06, cx - s * 0.44, cy - s * 0.62, cx, cy - s * 0.28);
      g.bezierCurveTo(cx + s * 0.44, cy - s * 0.62, cx + s * 0.72, cy - s * 0.06, cx, cy + s * 0.36);
      g.closePath();
    }
    function caption(g, text, x, y, size) {
      g.font = size + "px Shrikhand, Georgia, serif";
      g.lineJoin = "round"; g.lineWidth = size * 0.22; g.strokeStyle = COL.deep; g.strokeText(text, x, y);
      g.fillStyle = COL.fg; g.fillText(text, x, y);
    }
    var FX = {
      // Light spots drift slowly across a dimmed picture. Nothing blinks.
      mirrorball: function (t) {
        drawSource(ctx, t, 0, 0, W, H);
        ctx.fillStyle = "rgba(28, 7, 24, 0.35)"; ctx.fillRect(0, 0, W, H);
        ctx.save(); ctx.globalCompositeOperation = "screen";
        for (var i = 0; i < 18; i++) {
          var a = t * 0.3 + i * (Math.PI * 2 / 18);
          var x = W / 2 + Math.cos(a) * W * (0.2 + (i % 4) * 0.1), y = H * 0.12 + (0.5 + 0.5 * Math.sin(a * 1.3 + i)) * H * 0.78;
          ctx.fillStyle = i % 4 === 0 ? COL.lights[(i / 4) % 3] : "rgba(247, 234, 211, 0.6)";
          ctx.globalAlpha = i % 4 === 0 ? 0.45 : 1;
          ctx.beginPath(); ctx.arc(x, y, (10 + (i % 3) * 7) * K, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = COL.chrome; ctx.beginPath(); ctx.arc(W / 2, 0, 30 * K, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = COL.deep; ctx.lineWidth = 2 * K;
        for (var g = -24; g <= 24; g += 8) { ctx.beginPath(); ctx.moveTo(W / 2 + g * K, 0); ctx.lineTo(W / 2 + g * K, 30 * K); ctx.stroke(); }
      },
      // Friday's sweetheart cam: heart frame, warm rose tint, "Slow Burn".
      heart: function (t) {
        var cx = W / 2, cy = H * 0.47, s = H * 0.86;
        ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, H);
        ctx.save(); heartPath(ctx, cx, cy, s); ctx.clip();
        drawSource(ctx, t, cx - s * 0.6, cy - s * 0.55, s * 1.2, s * 0.95);
        ctx.globalCompositeOperation = "soft-light"; ctx.fillStyle = "rgba(255, 79, 168, 0.55)"; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "rgba(255, 150, 120, 0.12)"; ctx.fillRect(0, 0, W, H);
        ctx.restore();
        heartPath(ctx, cx, cy, s); ctx.strokeStyle = COL.lights[1]; ctx.lineWidth = 6 * K; ctx.stroke();
        caption(ctx, c.heartWords[0], 18 * K, H * 0.46, 34 * K);
        caption(ctx, c.heartWords[1], 18 * K, H * 0.46 + 40 * K, 34 * K);
      },
      // The picture split and mirrored into four.
      kaleido: function (t) {
        var q = quad.getContext("2d");
        drawSource(q, t, 0, 0, W / 2, H / 2, 1.2);
        ctx.drawImage(quad, 0, 0);
        ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(quad, 0, 0); ctx.restore();
        ctx.save(); ctx.translate(0, H); ctx.scale(1, -1); ctx.drawImage(quad, 0, 0); ctx.restore();
        ctx.save(); ctx.translate(W, H); ctx.scale(-1, -1); ctx.drawImage(quad, 0, 0); ctx.restore();
        ctx.fillStyle = COL.chrome; ctx.fillRect(W / 2 - 2 * K, 0, 4 * K, H); ctx.fillRect(0, H / 2 - 2 * K, W, 4 * K);
      },
      // Old TV signal: color fringe, warm cast, scanlines and film grain (low contrast, never a flash).
      broadcast: function (t) {
        var s = scratch.getContext("2d");
        drawSource(s, t, 0, 0, W, H);
        [[red, "#ff0000"], [cyan, "#00ffff"]].forEach(function (pair) {
          var g = pair[0].getContext("2d");
          g.globalCompositeOperation = "source-over"; g.drawImage(scratch, 0, 0);
          g.globalCompositeOperation = "multiply"; g.fillStyle = pair[1]; g.fillRect(0, 0, W, H);
        });
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
        ctx.drawImage(cyan, -3 * K, 0);
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.drawImage(red, 3 * K, 0); ctx.restore();
        ctx.save();
        ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = "#ffe2c2"; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = "overlay"; ctx.globalAlpha = 0.16;
        ctx.drawImage(grain[still ? 0 : Math.floor(t * 8) % grain.length], 0, 0, W, H);
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; ctx.drawImage(scan, 0, 0);
        ctx.restore();
      },
      // The picture on a grid of floor squares that brighten and fade slowly in the three light colors.
      floor: function (t) {
        var size = H / 9;
        ctx.fillStyle = COL.deep; ctx.fillRect(0, 0, W, H);
        for (var r = 0; r < 9; r++) {
          for (var col = 0; col < Math.ceil(W / size); col++) {
            var k = still ? ((col + r) % 3 === 0 ? 0.9 : 0.3) : 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.6 + col * 0.6 + r * 0.9));
            ctx.globalAlpha = k; ctx.fillStyle = COL.lights[(col + r * 2) % 3];
            ctx.fillRect(col * size + 2 * K, r * size + 2 * K, size - 4 * K, size - 4 * K);
          }
        }
        ctx.globalAlpha = 1;
        var iw = W * 0.6, ih = H * 0.6, ix = (W - iw) / 2, iy = H * 0.1;
        ctx.fillStyle = COL.chrome; ctx.fillRect(ix - 6 * K, iy - 6 * K, iw + 12 * K, ih + 12 * K);
        drawSource(ctx, t, ix, iy, iw, ih);
      }
    };

    // ----- render loop: runs only while the section is on screen -----
    function render(now) {
      raf = null;
      var t = still ? 0 : (now || performance.now()) / 1000;
      ctx.save(); FX[fx](t); ctx.restore();
      // A still demo only needs one frame; a camera or a moving effect needs every frame.
      if (onScreen && !document.hidden && (live || !still)) raf = requestAnimationFrame(render);
    }
    function kick() { if (!raf && onScreen && !document.hidden) raf = requestAnimationFrame(render); }
    function label() {
      var name = byId(c.effects, fx).label;
      cv.setAttribute("aria-label", (live ? c.who : c.demoWho) + ". " + name + ".");
    }

    // ----- lower third captions -----
    function nextCaption() { $("cam-caption").textContent = c.captions[capIndex++ % c.captions.length]; }
    nextCaption();
    setInterval(function () { if (onScreen) nextCaption(); }, 3200);

    // ----- effects buttons -----
    Array.prototype.forEach.call(sec.querySelectorAll(".fx-btn"), function (b) {
      b.addEventListener("click", function () {
        fx = b.getAttribute("data-fx");
        Array.prototype.forEach.call(sec.querySelectorAll(".fx-btn"), function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        label(); kick();
      });
    });

    // ----- camera -----
    var on = $("cam-on"), off = $("cam-off");
    function setLive(v) {
      live = v;
      $("cam-frame").classList.toggle("is-live", v);
      $("cam-tally").textContent = v ? c.liveTally : c.demoTally;
      $("cam-who").textContent = v ? c.who : c.demoWho;
      on.hidden = v; off.hidden = !v; on.disabled = false;
      label(); kick();
    }
    function stopCam(msg) {
      if (stream) stream.getTracks().forEach(function (tr) { tr.stop(); });
      stream = null;
      video.pause(); video.srcObject = null;
      if (live) setLive(false);
      if (msg) status(msg);
    }
    on.addEventListener("click", function () {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { status(c.fallbackLine); return; }
      on.disabled = true;
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
        .then(function (s) {
          stream = s;
          video.muted = true;
          video.srcObject = s;
          var p = video.play();
          if (p && p.catch) p.catch(function () {});
          setLive(true);
          status(c.liveLine);
          off.focus();
        })
        .catch(function () { on.disabled = false; status(c.fallbackLine); });
    });
    off.addEventListener("click", function () { stopCam(c.offLine); on.focus(); });
    window.addEventListener("pagehide", function () { stopCam(); });
    document.addEventListener("visibilitychange", kick);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) {
        onScreen = en[0].isIntersecting;
        if (onScreen) kick();
        else if (stream) stopCam(c.awayLine);
      }).observe(sec);
    }

    // ----- snapshot: a Polaroid-style card made in the browser -----
    $("cam-snap").addEventListener("click", function () {
      if (!raf) render();
      var pad = 40, card = makeCanvas(W + pad * 2, H + pad + 170), g = card.getContext("2d");
      g.fillStyle = COL.fg; g.fillRect(0, 0, card.width, card.height);
      g.drawImage(cv, pad, pad);
      g.save(); g.translate(pad + 8, H + pad + 105); g.rotate(-0.03);
      g.font = "58px Shrikhand, Georgia, serif"; g.fillStyle = COL.bg; g.fillText(c.polaroidText, 0, 0);
      g.restore();
      card.toBlob(function (blob) {
        if (!blob) return;
        if (shotUrl) URL.revokeObjectURL(shotUrl);
        shotUrl = URL.createObjectURL(blob);
        $("cam-shot-img").src = shotUrl;
        $("cam-save").href = shotUrl;
        $("cam-shot").hidden = false;
        status(c.snapLine);
        $("cam-save").focus();
      }, "image/png");
    });
    $("cam-shot-close").addEventListener("click", function () {
      $("cam-shot").hidden = true;
      if (shotUrl) { URL.revokeObjectURL(shotUrl); shotUrl = null; }
      $("cam-snap").focus();
    });

    label();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(kick);
    kick();
  }

  // ---------- confetti cannon ----------
  // Two bursts from the bottom corners in the three light colors, about 2 seconds, then the canvas goes away.
  function fireConfetti() {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var cv = document.createElement("canvas"), ctx = cv.getContext && cv.getContext("2d");
    if (!ctx) return;
    var css = getComputedStyle(document.documentElement);
    var colors = ["--track-1", "--track-2", "--track-3"].map(function (v) { return css.getPropertyValue(v).trim(); });
    var dpr = Math.min(window.devicePixelRatio || 1, 2), w = window.innerWidth, h = window.innerHeight;
    cv.className = "confetti";
    cv.setAttribute("aria-hidden", "true");
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.scale(dpr, dpr);
    document.body.appendChild(cv);
    var bits = [], n = Math.round(Math.min(110, w / 6));
    [0, 1].forEach(function (side) {
      for (var i = 0; i < n; i++) {
        var angle = (side ? 180 - (50 + Math.random() * 35) : 50 + Math.random() * 35) * Math.PI / 180;
        var speed = h * (0.012 + Math.random() * 0.012);
        bits.push({ x: side ? w : 0, y: h, vx: Math.cos(angle) * speed, vy: -Math.sin(angle) * speed,
          r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4, s: 6 + Math.random() * 6, c: colors[i % 3] });
      }
    });
    var t0 = null, DUR = 2000;
    function frame(t) {
      if (t0 === null) t0 = t;
      var k = (t - t0) / DUR;
      if (k >= 1) { cv.remove(); return; }
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      bits.forEach(function (b) {
        b.vy += h * 0.0006; b.vx *= 0.985; b.vy *= 0.985;
        b.x += b.vx; b.y += b.vy; b.r += b.vr;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r);
        ctx.fillStyle = b.c; ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
        ctx.restore();
      });
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ---------- name marquee ----------
  // A theater-marquee strip of performer names between the hero and About. Screen readers get the names
  // once as text; the moving copy is hidden from them. Hover or the Pause button stops it.
  function renderMarquee() {
    var el = $("marquee");
    if (!el) return;
    var m = D.marquee || {}, names = D.speakers.items.filter(function (p) { return !p.plain; }).map(function (p) { return p.name; });
    var row = names.map(function (n) {
      return '<span class="mq-name">' + esc(n) + '</span><span class="mq-star" aria-hidden="true">&#9733;</span>';
    }).join("");
    el.setAttribute("aria-label", m.label || "Performers");
    el.innerHTML = '<p class="sr">' + esc(names.join(", ")) + "</p>" +
      '<div class="mq-track" aria-hidden="true"><div class="mq-row">' + row + '</div><div class="mq-row">' + row + "</div></div>" +
      '<button type="button" class="mq-pause"><span class="mq-icon" aria-hidden="true"></span><span class="mq-label">' + esc(m.pause || "Pause") +
      '</span><span class="sr"> ' + esc(m.hidden || "scrolling names") + "</span></button>";
    el.querySelector(".mq-pause").addEventListener("click", function () {
      var paused = el.classList.toggle("is-paused");
      el.querySelector(".mq-label").textContent = paused ? (m.play || "Play") : (m.pause || "Pause");
    });
  }

  // ---------- content flows in on scroll ----------
  // Section headlines sharpen in word by word, lineup photos wipe up from the bottom edge, and cards and
  // rows stagger in 60ms apart. Each element animates once, 450-550ms, and nothing waits more than 420ms.
  // The hidden starting state only exists under html.reveal-on, which this script adds, so the page stays
  // fully visible if the script fails. Reduced motion never adds it.
  // Photos are observed through their wrapper: a fully clipped element never counts as intersecting.
  var REVEAL = { words: ".section-title", wipe: ".sp-media", stagger: ".sp-featured, .sp-card, .session, .ruled > div, .faq-item" };
  var revealIO = null;
  function initReveal() {
    if (!("IntersectionObserver" in window) || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
    revealIO = new IntersectionObserver(function (entries) {
      var k = 0;
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        revealIO.unobserve(e.target);
        if (e.target.classList.contains("rv-stagger")) e.target.style.setProperty("--rv-delay", Math.min(k++, 7) * 60 + "ms");
        e.target.classList.add("rv-in");
      });
    }, { rootMargin: "0px 0px -6% 0px" });
    prepReveal($("sections"), false);
    document.documentElement.classList.add("reveal-on");
    // A fast jump (a nav link, a flick) can carry an element from below the screen to above it in one
    // frame without it ever counting as intersecting. Anything already scrolled past is shown at once.
    var queued = false;
    window.addEventListener("scroll", function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        Array.prototype.forEach.call(document.querySelectorAll(".rv:not(.rv-in)"), function (el) {
          if (el.getClientRects().length && el.getBoundingClientRect().bottom <= 0) { revealIO.unobserve(el); el.classList.add("rv-in"); }
        });
      });
    }, { passive: true });
    // Keyboard focus never lands on something still hidden: focusing reveals it and its containers at once.
    document.addEventListener("focusin", function (e) {
      for (var el = e.target; el && el !== document.body; el = el.parentElement) {
        if (el.classList && el.classList.contains("rv") && !el.classList.contains("rv-in")) { revealIO.unobserve(el); el.classList.add("rv-in"); }
      }
    });
  }
  // instant: for sections re-rendered after a user action, show them at once instead of animating again.
  function prepReveal(root, instant) {
    if (!revealIO || !root) return;
    function mark(sel, kind) {
      Array.prototype.forEach.call(root.querySelectorAll(sel), function (el) {
        if (el.classList.contains("rv")) return;
        if (kind === "rv-words") splitWords(el);
        el.classList.add("rv", kind);
        if (instant) el.classList.add("rv-in"); else revealIO.observe(el);
      });
    }
    mark(REVEAL.words, "rv-words");
    mark(REVEAL.wipe, "rv-wipe");
    mark(REVEAL.stagger, "rv-stagger");
  }
  function splitWords(h) {
    var words = h.textContent.trim().split(/\s+/);
    h.innerHTML = words.map(function (w, i) { return '<span class="rv-w" style="--w:' + Math.min(i, 7) + '">' + esc(w) + "</span>"; }).join(" ");
  }

  // ---------- button label roll ----------
  // On hover or focus the label rolls up and out while an identical copy rolls in from below.
  // The copy is aria-hidden, so the accessible name is read once.
  function rollOne(b) {
    if (b.querySelector(":scope > .roll")) return;
    var html = b.innerHTML;
    b.innerHTML = '<span class="roll"><span class="roll-a">' + html + '</span><span class="roll-b" aria-hidden="true">' + html + "</span></span>";
  }
  function rollify(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll(".btn, .fx-btn"), rollOne);
  }
  function setLabel(b, html) { b.innerHTML = html; rollOne(b); }

  // ---------- artist popup ----------
  // One <dialog>: a large panel on desktop, a full-screen sheet that slides up on phones. Closes with
  // the X, Escape or a click outside, and focus goes back to the card that opened it. Set times jump to
  // that slot in the run of show. The record player is a preview only: no audio plays.
  function wireArtists() {
    var dlg = document.createElement("dialog");
    if (typeof dlg.showModal !== "function") return;
    dlg.className = "artist";
    dlg.id = "artist";
    dlg.setAttribute("aria-labelledby", "artist-name");
    document.body.appendChild(dlg);
    var P = D.speakers.popup || {}, opener = null, jumping = false;

    function recordSvg(p) {
      var grooves = [88, 78, 68, 58, 48].map(function (r) { return '<circle cx="100" cy="100" r="' + r + '" fill="none" stroke="#b9bcc6" stroke-opacity="0.3"/>'; }).join("");
      return '<svg class="record" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="98" fill="#1c0718" stroke="#b9bcc6" stroke-width="2"/>' + grooves +
        '<path d="M100 16 A84 84 0 0 1 176 64" fill="none" stroke="#f7ead3" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round"/>' +
        '<circle cx="100" cy="100" r="34" fill="#f7ead3"/><text x="100" y="109" text-anchor="middle" font-family="Shrikhand, Georgia, serif" font-size="24" fill="#2b0e25">' +
        esc(initials(p.name)) + '</text><circle cx="100" cy="100" r="4" fill="#1c0718"/></svg>';
    }
    function playerHtml(p) {
      return '<div class="player" id="artist-player" hidden>' +
        '<div class="player-deck"><div class="player-disc">' + recordSvg(p) + '<span class="tonearm" aria-hidden="true"></span></div>' +
          '<div class="player-side"><ol class="player-tracks" aria-label="' + esc(P.tracksLabel || "Tracks") + '">' + p.tracks.map(function (t, i) {
            return '<li><button type="button" class="player-track" data-track="' + i + '" aria-pressed="' + (i === 0) + '">' + esc(t) + "</button></li>";
          }).join("") + "</ol>" +
          '<div class="player-controls"><button type="button" class="btn btn-primary btn-small player-play" aria-pressed="false">' + esc(P.play || "Play") + "</button>" +
          '<span class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></div>' +
          '<p class="player-now" aria-live="polite"></p></div></div>' +
        '<p class="player-note">' + esc(P.note || "") + "</p></div>";
    }
    function render(p) {
      var list = speakerSessions()[p.id] || [];
      var nights = D.schedule.days.map(function (day) {
        var mine = list.filter(function (x) { return x.day.id === day.id; });
        if (!mine.length) return "";
        return '<div class="artist-night"><h3>' + esc(day.label) + '</h3><ul class="artist-slots">' + mine.map(function (x) {
          return '<li><a href="#session-' + x.s.id + '"><span class="t">' + esc(fmtTime(sessionTimes(x.day, x.s).start)) + "</span> " + esc(x.s.title) + "</a></li>";
        }).join("") + "</ul></div>";
      }).join("");
      var hasPlayer = p.tracks && p.tracks.length;
      dlg.innerHTML = '<div class="artist-inner">' +
        '<button type="button" class="artist-close" aria-label="' + esc(P.close || "Close") + '"><span aria-hidden="true">&times;</span></button>' +
        '<div class="artist-media">' + (p.photo ? '<img src="' + esc(p.photo) + '" alt="' + esc(p.alt || p.name) + '" width="800" height="1000">' : "") + "</div>" +
        '<div class="artist-body">' +
          '<h2 class="artist-name" id="artist-name">' + esc(p.name) + "</h2>" +
          (p.style ? '<p class="artist-style">' + esc(p.style) + "</p>" : "") +
          '<p class="artist-bio">' + copy(p.about || p.bio || "") + "</p>" +
          (nights ? '<div class="artist-nights">' + nights + "</div>" : "") +
          '<div class="artist-actions">' +
            (hasPlayer ? '<button type="button" class="btn artist-listen" aria-expanded="false" aria-controls="artist-player">' + esc(P.listen || "Listen") + "</button>" : "") +
            '<a class="btn btn-primary artist-tickets" href="#tickets">' + esc(P.tickets || "Get tickets") + ' <span class="arrow" aria-hidden="true">&rarr;</span></a>' +
          "</div>" +
          (hasPlayer ? playerHtml(p) : "") +
        "</div></div>";
      rollify(dlg);
      dlg._artist = p;
    }
    function open(id, from) {
      var p = byId(D.speakers.items, id);
      if (!p) return;
      opener = from;
      render(p);
      dlg.showModal();
    }
    function setPlaying(on) {
      var pl = dlg.querySelector(".player");
      if (!pl) return;
      pl.classList.toggle("is-playing", on);
      var btn = pl.querySelector(".player-play");
      btn.setAttribute("aria-pressed", String(on));
      setLabel(btn, esc(on ? (P.pause || "Pause") : (P.play || "Play")));
      var cur = pl.querySelector('.player-track[aria-pressed="true"]');
      pl.querySelector(".player-now").textContent = on && cur ? (P.now || "{track}").replace("{track}", cur.textContent) : "";
    }

    // Open from anywhere on a lineup card, except its own set-time links.
    document.addEventListener("click", function (e) {
      var hit = e.target.closest && e.target.closest(".sp-hit");
      if (!hit || e.target.closest("a")) return;
      open(hit.getAttribute("data-artist"), hit.querySelector(".sp-open"));
    });

    dlg.addEventListener("click", function (e) {
      if (e.target === dlg) { dlg.close(); return; }                       // click on the backdrop
      if (e.target.closest(".artist-close")) { dlg.close(); return; }
      var listen = e.target.closest(".artist-listen");
      if (listen) {
        var pl = dlg.querySelector(".player"), show = pl.hidden;
        pl.hidden = !show;
        listen.setAttribute("aria-expanded", String(show));
        if (show) pl.querySelector(".player-play").focus(); else setPlaying(false);
        return;
      }
      if (e.target.closest(".player-play")) { setPlaying(!dlg.querySelector(".player").classList.contains("is-playing")); return; }
      var tr = e.target.closest(".player-track");
      if (tr) {
        Array.prototype.forEach.call(dlg.querySelectorAll(".player-track"), function (b) { b.setAttribute("aria-pressed", String(b === tr)); });
        setPlaying(true);
        return;
      }
      var tix = e.target.closest(".artist-tickets");
      if (tix) {
        e.preventDefault();
        jumping = true;
        dlg.close();
        var sec = $("tickets"), h = $("tickets-title");
        if (sec) sec.scrollIntoView();
        if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
        history.replaceState(null, "", "#tickets");
        return;
      }
      // Set-time links: close first, then the page-wide handler switches the night tab and scrolls to the slot.
      var slot = e.target.closest('a[href^="#session-"]');
      if (slot) {
        jumping = true;
        dlg.close();
        var target = $(slot.getAttribute("href").slice(1));
        setTimeout(function () { if (target) { target.setAttribute("tabindex", "-1"); target.focus({ preventScroll: true }); } }, 0);
      }
    });
    dlg.addEventListener("close", function () {
      setPlaying(false);
      if (!jumping && opener && document.contains(opener)) opener.focus();
      jumping = false;
    });
  }

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
    if (cta && tier) { cta.innerHTML = "Register with " + esc(tier.name) + ", " + esc(tier.price) + ' <span class="arrow" aria-hidden="true">&rarr;</span>'; rollOne(cta); }
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
    rollify($("reg-out"));
    $("reg-confirm").focus();
    fireConfetti();
    $("reg-again").addEventListener("click", function () {
      var sec = $("register");
      sec.outerHTML = R.register();
      wireForm(); lightScenes(); prepReveal($("register"), true); rollify($("register"));
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
    wireTabs(); wireMatrix(); lightScenes();
    ["schedule", "speakers", "tickets"].forEach(function (id) { if ($(id)) { prepReveal($(id), true); rollify($(id)); } });
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
      // "Pick your night" links open that night's tab and bring the run of show into view.
      var tl = t.closest('a[href^="#tab-"]');
      if (tl) {
        var tab = $(tl.getAttribute("href").slice(1));
        if (tab) {
          e.preventDefault();
          selectTab(tab, false);
          $("schedule").scrollIntoView();
          tab.focus({ preventScroll: true });
          history.replaceState(null, "", "#schedule");
        }
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
      '<p class="footer-small">' + esc(m.footerLine || "") + "</p>" +
      (m.creditLine ? '<p class="footer-credit">' + esc(m.creditLine) + "</p>" : "") + "</div>";
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
      renderMarquee();
      wireTabs(); wireMatrix(); wireForm(); wireGlobal(); wireDanceCam(); wireArtists();
      danceFloor(); lightScenes();
      rollify(document); initReveal();
      if (location.hash.length > 1) {
        var target = $(location.hash.slice(1));
        if (target) target.scrollIntoView();
      }
    })
    .catch(showError);
})();
