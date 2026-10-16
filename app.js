// ---------- helpers ----------
const APP_URL = location.origin + location.pathname; // a phone camera opens the item directly
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const eur = n => (n == null || isNaN(n)) ? "–" : new Intl.NumberFormat("nl-NL",{style:"currency",currency:"EUR"}).format(n);
const num = v => { if (v === "" || v == null) return null; const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? null : n; };
const today = () => new Date().toISOString().slice(0,10);
const locText = it => it.location || [it.rack, it.box].filter(Boolean).join(", ");
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,2600); }

// ---------- storage: IndexedDB on this device ----------
let items = [];           // all item docs, kept in memory
const DB_NAME = "mywarehouse", STORE = "items";
let idb = null;
function openDb(){
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, {keyPath:"code"});
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function tx(mode, fn){
  return new Promise((res, rej) => {
    const t = idb.transaction(STORE, mode); const out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out?.result); t.onerror = () => rej(t.error);
  });
}
const store = {
  async put(it){ await tx("readwrite", s => s.put(it)); const i=items.findIndex(x=>x.code===it.code); if(i>=0) items[i]=it; else items.push(it); render(); },
  async del(code){ await tx("readwrite", s => s.delete(code)); items=items.filter(x=>x.code!==code); render(); },
  async nextCode(){
    // never reuse a code, even after deleting: a printed label may still be around
    let n = 1; try { n = +localStorage.getItem("mw-next") || 1; } catch(e){}
    n = Math.max(n, maxCode()+1);
    try { localStorage.setItem("mw-next", n+1); } catch(e){}
    return "MW-" + String(n).padStart(4,"0");
  }
};
function maxCode(){ return items.reduce((m,it)=>{ const k=/^MW-(\d+)$/.exec(it.code); return k ? Math.max(m, +k[1]) : m; }, 0); }

async function boot(){
  try {
    idb = await openDb();
    items = await tx("readonly", s => s.getAll()) || [];
    navigator.storage?.persist?.();
    $("#sync").textContent = "op dit apparaat";
  } catch(e){ $("#sync").textContent = "opslaan lukt niet"; }
  render(); openFromHash();
}

// downloads: a plain browser download, or the share sheet when that is all the phone offers
async function saveFile(name, blob){
  try {
    const file = new File([blob], name, {type: blob.type});
    if (/iPhone|iPad/.test(navigator.userAgent) && navigator.canShare?.({files:[file]})){ await navigator.share({files:[file]}); return true; }
  } catch(e){ if (e?.name === "AbortError") return false; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  return true;
}

// ---------- tabs ----------
let tab = "home";
document.querySelectorAll("nav.tabs button").forEach(b => b.addEventListener("click", () => b.dataset.tab === "scan" ? openScanner() : showTab(b.dataset.tab)));
document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => b.dataset.go === "scan" ? openScanner() : showTab(b.dataset.go)));
function openScanner(){ showTab("scan"); startCam(); }
$("#brand").addEventListener("click", () => showTab("home"));
$("#home-search").addEventListener("submit", e => { e.preventDefault(); goSearch(); });
$("#hq").addEventListener("search", goSearch);
function goSearch(){
  const v = $("#hq").value.trim(); if (!v) return;
  const exact = findItem(/^\d+$/.test(v) ? "MW-"+v.padStart(4,"0") : v);
  if (exact){ openItem(exact.code); return; }
  $("#q").value = v; filter = "alles";
  document.querySelectorAll("#filters .chip").forEach(x => x.setAttribute("aria-pressed", x.dataset.f==="alles"));
  $("#hq").value = ""; showTab("stock");
}
function showTab(t){
  if (t !== "scan") stopCam();
  tab = t;
  document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab===t));
  document.querySelectorAll("main>section").forEach(s => s.hidden = s.id !== "tab-"+t);
  try{ localStorage.setItem("mw-tab", t); }catch(e){}
  render(); window.scrollTo(0,0);
}

// ---------- render ----------
let filter = "voorraad";
document.querySelectorAll("#filters .chip").forEach(c => c.addEventListener("click", () => {
  filter = c.dataset.f; document.querySelectorAll("#filters .chip").forEach(x => x.setAttribute("aria-pressed", x===c)); renderStock();
}));
$("#q").addEventListener("input", renderStock);

function render(){ renderHome(); renderStock(); renderDatalists(); renderLabels(); renderSales(); }

function itemRows(list){
  return `<div class="list">` + list.map(it => `
    <button class="item" data-code="${esc(it.code)}">
      ${thumb(it)}
      <div><div class="t">${esc(it.title)}</div>
        <div class="m"><span class="code">${esc(it.code)}</span> · ${esc([it.brand,it.size].filter(Boolean).join(" · ") || it.category || "")}</div>
        <div style="margin-top:4px" class="row"><span class="loc">${esc(locText(it) || "geen locatie")}</span>${it.status==="verkocht"?'<span class="badge sold">verkocht</span>':""}${it.example?'<span class="badge ex">voorbeeld</span>':""}</div></div>
      <div class="price">${it.status==="verkocht" ? eur(it.sale?.price) : eur(it.askPrice)}</div>
    </button>`).join("") + `</div>`;
}
function bindRows(root){ root.querySelectorAll(".item").forEach(b => b.addEventListener("click", () => openItem(b.dataset.code))); }

function renderHome(){
  const h = new Date().getHours();
  $("#hello").textContent = h < 12 ? "Goedemorgen" : h < 18 ? "Goedemiddag" : "Goedenavond";
  const stock = items.filter(i=>i.status==="voorraad");
  const ym = new Date().toISOString().slice(0,7);
  const month = items.filter(i=>i.status==="verkocht" && i.sale && (i.sale.date||"").startsWith(ym));
  const mProfit = month.reduce((s,i)=>s+profitOf(i),0);
  $("#hello-sub").textContent = stock.length ? `${stock.length} ${stock.length===1?"artikel ligt":"artikelen liggen"} klaar in je magazijn.` : "Voeg je eerste artikel toe om te beginnen.";
  $("#statline").innerHTML = `
    <div><div class="l">Op voorraad</div><div class="v">${stock.length}</div></div>
    <div><div class="l">Verkocht deze maand</div><div class="v">${month.length}</div></div>
    <div><div class="l">Winst deze maand</div><div class="v ${mProfit>0?"pos":mProfit<0?"neg":""}">${eur(mProfit)}</div></div>`;
  const unl = stock.filter(i=>!i.labelPrinted).length;
  $("#home-nudge").innerHTML = unl ? `<div class="nudge"><span>${unl} ${unl===1?"artikel heeft":"artikelen hebben"} nog geen label.</span><button class="btn ink" id="nudge-go">Labels printen</button></div>` : "";
  if (unl) $("#nudge-go").addEventListener("click", () => { stock.filter(i=>!i.labelPrinted).forEach(i=>lblSel.add(i.code)); showTab("labels"); });
  const recent = items.slice().sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,4);
  $("#home-recent").innerHTML = recent.length ? itemRows(recent) : `<div class="empty">Nog niets toegevoegd.</div>`;
  bindRows($("#home-recent"));
}
function profitOf(i){ return (i.sale?.price||0) - (i.sale?.fees||0) - (i.buyPrice||0); }

function thumb(it){ return it.photo ? `<img class="thumb" src="${esc(it.photo)}" alt="">` : `<div class="thumb">${esc(it.code)}</div>`; }

function renderStock(){
  const q = $("#q").value.trim().toLowerCase();
  let list = items.slice().sort((a,b)=> (b.createdAt||"").localeCompare(a.createdAt||""));
  if (filter !== "alles") list = list.filter(it => it.status === filter);
  if (q) list = list.filter(it => [it.code,it.title,it.brand,locText(it),it.size,it.category].join(" ").toLowerCase().includes(q));
  const inStock = items.filter(i=>i.status==="voorraad");
  $("#stock-sub").textContent = items.length
    ? `${inStock.length} op voorraad, samen ${eur(inStock.reduce((s,i)=>s+(i.askPrice||0),0))} vraagprijs.`
    : "Zoek een artikel en zie direct waar het ligt.";
  if (!items.length){ $("#stock-list").innerHTML = `<div class="empty">Nog geen artikelen. Ga naar <b>Toevoegen</b> om je eerste item in te voeren.</div>`; return; }
  if (!list.length){ $("#stock-list").innerHTML = `<div class="empty">Niets gevonden${q?` voor “${esc(q)}”`:""}.</div>`; return; }
  $("#stock-list").innerHTML = itemRows(list);
  bindRows($("#stock-list"));
}

// suggestions come only from what this reseller has entered before
function renderDatalists(){
  const uniq = f => [...new Set(items.map(f).map(v => (v||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"nl",{numeric:true}));
  $("#dl-brand").innerHTML = uniq(i=>i.brand).map(v=>`<option value="${esc(v)}">`).join("");
  $("#dl-cat").innerHTML = uniq(i=>i.category).map(v=>`<option value="${esc(v)}">`).join("");
  $("#dl-loc").innerHTML = uniq(locText).map(v=>`<option value="${esc(v)}">`).join("");
}

// ---------- add item ----------
let pendingPhoto = null;
$("#add-photo").addEventListener("change", async e => {
  const f = e.target.files[0]; if (!f) return;
  pendingPhoto = await shrink(f, 520, .72);
  const p = $("#add-photo-prev"); p.src = pendingPhoto; p.hidden = false;
});
function loadImage(file){ return new Promise((res,rej)=>{ const u=URL.createObjectURL(file); const im=new Image(); im.onload=()=>{res(im);}; im.onerror=rej; im.src=u; }); }
async function shrink(file, max, q){
  const im = await loadImage(file);
  const s = Math.min(1, max/Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement("canvas"); c.width=Math.round(im.naturalWidth*s); c.height=Math.round(im.naturalHeight*s);
  c.getContext("2d").drawImage(im,0,0,c.width,c.height);
  return c.toDataURL("image/jpeg", q);
}
$("#add-form").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("#add-submit"); btn.disabled = true; $("#add-msg").textContent = "opslaan…";
  try {
    const it = {
      code: await store.nextCode(),
      title: $("#f-title").value.trim(), brand: $("#f-brand").value.trim(), category: matchExisting("category", $("#f-cat").value.trim()),
      size: $("#f-size").value.trim(), condition: $("#f-cond").value,
      buyPrice: num($("#f-buy").value), askPrice: num($("#f-ask").value),
      location: $("#f-loc").value.trim(), notes: $("#f-notes").value.trim(),
      photo: pendingPhoto, status: "voorraad", labelPrinted: false, createdAt: new Date().toISOString(), sale: null
    };
    await store.put(it);
    // keep category and location for the next item: you usually fill one box at a time
    ["#f-title","#f-brand","#f-size","#f-buy","#f-ask","#f-notes"].forEach(s=>$(s).value="");
    pendingPhoto = null; $("#add-photo-prev").hidden = true; $("#add-photo").value = "";
    $("#add-msg").textContent = "";
    toast(`${it.code} opgeslagen in ${locText(it)}`);
    openItem(it.code, it);
  } catch(err){ $("#add-msg").textContent = "Opslaan lukte niet. Probeer het opnieuw."; }
  btn.disabled = false;
});

// "broeken" and "Broeken" are the same category: reuse the spelling already in use
function matchExisting(field, v){
  if (!v) return v;
  const hit = items.find(i => (i[field]||"").toLowerCase() === v.toLowerCase());
  return hit ? hit[field] : v.charAt(0).toUpperCase() + v.slice(1);
}

// ---------- item dialog ----------
function findItem(code){ return items.find(i => i.code.toLowerCase() === String(code).trim().toLowerCase()); }
function openItem(code, fallback){
  const it = findItem(code) || fallback;
  if (!it){ toast(`Code ${code} niet gevonden`); return; }
  const sold = it.status === "verkocht";
  const profit = sold && it.sale ? (it.sale.price||0) - (it.sale.fees||0) - (it.buyPrice||0) : null;
  $("#dlg-body").innerHTML = `
    <div class="dlg-head"><div><div class="code">${esc(it.code)}${it.example?' <span class="badge ex">voorbeeld</span>':""}</div><h2 style="font-size:22px;margin-top:2px">${esc(it.title)}</h2></div>
      <button class="btn ghost" data-act="close" aria-label="Sluiten">✕</button></div>
    ${it.photo ? `<img class="hero" src="${esc(it.photo)}" alt="">` : ""}
    <div><div class="note" style="margin-bottom:4px">Ligt in</div><span class="loc big">${esc(locText(it) || "geen locatie")}</span></div>
    <dl class="kv">
      ${it.brand?`<dt>Merk</dt><dd>${esc(it.brand)}</dd>`:""}
      <dt>Categorie</dt><dd>${esc(it.category||"–")}</dd>
      ${it.size?`<dt>Maat</dt><dd>${esc(it.size)}</dd>`:""}
      <dt>Staat</dt><dd>${esc(it.condition||"–")}</dd>
      <dt>Inkoop</dt><dd>${eur(it.buyPrice)}</dd>
      <dt>Vraagprijs</dt><dd>${eur(it.askPrice)}</dd>
      ${it.notes?`<dt>Notities</dt><dd>${esc(it.notes)}</dd>`:""}
      ${sold?`<dt>Verkocht</dt><dd><b>${eur(it.sale?.price)}</b> via ${esc(it.sale?.platform||"–")} op ${esc(it.sale?.date||"–")}</dd>
      <dt>Winst</dt><dd>${eur(profit)}</dd>`:""}
    </dl>
    <div id="dlg-form"></div>
    <div class="row">
      ${sold ? `<button class="btn" data-act="unsell">Terugzetten op voorraad</button>`
             : `<button class="btn primary" data-act="sell">Verkocht</button><button class="btn" data-act="move">Verplaatsen</button>`}
      <button class="btn" data-act="label">Label</button>
      <button class="btn danger" data-act="delete">Verwijderen</button>
    </div>`;
  const d = $("#dlg"); if (!d.open) d.showModal();
  $("#dlg-body").querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => itemAction(b.dataset.act, it)));
}
$("#dlg").addEventListener("close", () => { if (location.hash) try{ history.replaceState(null,"",location.pathname+location.search); }catch(e){} });

function itemAction(act, it){
  const f = $("#dlg-form");
  if (act === "close") return $("#dlg").close();
  if (act === "sell"){
    f.innerHTML = `<form class="panel stack" id="sell-form">
      <div class="grid2">
        <label class="f">Verkoopprijs (€)<input type="number" id="sp" min="0" step="0.01" inputmode="decimal" required value="${it.askPrice ?? ""}"></label>
        <label class="f">Platform<select id="spf"><option>Vinted</option><option>Depop</option><option>eBay</option><option>Marktplaats</option><option>Instagram</option><option>Eigen webshop</option><option>Markt / winkel</option><option>Anders</option></select></label>
        <label class="f">Datum<input type="date" id="sd" value="${today()}"></label>
        <label class="f">Kosten / fees (€)<input type="number" id="sfee" min="0" step="0.01" inputmode="decimal" placeholder="0,00"></label>
      </div>
      <button class="btn primary" type="submit">Opslaan als verkocht</button></form>`;
    f.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault();
      const upd = {...it, status:"verkocht", sale:{price:num($("#sp").value), platform:$("#spf").value, date:$("#sd").value||today(), fees:num($("#sfee").value)||0}};
      await store.put(upd); toast(`${it.code} verkocht voor ${eur(upd.sale.price)}`); openItem(it.code, upd);
    });
    $("#sp").focus();
  }
  if (act === "move"){
    f.innerHTML = `<form class="panel stack">
      <label class="f">Nieuwe locatie<input type="text" id="mloc" list="dl-loc" required value="${esc(locText(it))}"></label>
      <button class="btn ink" type="submit">Nieuwe locatie opslaan</button></form>`;
    f.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault(); const upd = {...it, location:$("#mloc").value.trim()}; delete upd.rack; delete upd.box;
      await store.put(upd); toast(`${it.code} ligt nu in ${locText(upd)}`); openItem(it.code, upd);
    });
  }
  if (act === "unsell"){ const upd={...it,status:"voorraad",sale:null}; store.put(upd).then(()=>openItem(it.code, upd)); }
  if (act === "label"){
    f.innerHTML = `<div class="panel stack">${labelPreview(it)}
      <div class="row"><button class="btn primary" id="one-a4">PDF (A4-vel)</button><button class="btn" id="one-roll">PDF (62×29 mm)</button></div></div>`;
    drawPreviewQR(f, it);
    $("#one-a4").addEventListener("click", () => makePdf([it], "a4", 1));
    $("#one-roll").addEventListener("click", () => makePdf([it], "roll", 1));
  }
  if (act === "delete"){
    f.innerHTML = `<div class="panel row"><span class="grow">${esc(it.code)} definitief verwijderen?</span>
      <button class="btn" id="del-no">Annuleren</button><button class="btn primary" id="del-yes">Verwijderen</button></div>`;
    $("#del-no").addEventListener("click", () => f.innerHTML = "");
    $("#del-yes").addEventListener("click", async () => { await store.del(it.code); $("#dlg").close(); toast(`${it.code} verwijderd`); });
  }
}

// ---------- QR + labels ----------
function qrPayload(it){ return APP_URL ? `${APP_URL}#${it.code}` : it.code; }
function qrMatrix(text){ const q = qrcode(0, "M"); q.addData(text); q.make(); const n=q.getModuleCount(); return {n, dark:(r,c)=>q.isDark(r,c)}; }
function labelPreview(it){
  return `<div class="label-preview"><canvas width="96" height="96" data-qr></canvas>
    <div style="min-width:0"><div class="lc">${esc(it.code)}</div><div class="lt">${esc(it.title)}</div><div class="ll">${esc(locText(it))}${it.askPrice!=null?` · ${eur(it.askPrice)}`:""}</div></div></div>`;
}
function drawPreviewQR(root, it){
  root.querySelectorAll("canvas[data-qr]").forEach(cv => {
    if (typeof qrcode === "undefined") return;
    const m = qrMatrix(qrPayload(it)), ctx = cv.getContext("2d"), s = cv.width/(m.n+2);
    ctx.fillStyle="#fff"; ctx.fillRect(0,0,cv.width,cv.height); ctx.fillStyle="#000";
    for (let r=0;r<m.n;r++) for (let c=0;c<m.n;c++) if (m.dark(r,c)) ctx.fillRect((c+1)*s,(r+1)*s,Math.ceil(s),Math.ceil(s));
  });
}
function pdfLabel(doc, it, x, y, w, h){
  const pad = 2.5, qs = h - pad*2, m = qrMatrix(qrPayload(it)), cell = qs/m.n;
  doc.setFillColor(0,0,0);
  for (let r=0;r<m.n;r++) for (let c=0;c<m.n;c++) if (m.dark(r,c)) doc.rect(x+pad+c*cell, y+pad+r*cell, cell+0.02, cell+0.02, "F");
  const tx = x + pad + qs + 2.5, tw = w - (tx - x) - pad;
  doc.setFont("courier","bold"); doc.setFontSize(h > 32 ? 13 : 11); doc.text(it.code, tx, y + pad + 4.5);
  doc.setFont("helvetica","normal"); doc.setFontSize(h > 32 ? 8.5 : 7.5);
  const lines = doc.splitTextToSize(it.title || "", tw).slice(0, h > 32 ? 3 : 2);
  doc.text(lines, tx, y + pad + 9.5);
  doc.setFont("helvetica","bold"); doc.setFontSize(h > 32 ? 9 : 8);
  doc.text(doc.splitTextToSize(locText(it), tw).slice(0,1), tx, y + h - pad - (it.askPrice!=null ? 4.5 : 0.5));
  if (it.askPrice != null){ doc.setFont("helvetica","normal"); doc.text(eur(it.askPrice), tx, y + h - pad - 0.5); }
}
async function makePdf(list, format, start){
  if (!window.jspdf){ toast("PDF-onderdeel is niet geladen. Herlaad de pagina."); return; }
  const { jsPDF } = window.jspdf; let doc;
  if (format === "roll"){
    doc = new jsPDF({unit:"mm", format:[62,29], orientation:"landscape"});
    list.forEach((it,i) => { if (i) doc.addPage([62,29],"landscape"); pdfLabel(doc, it, 0, 0, 62, 29); });
  } else {
    doc = new jsPDF({unit:"mm", format:"a4"});
    const W=70, H=37, top=(297-8*H)/2; let slot = Math.max(0, Math.min(23, (start||1)-1));
    list.forEach((it) => {
      if (slot === 24){ doc.addPage(); slot = 0; }
      const col = slot % 3, row = Math.floor(slot/3);
      doc.setDrawColor(210); doc.setLineWidth(0.1); doc.rect(col*W, top+row*H, W, H);
      pdfLabel(doc, it, col*W, top+row*H, W, H); slot++;
    });
  }
  const name = `labels-${list.length===1?list[0].code:today()}.pdf`;
  const ok = await saveFile(name, doc.output("blob"));
  if (ok) toast("PDF opgeslagen");
  return ok;
}

let lblSel = new Set();
function renderLabels(){
  const stock = items.filter(i=>i.status==="voorraad").sort((a,b)=>a.code.localeCompare(b.code));
  [...lblSel].forEach(c => { if (!stock.some(i=>i.code===c)) lblSel.delete(c); });
  if (!stock.length){ $("#lbl-list").innerHTML = `<div class="empty">Geen artikelen op voorraad om te labelen.</div>`; $("#lbl-count").textContent=""; return; }
  $("#lbl-list").innerHTML = stock.map(it => `<label class="check"><input type="checkbox" data-code="${esc(it.code)}" ${lblSel.has(it.code)?"checked":""}>
    <span class="code">${esc(it.code)}</span><span class="grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.title)}</span>
    ${it.labelPrinted?'<span class="badge ex">geprint</span>':""}<span class="loc hide-sm">${esc(locText(it))}</span></label>`).join("");
  $("#lbl-list").querySelectorAll("input").forEach(cb => cb.addEventListener("change", () => { cb.checked ? lblSel.add(cb.dataset.code) : lblSel.delete(cb.dataset.code); updLblCount(); }));
  updLblCount();
}
function updLblCount(){ $("#lbl-count").textContent = `${lblSel.size} geselecteerd`; $("#lbl-pdf").disabled = !lblSel.size; }
$("#lbl-sel-new").addEventListener("click", () => { items.filter(i=>i.status==="voorraad"&&!i.labelPrinted).forEach(i=>lblSel.add(i.code)); renderLabels(); });
$("#lbl-sel-none").addEventListener("click", () => { lblSel.clear(); renderLabels(); });
$("#lbl-pdf").addEventListener("click", async () => {
  const list = items.filter(i=>lblSel.has(i.code)).sort((a,b)=>a.code.localeCompare(b.code));
  const ok = await makePdf(list, $("#lbl-format").value, +$("#lbl-start").value);
  if (ok){ for (const it of list) if (!it.labelPrinted) await store.put({...it, labelPrinted:true}); lblSel.clear(); renderLabels(); }
});

// ---------- scanning ----------
$("#scan-photo").addEventListener("change", async e => {
  const f = e.target.files[0]; if (!f) return; e.target.value = "";
  $("#scan-msg").textContent = "lezen…";
  try {
    const im = await loadImage(f);
    let found = null;
    for (const max of [1200, 800, 1800]){
      const s = Math.min(1, max/Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement("canvas"); c.width=Math.round(im.naturalWidth*s); c.height=Math.round(im.naturalHeight*s);
      const ctx = c.getContext("2d"); ctx.drawImage(im,0,0,c.width,c.height);
      const d = ctx.getImageData(0,0,c.width,c.height);
      const r = jsQR(d.data, c.width, c.height, {inversionAttempts:"attemptBoth"});
      if (r){ found = r.data; break; }
    }
    if (!found){ $("#scan-msg").textContent = "Geen QR-code gevonden. Kom dichterbij en zorg voor genoeg licht."; return; }
    handleScan(found);
  } catch(err){ $("#scan-msg").textContent = "Deze foto kon niet gelezen worden."; }
});
function handleScan(text){
  const code = (text.match(/MW-\d+/i)||[text])[0].toUpperCase();
  const hit = findItem(code);
  if (!hit){ $("#scan-msg").textContent = `Code ${code} staat niet in je voorraad.`; return false; }
  navigator.vibrate?.(60);
  // close the scanner and jump to the item on the stock page
  filter = "alles";
  document.querySelectorAll("#filters .chip").forEach(x => x.setAttribute("aria-pressed", x.dataset.f === "alles"));
  $("#q").value = hit.code;
  showTab("stock");
  openItem(hit.code);
  return true;
}

// live camera: BarcodeDetector where the phone has it, jsQR on a small frame otherwise
let camStream = null, camTimer = null, detector = null;
async function startCam(){
  if (camStream) return;
  if (!navigator.mediaDevices?.getUserMedia){ $("#scan-msg").textContent = "Deze browser geeft geen camerabeeld. Gebruik 'Foto gebruiken'."; return; }
  try {
    camStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}}, audio:false});
  } catch(e){ camStream = null; $("#scan-msg").textContent = "Geen toegang tot de camera. Sta de camera toe in je browser, of gebruik 'Foto gebruiken'."; return; }
  const v = $("#cam"); v.srcObject = camStream; await v.play().catch(()=>{});
  $("#cam-wrap").hidden = false; $("#cam-idle").hidden = true; $("#cam-start").hidden = true; $("#cam-stop").hidden = false;
  $("#scan-msg").textContent = "Zoeken naar een QR-code…";
  try { if ("BarcodeDetector" in window && (await BarcodeDetector.getSupportedFormats()).includes("qr_code")) detector = new BarcodeDetector({formats:["qr_code"]}); } catch(e){ detector = null; }
  const c = document.createElement("canvas"), ctx = c.getContext("2d", {willReadFrequently:true});
  let busy = false, last = "";
  camTimer = setInterval(async () => {
    if (busy || !v.videoWidth) return; busy = true;
    try {
      let text = null;
      if (detector){ const r = await detector.detect(v); text = r[0]?.rawValue || null; }
      else {
        const s = Math.min(1, 640/Math.max(v.videoWidth, v.videoHeight));
        c.width = Math.round(v.videoWidth*s); c.height = Math.round(v.videoHeight*s);
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const r = jsQR(ctx.getImageData(0,0,c.width,c.height).data, c.width, c.height, {inversionAttempts:"dontInvert"});
        text = r?.data || null;
      }
      if (text && text !== last){ last = text; if (handleScan(text)) return; }
    } catch(e){}
    busy = false;
  }, 180);
}
function stopCam(){
  clearInterval(camTimer); camTimer = null;
  camStream?.getTracks().forEach(t => t.stop()); camStream = null;
  const v = $("#cam"); if (v) v.srcObject = null;
  $("#cam-wrap").hidden = true; $("#cam-idle").hidden = false; $("#cam-start").hidden = false; $("#cam-stop").hidden = true;
}
$("#cam-start").addEventListener("click", startCam);
$("#cam-stop").addEventListener("click", () => { stopCam(); $("#scan-msg").textContent = "Camera gestopt."; });
document.addEventListener("visibilitychange", () => { if (document.hidden) stopCam(); });
$("#code-form").addEventListener("submit", e => {
  e.preventDefault(); let v = $("#code-in").value.trim(); if (!v) return;
  if (/^\d+$/.test(v)) v = "MW-" + v.padStart(4,"0");
  openItem(v.toUpperCase());
});
function openFromHash(){
  const h = decodeURIComponent(location.hash.slice(1));
  if (/^MW-\d+$/i.test(h)) openItem(h.toUpperCase());
}
window.addEventListener("hashchange", openFromHash);

// ---------- sales ----------
$("#s-period").addEventListener("change", renderSales);
function soldInPeriod(){
  const p = $("#s-period").value, now = new Date();
  return items.filter(i => i.status==="verkocht" && i.sale).filter(i => {
    const d = i.sale.date || "";
    if (p==="month") return d.slice(0,7) === now.toISOString().slice(0,7);
    if (p==="year") return d.slice(0,4) === String(now.getFullYear());
    return true;
  }).sort((a,b)=>(b.sale.date||"").localeCompare(a.sale.date||""));
}
// donut: segments [{label, value, color, shown}] drawn as stroked circle arcs with a 2px surface gap
function donut(title, segs, centerVal, centerLbl){
  const total = segs.reduce((s,x)=>s+x.value,0);
  const R = 70, C = 2*Math.PI*R, gap = segs.filter(s=>s.value>0).length > 1 ? 2 : 0;
  let off = 0;
  const arcs = total > 0 ? segs.filter(s=>s.value>0).map(s => {
    const len = s.value/total*C, dash = Math.max(0.5, len-gap);
    const el = `<circle class="seg" cx="90" cy="90" r="${R}" fill="none" stroke="${s.color}" stroke-width="20" stroke-dasharray="${dash.toFixed(2)} ${(C-dash).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" data-tip="${esc(s.label)}: ${esc(s.shown)} (${Math.round(s.value/total*100)}%)"></circle>`;
    off += len; return el;
  }).join("") : "";
  const legend = segs.map(s => `<div><i style="background:${s.color}"></i><span>${esc(s.label)}</span><span class="n">${esc(s.shown)}</span><span class="p">${total>0?Math.round(s.value/total*100)+"%":"–"}</span></div>`).join("");
  return `<div class="donut-card"><h2>${esc(title)}</h2>
    <div class="donut-wrap"><svg viewBox="0 0 180 180" role="img" aria-label="${esc(title)}"><circle cx="90" cy="90" r="${R}" fill="none" stroke="var(--sunk)" stroke-width="20"></circle><g transform="rotate(-90 90 90)">${arcs}</g></svg>
      <div class="donut-center"><b>${centerVal}</b><span>${esc(centerLbl)}</span></div></div>
    <div class="legend">${legend}</div></div>`;
}
const SERIES = ["var(--s1)","var(--s2)","var(--s3)","var(--s4)","var(--s5)","var(--s6)"];
function groupTop(map, max){ // fixed order by size; beyond `max` folds into "Overig"
  const e = Object.entries(map).sort((a,b)=>b[1]-a[1]);
  if (e.length <= max) return e;
  return e.slice(0,max-1).concat([["Overig", e.slice(max-1).reduce((s,x)=>s+x[1],0)]]);
}
function renderSales(){
  const sold = soldInPeriod();
  const omzet = sold.reduce((s,i)=>s+(i.sale.price||0),0);
  const winst = sold.reduce((s,i)=>s+profitOf(i),0);
  const plus = sold.filter(i=>profitOf(i)>=0), min = sold.filter(i=>profitOf(i)<0);
  const plusSum = plus.reduce((s,i)=>s+profitOf(i),0), minSum = -min.reduce((s,i)=>s+profitOf(i),0);
  const days = sold.map(i => (new Date(i.sale.date) - new Date((i.createdAt||"").slice(0,10)))/864e5).filter(n=>!isNaN(n)&&n>=0);
  const avgDays = days.length ? Math.round(days.reduce((a,b)=>a+b,0)/days.length) : null;
  $("#sales-stats").innerHTML = `
    <div><div class="l">Verkocht</div><div class="v">${sold.length}</div></div>
    <div><div class="l">Omzet</div><div class="v">${eur(omzet)}</div></div>
    <div><div class="l">Gem. dagen</div><div class="v">${avgDays ?? "–"}</div></div>`;
  if (!sold.length){ $("#donuts").innerHTML = `<div class="empty" style="grid-column:1/-1">Nog geen verkopen in deze periode. Scan een artikel en markeer het als verkocht.</div>`; }
  else {
    const byP = {}; sold.forEach(i => { const k=i.sale.platform||"Anders"; byP[k]=(byP[k]||0)+(i.sale.price||0); });
    const byC = {}; sold.forEach(i => { const k=i.category||"Zonder categorie"; byC[k]=(byC[k]||0)+1; });
    const pSegs = groupTop(byP, 6).map(([k,v],n)=>({label:k, value:v, shown:eur(v), color: k==="Overig" ? "var(--s7)" : SERIES[n]}));
    const cSegs = groupTop(byC, 6).map(([k,v],n)=>({label:k, value:v, shown:`${v}×`, color: k==="Overig" ? "var(--s7)" : SERIES[n]}));
    const wSegs = [
      {label:`Winst (${plus.length} ${plus.length===1?"artikel":"artikelen"})`, value:plusSum, shown:eur(plusSum), color:"var(--good)"},
      {label:`Verlies (${min.length} ${min.length===1?"artikel":"artikelen"})`, value:minSum, shown:eur(-minSum), color:"var(--bad)"}];
    $("#donuts").innerHTML =
      donut("Winst en verlies", wSegs, `<span style="color:${winst>=0?"var(--good)":"var(--bad)"}">${eur(winst)}</span>`, winst>=0?"netto winst":"netto verlies") +
      donut("Omzet per platform", pSegs, eur(omzet), "omzet") +
      donut("Verkocht per categorie", cSegs, String(sold.length), "artikelen");
  }
  $("#sales-table").innerHTML = sold.length ? `<table><thead><tr><th>Datum</th><th>Code</th><th>Artikel</th><th>Platform</th><th class="n">Inkoop</th><th class="n">Verkoop</th><th class="n">Kosten</th><th class="n">Winst</th></tr></thead><tbody>
    ${sold.map(i=>`<tr><td>${esc(i.sale.date)}</td><td class="code">${esc(i.code)}</td><td>${esc(i.title)}</td><td>${esc(i.sale.platform)}</td><td class="n">${eur(i.buyPrice)}</td><td class="n">${eur(i.sale.price)}</td><td class="n">${eur(i.sale.fees)}</td><td class="n">${eur((i.sale.price||0)-(i.sale.fees||0)-(i.buyPrice||0))}</td></tr>`).join("")}
    </tbody></table>` : "";
}
$("#s-csv").addEventListener("click", async () => {
  const sold = soldInPeriod();
  if (!sold.length){ toast("Geen verkopen om te exporteren"); return; }
  const q = v => `"${String(v ?? "").replace(/"/g,'""')}"`;
  const dec = n => n==null ? "" : String(n.toFixed(2)).replace(".", ",");
  const rows = [["Datum","Code","Artikel","Merk","Categorie","Platform","Inkoop","Verkoop","Kosten","Winst","Locatie"]]
    .concat(sold.map(i=>[i.sale.date,i.code,i.title,i.brand,i.category,i.sale.platform,dec(i.buyPrice),dec(i.sale.price),dec(i.sale.fees||0),dec((i.sale.price||0)-(i.sale.fees||0)-(i.buyPrice||0)),locText(i)]));
  const csv = "﻿" + rows.map(r=>r.map(q).join(";")).join("\r\n");
  if (await saveFile(`verkopen-${today()}.csv`, new Blob([csv], {type:"text/csv"}))) toast("CSV opgeslagen");
});

// hover / tap tooltip for chart segments
const tipEl = document.createElement("div"); tipEl.className = "tip"; tipEl.hidden = true; document.body.appendChild(tipEl);
function showTip(e){
  const t = e.target.closest?.("[data-tip]"); if (!t){ tipEl.hidden = true; return; }
  tipEl.textContent = t.dataset.tip; tipEl.hidden = false;
  const x = Math.min(e.clientX + 12, window.innerWidth - tipEl.offsetWidth - 8);
  tipEl.style.left = Math.max(8, x) + "px"; tipEl.style.top = (e.clientY - 36) + "px";
}
$("#donuts").addEventListener("pointermove", showTip);
$("#donuts").addEventListener("pointerdown", showTip);
$("#donuts").addEventListener("pointerleave", () => tipEl.hidden = true);

// ---------- backup ----------
$("#bk-save").addEventListener("click", async () => {
  const data = JSON.stringify({app:"mywarehouse", version:1, exportedAt:new Date().toISOString(), items}, null, 1);
  if (await saveFile(`mywarehouse-backup-${today()}.json`, new Blob([data], {type:"application/json"}))) toast("Back-up opgeslagen");
});
$("#bk-file").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const list = Array.isArray(data) ? data : data.items;
    if (!Array.isArray(list) || !list.every(i => i && typeof i.code === "string")) throw 0;
    if (!confirm(`${list.length} artikelen terugzetten? Artikelen met dezelfde code worden overschreven.`)) return;
    for (const it of list) await tx("readwrite", s => s.put(it));
    items = await tx("readonly", s => s.getAll()); render();
    toast(`${list.length} artikelen teruggezet`);
  } catch(err){ toast("Dit is geen geldig back-upbestand"); }
});

// ---------- install as app ----------
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(()=>{}));

// ---------- start ----------
try{ const t = localStorage.getItem("mw-tab"); if (t && document.getElementById("tab-"+t)) showTab(t); }catch(e){}
boot();
