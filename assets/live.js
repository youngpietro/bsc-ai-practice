/* Live "studying now" counter and site-wide totals, stored in Supabase (see supabase/setup.sql).
   Sends no personal data: +1 per answer, and a random id per browser tab that the server forgets after 2 minutes. */
(function () {
  "use strict";

  // Public values: the publishable key only allows what supabase/setup.sql permits (read totals, call 3 functions).
  const SUPABASE_URL = "https://jhxlhazevmleliwpqclh.supabase.co";
  const SUPABASE_KEY = "sb_publishable_9XP-8dR7eLO0nOYB_gQS4g_s5mcl4-D";
  const BEAT_MS = 45000;
  const TAB_KEY = "bscai-live-tab";

  const enabled = !!(SUPABASE_URL && SUPABASE_KEY);
  const listeners = [];
  let last = null;      // { online, ai, psy, at }
  let failed = false;

  function headers() {
    const h = { apikey: SUPABASE_KEY, "Content-Type": "application/json" };
    if (SUPABASE_KEY.startsWith("eyJ")) h.Authorization = "Bearer " + SUPABASE_KEY; // older "anon" keys are JWTs
    return h;
  }
  async function rpc(name, body, extra) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, Object.assign({ method: "POST", headers: headers(), body: JSON.stringify(body) }, extra));
    if (!r.ok) throw new Error(`${name} ${r.status}`);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }

  // One random id per tab, kept for the tab's lifetime so moving between pages isn't counted twice.
  let isNewSession = false;
  const tab = (() => {
    let id = null;
    try { id = sessionStorage.getItem(TAB_KEY); } catch (e) { /* storage blocked */ }
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
      isNewSession = true;
      try { sessionStorage.setItem(TAB_KEY, id); } catch (e) { /* fine: counted per page instead */ }
    }
    return id;
  })();
  const pageCourse = document.body.dataset.course || "site";

  function emit() {
    if (window.APP) window.APP.renderLiveChip();
    listeners.forEach(f => { try { f(last, failed); } catch (e) { /* keep others running */ } });
  }

  async function beat() {
    if (!enabled || document.visibilityState === "hidden") return;
    try {
      const res = await rpc("heartbeat", { p_id: tab, p_course: pageCourse, p_new_session: isNewSession });
      isNewSession = false;
      last = Object.assign({}, res, { at: Date.now() });
      failed = false;
    } catch (e) { failed = true; }
    emit();
  }
  function leave() {
    if (!enabled) return;
    try { fetch(`${SUPABASE_URL}/rest/v1/rpc/leave`, { method: "POST", headers: headers(), body: JSON.stringify({ p_id: tab }), keepalive: true }).catch(() => {}); } catch (e) { /* ignore */ }
  }

  function recordAnswer(course, ok) {
    if (!enabled || (course !== "ai" && course !== "psy")) return;
    rpc("record_answer", { p_course: course, p_correct: !!ok }).catch(() => {});
  }

  // All daily rows (a few per day, so this stays small for years).
  async function stats() {
    if (!enabled) return null;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/daily_stats?select=day,course,answered,correct,sessions,peak_online&order=day.asc`, { headers: headers() });
    if (!r.ok) throw new Error("stats " + r.status);
    return r.json();
  }

  // Calendar day in Amsterdam, matching the database's day boundaries.
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" });
  function amsDay(offsetDays = 0) { return fmt.format(new Date(Date.now() - offsetDays * 864e5)); }

  window.LIVE = {
    enabled,
    get last() { return last; },
    get failed() { return failed; },
    onUpdate: f => listeners.push(f),
    recordAnswer, stats, amsDay, refresh: beat
  };

  if (enabled) {
    beat();
    setInterval(beat, BEAT_MS);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") beat(); else leave(); });
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", e => { if (e.persisted) beat(); });
  }
})();
