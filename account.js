// ---------- accounts and online sync (Supabase) ----------
// The phone stays the working copy (fast, works offline). With an account every change is also sent
// to the database, and changes from other devices are pulled in. Local changes waiting to be sent
// are kept in localStorage ("mw-dirty"), so nothing is lost when the connection drops.
const CFG = window.MW_CONFIG || {};
const acctOn = !!(CFG.supabaseUrl && CFG.supabaseKey);
let sb = null, user = null, profile = null;
let syncState = "idle", lastSync = null, syncing = false, syncAgain = false, syncTimer = null;
let acctMode = "login";        // login | signup | forgot | recovery
let pendingMigration = null;   // user whose login waits for "take my data along?"
let acctMsg = "";

const ls = {
  get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } },
  set(k, v){ try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch(e){} }
};
// dirty: {code: change id}; only cleared when the same change was sent, so an edit during upload stays queued
const getDirty = () => { try { return JSON.parse(ls.get("mw-dirty") || "{}"); } catch(e){ return {}; } };
const setDirty = d => ls.set("mw-dirty", JSON.stringify(d));
function markDirty(codes){ const d = getDirty(), t = Date.now() + Math.random(); codes.forEach(c => d[c] = t); setDirty(d); }

const Sync = {
  touch(code){ markDirty([code]); schedule(); },
  removed(code){ markDirty([code]); schedule(); },
  planChanged(){ ls.set("mw-plan-dirty", String(Date.now())); schedule(); },
  status: headerStatus,
  start: startAccount,
  now: () => syncNow()
};
function schedule(){ clearTimeout(syncTimer); if (user) syncTimer = setTimeout(syncNow, 2500); }

function headerStatus(){
  const el = $("#sync"), btn = $("#acct-btn"); if (!el) return;
  btn.classList.toggle("in", !!user);
  if (!acctOn) { el.textContent = "Op dit apparaat"; return; }
  if (!user) { el.textContent = sb ? "Inloggen" : "Op dit apparaat"; return; }
  el.textContent = {busy: "Opslaan…", ok: "Opgeslagen", offline: "Offline", error: "Niet gesynct", idle: "Ingelogd"}[syncState] || "Ingelogd";
}

function loadScript(src){
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
async function startAccount(){
  headerStatus();
  if (!acctOn) return;
  try {
    if (!window.supabase) await loadScript("vendor/supabase.js");
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
  } catch(e){ sb = null; headerStatus(); return; }
  sb.auth.onAuthStateChange((ev, session) => {
    // never await Supabase inside this callback: hand off to the next tick
    setTimeout(() => {
      if (ev === "PASSWORD_RECOVERY") { acctMode = "recovery"; showTab("account"); }
      const u = session?.user || null;
      if (u && u.id !== user?.id) { user = u; onUser(u); }
      else if (!u && user) { user = null; profile = null; syncState = "idle"; }
      headerStatus(); renderAccount();
      // the confirmation link brings the user back with tokens in the address: tidy it
      if (/access_token|error_description/.test(location.hash)) try { history.replaceState(null, "", location.pathname + location.search); } catch(e){}
    }, 0);
  });
  window.addEventListener("online", () => syncNow());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) syncNow(); });
  setInterval(() => { if (!document.hidden) syncNow(); }, 120000);
  headerStatus(); renderAccount();
}

async function onUser(u){
  const owner = ls.get("mw-owner");
  if (owner === u.id) return syncNow();
  if (!owner) {
    if (items.length || plan?.spaces?.length) { pendingMigration = u; showTab("account"); return; }
    ls.set("mw-owner", u.id); ls.set("mw-lastpull", null); return syncNow();
  }
  // this device holds another account's data (already online): make room for this account
  const waiting = Object.keys(getDirty()).length || ls.get("mw-plan-dirty");
  if (waiting && !confirm("Op dit apparaat staan nog wijzigingen van een ander account die niet online staan. Als je doorgaat, worden die van dit apparaat gewist.")) { await sb.auth.signOut(); return; }
  await wipeLocal();
  ls.set("mw-owner", u.id); ls.set("mw-lastpull", null);
  syncNow();
}
async function wipeLocal(){
  for (const it of items.slice()) await store.del(it.code, {remote: true, quiet: true});
  plan = null; await metaSet("plan", null);
  setDirty({}); ls.set("mw-plan-dirty", null); ls.set("mw-next", null);
  render();
}

// first login on a device that already has stock: add it to the account
async function migrate(){
  const u = pendingMigration; if (!u) return;
  acctMsg = "Bezig met overzetten…"; renderAccount();
  try {
    const remote = new Set();
    for (let from = 0; ; from += 1000) {
      const {data, error} = await sb.from("items").select("code").eq("user_id", u.id).range(from, from + 999);
      if (error) throw error; data.forEach(r => remote.add(r.code)); if (data.length < 1000) break;
    }
    // same code already used in the account (another device): give the local item a new code
    const clash = items.filter(i => remote.has(i.code));
    if (clash.length) {
      let n = Math.max(maxCode(), ...[...remote].map(c => +(/^MW-(\d+)$/.exec(c)?.[1] || 0))) + 1;
      for (const it of clash) {
        const code = "MW-" + String(n++).padStart(4, "0");
        await store.del(it.code, {remote: true, quiet: true});
        await store.put({...it, code, labelPrinted: false}, {quiet: true});
      }
      ls.set("mw-next", String(n));
    }
    const {data: prof, error: pe} = await sb.from("profiles").select("plan").eq("id", u.id).maybeSingle();
    if (pe) throw pe;
    if (prof?.plan?.spaces?.length && plan?.spaces?.length) { plan = {...plan, spaces: [...prof.plan.spaces, ...plan.spaces]}; await metaSet("plan", plan); }
    else if (prof?.plan?.spaces?.length) { plan = prof.plan; await metaSet("plan", plan); }
    markDirty(items.map(i => i.code));
    if (plan?.spaces?.length) ls.set("mw-plan-dirty", String(Date.now()));
    ls.set("mw-owner", u.id); ls.set("mw-lastpull", null);
    pendingMigration = null;
    acctMsg = clash.length ? `${clash.length} ${clash.length === 1 ? "artikel kreeg" : "artikelen kregen"} een nieuwe code, omdat die code al in je account bestond. Print hun labels opnieuw.` : "";
    await syncNow();
    toast("Je voorraad staat nu in je account");
  } catch(e){ acctMsg = "Overzetten lukte niet. Controleer je internet en probeer het opnieuw."; }
  render();
}

async function syncNow(){
  if (!sb || !user || pendingMigration || ls.get("mw-owner") !== user.id) return;
  if (syncing) { syncAgain = true; return; }
  syncing = true; syncState = "busy"; headerStatus();
  try {
    const id = user.id, dirty = getDirty();
    // 1. pull what changed online since last time: first a light list, then full data only where needed
    let since = ls.get("mw-lastpull") || "1970-01-01T00:00:00Z";
    for (;;) {
      const {data, error} = await sb.from("items").select("code,deleted,updated_at,v:data->>updatedAt").eq("user_id", id).gt("updated_at", since).order("updated_at").limit(500);
      if (error) throw error;
      const need = [];
      for (const r of data) {
        if (r.code in dirty) continue;              // our own unsent change wins
        const local = items.find(i => i.code === r.code);
        if (r.deleted) { if (local) await store.del(r.code, {remote: true, quiet: true}); }
        else if (!local || local.updatedAt !== r.v) need.push(r.code);
      }
      for (let i = 0; i < need.length; i += 25) {
        const {data: full, error: fe} = await sb.from("items").select("code,data").eq("user_id", id).in("code", need.slice(i, i + 25));
        if (fe) throw fe;
        for (const r of full) if (r.data && !(r.code in getDirty())) await store.put({...r.data, code: r.code}, {remote: true, quiet: true});
      }
      if (data.length) { since = data[data.length - 1].updated_at; ls.set("mw-lastpull", since); }
      if (data.length < 500) break;
    }
    // 2. push local changes, a few at a time (photos make rows big)
    const codes = Object.keys(dirty);
    for (let i = 0; i < codes.length; i += 20) {
      const chunk = codes.slice(i, i + 20);
      const rows = chunk.map(c => { const it = items.find(x => x.code === c); return it ? {user_id: id, code: c, data: it, deleted: false} : {user_id: id, code: c, data: null, deleted: true}; });
      const {error} = await sb.from("items").upsert(rows, {onConflict: "user_id,code"});
      if (error) throw error;
      const now = getDirty(); chunk.forEach(c => { if (now[c] === dirty[c]) delete now[c]; }); setDirty(now);
    }
    // 3. profile and floor plan: the newest plan wins
    const {data: prof, error: pe} = await sb.from("profiles").select("*").eq("id", id).maybeSingle();
    if (pe) throw pe;
    profile = prof || {};
    const planMark = ls.get("mw-plan-dirty");
    if (!prof || planMark || (plan && !prof.plan)) {
      const row = {id, plan};
      if (!prof) row.name = user.user_metadata?.name || null;
      const {error} = await sb.from("profiles").upsert(row, {onConflict: "id"});
      if (error) throw error;
      if (!prof) profile = {...row};
      if (ls.get("mw-plan-dirty") === planMark) ls.set("mw-plan-dirty", null);
    } else if (prof.plan && (prof.plan.updatedAt || "") > (plan?.updatedAt || "")) {
      plan = prof.plan; await metaSet("plan", plan);
    }
    syncState = "ok"; lastSync = new Date();
  } catch(e){
    console.warn("sync", e);
    syncState = navigator.onLine === false ? "offline" : "error";
  }
  syncing = false; headerStatus(); render();
  if (syncAgain) { syncAgain = false; schedule(); }
}

// ---------- account page ----------
function authError(e){
  const m = (e?.message || "").toLowerCase();
  if (m.includes("invalid login")) return "E-mailadres of wachtwoord klopt niet.";
  if (m.includes("not confirmed")) return "Bevestig eerst je e-mailadres via de link in de mail die we je stuurden.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Er bestaat al een account met dit e-mailadres. Log in, of kies 'Wachtwoord vergeten'.";
  if (m.includes("password") && (m.includes("6") || m.includes("short") || m.includes("weak"))) return "Kies een wachtwoord van minstens 8 tekens.";
  if (m.includes("rate limit") || m.includes("too many")) return "Te veel pogingen. Wacht een paar minuten en probeer het opnieuw.";
  if (m.includes("fetch") || m.includes("network")) return "Geen verbinding. Controleer je internet.";
  return "Dat lukte niet: " + (e?.message || "onbekende fout");
}
function renderAccount(){
  const box = $("#acct-body"); if (!box || box.contains(document.activeElement) && document.activeElement.tagName === "INPUT") return;
  const msg = acctMsg ? `<p class="note" id="acct-msg" style="margin:0">${esc(acctMsg)}</p>` : `<p class="note" id="acct-msg" style="margin:0"></p>`;
  if (!acctOn) { box.innerHTML = `<div class="panel stack"><h2>Accounts staan nog uit</h2><p class="note" style="margin:0">Deze versie bewaart alles alleen op dit apparaat. Zodra accounts aanstaan, log je hier in en gaan je gegevens veilig mee naar je account.</p></div>`; return; }
  if (!sb) { box.innerHTML = `<div class="panel"><p class="note" style="margin:0">Account laden… Lukt dat niet, controleer dan je internet.</p></div>`; return; }
  if (pendingMigration) {
    const n = items.length, sp = plan?.spaces?.length || 0;
    box.innerHTML = `<div class="panel stack"><h2>Je voorraad meenemen?</h2>
      <p style="margin:0">Op dit apparaat staan <b>${n} ${n === 1 ? "artikel" : "artikelen"}</b>${sp ? ` en een plattegrond met <b>${sp} ${sp === 1 ? "ruimte" : "ruimtes"}</b>` : ""}. We zetten die in je account <b>${esc(pendingMigration.email || "")}</b>, zodat ze online veilig staan.</p>
      ${msg}<div class="row"><button class="btn primary" id="mig-yes">Ja, meenemen</button><button class="btn ghost" id="mig-no">Nee, uitloggen</button></div></div>`;
    $("#mig-yes").addEventListener("click", migrate);
    $("#mig-no").addEventListener("click", async () => { pendingMigration = null; await sb.auth.signOut(); toast("Uitgelogd. Je voorraad staat nog op dit apparaat."); });
    return;
  }
  if (acctMode === "recovery") {
    box.innerHTML = `<form class="panel stack" id="rec-form"><h2>Nieuw wachtwoord</h2>
      <label class="f">Nieuw wachtwoord<input type="password" id="a-pw" minlength="8" required autocomplete="new-password"></label>${msg}
      <button class="btn primary" type="submit">Wachtwoord opslaan</button></form>`;
    $("#rec-form").addEventListener("submit", async e => {
      e.preventDefault();
      const {error} = await sb.auth.updateUser({password: $("#a-pw").value});
      if (error) { $("#acct-msg").textContent = authError(error); return; }
      acctMode = "login"; acctMsg = ""; toast("Wachtwoord gewijzigd"); renderAccount();
    });
    return;
  }
  if (user) {
    const p = profile || {};
    const when = lastSync ? lastSync.toLocaleTimeString("nl-NL", {hour: "2-digit", minute: "2-digit"}) : null;
    const waiting = Object.keys(getDirty()).length;
    const state = {busy: "Bezig met opslaan…", ok: `Alles staat online${when ? ` (laatst om ${when})` : ""}.`, offline: "Geen internet. Je wijzigingen gaan online zodra je weer verbinding hebt.", error: "Online opslaan lukte niet. We proberen het zo opnieuw.", idle: "Verbonden."}[syncState];
    box.innerHTML = `<div class="stack">
      <div class="panel stack"><div class="row" style="justify-content:space-between"><div><div class="note">Ingelogd als</div><b>${esc(user.email || "")}</b></div><button class="btn" id="a-out">Uitloggen</button></div>
        <p class="note" style="margin:0">${esc(state)}${waiting ? ` ${waiting} ${waiting === 1 ? "wijziging wacht" : "wijzigingen wachten"} nog.` : ""}</p>${msg}
        <div class="row"><button class="btn" id="a-sync">Nu synchroniseren</button></div></div>
      <form class="panel stack" id="prof-form"><h2>Je gegevens</h2>
        <div class="grid2">
          <label class="f">Naam<input type="text" id="p-name" value="${esc(p.name || user.user_metadata?.name || "")}" autocomplete="name"></label>
          <label class="f">Bedrijfsnaam / shop<input type="text" id="p-biz" value="${esc(p.business || "")}" placeholder="Bijv. je Vinted-naam" autocomplete="organization"></label>
          <label class="f">Telefoon<input type="tel" id="p-phone" value="${esc(p.phone || "")}" autocomplete="tel"></label>
          <label class="f">Plaats<input type="text" id="p-city" value="${esc(p.city || "")}" autocomplete="address-level2"></label>
        </div>
        <div class="row"><button class="btn primary" type="submit">Opslaan</button></div></form></div>`;
    $("#a-sync").addEventListener("click", () => syncNow());
    $("#a-out").addEventListener("click", async () => {
      await syncNow();
      if (Object.keys(getDirty()).length && !confirm("Niet alles staat al online. Toch uitloggen? Je wijzigingen blijven op dit apparaat en gaan online zodra je weer inlogt.")) return;
      await sb.auth.signOut(); acctMsg = ""; toast("Uitgelogd. Je voorraad blijft ook op dit apparaat staan.");
    });
    $("#prof-form").addEventListener("submit", async e => {
      e.preventDefault();
      const row = {id: user.id, name: $("#p-name").value.trim(), business: $("#p-biz").value.trim(), phone: $("#p-phone").value.trim(), city: $("#p-city").value.trim()};
      const {error} = await sb.from("profiles").upsert(row, {onConflict: "id"});
      if (error) { $("#acct-msg").textContent = authError(error); return; }
      profile = {...profile, ...row}; document.activeElement?.blur?.(); toast("Gegevens opgeslagen"); renderAccount();
    });
    return;
  }
  // logged out
  const m = acctMode;
  box.innerHTML = `<div class="chips acct-tabs"><button class="chip" data-m="login" aria-pressed="${m === "login"}">Inloggen</button><button class="chip" data-m="signup" aria-pressed="${m === "signup"}">Account maken</button></div>
    <form class="panel stack" id="auth-form">
      ${m === "signup" ? `<label class="f">Naam<input type="text" id="a-name" autocomplete="name" required></label>` : ""}
      <label class="f">E-mailadres<input type="email" id="a-mail" autocomplete="email" required></label>
      ${m !== "forgot" ? `<label class="f">Wachtwoord<input type="password" id="a-pw" minlength="${m === "signup" ? 8 : 1}" required autocomplete="${m === "signup" ? "new-password" : "current-password"}"></label>` : ""}
      ${msg}
      <div class="row"><button class="btn primary" type="submit">${{login: "Inloggen", signup: "Account maken", forgot: "Stuur herstel-link"}[m]}</button>
        ${m === "login" ? `<button class="linkbtn" type="button" data-m="forgot">Wachtwoord vergeten?</button>` : m === "forgot" ? `<button class="linkbtn" type="button" data-m="login">Terug naar inloggen</button>` : ""}</div>
      ${m === "signup" ? `<p class="note" style="margin:0">Je krijgt een mail om je e-mailadres te bevestigen. Wat nu op dit apparaat staat, neem je daarna mee naar je account.</p>` : ""}
    </form>`;
  box.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => { acctMode = b.dataset.m; acctMsg = ""; renderAccount(); }));
  $("#auth-form").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("#a-mail").value.trim(), pw = $("#a-pw")?.value, out = $("#acct-msg"), btn = e.submitter || $("#auth-form button[type=submit]");
    btn.disabled = true; out.textContent = "Even geduld…";
    try {
      if (m === "login") {
        const {error} = await sb.auth.signInWithPassword({email, password: pw}); if (error) throw error;
        acctMsg = ""; out.textContent = "";
      } else if (m === "signup") {
        const {data, error} = await sb.auth.signUp({email, password: pw, options: {data: {name: $("#a-name").value.trim()}, emailRedirectTo: APP_URL}});
        if (error) throw error;
        if (data?.user && Array.isArray(data.user.identities) && !data.user.identities.length) throw {message: "already registered"};
        if (!data.session) { acctMode = "login"; acctMsg = `We hebben een mail gestuurd naar ${email}. Klik op de link daarin en log daarna hier in.`; document.activeElement?.blur?.(); renderAccount(); }
      } else {
        const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: APP_URL}); if (error) throw error;
        acctMode = "login"; acctMsg = `Als er een account is voor ${email}, staat er nu een mail met een link om een nieuw wachtwoord te kiezen.`; document.activeElement?.blur?.(); renderAccount();
      }
    } catch(err){ out.textContent = authError(err); }
    btn.disabled = false;
  });
}

function initAccount(){
  $("#acct-btn").addEventListener("click", () => showTab("account"));
}
