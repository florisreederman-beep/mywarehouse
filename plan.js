// ---------- floor plan: spaces (rooms) with furniture and storage spots ----------
// Sizes and positions are in centimetres. An object keeps its own width (w) and depth (h);
// rot (0-3, quarter turns) decides how it lies on the floor.
let plan = null;          // {spaces:[{id,name,kind,w,h,objects:[...]}], updatedAt}
let planSpace = null;     // id of the space shown
let planEdit = false;     // editing the floor plan
let planSel = null;       // selected object id while editing
let spotFilter = null;    // storage object id the stock list is narrowed to
let planDragging = false;

const uid = () => Math.random().toString(36).slice(2, 9);

// Everything that can stand in a space. store: stock can lie there; levels: shelves/compartments.
const OBJ_TYPES = {
  rek:      {label:"Kledingrek", w:150, h:50,  store:true,  levels:1, word:"stang", group:"store"},
  stelling: {label:"Stelling",   w:100, h:40,  store:true,  levels:4, word:"plank", group:"store"},
  kast:     {label:"Kast",       w:100, h:55,  store:true,  levels:3, word:"vak",   group:"store"},
  ladekast: {label:"Ladekast",   w:80,  h:45,  store:true,  levels:4, word:"la",    group:"store"},
  doos:     {label:"Doos",       w:50,  h:35,  store:true,  levels:1, word:"vak",   group:"store"},
  pallet:   {label:"Pallet",     w:120, h:80,  store:true,  levels:1, word:"laag",  group:"store"},
  tafel:    {label:"Tafel",      w:140, h:70,  store:true,  levels:1, word:"vak",   group:"store"},
  wandrek:  {label:"Wandrek",    w:100, h:20,  store:true,  levels:1, word:"haak",  group:"store"},
  bed:      {label:"Bed",        w:140, h:200, store:false, levels:1, word:"vak",   group:"fixed"},
  bureau:   {label:"Bureau",     w:120, h:60,  store:false, levels:1, word:"la",    group:"fixed"},
  bank:     {label:"Bank",       w:200, h:90,  store:false, levels:1, word:"vak",   group:"fixed"},
  deur:     {label:"Deur",       w:80,  h:80,  store:false, levels:1, word:"vak",   group:"fixed"},
  roldeur:  {label:"Roldeur",    w:250, h:15,  store:false, levels:1, word:"vak",   group:"fixed"},
  raam:     {label:"Raam",       w:100, h:12,  store:false, levels:1, word:"vak",   group:"fixed"},
  auto:     {label:"Auto",       w:180, h:450, store:false, levels:1, word:"vak",   group:"fixed"},
  fiets:    {label:"Fiets",      w:170, h:60,  store:false, levels:1, word:"vak",   group:"fixed"},
  trap:     {label:"Trap",       w:90,  h:200, store:false, levels:1, word:"vak",   group:"fixed"},
  pilaar:   {label:"Pilaar",     w:30,  h:30,  store:false, levels:1, word:"vak",   group:"fixed"},
  ketel:    {label:"Cv / meterkast", w:60, h:40, store:false, levels:1, word:"vak", group:"fixed"},
  laag:     {label:"Schuin dak", w:300, h:100, store:false, levels:1, word:"vak",   group:"fixed"},
  foto:     {label:"Fotohoek",   w:120, h:120, store:false, levels:1, word:"vak",   group:"fixed"},
  blok:     {label:"Iets anders", w:100, h:100, store:false, levels:1, word:"vak",  group:"fixed"}
};
// level words a reseller can pick for a storage object
const LEVEL_WORDS = ["plank","vak","la","stang","laag","haak","bak"];

// Kinds of space, with a sensible size and the things that are usually already there.
const SPACE_KINDS = {
  slaapkamer: {label:"Slaapkamer", hint:"Bed en kast staan er al; jij zet er rekken en dozen bij.", w:350, h:300,
    objects:[{t:"deur",x:260,y:0},{t:"bed",x:0,y:100},{t:"kast",x:20,y:0,name:"Kledingkast"},{t:"raam",x:180,y:288}]},
  schuur:     {label:"Schuur / tuinhuis", hint:"Vaak met fietsen en een werkbank.", w:300, h:250,
    objects:[{t:"deur",x:20,y:0},{t:"fiets",x:120,y:190},{t:"tafel",x:160,y:0,name:"Werkbank",store:false}]},
  garage:     {label:"Garage", hint:"Met of zonder auto erin.", w:300, h:550,
    objects:[{t:"roldeur",x:25,y:535},{t:"auto",x:60,y:40}]},
  zolder:     {label:"Zolder", hint:"Let op de lage randen onder het schuine dak.", w:500, h:400,
    objects:[{t:"trap",x:210,y:150,h:100,name:"Trapgat"},{t:"laag",x:0,y:0,w:500},{t:"laag",x:0,y:300,w:500}]},
  kelder:     {label:"Kelder / berging", hint:"Klein, met trap en meterkast.", w:300, h:300,
    objects:[{t:"trap",x:0,y:0},{t:"ketel",x:240,y:0}]},
  unit:       {label:"Opslagbox (gehuurd)", hint:"Een self-storage box met roldeur.", w:250, h:400,
    objects:[{t:"roldeur",x:0,y:385}]},
  magazijn:   {label:"Magazijn / bedrijfsruimte", hint:"Een grotere gehuurde ruimte.", w:800, h:1200,
    objects:[{t:"roldeur",x:275,y:1185},{t:"deur",x:700,y:0},{t:"pilaar",x:385,y:585}]},
  anders:     {label:"Andere ruimte", hint:"Woonkamer, hal, winkel of iets anders.", w:400, h:400,
    objects:[{t:"deur",x:300,y:0}]}
};

// ---------- data helpers ----------
const spaceOf = id => plan?.spaces.find(s => s.id === id);
function findObj(objId){
  for (const s of plan?.spaces || []) { const o = s.objects.find(o => o.id === objId); if (o) return {space:s, obj:o}; }
  return null;
}
const foot = o => o.rot % 2 ? {w:o.h, h:o.w} : {w:o.w, h:o.h};
const storeSpots = () => (plan?.spaces || []).flatMap(s => s.objects.filter(o => o.store).map(o => ({space:s, obj:o})));
const levelLabel = (o, l) => `${o.word || "plank"} ${l}`;
function placeText(place){
  const f = place && findObj(place.o); if (!f) return "";
  return [f.space.name, f.obj.name, f.obj.levels > 1 && place.l ? levelLabel(f.obj, place.l) : ""].filter(Boolean).join(" · ");
}
const itemsAt = objId => items.filter(i => i.status === "voorraad" && i.place?.o === objId);

function nextName(type){
  const base = OBJ_TYPES[type].label;
  const used = (plan?.spaces || []).flatMap(s => s.objects).filter(o => o.type === type).length;
  return OBJ_TYPES[type].group === "store" ? `${base} ${used + 1}` : base;
}
function makeObj(type, extra = {}){
  const T = OBJ_TYPES[type];
  return {id: uid(), type, name: extra.name || nextName(type), x: extra.x || 0, y: extra.y || 0,
    w: extra.w || T.w, h: extra.h || T.h, rot: 0, store: extra.store ?? T.store, levels: T.levels, word: T.word};
}
function makeSpace(kind, name, w, h){
  const K = SPACE_KINDS[kind];
  const s = {id: uid(), kind, name: name || K.label.split(" /")[0].replace(" (gehuurd)",""), w: w || K.w, h: h || K.h, objects: []};
  if (!plan) plan = {spaces: [], updatedAt: null};
  plan.spaces.push(s);
  for (const d of K.objects){ const o = makeObj(d.t, d); s.objects.push(o); clampObj(s, o); }
  return s;
}
function clampObj(s, o){
  const f = foot(o);
  o.x = Math.max(0, Math.min(s.w - f.w, o.x)); o.y = Math.max(0, Math.min(s.h - f.h, o.y));
  if (f.w > s.w) o.x = 0; if (f.h > s.h) o.y = 0;
}
// first free spot on a 10 cm grid, so a new object doesn't land on top of the bed
function freeSpot(s, o){
  const f = foot(o), hits = (x, y) => s.objects.some(p => { const g = foot(p); return x < p.x + g.w && x + f.w > p.x && y < p.y + g.h && y + f.h > p.y; });
  for (let y = 0; y + f.h <= s.h; y += 10) for (let x = 0; x + f.w <= s.w; x += 10) if (!hits(x, y)) return {x, y};
  return {x: Math.max(0, (s.w - f.w) / 2), y: Math.max(0, (s.h - f.h) / 2)};
}

async function savePlan(){
  plan.updatedAt = new Date().toISOString();
  try { await metaSet("plan", plan); } catch(e){ toast("Plattegrond opslaan lukte niet"); }
  // renamed spots: keep the location text on items (and their labels) in step
  for (const it of items) if (it.place){
    const t = placeText(it.place);
    if (t && t !== it.location) await store.put({...it, location: t}, {quiet: true});
  }
  Sync.planChanged();
  renderPlan.force = true; render(); renderPlan.force = false;
}

// ---------- drawing ----------
function objShape(o){
  const w = o.w, h = o.h, x = -w/2, y = -h/2, t = o.type;
  const R = (cls, ex = "") => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(4, w/6, h/6)}" ${ex}/>`;
  if (t === "deur") return `<path class="fx" d="M${x} ${y}H${x+w}M${x} ${y}V${y+h}A${w} ${h} 0 0 0 ${x+w} ${y}" fill="none"/><path class="swing" d="M${x} ${y}V${y+h}A${w} ${h} 0 0 0 ${x+w} ${y}Z"/>`;
  if (t === "roldeur" || t === "raam") return R("fx win") + `<line class="fx" x1="${x}" y1="0" x2="${x+w}" y2="0"/>`;
  if (t === "bed") return R("fu") + `<rect class="fu2" x="${x+w*.1}" y="${y+6}" width="${w*.8}" height="${Math.min(40,h*.2)}" rx="4"/><line class="fu2" x1="${x}" y1="${y+h*.35}" x2="${x+w}" y2="${y+h*.35}"/>`;
  if (t === "auto") return `<rect class="fu" x="${x}" y="${y}" width="${w}" height="${h}" rx="${w*.25}"/><rect class="fu2" x="${x+w*.12}" y="${y+h*.22}" width="${w*.76}" height="${h*.16}" rx="10"/><rect class="fu2" x="${x+w*.12}" y="${y+h*.66}" width="${w*.76}" height="${h*.12}" rx="10"/>`;
  if (t === "trap") { let s = R("fu"); for (let i = 1; i < 8; i++) s += `<line class="fu2" x1="${x}" y1="${y+h*i/8}" x2="${x+w}" y2="${y+h*i/8}"/>`; return s; }
  if (t === "laag") return R("low");
  if (t === "pilaar") return R("fx solid");
  if (t === "fiets") return R("fu") + `<circle class="fu2" cx="${x+w*.2}" cy="0" r="${h*.35}"/><circle class="fu2" cx="${x+w*.8}" cy="0" r="${h*.35}"/>`;
  const cls = o.store ? "st" : "fu";
  if (t === "rek") { let s = R(cls) + `<line class="ln" x1="${x+6}" y1="0" x2="${x+w-6}" y2="0"/>`; for (let i = 1; i < 10; i++) s += `<line class="ln" x1="${x+w*i/10}" y1="${-h*.3}" x2="${x+w*i/10}" y2="${h*.3}"/>`; return s; }
  if (t === "stelling" || t === "kast" || t === "ladekast") { let s = R(cls); const n = Math.min(o.levels || 1, 6); for (let i = 1; i < n; i++) s += `<line class="ln" x1="${x+w*i/n}" y1="${y}" x2="${x+w*i/n}" y2="${y+h}"/>`; return s + `<line class="ln front" x1="${x}" y1="${y+h-3}" x2="${x+w}" y2="${y+h-3}"/>`; }
  if (t === "doos") return R(cls) + `<path class="ln" d="M${x} ${y}L0 0L${x+w} ${y}M${x} ${y+h}L0 0L${x+w} ${y+h}"/>`;
  if (t === "pallet") { let s = R(cls); for (let i = 1; i < 5; i++) s += `<line class="ln" x1="${x}" y1="${y+h*i/5}" x2="${x+w}" y2="${y+h*i/5}"/>`; return s; }
  return R(cls);
}

// mode: "view" (counts, tap to filter), "edit" (drag), "mini" (one spot highlighted)
function planSvg(s, mode, opt = {}){
  const pad = Math.max(24, Math.max(s.w, s.h) * .07), fs = (s.w + 2*pad) / 26;
  const grid = [];
  const step = Math.max(s.w, s.h) > 900 ? 100 : 50;
  for (let x = step; x < s.w; x += step) grid.push(`<line class="${x % 100 ? "g1" : "g2"}" x1="${x}" y1="0" x2="${x}" y2="${s.h}"/>`);
  for (let y = step; y < s.h; y += step) grid.push(`<line class="${y % 100 ? "g1" : "g2"}" x1="0" y1="${y}" x2="${s.w}" y2="${y}"/>`);
  const m = v => (v/100).toLocaleString("nl-NL", {maximumFractionDigits: 2}) + " m";
  // fixed things first, storage on top so it is always tappable
  const objs = s.objects.slice().sort((a, b) => (a.store - b.store) || (a.type === "laag" ? -1 : 0));
  const body = objs.map(o => {
    const f = foot(o), cx = o.x + f.w/2, cy = o.y + f.h/2;
    const n = o.store ? itemsAt(o.id).length : 0;
    const on = (mode === "edit" && planSel === o.id) || (mode === "view" && spotFilter === o.id) || (mode === "mini" && opt.hi === o.id);
    const hit = mode === "view" && opt.hits?.has(o.id);
    const dim = mode === "mini" && opt.hi !== o.id;
    // label: full name if it fits, else just its number
    let label = o.name; const room = f.w * .92;
    if (label.length * fs * .52 > room) { const k = /(\d+)\s*$/.exec(label); label = k ? k[1] : (o.store ? label.slice(0, Math.max(1, Math.floor(room / (fs*.52)))) : ""); }
    if (["deur","raam","roldeur","pilaar"].includes(o.type) && mode !== "edit") label = "";
    // count badge in the top-right corner, inside the object so neighbours don't overlap
    const r = Math.min(fs*.8, f.w/2.2, f.h/2.2), bx = o.x + f.w - r - 1, by = o.y + r + 1;
    const badge = mode === "view" && n ? `<g class="badge-n"><circle cx="${bx}" cy="${by}" r="${r}"/><text x="${bx}" y="${by}" font-size="${r*1.1}">${n}</text></g>` : "";
    return `<g class="obj ${o.store ? "is-store" : ""} ${on ? "on" : ""} ${hit ? "hit" : ""} ${dim ? "dim" : ""}" data-id="${o.id}">
      <g transform="translate(${cx} ${cy}) rotate(${o.rot*90})">${objShape(o)}</g>
      ${label ? `<text class="ol" x="${cx}" y="${cy}" font-size="${fs}">${esc(label)}</text>` : ""}${badge}</g>`;
  }).join("");
  return `<svg class="plan-svg ${mode}" viewBox="${-pad} ${-pad} ${s.w + 2*pad} ${s.h + 2*pad}" data-space="${s.id}" role="img" aria-label="Plattegrond ${esc(s.name)}">
    <rect class="floor" x="0" y="0" width="${s.w}" height="${s.h}"/>${grid.join("")}
    <rect class="wall" x="0" y="0" width="${s.w}" height="${s.h}" fill="none"/>
    <text class="dim-t" x="${s.w/2}" y="${-pad*.35}" font-size="${fs*.9}">${m(s.w)}</text>
    <text class="dim-t" x="${-pad*.35}" y="${s.h/2}" font-size="${fs*.9}" transform="rotate(-90 ${-pad*.35} ${s.h/2})">${m(s.h)}</text>
    ${body}</svg>`;
}
function miniMap(place){
  const f = place && findObj(place.o); if (!f) return "";
  return `<div class="mini-plan">${planSvg(f.space, "mini", {hi: f.obj.id})}</div>`;
}

// ---------- Voorraad page: start, view, edit ----------
function renderPlan(){
  const area = $("#plan-area"); if (!area || planDragging) return;
  if (area.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName) && !renderPlan.force) return;
  $("#stock-browse").hidden = planEdit;
  if (!plan?.spaces.length) { planEdit = false; area.innerHTML = kindChooser(true); bindKindChooser(area); $("#stock-browse").hidden = false; return; }
  if (!spaceOf(planSpace)) planSpace = plan.spaces[0].id;
  const s = spaceOf(planSpace);
  const tabs = `<div class="chips space-tabs">${plan.spaces.map(x => `<button class="chip" data-space="${x.id}" aria-pressed="${x.id === s.id}">${esc(x.name)}</button>`).join("")}
    ${planEdit ? `<button class="chip add" data-act="add-space">+ Ruimte</button>` : ""}</div>`;
  if (planEdit) area.innerHTML = editView(s, tabs); else area.innerHTML = viewView(s, tabs);
  bindPlan(area, s);
}

function kindChooser(first){
  return `<div class="panel stack plan-start">
    ${first ? `<div><h2>Maak eerst je plattegrond</h2><p class="note" style="margin:4px 0 0">Teken waar je voorraad ligt: je slaapkamer, schuur of gehuurde ruimte. Daarna kies je bij elk artikel een plek, en zie je bij het zoeken meteen waar het ligt.</p></div>`
            : `<div class="dlg-head"><h2>Ruimte toevoegen</h2><button class="btn ghost" data-act="cancel-space" aria-label="Annuleren">✕</button></div>`}
    <div class="kinds">${Object.entries(SPACE_KINDS).map(([k, K]) => `<button class="kind" data-kind="${k}"><b>${esc(K.label)}</b><span>${esc(K.hint)}</span></button>`).join("")}</div>
    <form class="stack" id="kind-form" hidden>
      <div class="grid2">
        <label class="f">Naam<input type="text" id="k-name" required maxlength="40"></label>
        <label class="f">Breedte (m)<input type="number" id="k-w" min="0.5" max="100" step="0.1" inputmode="decimal" required></label>
        <label class="f">Lengte (m)<input type="number" id="k-h" min="0.5" max="100" step="0.1" inputmode="decimal" required></label>
      </div>
      <p class="note" id="k-hint" style="margin:0"></p>
      <div class="row"><button class="btn primary" type="submit">Ruimte maken</button><button class="btn ghost" type="button" data-act="kind-back">Andere ruimte kiezen</button></div>
    </form></div>`;
}
function bindKindChooser(root){
  let kind = null;
  root.querySelectorAll(".kind").forEach(b => b.addEventListener("click", () => {
    kind = b.dataset.kind; const K = SPACE_KINDS[kind];
    root.querySelector(".kinds").hidden = true; root.querySelector("#kind-form").hidden = false;
    const n = (plan?.spaces || []).filter(s => s.kind === kind).length;
    $("#k-name").value = K.label.split(" /")[0].replace(" (gehuurd)","") + (n ? " " + (n + 1) : "");
    $("#k-w").value = K.w/100; $("#k-h").value = K.h/100;
    $("#k-hint").textContent = K.objects.length ? `We zetten er alvast neer: ${[...new Set(K.objects.map(d => (d.name || OBJ_TYPES[d.t].label).toLowerCase()))].join(", ")}. Verschuif of verwijder wat niet klopt.` : "";
    $("#k-name").focus();
  }));
  root.querySelector("[data-act=kind-back]")?.addEventListener("click", () => { root.querySelector(".kinds").hidden = false; root.querySelector("#kind-form").hidden = true; });
  root.querySelector("[data-act=cancel-space]")?.addEventListener("click", () => renderPlan());
  root.querySelector("#kind-form").addEventListener("submit", async e => {
    e.preventDefault();
    const cm = v => Math.round(Math.min(100, Math.max(.5, num(v) || 1)) * 100);
    const s = makeSpace(kind, $("#k-name").value.trim(), cm($("#k-w").value), cm($("#k-h").value));
    s.objects.forEach(o => clampObj(s, o));
    planSpace = s.id; planEdit = true; planSel = null;
    await savePlan();
    toast(`${s.name} gemaakt. Voeg nu je rekken, stellingen en dozen toe.`);
  });
}

function viewView(s, tabs){
  const q = $("#q").value.trim().toLowerCase();
  const hits = new Set();
  if (q) items.filter(it => it.place && [it.code, it.title, it.brand, it.size, it.category].join(" ").toLowerCase().includes(q)).forEach(it => hits.add(it.place.o));
  const spots = s.objects.filter(o => o.store);
  const inSpace = items.filter(i => i.status === "voorraad" && spots.some(o => o.id === i.place?.o)).length;
  const sel = spotFilter && findObj(spotFilter);
  const otherHits = q ? plan.spaces.filter(x => x.id !== s.id && x.objects.some(o => hits.has(o.id))) : [];
  return `<div class="plan-card">${tabs}
    <div class="plan-wrap">${planSvg(s, "view", {hits})}</div>
    <div class="plan-foot">
      <span class="note">${spots.length ? `${inSpace} ${inSpace === 1 ? "artikel" : "artikelen"} in ${spots.length} ${spots.length === 1 ? "opslagplek" : "opslagplekken"}. Tik op een plek om te zien wat er ligt.` : "Nog geen opslagplekken in deze ruimte."}</span>
      <button class="btn" data-act="edit">Plattegrond bewerken</button>
    </div>
    ${otherHits.length ? `<div class="nudge"><span>Ook gevonden in ${otherHits.map(x => esc(x.name)).join(", ")}</span>${otherHits.map(x => `<button class="btn ink" data-space="${x.id}">${esc(x.name)}</button>`).join("")}</div>` : ""}
    ${sel ? spotInfo(sel) : ""}</div>`;
}
function spotInfo({space, obj}){
  const here = itemsAt(obj.id);
  const per = obj.levels > 1 ? Array.from({length: obj.levels}, (_, i) => i + 1).map(l => `<span class="loc">${esc(levelLabel(obj, l))}: ${here.filter(i => i.place.l === l).length}</span>`).join("") : "";
  return `<div class="spot-info">
    <div class="row" style="justify-content:space-between"><div><div class="note">${esc(space.name)}</div><h2>${esc(obj.name)}</h2></div>
      <div class="row"><button class="btn primary" data-act="add-here">+ Hier toevoegen</button><button class="btn ghost" data-act="clear-spot" aria-label="Plek loslaten">✕</button></div></div>
    ${per ? `<div class="row" style="margin-top:8px;gap:6px">${per}</div>` : ""}</div>`;
}

function editView(s, tabs){
  const o = s.objects.find(x => x.id === planSel);
  const btn = ([k, T]) => `<button class="pal" data-add="${k}">${esc(T.label)}</button>`;
  return `<div class="plan-card editing">
    <div class="row" style="justify-content:space-between"><h2>Plattegrond bewerken</h2><button class="btn primary" data-act="done">Klaar</button></div>
    ${tabs}
    <p class="note" style="margin:0">Sleep dingen naar de goede plek. Tik op iets om het aan te passen.</p>
    <div class="plan-wrap">${planSvg(s, "edit")}</div>
    ${o ? objPanel(s, o) : roomPanel(s)}
    <div class="palette"><h3>Opslag toevoegen</h3><div class="pals">${Object.entries(OBJ_TYPES).filter(([, T]) => T.group === "store").map(btn).join("")}</div>
      <h3>Wat er al staat</h3><div class="pals">${Object.entries(OBJ_TYPES).filter(([, T]) => T.group === "fixed").map(btn).join("")}</div></div>
  </div>`;
}
function roomPanel(s){
  return `<form class="panel stack" id="room-form">
    <div class="grid2">
      <label class="f">Naam ruimte<input type="text" id="r-name" value="${esc(s.name)}" maxlength="40" required></label>
      <label class="f">Breedte (m)<input type="number" id="r-w" value="${s.w/100}" min="0.5" max="100" step="0.1" inputmode="decimal"></label>
      <label class="f">Lengte (m)<input type="number" id="r-h" value="${s.h/100}" min="0.5" max="100" step="0.1" inputmode="decimal"></label>
    </div>
    <div class="row"><button class="btn danger" type="button" data-act="del-space">Ruimte verwijderen</button></div></form>`;
}
function objPanel(s, o){
  const n = itemsAt(o.id).length;
  return `<form class="panel stack" id="obj-form">
    <div class="dlg-head"><div><div class="note">${esc(OBJ_TYPES[o.type]?.label || "")}${n ? ` · ${n} ${n === 1 ? "artikel" : "artikelen"}` : ""}</div></div>
      <button class="btn ghost" type="button" data-act="deselect" aria-label="Sluiten">✕</button></div>
    <div class="grid2">
      <label class="f">Naam<input type="text" id="o-name" value="${esc(o.name)}" maxlength="40" required></label>
      <label class="f">Breedte (cm)<input type="number" id="o-w" value="${o.w}" min="5" max="5000" step="5" inputmode="numeric"></label>
      <label class="f">Diepte (cm)<input type="number" id="o-h" value="${o.h}" min="5" max="5000" step="5" inputmode="numeric"></label>
    </div>
    <label class="check" style="border:0;padding:0"><input type="checkbox" id="o-store" ${o.store ? "checked" : ""}> Hier ligt voorraad${o.type === "bed" ? " (bijv. bakken onder het bed)" : ""}</label>
    ${o.store ? `<div class="grid2">
      <label class="f">Aantal ${esc(o.word || "plank")}en<input type="number" id="o-lv" value="${o.levels || 1}" min="1" max="20" step="1" inputmode="numeric"></label>
      <label class="f">Noem ze<select id="o-word">${LEVEL_WORDS.map(w => `<option ${w === (o.word || "plank") ? "selected" : ""}>${w}</option>`).join("")}</select></label></div>` : ""}
    <div class="row">
      <button class="btn" type="button" data-act="rot">Draaien</button>
      <button class="btn" type="button" data-act="dup">Nog een</button>
      <button class="btn danger" type="button" data-act="del-obj">Verwijderen</button>
    </div></form>`;
}

function bindPlan(area, s){
  area.querySelectorAll("[data-space]").forEach(b => b.tagName === "BUTTON" && b.addEventListener("click", () => { planSpace = b.dataset.space; planSel = null; spotFilter = null; renderPlan(); renderStock(); }));
  const act = (a, fn) => area.querySelectorAll(`[data-act="${a}"]`).forEach(b => b.addEventListener("click", fn));
  act("edit", () => { planEdit = true; planSel = null; spotFilter = null; renderPlan(); renderStock(); });
  act("done", () => { planEdit = false; planSel = null; renderPlan(); renderStock(); window.scrollTo(0, 0); });
  act("add-space", () => { area.innerHTML = kindChooser(false); bindKindChooser(area); });
  act("clear-spot", () => { spotFilter = null; renderPlan(); renderStock(); });
  act("add-here", () => { lastSpot = {o: spotFilter, l: null}; showTab("add"); });
  act("deselect", () => { planSel = null; renderPlan(); });
  const svg = area.querySelector("svg.plan-svg");
  if (!planEdit){
    svg.querySelectorAll(".obj.is-store").forEach(g => g.addEventListener("click", () => {
      spotFilter = spotFilter === g.dataset.id ? null : g.dataset.id; renderPlan(); renderStock();
      if (spotFilter) $("#stock-list").scrollIntoView?.({block: "nearest"});
    }));
    return;
  }
  // ---- editing ----
  area.querySelectorAll("[data-add]").forEach(b => b.addEventListener("click", async () => {
    const o = makeObj(b.dataset.add); Object.assign(o, freeSpot(s, o)); s.objects.push(o); clampObj(s, o);
    planSel = o.id; await savePlan(); area.querySelector("svg")?.scrollIntoView?.({block: "nearest"});
  }));
  const rf = area.querySelector("#room-form");
  if (rf){
    rf.addEventListener("change", async () => {
      s.name = $("#r-name").value.trim() || s.name;
      const cm = v => Math.round(Math.min(100, Math.max(.5, num(v) || s.w/100)) * 100);
      s.w = cm($("#r-w").value); s.h = cm($("#r-h").value); s.objects.forEach(o => clampObj(s, o));
      await savePlan();
    });
    rf.addEventListener("submit", e => e.preventDefault());
    act("del-space", async () => {
      const n = items.filter(i => s.objects.some(o => o.id === i.place?.o)).length;
      if (!confirm(`${s.name} verwijderen?${n ? ` ${n} artikelen houden hun tekst-locatie maar staan dan niet meer op de plattegrond.` : ""}`)) return;
      for (const it of items.filter(i => s.objects.some(o => o.id === i.place?.o))) await store.put({...it, place: null}, {quiet: true});
      plan.spaces = plan.spaces.filter(x => x.id !== s.id); planSpace = null; planSel = null;
      if (!plan.spaces.length) planEdit = false;
      await savePlan();
    });
  }
  const of = area.querySelector("#obj-form");
  if (of){
    const o = s.objects.find(x => x.id === planSel);
    of.addEventListener("submit", e => e.preventDefault());
    of.addEventListener("change", async () => {
      o.name = $("#o-name").value.trim() || o.name;
      o.w = Math.max(5, Math.round(num($("#o-w").value) || o.w)); o.h = Math.max(5, Math.round(num($("#o-h").value) || o.h));
      o.store = $("#o-store").checked;
      if ($("#o-lv")) o.levels = Math.max(1, Math.min(20, Math.round(num($("#o-lv").value) || 1)));
      if ($("#o-word")) o.word = $("#o-word").value;
      // shelves that no longer exist: those items stay on the object, without a shelf
      for (const it of items.filter(i => i.place?.o === o.id && i.place.l > (o.store ? o.levels : 0))) await store.put({...it, place: o.store ? {o: o.id, l: null} : null}, {quiet: true});
      clampObj(s, o); await savePlan();
    });
    act("rot", async () => { o.rot = (o.rot + 1) % 4; clampObj(s, o); await savePlan(); });
    act("dup", async () => {
      const c = makeObj(o.type, {w: o.w, h: o.h, store: o.store}); c.rot = o.rot; c.levels = o.levels; c.word = o.word;
      Object.assign(c, freeSpot(s, c)); s.objects.push(c); clampObj(s, c); planSel = c.id; await savePlan();
    });
    act("del-obj", async () => {
      const here = items.filter(i => i.place?.o === o.id);
      if (here.length && !confirm(`Op ${o.name} liggen ${here.length} artikelen. Toch verwijderen? Ze houden hun tekst-locatie.`)) return;
      for (const it of here) await store.put({...it, place: null}, {quiet: true});
      s.objects = s.objects.filter(x => x.id !== o.id); planSel = null; await savePlan();
    });
  }
  // drag to move, snapping to 10 cm; a tap without moving selects
  const pt = e => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  svg.querySelectorAll(".obj").forEach(g => {
    g.addEventListener("touchstart", e => e.preventDefault(), {passive: false});
    g.addEventListener("pointerdown", e => {
      e.preventDefault();
      const o = s.objects.find(x => x.id === g.dataset.id), start = pt(e), ox = o.x, oy = o.y; let moved = false;
      g.setPointerCapture?.(e.pointerId); g.classList.add("on"); planDragging = true;
      const move = ev => {
        const p = pt(ev), dx = p.x - start.x, dy = p.y - start.y;
        if (!moved && Math.hypot(dx, dy) < 6) return; moved = true;
        o.x = Math.round((ox + dx) / 10) * 10; o.y = Math.round((oy + dy) / 10) * 10; clampObj(s, o);
        g.setAttribute("transform", `translate(${o.x - ox} ${o.y - oy})`);
      };
      const up = async () => {
        g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up);
        planSel = o.id; planDragging = false;
        if (moved) await savePlan(); else renderPlan();
      };
      g.addEventListener("pointermove", move); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
    });
  });
  svg.addEventListener("click", e => { if (e.target.closest(".obj")) return; if (planSel){ planSel = null; renderPlan(); } });
}

// ---------- choosing a spot for an item (add form and "Verplaatsen") ----------
let lastSpot = null; // {o, l}: you usually fill one shelf at a time
function spotPicker(p, cur, curText){
  const spots = storeSpots();
  if (!spots.length) return `<label class="f">Locatie<input type="text" id="${p}-loc" list="dl-loc" required value="${esc(curText || "")}" placeholder="Bijv. Rek 1, doos 6"></label>
    <p class="note" style="margin:-6px 0 0">Tip: maak een <button type="button" class="linkbtn" data-go-plan>plattegrond</button>, dan kies je hier een plek uit je eigen ruimte.</p>`;
  const valid = cur && findObj(cur.o)?.obj.store;
  const opts = plan.spaces.filter(s => s.objects.some(o => o.store)).map(s => `<optgroup label="${esc(s.name)}">${s.objects.filter(o => o.store).map(o => `<option value="${o.id}" ${valid && cur.o === o.id ? "selected" : ""}>${esc(o.name)} (${itemsAt(o.id).length})</option>`).join("")}</optgroup>`).join("");
  const free = !valid && curText;
  return `<div class="grid2 spot-pick">
    <label class="f">Opslagplek<select id="${p}-spot" required>${valid || free ? "" : `<option value="" selected disabled>Kies een plek…</option>`}${opts}<option value="__free" ${free ? "selected" : ""}>Andere plek (zelf typen)</option></select></label>
    <label class="f" id="${p}-lv-wrap" hidden><span id="${p}-lv-word">Plank</span><select id="${p}-lv"></select></label>
    <label class="f" id="${p}-free" hidden>Locatie<input type="text" id="${p}-loc" list="dl-loc" value="${esc(curText || "")}" placeholder="Bijv. Bij de voordeur"></label>
  </div>`;
}
function bindSpotPicker(root, p, cur){
  root.querySelector("[data-go-plan]")?.addEventListener("click", () => { $("#dlg").open && $("#dlg").close(); showTab("stock"); });
  const sel = root.querySelector(`#${p}-spot`); if (!sel) return;
  const upd = () => {
    const f = findObj(sel.value), lv = root.querySelector(`#${p}-lv`), isFree = sel.value === "__free";
    root.querySelector(`#${p}-free`).hidden = !isFree; root.querySelector(`#${p}-loc`).required = isFree;
    const many = f && f.obj.levels > 1;
    root.querySelector(`#${p}-lv-wrap`).hidden = !many;
    if (many){
      const w = f.obj.word || "plank";
      root.querySelector(`#${p}-lv-word`).textContent = w.charAt(0).toUpperCase() + w.slice(1);
      const keep = cur?.o === f.obj.id ? cur.l : null;
      lv.innerHTML = `<option value="">Maakt niet uit</option>` + Array.from({length: f.obj.levels}, (_, i) => `<option value="${i+1}" ${keep === i+1 ? "selected" : ""}>${esc(levelLabel(f.obj, i+1))}</option>`).join("");
    }
  };
  sel.addEventListener("change", upd); upd();
}
// returns {place, location}
function readSpotPicker(root, p){
  const sel = root.querySelector(`#${p}-spot`);
  if (!sel || sel.value === "__free") return {place: null, location: root.querySelector(`#${p}-loc`).value.trim()};
  const lvRaw = root.querySelector(`#${p}-lv-wrap`).hidden ? "" : root.querySelector(`#${p}-lv`).value;
  const place = {o: sel.value, l: lvRaw ? +lvRaw : null};
  return {place, location: placeText(place)};
}
function renderAddPicker(){
  const box = $("#loc-picker"); if (!box || box.contains(document.activeElement)) return;
  const prevText = $("#f-loc")?.value || "";
  box.innerHTML = spotPicker("f", lastSpot, lastSpot ? "" : prevText);
  bindSpotPicker(box, "f", lastSpot);
}

function initPlan(){
  $("#q").addEventListener("input", () => { if (!planEdit) renderPlan(); });
}
