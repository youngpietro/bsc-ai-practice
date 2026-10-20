/* Quiz page: one engine for every course. The page sets <body data-course="ai|psy">. */
(function () {
  "use strict";
  const { $, esc, pct, plural } = APP.util;
  const C = APP.courseById(document.body.dataset.course);
  const LETTERS = "ABCDE";
  const BIG_DECK = 120; // above this the question map is folded away

  APP.renderTopbar();
  document.title = `${C.short} practice · BSc AI Practice`;

  // ---------- per-course position ----------
  function ui() {
    const S = APP.S;
    if (!S.ui[C.id]) S.ui[C.id] = { filter: C.id === "psy" ? C.topics[0].key : "all", order: null, missed: null, cur: null };
    const U = S.ui[C.id];
    if (U.filter !== "all" && !C.topicByKey[U.filter]) U.filter = "all";
    if (U.order && (!Array.isArray(U.order) || U.order.length !== C.questions.length || U.order.some(id => !C.byId[id]))) U.order = null;
    if (U.missed && !Array.isArray(U.missed)) U.missed = null;
    return U;
  }
  let hintFor = null;
  let armed = false; // reset button waiting for its confirming second click

  function deck() {
    const U = ui();
    let ids = U.order || C.questions.map(q => q.id);
    if (U.filter !== "all") ids = ids.filter(id => C.byId[id].topic === U.filter);
    if (U.missed) {
      const set = new Set(U.missed);
      const m = ids.filter(id => set.has(id));
      if (m.length) ids = m; else U.missed = null;
    }
    return ids;
  }
  const isRight = id => !!(APP.S.ans[id] && APP.S.ans[id].ok);
  const answered = id => APP.S.ans[id] !== undefined;

  // ---------- header ----------
  function renderHead() {
    const ex = APP.examInfo(C);
    $("#title").textContent = C.name;
    $("#exam").textContent = ex ? `Exam · ${C.examLabel} · ${ex.label}` : `${APP.TERM.year} · ${APP.TERM.period}`;
    $("#sub").textContent = `${C.questions.length} questions over ${plural(C.topics.length, C.topicNoun)}. ${C.blurb}`;
  }

  function renderRail() {
    const U = ui(), st = APP.courseStats(C);
    const allChip = `<button class="chip" type="button" data-t="all" aria-pressed="${U.filter === "all"}">All ${C.topicNoun}s<small>${st.ok}/${st.total}</small></button>`;
    $("#rail").innerHTML = allChip + st.topics.map(t =>
      `<button class="chip" type="button" data-t="${t.key}" aria-pressed="${U.filter === t.key}" title="${esc(t.label)}: ${APP.LEVEL_LABEL[t.level]}">` +
      `<span class="lv l-${t.level}" aria-hidden="true"></span>${esc(C.id === "psy" ? t.short + " " + C.topicByKey[t.key].title : t.label)}<small>${t.ok}/${t.total}</small></button>`
    ).join("");
    $("#rail").querySelectorAll(".chip").forEach(b => b.onclick = () => setFilter(b.dataset.t));
    const cur = $("#rail").querySelector('[aria-pressed="true"]');
    if (cur && cur.scrollIntoView && !renderRail.done) { cur.scrollIntoView({ block: "nearest", inline: "center" }); renderRail.done = true; }
  }

  // ---------- main render ----------
  function render() {
    const U = ui();
    const d = deck();
    if (!d.includes(U.cur)) U.cur = d.find(id => !answered(id)) || d[0];
    const i = d.indexOf(U.cur);
    const q = C.byId[U.cur];
    const a = APP.S.ans[q.id];
    const isAns = a !== undefined;
    const topic = C.topicByKey[q.topic];

    $("#qmeta").innerHTML = `<span>Q ${i + 1} / ${d.length}</span><span class="topic">${esc(C.id === "psy" ? topic.short + " · " + topic.title : topic.label)}</span>` +
      (q.chart ? `<span>${q.chart.t === "table" ? "Table" : "Graph"} question</span>` : "") +
      (U.missed ? `<span class="flag">Retrying mistakes</span>` : "") +
      ((APP.S.hist[q.id] && APP.S.hist[q.id].w && !isAns) ? `<span class="flag">Missed before</span>` : "");
    $("#prompt").textContent = q.prompt;
    $("#figure").innerHTML = q.chart && window.PSY_FIGURE ? window.PSY_FIGURE(q.chart) : "";
    $("#figure").hidden = !q.chart;

    const opts = $("#opts");
    opts.innerHTML = "";
    q.options.forEach((t, k) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button"; b.className = "opt";
      if (isAns) {
        b.disabled = true;
        if (k === q.correct) b.classList.add("correct");
        else if (k === a.p) b.classList.add("wrong");
        else b.classList.add("dim");
      }
      b.innerHTML = `<span class="bubble">${LETTERS[k]}</span><span class="txt"></span>`;
      b.querySelector(".txt").textContent = t;
      b.onclick = () => choose(k);
      li.appendChild(b); opts.appendChild(li);
    });

    const showHint = hintFor === q.id && !isAns && q.hint;
    $("#hint").hidden = !showHint;
    $("#hint").textContent = q.hint ? "Hint: " + q.hint : "";
    $("#hintBtn").hidden = isAns || !q.hint;
    $("#hintBtn").textContent = showHint ? "Hide hint" : "Show hint";

    const fb = $("#feedback");
    fb.hidden = !isAns;
    if (isAns) {
      fb.className = "feedback " + (a.ok ? "ok" : "no");
      $("#verdict").textContent = a.ok ? "Correct." : `Not quite. The answer is ${LETTERS[q.correct]}.`;
      $("#explain").textContent = q.explanation;
    }
    $("#prev").disabled = i <= 0;
    $("#next").disabled = i >= d.length - 1;
    $("#next").textContent = i >= d.length - 1 ? "Last question" : "Next";
    $(".keys").textContent = `Keys: ${LETTERS.slice(0, 1)}–${LETTERS[q.options.length - 1]} answer${q.hint ? " · H hint" : ""} · ← →`;

    renderStats(d);
    renderMap(d);
    renderRail();
    renderTable();
    APP.save();
  }

  function renderStats(d) {
    const U = ui();
    const done = d.filter(answered);
    const right = done.filter(isRight).length;
    const p = done.length ? right / done.length : null;
    $("#qstats").innerHTML =
      `<span>Answered <b>${done.length}</b> / ${d.length}</span><span>Correct <b>${right}</b></span>` +
      `<span>Wrong <b>${done.length - right}</b></span><span>Score <b>${pct(p)}</b></span>`;
    const bar = $("#bar").children;
    bar[0].style.width = (100 * right / d.length) + "%";
    bar[1].style.width = (100 * (done.length - right) / d.length) + "%";
    $("#bar").setAttribute("aria-label", `${right} correct and ${done.length - right} wrong out of ${d.length}`);

    const scope = scopeIds();
    const wrongHere = scope.filter(id => answered(id) && !isRight(id)).length;
    $("#missed").disabled = wrongHere === 0 && !U.missed;
    $("#missed").textContent = U.missed ? "Back to all questions" : `Retry mistakes (${wrongHere})`;
    $("#shuffle").textContent = U.order ? "Original order" : "Shuffle";
    if (!armed) $("#reset").textContent = resetLabel();

    const complete = done.length === d.length && d.length > 0;
    $("#done").hidden = !complete;
    if (complete) {
      const miss = d.length - right;
      const where = U.filter === "all" ? C.short : C.topicByKey[U.filter].label;
      $("#doneText").textContent = `${U.missed ? "Retry round" : where} finished: ${right} of ${d.length} right (${pct(right / d.length)}).` +
        (miss ? ` Retry the ${miss} you missed to lock them in.` : nextTopicHint());
      $("#doneMissed").hidden = miss === 0;
      $("#doneNext").hidden = miss !== 0 || !nextTopic();
    }
  }
  function nextTopic() {
    const U = ui();
    if (U.filter === "all") return null;
    const st = APP.courseStats(C);
    const idx = C.topics.findIndex(t => t.key === U.filter);
    for (let k = 1; k <= C.topics.length; k++) {
      const t = st.topics[(idx + k) % C.topics.length];
      if (t.done < t.total) return t;
    }
    return null;
  }
  function nextTopicHint() { const t = nextTopic(); return t ? ` Next up: ${t.label}.` : " Nothing missed."; }

  function renderMap(d) {
    const U = ui();
    const box = $("#mapbox");
    const big = d.length > BIG_DECK;
    box.querySelector("summary").textContent = big ? `Show all ${d.length} questions` : "Question map";
    if (!big) box.open = true;
    box.querySelector("summary").hidden = !big;
    const map = $("#map");
    if (big && !box.open) { map.innerHTML = ""; return; }
    map.innerHTML = d.map((id, k) => {
      const cls = answered(id) ? (isRight(id) ? " ok" : " no") : "";
      return `<button type="button" class="cell${cls}${id === U.cur ? " cur" : ""}" data-id="${id}" aria-label="Question ${k + 1}${cls ? (cls === " ok" ? ", correct" : ", wrong") : ""}">${k + 1}</button>`;
    }).join("");
    map.querySelectorAll(".cell").forEach(c => c.onclick = () => { ui().cur = c.dataset.id; hintFor = null; render(); $("#card").scrollIntoView({ block: "nearest" }); });
  }

  function renderTable() {
    const U = ui(), st = APP.courseStats(C);
    const rows = st.topics.map(t =>
      `<tr class="click" data-t="${t.key}" tabindex="0"><td>${esc(t.label)}</td><td class="n">${t.total}</td><td class="n">${t.done}</td><td class="n">${t.ok}</td>` +
      `<td class="n">${pct(t.acc)}</td><td><span class="lvl l-${t.level}"><i aria-hidden="true"></i>${APP.LEVEL_LABEL[t.level]}</span></td></tr>`).join("");
    $("#table").innerHTML = `<thead><tr><th>${C.topicNoun[0].toUpperCase() + C.topicNoun.slice(1)}</th><th class="n">Qs</th><th class="n">Done</th><th class="n">Right</th><th class="n">Score</th><th>Level</th></tr></thead><tbody>${rows}</tbody>`;
    $("#table").querySelectorAll("tr[data-t]").forEach(tr => {
      const go = () => { setFilter(tr.dataset.t); window.scrollTo({ top: 0, behavior: "smooth" }); };
      tr.onclick = go;
      tr.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
    });
  }

  // ---------- actions ----------
  function scopeIds() {
    const U = ui();
    return C.questions.map(q => q.id).filter(id => U.filter === "all" || C.byId[id].topic === U.filter);
  }
  function setFilter(f) {
    const U = ui();
    U.filter = f; U.missed = null; hintFor = null;
    const d = deck();
    U.cur = d.find(id => !answered(id)) || d[0];
    render();
  }
  function choose(k) {
    const U = ui();
    const q = C.byId[U.cur];
    if (!q || answered(q.id) || k >= q.options.length) return;
    const res = APP.recordAnswer(q.id, k, k === q.correct);
    hintFor = null;
    APP.renderTopbar();
    render();
    APP.announce(res);
  }
  function step(dir) {
    const U = ui(), d = deck(), j = d.indexOf(U.cur) + dir;
    if (j < 0 || j >= d.length) return;
    U.cur = d[j]; hintFor = null; render();
  }
  function startMissed() {
    const U = ui();
    const wrong = scopeIds().filter(id => answered(id) && !isRight(id));
    if (!wrong.length) { U.missed = null; render(); return; }
    APP.clearAnswers(wrong);
    U.missed = U.order ? U.order.filter(id => wrong.includes(id)) : wrong;
    U.cur = U.missed[0]; hintFor = null; render();
  }

  $("#prev").onclick = () => step(-1);
  $("#next").onclick = () => step(1);
  $("#hintBtn").onclick = () => { hintFor = hintFor === ui().cur ? null : ui().cur; render(); };
  $("#shuffle").onclick = () => {
    const U = ui();
    if (U.order) U.order = null;
    else {
      const a = C.questions.map(q => q.id);
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      U.order = a;
    }
    U.cur = deck()[0]; hintFor = null; render();
  };
  $("#missed").onclick = () => { const U = ui(); if (U.missed) { U.missed = null; U.cur = deck()[0]; render(); } else startMissed(); };
  $("#doneMissed").onclick = startMissed;
  $("#doneNext").onclick = () => { const t = nextTopic(); if (t) { setFilter(t.key); window.scrollTo({ top: 0 }); } };
  $("#mapbox").addEventListener("toggle", () => renderMap(deck()));
  function resetLabel() { return ui().filter === "all" ? "Reset course" : `Reset this ${C.topicNoun}`; }
  $("#reset").onclick = () => {
    const b = $("#reset"), U = ui();
    if (!armed) {
      armed = true; b.textContent = "Click again to clear"; b.classList.add("warn");
      setTimeout(() => { armed = false; b.textContent = resetLabel(); b.classList.remove("warn"); }, 3000);
      return;
    }
    armed = false; b.classList.remove("warn");
    APP.clearAnswers(scopeIds());
    U.missed = null; U.cur = null; hintFor = null; render();
  };

  document.addEventListener("keydown", e => {
    const tag = e.target.tagName;
    if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const li = "abcde".indexOf(k), ni = "12345".indexOf(k);
    if (k.length === 1 && (li >= 0 || ni >= 0)) { choose(li >= 0 ? li : ni); e.preventDefault(); }
    else if (k === "arrowright" || (k === "enter" && tag !== "BUTTON")) { step(1); e.preventDefault(); }
    else if (k === "arrowleft") { step(-1); e.preventDefault(); }
    else if (k === "h") { if (!$("#hintBtn").hidden) $("#hintBtn").click(); }
  });

  // Deep links from the dashboard: #topic=<key>&missed=1
  function applyHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (!h.has("topic") && !h.has("missed")) return false;
    const U = ui();
    const t = h.get("topic");
    U.filter = t && C.topicByKey[t] ? t : (h.has("missed") ? "all" : U.filter);
    U.missed = null;
    if (h.get("missed") === "1") startMissed(); else setFilter(U.filter);
    history.replaceState(null, "", location.pathname + location.search);
    return true;
  }
  window.addEventListener("hashchange", applyHash);
  APP.onChange(() => { APP.renderTopbar(); render(); });

  renderHead();
  if (!applyHash()) render();
  APP.announce({ unlocked: APP.checkBadges(), goalReached: false });
})();
