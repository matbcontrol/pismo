// Новогоднее письмо по ссылке: экран телефона целиком обёрнут бумагой, адресат рвёт её пальцем, под ней листок с личной цифрой года, посланием и подарком.
//   ?c=<код>     письмо адресата из cards/<код>.json; в нём поле set называет набор компании
//   ?set=<имя>   набор sets/<имя>.json: знак и краски компании, письмо для показа; без кода и набора открывается receipt, «Чек года»
//   ?manual=1    время идёт только по команде window.__card.run(сек): так снимает dev/cap.mjs
import * as THREE from 'three';
import { W, H, BRAND, CARD, loadFonts, drawWrap, drawTicket, drawReceipt, drawFiber } from './art.js';
import { Tear, makeMaterials, makeShareMaterial } from './tear.js';
import { GiftAudio } from './audio.js';

const qs = new URLSearchParams(location.search), manual = qs.has('manual');
const audio = new GiftAudio('sfx/');                     // записи грузятся сразу, звук включается первым касанием
if (/^[1-3]$/.test(qs.get('printer') || '')) audio.printer = 'printer' + qs.get('printer');   // какая запись принтера печатает чек, пока выбираем на слух
const canvas = document.getElementById('scene'), stage = document.getElementById('stage'), fingerEl = document.getElementById('finger');
const fitK = () => Math.min(innerWidth / W, innerHeight / H) || 1;        // окно может открыться свёрнутым, с нулевым размером
const fitStage = () => stage.style.setProperty('--k', fitK().toFixed(4));
stage.style.height = canvas.style.height = H + 'px';
fitStage(); addEventListener('resize', fitStage);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
const prNow = () => Math.min(3, Math.max(1, (window.devicePixelRatio || 1) * Math.min(1.5, Math.max(1, fitK()))));
const pr = prNow();
renderer.setPixelRatio(pr); renderer.setSize(W, H, false);
const cam = new THREE.OrthographicCamera(0, W, H, 0, -200, 200);
const hex = (h) => { const n = parseInt(h.slice(1), 16); return new THREE.Vector3((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };   // цвета как есть, без перевода в линейное пространство
const tex = (c, mip = true) => { const t = new THREE.CanvasTexture(c); t.generateMipmaps = mip; t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; t.anisotropy = 4; return t; };

const clean = (s, d) => (s || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || d;
const getJSON = async (u) => { try { const r = await fetch(u, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; } };
const cid = clean(qs.get('c'), ''), cardFile = cid ? await getJSON('cards/' + cid + '.json') : null;
const sid = clean(qs.get('set') || (cardFile && cardFile.set), 'receipt'), set = (await getJSON('sets/' + sid + '.json')) || {};
const brand = { ...BRAND, ...(set.brand || {}) };
const card = { ...CARD, ...(set.card || {}), ...(cardFile || {}) };
// ?demo: страница для компаний подставляет своего адресата и цифру. У писем настоящего заказчика это выключено (demo: false в наборе), там только коды.
if (qs.has('demo') && brand.demo !== false) {
  const g = (k, n) => (qs.get(k) || '').replace(/[<>]/g, '').trim().slice(0, n), dm = set.demo || {};
  if (g('to', 24)) { card.to = g('to', 24); if (dm.msg) card.msg = dm.msg; }
  if (g('amount', 18)) {
    card.amount = g('amount', 18).toUpperCase(); const kg = dm.cups && card.amount.match(/^(\d[\d\s]*)\s*КГ$/);
    if (kg) card.words = 'ЭТО ПРИМЕРНО ' + (Math.round(+kg[1].replace(/\s/g, '') * 1000 / 12 / 100) * 100).toLocaleString('ru-RU').replace(/ /g, ' ') + ' ЧАШЕК';
    else { if (dm.label) card.label = dm.label; if (dm.words) card.words = dm.words; }
  }
  if (g('place', 28)) card.place = g('place', 28).toUpperCase();
}
document.title = brand.name[0] + brand.name.slice(1).toLowerCase() + ': ' + card.big.join(' ').toLowerCase().replace(/^с/, 'С');
await loadFonts();
// Широкое окно компьютера: слева крупно, кому письмо. Поле и надпись берут две краски компании: тёмная идёт на поле, вторая на надпись, если она на нём читается.
{
  const lum = (h) => { const n = parseInt(h.slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const x = lum(a) + 0.05, y = lum(b) + 0.05; return x > y ? x / y : y / x; };
  const [bg, other] = lum(brand.ink1) < lum(brand.ink2) ? [brand.ink1, brand.ink2] : [brand.ink2, brand.ink1], rs = document.documentElement.style;
  rs.setProperty('--bg', bg); rs.setProperty('--fg', brand.paperLabel); rs.setProperty('--acc', contrast(other, bg) >= 3 ? other : brand.paperWrap);
  document.querySelector('meta[name="theme-color"]').content = bg;
  const side = document.getElementById('side'), h = document.getElementById('sideH');
  for (const [t, cls] of [[card.to + ',', 'n'], ['с Новым', ''], ['годом!', '']]) { const s = document.createElement('span'); s.textContent = t; if (cls) s.className = cls; h.appendChild(s); }
  document.getElementById('sideP').textContent = `От ${card.from}. Бумага рвётся мышью, на телефоне пальцем.`;
  const fitSide = () => {                                  // длинное имя не должно заходить под письмо
    h.style.fontSize = ''; if (getComputedStyle(side).display === 'none') return;
    const avail = stage.getBoundingClientRect().left - side.getBoundingClientRect().left - innerWidth * 0.03, w = h.scrollWidth;
    if (w > avail && avail > 0) h.style.fontSize = (parseFloat(getComputedStyle(h).fontSize) * avail / w) + 'px';
  };
  fitSide(); addEventListener('resize', fitSide);
}
const drawInside = card.inside === 'receipt' ? drawReceipt : drawTicket;                   // что лежит под обёрткой: бланк или чек года
const wrap = drawWrap(card, brand), ticket = drawInside(card, brand), fiber = tex(drawFiber());
const blank = document.createElement('canvas'); blank.width = blank.height = 4;
fiber.wrapS = fiber.wrapT = THREE.RepeatWrapping;
const shadowRT = new THREE.WebGLRenderTarget(Math.round(W * 1.5), Math.round(H * 1.5), { depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
const U = {
  uSize: { value: new THREE.Vector2(W, H) }, uDpr: { value: pr }, uL: { value: new THREE.Vector3(-0.42, 0.52, 0.74).normalize() },
  tFiber: { value: fiber }, tShadow: { value: shadowRT.texture }, tWrap: { value: tex(wrap.plates) }, tAux: { value: tex(wrap.aux) },
  tTicket: { value: tex(ticket.plates) }, tTicket2: { value: tex(ticket.plates2) }, tTicket3: { value: tex(ticket.plates3 || blank) },
  uInside: { value: card.inside === 'receipt' ? 1 : 0 }, uThermal: { value: hex(brand.thermal || '#2a2932') }, uPaperR: { value: hex(brand.paperReceipt || '#f4f2ec') }, uPen: { value: hex(brand.pen || '#2340a8') },
  uInk1: { value: hex(brand.ink1) }, uInk2: { value: hex(brand.ink2) }, uMarker: { value: hex(brand.marker) },
  uPaperW: { value: hex(brand.paperWrap) }, uPaperB: { value: hex(brand.paperBack) }, uPaperL: { value: hex(brand.paperLabel) }, uPaperT: { value: hex(brand.paperTicket) },
  uShadowTint: { value: new THREE.Vector3(0.5, 0.47, 0.53) }, uShadowK: { value: 0.82 }, uLift: { value: 2.6 },
  uHit1: { value: 0 }, uHit2: { value: 0 }, uHand: { value: 0 }, uWet: { value: 0 }, uPress: { value: 0 },
  uHandL: { value: new THREE.Vector4(...ticket.hand) }, uHandY: { value: new THREE.Vector3(...ticket.handY) }, uStampX: { value: ticket.stampX || 216 }, uStampY: { value: ticket.stampY }, uTicketOff: { value: 0 }, uExt: { value: ticket.ext || 0 }, uFeed: { value: 0 },
};
addEventListener('resize', () => { const p = prNow(); if (Math.abs(p - renderer.getPixelRatio()) > 0.01) { renderer.setPixelRatio(p); renderer.setSize(W, H, false); U.uDpr.value = p; } });
const tear = new Tear(renderer, U, W, H), mats = makeMaterials(U);
if (qs.has('roll')) tear.rollK = +qs.get('roll');
const scene = new THREE.Scene(), shadowScene = new THREE.Scene(), plane = new THREE.PlaneGeometry(W, H);
// листок длиннее экрана вниз: когда его тянут вверх, снизу идёт та же чистая бумага
const TE = ticket.ext || 220, tGeom = new THREE.PlaneGeometry(W, H + TE), tUv = tGeom.attributes.uv;
for (let i = 0; i < tUv.count; i++) if (tUv.getY(i) < 0.5) tUv.setY(i, -TE / H);
const mTicket = new THREE.Mesh(tGeom, mats.ticket); mTicket.position.set(W / 2, (H - TE) / 2, -0.5); mTicket.renderOrder = 2;
const mBase = new THREE.Mesh(plane, mats.base); mBase.position.set(W / 2, H / 2, 0); mBase.renderOrder = 1;
scene.add(mTicket, mBase, tear.group); shadowScene.add(tear.shadowGroup);

// ---------- удар печати ----------
const seq = { on: false, t: 0, shake: [], done: false, auto: !manual };
function hit() { if (seq.on) return; if (!feedS.done) { startFeed(); return; } seq.on = true; seq.t = -0.1; }   // у чека сначала выезжает лента
function shakeNow(amp, ang) { seq.shake.push({ t: 0, amp, x: Math.cos(ang), y: Math.sin(ang) }); }
function seqTick(dt) {
  let sx = 0, sy = 0;
  for (const s of seq.shake) { s.t += dt; const e = s.amp * Math.exp(-s.t / 0.07) * Math.cos(s.t * 62); sx += s.x * e; sy += s.y * e; }
  seq.shake = seq.shake.filter((s) => s.t < 0.6); cam.position.set(sx, sy, 0);
  if (!seq.on) return;
  const t0 = seq.t; seq.t += dt; const t = seq.t, at = (x) => t0 < x && t >= x;
  const pr = (c) => t < c ? Math.pow(Math.max(0, 1 - (c - t) / 0.1), 2) : Math.max(0, 1 - (t - c) / 0.09);   // тень штампа: сгущается к касанию, потом штамп уходит
  U.uPress.value = Math.max(pr(0), 0.85 * pr(0.24));
  if (t < 0) return;
  if (at(0)) { U.uHit1.value = 1; U.uWet.value = 1; shakeNow(5.5, -1.1); tear.flaps.forEach((f, i) => f.hop(5 + 4 * ((i * 37) % 5) / 4, 0.2 + 0.03 * (i % 3), 0.008 * (i % 4))); audio.stamp(); }
  if (at(0.24)) { U.uHit2.value = 1; shakeNow(3.2, 2.2); tear.flaps.forEach((f, i) => f.hop(2.5 + 2 * ((i * 53) % 5) / 4, 0.16, 0.006 * (i % 3)));
    audio.play('tap', { gain: 0.55, rate: 1.08 }); audio.play('land', { gain: 0.22 }); }
  U.uWet.value = Math.max(0, 1 - seq.t / 1.4);
  // у чека послание ниже первого окна: ручка начинает писать, когда строки выходят из-под обёртки
  if (ticket.handBox && !seq.pen && seq.t > 0.9 && visible(ticket.handBox)) seq.pen = 1e-3; if (seq.pen) seq.pen += dt;
  const th = ticket.handBox ? (seq.pen || 0) - 0.2 : seq.t - 0.9; U.uHand.value = th < 0 ? 0 : th < 0.85 ? th / 0.85 : th < 1.45 ? 1 + (th - 0.85) / 0.6 : 2 + Math.min(1, Math.max(0, (th - 1.6) / 0.45));
  if (seq.t > (ticket.handBox ? 1.5 : 3.1)) seq.done = true;
}
// ---------- лента выезжает ----------
// Чек года печатается на глазах: пока обёртка цела, ленты под ней нет. Когда окно открыто, лента идёт снизу, из-под бумаги, строка за строкой:
// шапка быстро, позиции по одной, итог медленно. Потом по чеку бьют печати. uFeed: на сколько лента ещё не дошла до своего места.
const FD = ticket.feed, FMAX = FD ? H - FD.top + 14 : 0, feedS = { on: false, done: !FD, f: 0, plan: [], i: 0, t: 0, from: 0, slot: 0 };
const setFeed = (v) => { feedS.f = v; U.uFeed.value = v; };
setFeed(FMAX);
const FEED_SND = { L: 'x', A: 'x', i: 'l', t: 'l', h: 's', r: 's', w: 's', b: 's' };   // какой кусок записи принтера звучит на шаге
const FEED_T = { L: [0.34, 0.06], h: [0.045, 0.03], r: [0.04, 0.02], i: [0.06, 0.17], t: [0.08, 0.14], A: [0.5, 0.22], w: [0.06, 0.09], b: [0.05, 0.01] };   // сколько длится шаг и сколько строка стоит
function startFeed() {
  if (!FD || feedS.on || feedS.done) return;
  // Щель, из которой идёт лента: нижний край окна над лентой, где порвано больше половины ширины. low: самая нижняя порванная точка,
  // лента стартует под ней, чтобы не появиться вдруг в узком надрыве. До щели она доходит ровным ходом, дальше идёт по строкам.
  let slot = 0, low = 0;
  for (let y = H - 2; y > FD.top + 60 && !slot; y -= 3) { let n = 0; for (let x = 96; x <= 336; x += 30) if (inHole(x, y)) n++; if (n && !low) low = y; if (n >= 5) slot = y; }
  if (!low) low = H; if (!slot) slot = low;
  const f0 = Math.min(FMAX, low - FD.top + 14); let f = f0; feedS.plan = []; feedS.slot = slot;
  for (const [y, k] of FD.rows) { const to = Math.max(0, slot - y - 5); if (to >= f) continue; feedS.plan.push({ to, k, mv: k === 'L' ? Math.max(FEED_T.L[0], (f - to) / 220) : FEED_T[k][0] }); f = to; if (!to) break; }
  if (f > 0) feedS.plan.push({ to: 0, k: 'b', mv: FEED_T.b[0] });
  setFeed(f0); feedS.on = true; feedS.i = 0; feedS.t = 0; feedS.from = f0; feedS.snd = -1;
}
function feedTick(dt) {
  if (!feedS.on) return;
  feedS.t += dt;
  for (;;) {
    const s = feedS.plan[feedS.i];
    if (!s) { setFeed(0); feedS.on = false; feedS.done = true; seq.on = true; seq.t = -0.42; return; }   // лента на месте: пауза и первый удар
    const mv = s.mv, hold = FEED_T[s.k][1];
    if (feedS.snd !== feedS.i) { feedS.snd = feedS.i; feedS.log && feedS.log.push(s.k); audio.print(FEED_SND[s.k], s.k === 'r' || s.k === 'b' ? 0.32 : 0.5, s.k === 'L' || s.k === 'A' ? mv : 0); }   // принтер печатает строку
    if (feedS.t < mv + hold) { const u = Math.min(1, feedS.t / mv); setFeed(feedS.from + (s.to - feedS.from) * (s.k === 'L' || s.k === 'A' ? u : 1 - (1 - u) * (1 - u))); return; }
    feedS.t -= mv + hold; feedS.from = s.to; feedS.i++;
  }
}
// звук: разрыв идёт за скоростью пальца, лоскут шуршит, сворачиваясь, и ложится; панорама по месту на листе
const panX = (x) => Math.max(-1, Math.min(1, x / W * 2 - 1));
tear.onBegin = (f) => audio.rip(0.7, panX(f.P0.x));
tear.onRelease = (f) => { seq.check = 0.55; audio.tear(0); audio.crinkle(0.32, panX(f.P.x)); audio.play('land', { gain: 0.18, at: Math.min(0.6, f.dur || 0.4), pan: panX(f.P.x) * 0.5 }); };
tear.onLoose = (f) => audio.crinkle(0.2, panX(f.C.x));                                   // лоскут потерял опору и пошёл вниз
tear.onLand = (f) => audio.play('land', { gain: 0.16, rate: 1.1, pan: panX(f.pos ? f.pos.x : W / 2) * 0.5 });   // рулон докатился до нижнего края

// ---------- палец ----------
const world = (x, y) => new THREE.Vector2(x, H - y);
// Когда послание дописано, листок можно тянуть пальцем вверх из обёртки, как открытку из конверта: снизу выходят подарок и кнопки.
// Касание без сдвига по видной кнопке нажимает её. Рвать бумагу по-прежнему можно, начав с целой бумаги.
const MAXUP = ticket.maxUp || 140, pullS = { on: false, off: 0, drag: null, used: false, nudge: -1 };
const inHole = (x, y) => tear.tornAt(world(x, y));
const setOff = (v) => { pullS.off = Math.min(MAXUP, Math.max(0, v)); mTicket.position.y = (H - TE) / 2 + pullS.off; U.uTicketOff.value = pullS.off; };
const act = { a: card.reply, b: card.copy ? 'copy' : card.order, s: 'save', foot: 'reload' };
const visible = (r) => { let n = 0; for (const [u, v] of [[0.15, 0.25], [0.85, 0.25], [0.5, 0.5], [0.15, 0.75], [0.85, 0.75]]) if (inHole(r.x + r.w * u, r.y + r.h * v - pullS.off)) n++; return n >= 4; };
// Кнопки напечатаны на листке, поэтому ответ на нажатие тоже печатается: листок перерисовывается с другой надписью на кнопке.
function relabel(over) {
  const t = drawInside({ ...card, ...over }, brand);
  for (const [u, c] of [[U.tTicket, t.plates], [U.tTicket2, t.plates2]]) { u.value.image = c; u.value.needsUpdate = true; }
}
async function copyText(s) {
  try { await navigator.clipboard.writeText(s); return true; } catch {}
  try { const ta = document.createElement('textarea'); ta.value = s; ta.style.cssText = 'position:fixed;left:-99px;top:0;opacity:0'; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok; } catch { return false; }
}
let relabelT = 0;
function tap(x, y) {
  const ty = y + pullS.off;
  for (const [k, r] of Object.entries(ticket.buttons)) {
    if (x < r.x || x > r.x + r.w || ty < r.y || ty > r.y + r.h || !visible(r)) continue;
    audio.tap(0.45); window.__card && (window.__card.tapped = k);
    if (act[k] === 'reload') location.reload();
    else if (act[k] === 'copy') copyText(card.copy).then((ok) => { window.__card && (window.__card.copied = ok);
      relabel({ btnB: ok ? 'КОД СКОПИРОВАН' : 'ВЫДЕЛИТЕ КОД ВЫШЕ' }); clearTimeout(relabelT); relabelT = setTimeout(() => relabel({}), 2200); });
    else if (act[k] === 'save') saveReceipt().then((r) => { window.__card && (window.__card.saved = r);
      if (r === 'ok') { relabel({ btnS: 'ЧЕК СОХРАНЁН' }); clearTimeout(relabelT); relabelT = setTimeout(() => relabel({}), 2200); } });
    else if (act[k]) window.open(act[k], '_blank', 'noopener');
    return;
  }
}
const down = (x, y) => { if (pullS.on && inHole(x, y)) { pullS.drag = { x0: x, y0: y, off0: pullS.off, moved: 0 }; return; } tear.down(world(x, y)); };
const move = (x, y) => { const d = pullS.drag; if (d) { d.moved = Math.max(d.moved, Math.hypot(x - d.x0, y - d.y0));
  if (d.moved > 6) { if (!d.slid) { d.slid = true; audio.cardSlide(); } setOff(d.off0 + d.y0 - y); pullS.used = true; } return; } tear.move(world(x, y)); };
const up = () => { const d = pullS.drag; if (d) { pullS.drag = null; if (d.moved <= 6) tap(d.x0, d.y0); return; } tear.up(); };
const local = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
let pid = null;
canvas.addEventListener('pointerdown', (e) => { if (pid !== null) return; pid = e.pointerId; audio.unlock(); try { canvas.setPointerCapture(pid); } catch {} down(...local(e)); e.preventDefault(); });
canvas.addEventListener('pointermove', (e) => { if (e.pointerId !== pid) return; const ev = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; move(...local(ev[ev.length - 1] || e)); });
const end = (e) => { if (e.pointerId !== pid) return; pid = null; up(); };
canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

// ---------- чек картинкой ----------
// Кнопка «Сохранить чек» отдаёт картинку 1080x1920: та же лента с печатями и словами от руки на подкладке конверта. Подарка и кода на ней нет.
const shareS = { file: null, url: null, busy: false };
function renderShare() {
  const t = drawReceipt(card, brand, { share: true }), SW = t.plates.width, SH = t.plates.height, hs = SH * W / SW;
  const SU = { uSize: { value: new THREE.Vector2(W, hs) }, uL: U.uL, tFiber: U.tFiber, tTicket: { value: tex(t.plates, false) }, tTicket2: { value: tex(t.plates2, false) }, tTicket3: { value: tex(t.plates3, false) },
    uThermal: U.uThermal, uPaperR: U.uPaperR, uPen: U.uPen, uInk1: U.uInk1, uInk2: U.uInk2, uPaperL: U.uPaperL,
    uHit1: { value: 1 }, uHit2: { value: 1 }, uHand: { value: 3 }, uWet: { value: 0 }, uHandL: { value: new THREE.Vector4(...t.hand) }, uHandY: { value: new THREE.Vector3(...t.handY) },
    uTicketOff: { value: 0 }, uExt: { value: 0 }, uFeed: { value: 0 } };
  const rt = new THREE.WebGLRenderTarget(SW, SH, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const sc = new THREE.Scene(), m = new THREE.Mesh(new THREE.PlaneGeometry(W, hs), makeShareMaterial(SU)); m.position.set(W / 2, hs / 2, 0); sc.add(m);
  renderer.setRenderTarget(rt); renderer.render(sc, new THREE.OrthographicCamera(0, W, hs, 0, -10, 10));
  const px = new Uint8Array(SW * SH * 4); renderer.readRenderTargetPixels(rt, 0, 0, SW, SH, px); renderer.setRenderTarget(null);
  const cv = document.createElement('canvas'); cv.width = SW; cv.height = SH; const g = cv.getContext('2d'), im = g.createImageData(SW, SH);
  for (let y = 0; y < SH; y++) im.data.set(px.subarray((SH - 1 - y) * SW * 4, (SH - y) * SW * 4), y * SW * 4);   // в буфере строки идут снизу вверх
  for (let i = 3; i < im.data.length; i += 4) im.data[i] = 255;
  g.putImageData(im, 0, 0);
  rt.dispose(); m.geometry.dispose(); m.material.dispose(); for (const k of ['tTicket', 'tTicket2', 'tTicket3']) SU[k].value.dispose();
  return cv;
}
function makeShare() {
  if (shareS.busy || shareS.file) return; shareS.busy = true;
  renderShare().toBlob((bl) => { shareS.busy = false; if (!bl) return;
    shareS.file = new File([bl], `chek-${(String(card.title || '').match(/\d{4}/) || ['2026'])[0]}.png`, { type: 'image/png' }); shareS.url = URL.createObjectURL(bl); }, 'image/png');
}
function showShare() {                                      // запасной путь: картинка на экране, сохраняется долгим нажатием
  const o = document.createElement('div'), im = new Image(), p = document.createElement('p'); o.id = 'keep'; im.src = shareS.url; im.alt = 'Чек';
  p.textContent = 'Чтобы сохранить, нажмите на картинку и держите. Чтобы вернуться, коснитесь поля рядом.';
  o.append(im, p); o.addEventListener('click', (e) => { if (e.target !== im) o.remove(); }); document.body.appendChild(o); return 'shown';
}
async function saveReceipt() {
  if (!shareS.file) { makeShare(); for (let i = 0; i < 80 && !shareS.file; i++) await new Promise((r) => setTimeout(r, 50)); }
  const f = shareS.file; if (!f) return 'fail';
  const ua = navigator.userAgent, ios = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) {                                                // на айфоне в листе «Поделиться» есть «Сохранить изображение»
    if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f] }); return 'ok'; } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; } }
    return showShare();
  }
  if (/; wv\)/.test(ua)) return showShare();                // встроенный браузер приложения на Android файлы не скачивает
  const a = document.createElement('a'); a.href = shareS.url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); return 'ok';
}

// ---------- кадр ----------
let player = null, tearOn = false;
const ease = (k) => 0.5 - 0.5 * Math.cos(Math.PI * Math.pow(k, 0.82));
function spline(p, u) {                              // плавный путь через точки
  const n = p.length - 1, x = Math.min(n - 1e-6, u * n), i = Math.floor(x), t = x - i, a = p[Math.max(0, i - 1)], b = p[i], c = p[i + 1], d = p[Math.min(n, i + 2)];
  const f = (k) => 0.5 * (2 * b[k] + (c[k] - a[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t + (3 * b[k] - a[k] - 3 * c[k] + d[k]) * t * t * t);
  return [f(0), f(1)];
}
function finger(x, y, on) { fingerEl.style.opacity = on ? 1 : 0; fingerEl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; }
function step(dt) {
  if (player) {
    player.t += dt; const k = Math.min(1, player.t / player.dur), p = spline(player.pts, player.flick ? Math.pow(k, 1.7) : ease(k));
    if (!player.down) { down(...player.pts[0]); player.down = true; }
    move(...p); finger(p[0], p[1], true);
    if (k >= 1 && !player.hold) { up(); finger(p[0], p[1], false); player = null; }
  }
  if (seq.check > 0 && seq.auto) { seq.check -= dt; if (seq.check <= 0 && !seq.on) { const b = ticket.amountBox; if (tear.open(b.x, H - b.y - b.h, b.w, b.h) > 0.62) hit(); } }
  feedTick(dt); seqTick(dt); tear.tick(dt);
  if (ticket.buttons.s && !shareS.file && !shareS.busy && U.uHand.value >= 3) makeShare();   // послание дописано: картинка на память готовится заранее, чтобы кнопка ответила сразу
  if (tear.mode === 'tear' || tear.mode === 'coast') { const v = (tear.mode === 'coast' ? tear.cv : tear.vel).length(); audio.tear(Math.min(1, v / 1500), panX(tear.prev.x)); tearOn = true; }
  else if (tearOn) { audio.tear(0); tearOn = false; }
  if (seq.done && !pullS.on) { pullS.on = true; pullS.nudge = 0; }
  if (pullS.nudge >= 0 && !pullS.used && !pullS.drag) {      // листок один раз чуть выглядывает вверх и садится обратно: его можно тянуть
    const k0 = (pullS.nudge - 0.8) / 0.9; pullS.nudge += dt; const k = (pullS.nudge - 0.8) / 0.9;
    if (k0 < 0 && k >= 0) audio.play('cardslide', { gain: 0.22 });
    if (k >= 0) setOff(k < 1 ? 26 * Math.sin(Math.PI * k) ** 2 : 0); if (k >= 1) pullS.nudge = -1;
  }
}
function draw() {
  renderer.setRenderTarget(shadowRT); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(shadowScene, cam);
  renderer.setRenderTarget(null); renderer.setClearColor(0x14110d, 1); renderer.render(scene, cam);
}
let last = performance.now();
function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); draw(); requestAnimationFrame(loop); }
if (!manual) requestAnimationFrame(loop); else draw();

window.__card = {
  W, H, tear, U, seq, THREE, hit, down, move, up, finger, draw, pullS, setOff, card, brand, ticket, audio, relabel, tapped: null, copied: null,
  feedS, shareS, saveReceipt, sharePNG: () => renderShare().toDataURL('image/png'), saved: null,
  run(sec) { for (let i = Math.max(1, Math.round(sec * 60)); i > 0; i--) step(1 / 60); draw(); },
  stroke(pts, dur, hold = false, flick = false) { player = { pts, dur, t: 0, hold, flick, down: false }; },
  drop() { if (player) { const p = player.pts[player.pts.length - 1]; up(); finger(p[0], p[1], false); player = null; } },
  open() { const b = ticket.amountBox; return tear.open(b.x, H - b.y - b.h, b.w, b.h); },
  ready: true,
};
