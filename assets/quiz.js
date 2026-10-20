/* Quiz page: every question of the chosen lecture/topic in one scrollable list, answered in place.
   One engine for every course; the page sets <body data-course="ai|psy">. */
(function () {
  "use strict";
  const { $, esc, pct, plural } = APP.util;
  const C = APP.courseById(document.body.dataset.course);
  const LETTERS = "ABCDE";
  const PAGE = 100;          // questions rendered at once; "Show more" adds the next batch
  let limit = PAGE;
  let armed = false;         // reset button waiting for its confirming second click
  const hintOpen = new Set();

  APP.renderTopbar();
  document.title = `${C.short} practice · BSc AI Practice`;

  // ---------- per-course view state ----------
  function ui() {
    const S = APP.S;
    if (!S.ui[C.id]) S.ui[C.id] = { filter: C.id === "psy" ? C.topics[0].key : "all", order: null, missed: null };
    const U = S.ui[C.id];
    if (U.filter !== "all" && !C.topicByKey[U.filter]) U.filter = "all";
    if (U.order && (!Array.isArray(U.order) || U.order.length !== C.questions.length || U.order.some(id => !C.byId[id]))) U.order = null;
    if (U.missed && !Array.isArray(U.missed)) U.missed = null;
    return U;
  }
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
  const answered = id => APP.S.ans[id] !== undefined;
  const isRight = id => !!(APP.S.ans[id] && APP.S.ans[id].ok);
  const domId = id => "q-" + id.replace(/[^a-z0-9]/gi, "-");
  const topicName = t => (C.id === "psy" ? `${t.short} · ${t.title}` : t.label);

  // ---------- header ----------
  function renderHead() {
    const ex = APP.examInfo(C);
    $("#title").textContent = C.name;
    $("#exam").textContent = ex ? `Exam · ${C.examLabel} · ${ex.label}` : `${APP.TERM.year} · ${APP.TERM.period}`;
    $("#sub").textContent = `${C.questions.length} questions over ${plural(C.topics.length, C.topicNoun)}. ${C.blurb}`;
  }
  function renderRail() {
    const U = ui(), st = APP.courseStats(C);
    $("#rail").innerHTML =
      `<button class="chip" type="button" data-t="all" aria-pressed="${U.filter === "all"}">All ${C.topicNoun}s<small>${st.ok}/${st.total}</small></button>` +
      st.topics.map(t =>
        `<button class="chip" type="button" data-t="${t.key}" aria-pressed="${U.filter === t.key}" title="${esc(t.label)}: ${APP.LEVEL_LABEL[t.level]}">` +
        `<span class="lv l-${t.level}" aria-hidden="true"></span>${esc(topicName(C.topicByKey[t.key]))}<small>${t.ok}/${t.total}</small></button>`).join("");
    $("#rail").querySelectorAll(".chip").forEach(b => b.onclick = () => setFilter(b.dataset.t));
    const cur = $("#rail").querySelector('[aria-pressed="true"]');
    if (cur && !renderRail.done) { cur.scrollIntoView({ block: "nearest", inline: "center" }); renderRail.done = true; window.scrollTo(0, 0); }
  }

  // ---------- one question ----------
  function cardClass(id) { const a = APP.S.ans[id]; return "card qcard" + (a ? (a.ok ? " is-ok" : " is-no") : ""); }
  function cardHtml(q, n) {
    const a = APP.S.ans[q.id], isAns = !!a;
    const missedBefore = !isAns && APP.S.hist[q.id] && APP.S.hist[q.id].w;
    let h = `<div class="qmeta"><span class="qn">${n}</span><span class="topic">${esc(topicName(C.topicByKey[q.topic]))}</span>` +
      (q.chart ? `<span>${q.chart.t === "table" ? "Table" : "Graph"} question</span>` : "") +
      (missedBefore ? `<span class="flag">Missed before</span>` : "") + `</div>`;
    h += `<h2 class="prompt">${esc(q.prompt)}</h2>`;
    if (q.chart && window.PSY_FIGURE) h += window.PSY_FIGURE(q.chart);
    h += `<ol class="opts">` + q.options.map((t, k) => {
      const cls = !isAns ? "" : k === q.correct ? " correct" : k === a.p ? " wrong" : " dim";
      return `<li><button type="button" class="opt${cls}" data-k="${k}"${isAns ? " disabled" : ""}><span class="bubble">${LETTERS[k]}</span><span class="txt">${esc(t)}</span></button></li>`;
    }).join("") + `</ol>`;
    if (q.hint && !isAns) {
      const open = hintOpen.has(q.id);
      h += (open ? `<p class="hintbox">Hint: ${esc(q.hint)}</p>` : "") +
        `<div><button type="button" class="btn sm ghost hint-btn">${open ? "Hide hint" : "Show hint"}</button></div>`;
    }
    if (isAns) {
      h += `<div class="feedback ${a.ok ? "ok" : "no"}" role="status"><span class="verdict">${a.ok ? "Correct." : `Not quite. The answer is ${LETTERS[q.correct]}.`}</span><p>${esc(q.explanation)}</p></div>`;
    }
    return h;
  }
  function refreshCard(id) {
    const el = document.getElementById(domId(id));
    if (!el) return;
    el.className = cardClass(id);
    el.innerHTML = cardHtml(C.byId[id], deck().indexOf(id) + 1);
  }

  // ---------- the list ----------
  function renderList() {
    const d = deck();
    const shown = d.slice(0, limit);
    $("#list").innerHTML = shown.map((id, i) =>
      `<article class="${cardClass(id)}" id="${domId(id)}" data-id="${id}">${cardHtml(C.byId[id], i + 1)}</article>`).join("");
    const rest = d.length - shown.length;
    $("#more").hidden = rest <= 0;
    $("#more").textContent = `Show ${Math.min(PAGE, rest)} more (${rest} left)`;
  }
  function renderSide() {
    const d = deck();
    renderStats(d);
    renderRail();
    renderTable();
    APP.save();
  }
  function render() { renderList(); renderSide(); }

  function renderStats(d) {
    const U = ui();
    const done = d.filter(answered);
    const right = done.filter(isRight).length;
    $("#qstats").innerHTML =
      `<span>Answered <b>${done.length}</b> / ${d.length}</span><span>Correct <b>${right}</b></span>` +
      `<span>Wrong <b>${done.length - right}</b></span><span>Score <b>${pct(done.length ? right / done.length : null)}</b></span>` +
      (U.missed ? `<span class="flag">Retrying mistakes</span>` : "");
    const bar = $("#bar").children;
    bar[0].style.width = (100 * right / d.length) + "%";
    bar[1].style.width = (100 * (done.length - right) / d.length) + "%";
    $("#bar").setAttribute("aria-label", `${right} correct and ${done.length - right} wrong out of ${d.length}`);

    const wrongHere = scopeIds().filter(id => answered(id) && !isRight(id)).length;
    $("#missed").disabled = wrongHere === 0 && !U.missed;
    $("#missed").textContent = U.missed ? "Back to all questions" : `Retry mistakes (${wrongHere})`;
    $("#shuffle").textContent = U.order ? "Original order" : "Shuffle";
    $("#jump").disabled = done.length === d.length;
    if (!armed) $("#reset").textContent = resetLabel();

    const complete = done.length === d.length && d.length > 0;
    $("#done").hidden = !complete;
    if (complete) {
      const miss = d.length - right;
      const where = U.filter === "all" ? C.short : C.topicByKey[U.filter].label;
      $("#doneText").textContent = `${U.missed ? "Retry round" : where} finished: ${right} of ${d.length} right (${pct(right / d.length)}).` +
        (miss ? ` Retry the ${miss} you missed to lock them in.` : (nextTopic() ? ` Next up: ${nextTopic().label}.` : " Nothing missed."));
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
  function renderTable() {
    const st = APP.courseStats(C);
    const rows = st.topics.map(t =>
      `<tr class="click" data-t="${t.key}" tabindex="0"><td>${esc(t.label)}</td><td class="n">${t.total}</td><td class="n">${t.done}</td><td class="n">${t.ok}</td>` +
      `<td class="n">${pct(t.acc)}</td><td><span class="lvl l-${t.level}"><i aria-hidden="true"></i>${APP.LEVEL_LABEL[t.level]}</span></td></tr>`).join("");
    $("#table").innerHTML = `<thead><tr><th>${C.topicNoun[0].toUpperCase() + C.topicNoun.slice(1)}</th><th class="n">Qs</th><th class="n">Done</th><th class="n">Right</th><th class="n">Score</th><th>Level</th></tr></thead><tbody>${rows}</tbody>`;
    $("#table").querySelectorAll("tr[data-t]").forEach(tr => {
      const go = () => { setFilter(tr.dataset.t); toTop(); };
      tr.onclick = go;
      tr.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
    });
  }

  // ---------- actions ----------
  function scopeIds() {
    const U = ui();
    return C.questions.map(q => q.id).filter(id => U.filter === "all" || C.byId[id].topic === U.filter);
  }
  function toTop() { $("#rail").scrollIntoView({ block: "start" }); window.scrollBy(0, -80); }
  function setFilter(f) {
    const U = ui();
    U.filter = f; U.missed = null; limit = PAGE; hintOpen.clear();
    render();
  }
  function choose(id, k) {
    const q = C.byId[id];
    if (!q || answered(id) || k >= q.options.length) return;
    const res = APP.recordAnswer(id, k, k === q.correct);
    hintOpen.delete(id);
    refreshCard(id);
    APP.renderTopbar();
    renderSide();
    APP.announce(res);
  }
  function startMissed() {
    const U = ui();
    const wrong = scopeIds().filter(id => answered(id) && !isRight(id));
    if (!wrong.length) { U.missed = null; render(); return; }
    APP.clearAnswers(wrong);
    U.missed = U.order ? U.order.filter(id => wrong.includes(id)) : wrong;
    limit = PAGE; hintOpen.clear();
    render();
  }
  function jumpToNext() {
    const d = deck();
    const id = d.find(x => !answered(x));
    if (!id) return;
    const idx = d.indexOf(id);
    if (idx >= limit) { limit = Math.ceil((idx + 1) / PAGE) * PAGE; renderList(); }
    const el = document.getElementById(domId(id));
    el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const first = el.querySelector(".opt");
    if (first) first.focus({ preventScroll: true });
  }
  function resetLabel() { return ui().filter === "all" ? "Reset course" : `Reset this ${C.topicNoun}`; }

  $("#list").addEventListener("click", e => {
    const card = e.target.closest(".qcard");
    if (!card) return;
    const id = card.dataset.id;
    const opt = e.target.closest(".opt");
    if (opt && !opt.disabled) { choose(id, +opt.dataset.k); return; }
    if (e.target.closest(".hint-btn")) { if (hintOpen.has(id)) hintOpen.delete(id); else hintOpen.add(id); refreshCard(id); }
  });
  $("#more").onclick = () => { limit += PAGE; renderList(); };
  $("#jump").onclick = jumpToNext;
  $("#shuffle").onclick = () => {
    const U = ui();
    if (U.order) U.order = null;
    else {
      const a = C.questions.map(q => q.id);
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      U.order = a;
    }
    limit = PAGE; render();
  };
  $("#missed").onclick = () => { const U = ui(); if (U.missed) { U.missed = null; limit = PAGE; render(); } else startMissed(); };
  $("#doneMissed").onclick = () => { startMissed(); toTop(); };
  $("#doneNext").onclick = () => { const t = nextTopic(); if (t) { setFilter(t.key); toTop(); } };
  $("#reset").onclick = () => {
    const b = $("#reset"), U = ui();
    if (!armed) {
      armed = true; b.textContent = "Click again to clear"; b.classList.add("warn");
      setTimeout(() => { armed = false; b.textContent = resetLabel(); b.classList.remove("warn"); }, 3000);
      return;
    }
    armed = false; b.classList.remove("warn");
    APP.clearAnswers(scopeIds());
    U.missed = null; limit = PAGE; hintOpen.clear(); render();
  };

  // Deep links from the dashboard: #topic=<key>&missed=1
  function applyHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (!h.has("topic") && !h.has("missed")) return false;
    const U = ui();
    const t = h.get("topic");
    U.filter = t && C.topicByKey[t] ? t : (h.has("missed") ? "all" : U.filter);
    U.missed = null; limit = PAGE;
    if (h.get("missed") === "1") startMissed(); else render();
    history.replaceState(null, "", location.pathname + location.search);
    return true;
  }
  window.addEventListener("hashchange", applyHash);
  APP.onChange(() => { APP.renderTopbar(); render(); });

  renderHead();
  if (!applyHash()) render();
  APP.announce({ unlocked: APP.checkBadges(), goalReached: false });
})();
