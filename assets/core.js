/* Shared engine: courses, saved progress, achievements, study suggestions, theme, top bar.
   Progress lives only in this browser (localStorage). Export/import moves it between devices. */
(function () {
  "use strict";

  const STORE_KEY = "bscai-practice.v1";
  const TERM = { year: "2026–2027", period: "Period 1" };

  // ---------- small helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const slug = s => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const pct = x => (x == null ? "–" : Math.round(x * 100) + "%");
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + "s")}`;
  function duration(sec) {
    const m = Math.round((sec || 0) / 60);
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
  }
  const newId = () => (crypto.randomUUID ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
  function dayKey(d = new Date()) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function perm(n, seed) { const r = rng(seed); const p = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p; }

  // ---------- courses ----------
  function buildCourses() {
    const list = [];
    if (window.AI_QUESTIONS) {
      const topics = window.AI_LECS.map(l => ({ key: slug(l), label: l, short: l }));
      const keyOf = Object.fromEntries(topics.map(t => [t.label, t.key]));
      list.push({
        id: "ai", tone: "ai", name: "Introduction to AI", short: "Intro to AI", page: "intro-ai.html",
        exam: "2026-10-21T15:30:00+02:00", examLabel: "Wed 21 Oct 2026, 15:30",
        topicNoun: "lecture",
        blurb: "Every lecture except the Introduction and Discrete Mathematics. The four answers are always about the same length, so length gives nothing away.",
        topics,
        questions: window.AI_QUESTIONS.map(q => ({
          id: "ai:" + q.id, topic: keyOf[q.lec], prompt: q.prompt, options: q.options,
          correct: q.correct, hint: q.hint, explanation: q.explanation, chart: null
        }))
      });
    }
    if (window.PSYCH_TOPICS) {
      const topics = window.PSYCH_TOPICS.map(t => ({ key: "t" + t.n, label: `Topic ${t.n} · ${t.title}`, short: "T" + t.n, title: t.title }));
      const questions = [];
      window.PSYCH_TOPICS.forEach(t => t.qs.forEach((q, i) => {
        const p = perm(q.o.length, t.n * 1000 + i + 7); // same option order as the original drill
        questions.push({
          id: `psy:${t.n}:${i}`, topic: "t" + t.n, prompt: q.q, options: p.map(k => q.o[k]),
          correct: p.indexOf(0), hint: null, explanation: q.e, chart: q.c || null
        });
      }));
      list.push({
        id: "psy", tone: "psy", name: "Introduction to Psychology & its Methods", short: "Psychology", page: "psychology.html",
        exam: null, examLabel: null, topicNoun: "topic",
        blurb: "All 13 topics, 50 questions each, from genes and the brain to research designs. Many questions come with a graph or table to read.",
        topics, questions
      });
    }
    list.forEach(c => {
      c.byId = Object.fromEntries(c.questions.map(q => [q.id, q]));
      c.topicByKey = Object.fromEntries(c.topics.map(t => [t.key, t]));
    });
    return list;
  }
  const COURSES = buildCourses();
  const courseById = id => COURSES.find(c => c.id === id);

  // ---------- storage ----------
  function blank() {
    return {
      v: 1,
      profile: { name: "", goal: 25, created: Date.now() },
      ans: {},       // current answer per question: { p: picked index, ok, at }
      hist: {},      // lifetime per question: { n: attempts, c: correct, w: wrong, fx: fixed-after-wrong }
      days: {},      // "YYYY-MM-DD": { n, c }
      streak: { cur: 0, best: 0 },
      counters: { fixed: 0 },
      badges: {},    // badge id -> unlocked timestamp
      ui: {},        // per-course quiz position
      settings: { theme: "auto" },
      flags: {}
    };
  }
  function normalize(d) {
    const b = blank();
    if (!d || typeof d !== "object") return b;
    for (const k of Object.keys(b)) {
      if (d[k] === undefined || d[k] === null || typeof d[k] !== typeof b[k]) continue;
      b[k] = (typeof b[k] === "object" && !Array.isArray(b[k])) ? Object.assign(b[k], d[k]) : d[k];
    }
    return b;
  }
  function load() {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) return normalize(JSON.parse(raw)); } catch (e) { /* private mode etc. */ }
    return blank();
  }
  let S = load();
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
  const listeners = [];
  window.addEventListener("storage", e => { if (e.key === STORE_KEY) { S = load(); applyTheme(); listeners.forEach(f => f()); } });

  // ---------- recording answers ----------
  function recordAnswer(qid, pick, ok) {
    S.ans[qid] = { p: pick, ok, at: Date.now() };
    const h = S.hist[qid] || (S.hist[qid] = { n: 0, c: 0, w: 0 });
    let comeback = false;
    if (ok && h.w > 0 && !h.fx) { h.fx = 1; comeback = true; S.counters.fixed = (S.counters.fixed || 0) + 1; }
    h.n++; if (ok) h.c++; else h.w++;
    const dk = dayKey();
    const day = S.days[dk] || (S.days[dk] = { n: 0, c: 0 });
    day.n++; if (ok) day.c++;
    S.streak.cur = ok ? S.streak.cur + 1 : 0;
    S.streak.best = Math.max(S.streak.best, S.streak.cur);
    const unlocked = checkBadges();
    let goalReached = false;
    if (day.n >= S.profile.goal && S.flags.goalDay !== dk) { S.flags.goalDay = dk; goalReached = true; }
    save();
    if (window.LIVE) {
      const cid = qid.split(":")[0], c = courseById(cid), q = c && c.byId[qid];
      window.LIVE.recordAnswer(cid, ok);                         // anonymous +1 to the site-wide total
      if (q) window.LIVE.logAnswer(cid, q.topic, qid, ok);       // only saved if this student turned on their verified record
    }
    return { unlocked, goalReached, comeback };
  }
  function clearAnswers(ids) { ids.forEach(id => { delete S.ans[id]; }); save(); }

  // ---------- stats ----------
  function levelOf(t) {
    if (!t.done) return "new";
    const acc = t.ok / t.done;
    if (t.done === t.total && acc >= 0.9) return "mastered";
    if (acc >= 0.8 && t.done >= t.total * 0.5) return "strong";
    if (acc >= 0.6) return "progress";
    return "weak";
  }
  const LEVEL_LABEL = { new: "Not started", weak: "Needs work", progress: "Getting there", strong: "Strong", mastered: "Mastered" };

  function courseStats(c) {
    const per = {};
    c.topics.forEach(t => { per[t.key] = { key: t.key, label: t.label, short: t.short, total: 0, done: 0, ok: 0 }; });
    c.questions.forEach(q => { const p = per[q.topic]; p.total++; const a = S.ans[q.id]; if (a) { p.done++; if (a.ok) p.ok++; } });
    const topics = c.topics.map(t => {
      const p = per[t.key];
      return Object.assign(p, { wrong: p.done - p.ok, acc: p.done ? p.ok / p.done : null, level: levelOf(p) });
    });
    const total = c.questions.length;
    const done = topics.reduce((s, t) => s + t.done, 0);
    const ok = topics.reduce((s, t) => s + t.ok, 0);
    return { topics, total, done, ok, wrong: done - ok, acc: done ? ok / done : null };
  }

  function dayStreak() {
    let n = 0; const d = new Date();
    if (!S.days[dayKey(d)]) d.setDate(d.getDate() - 1); // today not studied yet: count up to yesterday
    while (S.days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function lifetime() {
    let n = 0, c = 0;
    Object.values(S.hist).forEach(h => { n += h.n; c += h.c; });
    return { answered: n, correct: c, acc: n ? c / n : null, daysActive: Object.keys(S.days).length };
  }
  function todayCount() { const d = S.days[dayKey()]; return d ? d.n : 0; }

  // ---------- achievements ----------
  const BADGES = [
    { id: "first", glyph: "1", name: "First answer", desc: "Answer your first question.", test: x => x.answered >= 1 },
    { id: "q25", glyph: "25", name: "Warming up", desc: "Answer 25 questions.", test: x => x.answered >= 25 },
    { id: "q100", glyph: "100", name: "Century", desc: "Answer 100 questions.", test: x => x.answered >= 100 },
    { id: "q500", glyph: "500", name: "Marathon", desc: "Answer 500 questions.", test: x => x.answered >= 500 },
    { id: "s10", glyph: "10×", name: "Perfect ten", desc: "Get 10 right in a row.", test: x => x.best >= 10 },
    { id: "s25", glyph: "25×", name: "On fire", desc: "Get 25 right in a row.", test: x => x.best >= 25 },
    { id: "fix1", glyph: "↺", name: "Comeback", desc: "Get a question right that you missed before.", test: x => x.fixed >= 1 },
    { id: "fix25", glyph: "↺25", name: "Mistake hunter", desc: "Fix 25 earlier mistakes.", test: x => x.fixed >= 25 },
    { id: "goal", glyph: "◎", name: "Goal getter", desc: "Reach your daily goal.", test: x => x.goalHit },
    { id: "d3", glyph: "3d", name: "Habit forming", desc: "Practise 3 days in a row.", test: x => x.dayStreak >= 3 },
    { id: "d7", glyph: "7d", name: "Week strong", desc: "Practise 7 days in a row.", test: x => x.dayStreak >= 7 },
    { id: "both", glyph: "2", name: "Double load", desc: "Practise both courses.", test: x => x.coursesTried >= 2 },
    { id: "master", glyph: "★", name: "Topic master", desc: "Answer every question in one topic with 90%+ right.", test: x => x.mastered >= 1 },
    { id: "ai-all", glyph: "AI", name: "AI all-rounder", desc: "Answer every Intro to AI question.", test: x => x.full.ai },
    { id: "ai-80", glyph: "AI+", name: "AI exam ready", desc: "Answer every Intro to AI question with 80%+ right.", test: x => x.full.ai && x.acc.ai >= 0.8 },
    { id: "psy-tour", glyph: "Ψ", name: "Psych explorer", desc: "Try every Psychology topic.", test: x => x.tried.psy === 13 },
    { id: "psy-all", glyph: "Ψ+", name: "Psych completionist", desc: "Answer all 650 Psychology questions.", test: x => x.full.psy }
  ];
  function badgeFacts() {
    const lt = lifetime();
    const x = { answered: lt.answered, best: S.streak.best, fixed: S.counters.fixed || 0, dayStreak: dayStreak(),
      goalHit: !!S.flags.goalDay, coursesTried: 0, mastered: 0, full: {}, acc: {}, tried: {} };
    COURSES.forEach(c => {
      const st = courseStats(c);
      if (st.done > 0) x.coursesTried++;
      x.mastered += st.topics.filter(t => t.level === "mastered").length;
      x.full[c.id] = st.done === st.total;
      x.acc[c.id] = st.acc || 0;
      x.tried[c.id] = st.topics.filter(t => t.done > 0).length;
    });
    return x;
  }
  function checkBadges() {
    const x = badgeFacts(); const fresh = [];
    BADGES.forEach(b => { if (!S.badges[b.id] && b.test(x)) { S.badges[b.id] = Date.now(); fresh.push(b); } });
    return fresh;
  }

  // ---------- study suggestions ----------
  function examInfo(c, now = Date.now()) {
    if (!c.exam) return null;
    const ms = Date.parse(c.exam) - now;
    const days = Math.ceil(ms / 864e5);
    let label;
    if (ms < -3 * 3600e3) label = "exam done";
    else if (ms < 0) label = "exam now";
    else if (ms < 864e5 && new Date(c.exam).getDate() === new Date(now).getDate()) label = "exam today";
    else if (days <= 1) label = "exam tomorrow";
    else label = `exam in ${days} days`;
    return { ms, days, label, past: ms < -3 * 3600e3, soon: ms > -3 * 3600e3 && ms < 3 * 864e5 };
  }

  function suggestions(max = 5) {
    const out = [];
    COURSES.forEach(c => {
      const st = courseStats(c);
      const ex = examInfo(c);
      const boost = ex ? (ex.past ? -40 : ex.soon ? 25 : ex.days <= 14 ? 10 : 0) : 0;
      const noun = c.topicNoun;
      const href = (topic, missed) => `${c.page}#` + [topic ? "topic=" + topic : "", missed ? "missed=1" : ""].filter(Boolean).join("&");
      const weak = st.topics.filter(t => t.done >= 3 && t.acc < 0.65).sort((a, b) => a.acc - b.acc);

      if (ex && ex.soon && st.done < st.total) {
        const started = st.topics.filter(t => t.done > 0 && t.done < t.total).sort((a, b) => (a.ok / a.total) - (b.ok / b.total));
        const focus = weak[0] || started[0] || st.topics.find(t => t.done === 0);
        const why = !focus ? "Run through everything once more."
          : weak[0] ? `Start with ${focus.label}, your weakest ${noun} so far.`
          : st.done === 0 ? `Work through the ${noun}s in order, starting with ${focus.label}.`
          : `Next up: ${focus.label}.`;
        out.push({ p: 150, tone: "urgent", tag: ex.label, course: c, title: `${c.short}: ${plural(st.total - st.done, "question")} still to go`,
          detail: why, href: href(focus && focus.key, focus && focus === weak[0]), cta: "Go" });
      }
      weak.slice(0, 2).forEach(t => out.push({
        p: 80 + (1 - t.acc) * 10 + boost, tone: "weak", tag: "Weak spot", course: c, title: `Review ${t.label}`,
        detail: `${pct(t.acc)} right over ${plural(t.done, "answer")}. Retry the ${t.wrong} you missed.`,
        href: href(t.key, true), cta: "Retry"
      }));
      const otherWrong = st.wrong - weak.slice(0, 2).reduce((s, t) => s + t.wrong, 0);
      if (otherWrong > 0) out.push({
        p: 62 + boost, tone: "retry", tag: "Mistakes", course: c, title: `Retry ${plural(otherWrong, "mistake")} in ${c.short}`,
        detail: "Wrong answers stick best when you fix them soon after.", href: href(null, true), cta: "Retry"
      });
      const going = st.topics.filter(t => t.done > 0 && t.done < t.total && (t.acc ?? 1) >= 0.65)
        .sort((a, b) => (b.done / b.total) - (a.done / a.total))[0];
      if (going) out.push({
        p: 55 + boost, tone: "continue", tag: "Keep going", course: c, title: `Finish ${going.label}`,
        detail: `${going.done}/${going.total} done at ${pct(going.acc)} right.`, href: href(going.key), cta: "Continue"
      });
      const fresh = st.topics.filter(t => t.done === 0);
      if (fresh.length) out.push({
        p: 45 + boost + (st.done === 0 ? 5 : 0), tone: "new", tag: "Not started", course: c, title: `Start ${fresh[0].label}`,
        detail: `${plural(fresh.length, noun)} in ${c.short} not started yet.`, href: href(fresh[0].key), cta: "Start"
      });
      if (st.done === st.total && !weak.length && st.wrong === 0) out.push({
        p: 20 + boost, tone: "done", tag: "All done", course: c, title: `${c.short}: everything answered correctly`,
        detail: "Reset the course and do a shuffled run to check it sticks.", href: c.page, cta: "Open"
      });
    });
    // Drop lower-priority items that point to the same place as a higher one
    const seen = new Set();
    return out.sort((a, b) => b.p - a.p).filter(s => !seen.has(s.href) && seen.add(s.href)).slice(0, max);
  }

  // ---------- theme ----------
  function applyTheme() {
    const t = S.settings.theme;
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }
  function effectiveTheme() {
    const t = S.settings.theme;
    if (t === "light" || t === "dark") return t;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  applyTheme();

  const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

  // ---------- top bar ----------
  function renderTopbar() {
    const host = $("#topbar");
    if (!host) return;
    const here = document.body.dataset.page;
    const links = [["home", "index.html", "Dashboard"], ...COURSES.map(c => [c.id, c.page, c.short])];
    const t = todayCount(), g = S.profile.goal;
    host.innerHTML = `<div class="topbar-in">
      <a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true">AI</span><span>BSc AI Practice<small>${TERM.year} · ${TERM.period}</small></span></a>
      <nav class="navlinks" aria-label="Main">${links.map(([id, href, label]) => `<a href="${href}"${id === here ? ' aria-current="page"' : ""}>${esc(label)}</a>`).join("")}</nav>
      <span class="live-chip" id="liveChip" hidden></span>
      <a class="today-chip" href="index.html" title="Questions answered today / your daily goal">${S.profile.name ? esc(S.profile.name) + " · " : ""}today <b>${t}</b>/${g}</a>
      <button class="icon-btn" id="themeBtn" type="button" aria-label="Switch to ${effectiveTheme() === "dark" ? "light" : "dark"} mode">${effectiveTheme() === "dark" ? ICON_SUN : ICON_MOON}</button>
    </div>`;
    $("#themeBtn").onclick = () => {
      S.settings.theme = effectiveTheme() === "dark" ? "light" : "dark";
      save(); applyTheme(); renderTopbar();
    };
    renderLiveChip();
  }

  // "● 12 studying now", filled by live.js once the server answers
  function renderLiveChip() {
    const el = $("#liveChip");
    const L = window.LIVE && window.LIVE.last;
    if (!el) return;
    if (!L || window.LIVE.failed) { el.hidden = true; return; }
    const rest = Math.max(0, L.online - L.ai - L.psy);
    el.hidden = false;
    el.title = `${L.ai} on Intro to AI · ${L.psy} on Psychology · ${rest} on the dashboard. Updates every minute.`;
    el.innerHTML = `<i class="pulse" aria-hidden="true"></i><b>${L.online}</b> <span class="long">studying now</span><span class="short">online</span>`;
  }

  // ---------- toast ----------
  function toast(title, body, glyph) {
    let box = $(".toasts");
    if (!box) { box = document.createElement("div"); box.className = "toasts"; box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `${glyph ? `<span class="medal">${esc(glyph)}</span>` : ""}<div><b>${esc(title)}</b>${esc(body || "")}</div>`;
    box.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }
  function announce(result) {
    if (!result) return;
    result.unlocked.forEach(b => toast("Achievement unlocked: " + b.name, b.desc, b.glyph));
    if (result.goalReached) toast("Daily goal reached", `${S.profile.goal} questions today. Nice work.`, "◎");
  }

  // ---------- export / import / reset ----------
  function exportData() {
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bscai-practice-progress-${dayKey()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function importData(text) {
    const d = JSON.parse(text);
    if (!d || typeof d !== "object" || !d.ans || !d.hist) throw new Error("This file is not a progress export from this site.");
    S = normalize(d); checkBadges(); save(); applyTheme();
  }
  // Clears local progress. The verified record lives on the server and has its own delete button, so keep its key.
  function resetAll() {
    const theme = S.settings.theme, { studyId, record, recordSince } = S.profile;
    S = blank(); S.settings.theme = theme;
    Object.assign(S.profile, { studyId, record, recordSince });
    save();
  }

  window.APP = {
    TERM, COURSES, courseById, BADGES, LEVEL_LABEL,
    get S() { return S; }, save, onChange: f => listeners.push(f),
    recordAnswer, clearAnswers, courseStats, lifetime, dayStreak, todayCount, checkBadges, suggestions, examInfo,
    renderTopbar, renderLiveChip, toast, announce, exportData, importData, resetAll,
    util: { $, esc, pct, plural, dayKey, slug, duration, newId }
  };
})();
