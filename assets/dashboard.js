/* Dashboard: greeting, daily goal, suggestions, course progress, stats, activity, achievements, data tools. */
(function () {
  "use strict";
  const { $, esc, pct, plural, dayKey } = APP.util;
  const RING_LEN = 2 * Math.PI * 50;
  let editingName = false;

  // ---------- tooltip shared by the topic strips and activity bars ----------
  const tip = document.createElement("div");
  tip.className = "tip"; tip.hidden = true; tip.setAttribute("role", "tooltip");
  document.body.appendChild(tip);
  function showTip(el) {
    tip.innerHTML = el.dataset.tip;
    tip.hidden = false;
    const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
    let x = r.left + r.width / 2 - t.width / 2;
    x = Math.max(8, Math.min(x, window.innerWidth - t.width - 8));
    let y = r.top - t.height - 8;
    if (y < 8) y = r.bottom + 8;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function hideTip() { tip.hidden = true; }
  function wireTips(root) {
    root.querySelectorAll("[data-tip]").forEach(el => {
      el.addEventListener("mouseenter", () => showTip(el));
      el.addEventListener("focus", () => showTip(el));
      el.addEventListener("mouseleave", hideTip);
      el.addEventListener("blur", hideTip);
    });
  }
  window.addEventListener("scroll", hideTip, { passive: true });

  // ---------- hero ----------
  function renderHero() {
    const S = APP.S, lt = APP.lifetime(), name = S.profile.name;
    const hour = new Date().getHours();
    const hello = hour < 6 ? "Up late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    $("#greet").textContent = name ? `${hello}, ${name}` : "Practice for your Period 1 exams";
    let lead;
    if (!lt.answered) {
      lead = "Free practice quizzes for Introduction to AI and Introduction to Psychology & its Methods. Answer questions and this page tracks your progress, hands out achievements and tells you what to study next.";
    } else {
      const ds = APP.dayStreak();
      lead = `You've answered ${plural(lt.answered, "question")} with ${pct(lt.acc)} right` +
        (ds > 1 ? `, and practised ${ds} days in a row.` : ".") +
        (name ? "" : " Add a nickname to make this page yours.");
    }
    $("#lead").innerHTML = esc(lead) + (name && !editingName ? ` <a href="#" id="editName">Change name</a>` : "");
    const form = $("#nameForm");
    form.hidden = !!name && !editingName;
    $("#nameCancel").hidden = !name;
    if (!form.hidden) $("#nameInput").value = name;
    const edit = $("#editName");
    if (edit) edit.onclick = e => { e.preventDefault(); editingName = true; renderHero(); $("#nameInput").focus(); };

    $("#exams").innerHTML = APP.COURSES.map(c => {
      const ex = APP.examInfo(c);
      if (!ex) return "";
      return `<span class="exam-pill${ex.soon ? " soon" : ""}"><span class="cdot ${c.tone}"></span><span>${esc(c.short)}: <b>${esc(ex.label)}</b> · ${esc(c.examLabel)}</span></span>`;
    }).join("");

    const today = APP.todayCount(), goal = S.profile.goal;
    const frac = Math.min(1, today / goal);
    $("#ringVal").setAttribute("stroke-dasharray", `${(frac * RING_LEN).toFixed(1)} ${RING_LEN.toFixed(1)}`);
    $("#ringVal").style.opacity = today ? 1 : 0;
    $("#ringNum").textContent = today;
    $("#ringOf").textContent = today >= goal ? "goal reached" : `of ${goal} today`;
    $("#ring").setAttribute("aria-label", `${today} of ${goal} questions answered today`);
    $("#goal").value = String(goal);
  }

  // ---------- suggestions ----------
  function renderSugs() {
    const list = APP.suggestions(5);
    $("#sugs").innerHTML = list.length ? list.map(s => `
      <div class="sug">
        <span class="tag t-${s.tone}">${esc(s.tag)}</span>
        <div>
          <div class="sug-title">${esc(s.title)}</div>
          <div class="sug-detail">${esc(s.detail)}</div>
          <div class="sug-course"><span class="cdot ${s.course.tone}"></span>${esc(s.course.name)}</div>
        </div>
        <a class="btn sm${s.tone === "urgent" || s === list[0] ? " primary" : ""}" href="${s.href}">${esc(s.cta)}</a>
      </div>`).join("") : `<div class="sug"><span class="tag t-done">All done</span><div><div class="sug-title">Nothing left to suggest</div><div class="sug-detail">Every question answered correctly. Reset a course for a fresh run.</div></div></div>`;
  }

  // ---------- course cards ----------
  function renderCourses() {
    $("#courses").innerHTML = APP.COURSES.map(c => {
      const st = APP.courseStats(c), ex = APP.examInfo(c);
      const noun = c.topicNoun;
      const strip = st.topics.map(t => {
        const tipHtml = `<b>${esc(t.label)}</b>${APP.LEVEL_LABEL[t.level]} · ${t.done}/${t.total} done${t.done ? " · " + pct(t.acc) + " right" : ""}`;
        return `<button type="button" class="l-${t.level}" data-href="${c.page}#topic=${t.key}" data-tip="${esc(tipHtml)}" aria-label="${esc(t.label)}: ${APP.LEVEL_LABEL[t.level]}, ${t.done} of ${t.total} done"></button>`;
      }).join("");
      const rows = st.topics.map(t => `<tr class="click" data-href="${c.page}#topic=${t.key}" tabindex="0"><td>${esc(t.label)}</td><td class="n">${t.done}/${t.total}</td><td class="n">${pct(t.acc)}</td><td><span class="lvl l-${t.level}"><i aria-hidden="true"></i>${APP.LEVEL_LABEL[t.level]}</span></td></tr>`).join("");
      const started = st.done > 0;
      return `<article class="card course ${c.tone}">
        <div>
          <div class="eyebrow">${ex ? `Exam ${esc(c.examLabel)} · ${esc(ex.label)}` : `${APP.TERM.year} · ${APP.TERM.period}`}</div>
          <h3 style="margin-top:6px">${esc(c.name)}</h3>
        </div>
        <div class="meta"><span>${c.questions.length} questions</span><span>${plural(c.topics.length, noun)}</span>${c.id === "psy" ? "<span>Graph &amp; table questions</span>" : "<span>Hints on every question</span>"}</div>
        <div class="pbar" role="img" aria-label="${st.ok} right and ${st.wrong} wrong of ${st.total}"><i class="g" style="width:${100 * st.ok / st.total}%"></i><i class="r" style="width:${100 * st.wrong / st.total}%"></i></div>
        <div class="nums">
          <div><b>${pct(st.done / st.total)}</b><span>answered</span></div>
          <div><b>${pct(st.acc)}</b><span>right</span></div>
          <div><b>${st.wrong}</b><span>${st.wrong === 1 ? "mistake" : "mistakes"} to retry</span></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div class="strip" style="grid-template-columns:repeat(${st.topics.length},1fr)">${strip}</div>
          <div class="strip-legend"><span><i style="background:var(--line-soft)"></i>Not started</span><span><i style="background:var(--bad)"></i>Needs work</span><span><i style="background:var(--hint)"></i>Getting there</span><span><i style="background:var(--good)"></i>Strong / mastered</span></div>
        </div>
        <details class="topics"><summary>All ${noun}s</summary>
          <div class="tablewrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>${noun[0].toUpperCase() + noun.slice(1)}</th><th class="n">Done</th><th class="n">Right</th><th>Level</th></tr></thead><tbody>${rows}</tbody></table></div>
        </details>
        <div class="actions">
          <a class="btn primary" href="${c.page}">${started ? "Continue" : "Start practising"}</a>
          ${st.wrong ? `<a class="btn" href="${c.page}#missed=1">Retry ${plural(st.wrong, "mistake")}</a>` : ""}
        </div>
      </article>`;
    }).join("");
    $("#courses").querySelectorAll("[data-href]").forEach(el => {
      el.addEventListener("click", () => { location.href = el.dataset.href; });
      if (el.tagName === "TR") el.addEventListener("keydown", e => { if (e.key === "Enter") location.href = el.dataset.href; });
    });
    wireTips($("#courses"));
  }

  // ---------- stats + activity ----------
  function renderStats() {
    const S = APP.S, lt = APP.lifetime(), ds = APP.dayStreak();
    const tiles = [
      ["Questions answered", lt.answered.toLocaleString("en"), "including retries"],
      ["Answered right", pct(lt.acc), lt.answered ? `${lt.correct.toLocaleString("en")} correct answers` : "answer a few to see this"],
      ["Best run", S.streak.best, S.streak.cur ? `current run: ${S.streak.cur} right in a row` : "most right in a row"],
      ["Day streak", ds, `${plural(lt.daysActive, "day")} active in total`]
    ];
    $("#stats").innerHTML = tiles.map(([k, v, s]) => `<div class="card stat"><span>${esc(k)}</span><b>${esc(String(v))}</b><small>${esc(s)}</small></div>`).join("");
    const first = Math.min(...Object.keys(S.days).map(d => Date.parse(d)).filter(Boolean), Infinity);
    $("#sinceLine").textContent = isFinite(first) ? "Since " + new Date(first).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";

    const days = [];
    for (let k = 13; k >= 0; k--) { const d = new Date(); d.setDate(d.getDate() - k); days.push(d); }
    const vals = days.map(d => S.days[dayKey(d)] || { n: 0, c: 0 });
    const max = Math.max(10, ...vals.map(v => v.n));
    $("#actBars").innerHTML = days.map((d, i) => {
      const v = vals[i];
      const label = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
      const tipHtml = `<b>${esc(label)}</b>${v.n ? `${v.n} answered · ${v.c} right` : "No practice"}`;
      return `<button type="button" class="${v.n ? "" : "zero"}" data-tip="${esc(tipHtml)}" aria-label="${esc(label)}: ${v.n} answered"><span style="height:${(100 * v.n / max).toFixed(1)}%"></span></button>`;
    }).join("");
    $("#actAxis").innerHTML = days.map((d, i) => `<span${i === 13 ? ' style="color:var(--fg);font-weight:600"' : ""}>${i === 13 ? "today" : d.getDate()}</span>`).join("");
    $("#actTable").innerHTML = `<caption>Questions answered per day, last 14 days</caption><thead><tr><th>Day</th><th>Answered</th><th>Right</th></tr></thead><tbody>` +
      days.map((d, i) => `<tr><td>${dayKey(d)}</td><td>${vals[i].n}</td><td>${vals[i].c}</td></tr>`).join("") + "</tbody>";
    wireTips($("#actBars"));
  }

  // ---------- achievements ----------
  function renderBadges() {
    const S = APP.S;
    const got = APP.BADGES.filter(b => S.badges[b.id]).length;
    $("#badgeCount").textContent = `${got} of ${APP.BADGES.length} unlocked`;
    const sorted = APP.BADGES.slice().sort((a, b) => (!!S.badges[b.id]) - (!!S.badges[a.id]));
    $("#badges").innerHTML = sorted.map(b => {
      const at = S.badges[b.id];
      const when = at ? new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
      return `<div class="card badge${at ? "" : " locked"}"><span class="medal${at ? "" : " locked"}" aria-hidden="true">${esc(b.glyph)}</span><div><b>${esc(b.name)}</b><span>${esc(b.desc)}${at ? ` · ${when}` : ""}</span></div><span class="sr">${at ? "Unlocked" : "Locked"}</span></div>`;
    }).join("");
  }

  function renderAll() { APP.renderTopbar(); renderHero(); renderSugs(); renderCourses(); renderStats(); renderBadges(); }

  // ---------- events ----------
  $("#nameForm").addEventListener("submit", e => {
    e.preventDefault();
    APP.S.profile.name = $("#nameInput").value.trim().slice(0, 24);
    editingName = false; APP.save(); renderAll();
  });
  $("#nameCancel").onclick = () => { editingName = false; renderHero(); };
  $("#goal").onchange = e => { APP.S.profile.goal = +e.target.value || 25; APP.save(); renderAll(); };
  $("#export").onclick = () => APP.exportData();
  $("#importFile").onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => {
      try { APP.importData(t); renderAll(); APP.toast("Progress imported", "Your answers and achievements are back."); }
      catch (err) { APP.toast("Import failed", err.message || "That file could not be read."); }
      e.target.value = "";
    });
  };
  let armed = false;
  $("#resetAll").onclick = () => {
    const b = $("#resetAll");
    if (!armed) {
      armed = true; b.textContent = "Click again to erase all";
      setTimeout(() => { armed = false; b.textContent = "Reset everything"; }, 3500);
      return;
    }
    armed = false; b.textContent = "Reset everything";
    APP.resetAll(); renderAll(); APP.toast("Progress cleared", "Everything is back to zero.");
  };
  APP.onChange(renderAll);
  window.addEventListener("pageshow", e => { if (e.persisted) renderAll(); });

  APP.checkBadges(); APP.save();
  renderAll();
})();
