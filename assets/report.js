/* Public study-record page: report.html?code=XXXX-XXXX. Everything shown comes from the server (get_report). */
(function () {
  "use strict";
  const { $, esc, pct, plural, duration } = APP.util;
  APP.renderTopbar();

  const code = (new URLSearchParams(location.search).get("code") || "").trim().toUpperCase();
  const TZ = "Europe/Amsterdam";
  const fmtDate = s => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
  const fmtStamp = s => new Date(s).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ, timeZoneName: "short" });
  const dayLabel = key => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); };

  function showLookup(msg) {
    $("#status").hidden = true;
    $("#report").hidden = true;
    $("#lookup").hidden = false;
    $("#lookupMsg").textContent = msg || "";
    if (code) $("#codeInput").value = code;
  }
  $("#lookupForm").onsubmit = e => {
    e.preventDefault();
    const c = $("#codeInput").value.trim().toUpperCase();
    if (c) location.search = "?code=" + encodeURIComponent(c);
  };

  async function load() {
    if (!code) return showLookup();
    if (!window.LIVE || !LIVE.enabled) return showLookup("Study records can't be checked right now.");
    let d;
    try { d = await LIVE.record.get(code); }
    catch (e) { return showLookup("Couldn't reach the server. Check your connection and try again."); }
    if (!d) return showLookup(`No study record found for code ${code}. Check the code and try again.`);
    render(d);
  }

  // All calendar days from the first activity to today (Amsterdam): at least 14, at most the last 60.
  function dayRange(d) {
    const byDay = Object.fromEntries(d.days.map(x => [x.day, x]));
    const first = d.days.length ? d.days[0].day : LIVE.amsDay(0);
    const out = [];
    for (let k = 0; k < 400; k++) {
      const key = LIVE.amsDay(k);
      out.unshift(byDay[key] || { day: key, answers: 0, correct: 0, seconds: 0 });
      if (key <= first && out.length >= 14) break;
    }
    return out.slice(-60);
  }

  function render(d) {
    const name = d.name || "Anonymous student";
    document.title = `Study record ${d.code}${d.name ? " · " + d.name : ""} · BSc AI Practice`;
    const active = d.days.filter(x => x.answers || x.seconds);
    const url = location.origin + location.pathname + "?code=" + encodeURIComponent(d.code);
    const courseName = id => (APP.courseById(id) || { name: id }).name;
    const topicName = (cid, key) => { const c = APP.courseById(cid); const t = c && c.topicByKey[key]; return t ? t.label : key; };

    const tiles = [
      ["Questions answered", d.answers.toLocaleString("en"), d.answers ? `${d.courses.reduce((s, c) => s + c.questions, 0)} different questions` : "nothing yet"],
      ["Answered right", pct(d.answers ? d.correct / d.answers : null), d.answers ? `${d.correct.toLocaleString("en")} correct answers` : "–"],
      ["Active study time", duration(d.seconds), "time spent working on quiz pages"],
      ["Days practised", active.length, !d.first ? "–" : fmtDate(d.first) === fmtDate(d.last) ? fmtDate(d.first) : `${fmtDate(d.first)} – ${fmtDate(d.last)}`]
    ];

    const range = dayRange(d);
    const max = Math.max(10, ...range.map(x => x.answers));
    const step = range.length > 21 ? 7 : 1;
    const bars = range.map(x => `<div class="rb${x.answers ? "" : " zero"}" title="${esc(dayLabel(x.day))}: ${x.answers} answered, ${duration(x.seconds)} active"><span style="height:${(100 * x.answers / max).toFixed(1)}%"></span></div>`).join("");
    const axis = range.map((x, i) => `<span>${i === range.length - 1 ? "today" : (i % step === 0 ? Number(x.day.slice(8)) : "")}</span>`).join("");

    const courseRows = d.courses.map(c => {
      const total = (APP.courseById(c.course) || { questions: [] }).questions.length;
      return `<tr><td>${esc(courseName(c.course))}</td><td class="n">${c.answers}</td><td class="n">${c.questions}${total ? ` / ${total}` : ""}</td><td class="n">${pct(c.correct / c.answers)}</td></tr>`;
    }).join("");
    const topicRows = d.topics.map(t => `<tr><td><span class="cdot ${t.course}"></span> ${esc(topicName(t.course, t.topic))}</td><td class="n">${t.answers}</td><td class="n">${pct(t.correct / t.answers)}</td></tr>`).join("");
    const dayRows = active.slice().reverse().map(x => `<tr><td>${esc(dayLabel(x.day))}</td><td class="n">${x.answers}</td><td class="n">${x.answers ? pct(x.correct / x.answers) : "–"}</td><td class="n">${duration(x.seconds)}</td></tr>`).join("");

    $("#report").innerHTML = `
      <header class="rep-head">
        <div class="eyebrow">Verified study record · BSc AI Practice</div>
        <h1>${esc(name)}</h1>
        <div class="muted">Report code <b class="mono">${esc(d.code)}</b> · shared since ${esc(fmtDate(d.published))}</div>
      </header>

      <div class="verify">
        <span class="medal" aria-hidden="true">✓</span>
        <div>
          <b>Checked with the server on ${esc(fmtStamp(d.generated))}</b>
          <p>Everything on this page was saved by the server while the student practised, using the server's own clock. The student can't edit, add or backdate entries, and the numbers update as they keep practising.</p>
        </div>
      </div>

      <div class="stats">${tiles.map(([k, v, s]) => `<div class="card stat"><span>${esc(k)}</span><b>${esc(String(v))}</b><small>${esc(s)}</small></div>`).join("")}</div>

      ${d.answers || d.seconds ? `
      <section class="card activity">
        <div class="section-h" style="margin-bottom:12px"><h2 style="font-size:.92rem">Questions answered per day</h2><span class="aside">${plural(range.length, "day")} shown</span></div>
        <div class="rep-bars" style="grid-template-columns:repeat(${range.length},1fr)">${bars}</div>
        <div class="act-base"></div>
        <div class="rep-axis" style="grid-template-columns:repeat(${range.length},1fr)">${axis}</div>
      </section>

      <section class="section">
        <div class="section-h"><h2>By course</h2></div>
        <div class="card tablewrap"><table class="tbl"><thead><tr><th>Course</th><th class="n">Answers</th><th class="n">Different questions</th><th class="n">Right</th></tr></thead><tbody>${courseRows}</tbody></table></div>
      </section>

      <section class="section">
        <div class="section-h"><h2>By lecture / topic</h2></div>
        <div class="card tablewrap"><table class="tbl"><thead><tr><th>Lecture / topic</th><th class="n">Answers</th><th class="n">Right</th></tr></thead><tbody>${topicRows}</tbody></table></div>
      </section>

      <section class="section">
        <div class="section-h"><h2>Day by day</h2><span class="aside">Times in Amsterdam time</span></div>
        <div class="card tablewrap"><table class="tbl"><thead><tr><th>Day</th><th class="n">Answers</th><th class="n">Right</th><th class="n">Active time</th></tr></thead><tbody>${dayRows}</tbody></table></div>
      </section>` : `<div class="card" style="padding:18px"><p class="muted">No practice has been recorded under this code yet.</p></div>`}

      <p class="rep-note muted">This record shows practice on BSc AI Practice: when questions were answered, how many were right, and how long the student was actively working on quiz pages (time only counts while the page is open and in use). It does not show who was at the keyboard, or whether answers were looked up. BSc AI Practice is an unofficial student-made site.</p>
      <p class="print-only">Check this record online: ${esc(url)}</p>

      <div class="rec-actions no-print">
        <button class="btn primary" type="button" id="printBtn">Save as PDF / print</button>
        <button class="btn" type="button" id="copyBtn">Copy link</button>
      </div>`;
    $("#status").hidden = true;
    $("#report").hidden = false;
    $("#printBtn").onclick = () => window.print();
    $("#copyBtn").onclick = () => {
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(
        () => APP.toast("Link copied", ""), () => APP.toast("Copy this link", url));
    };
  }

  load();
})();
