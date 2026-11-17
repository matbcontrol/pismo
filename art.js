// Печатные формы открытки: новогодняя обёртка и листок под ней. Картинка рисуется кодом на холсте.
// Каждая краска лежит в своём канале: R первая краска, G вторая, B маркер или штамп. Цвет и фактуру собирает шейдер,
// поэтому буквы остаются сплошной плашкой, а зерно бумаги и непропечатки идут отдельно от них.
// Ширина листа постоянная, высота по экрану (от 768 до 940), чтобы на вытянутых телефонах не было пустых полос. Раскладка привязана к верху.
const ASPECT = typeof innerWidth === 'number' && innerWidth > 0 ? innerHeight / innerWidth : 0;
export const S = 2.5, W = 432, H = Math.round(Math.min(940, Math.max(768, W * ASPECT)));
const BIG = '"Alumni Sans"', MONO = '"IBM Plex Mono"', HAND = 'Caveat';

// Компания по умолчанию. Набор sets/<имя>.json может заменить любые поля: знак, две краски, строку на бумаге, середину снежинки.
export const BRAND = {
  name: 'ТРЕСК', sub: 'ОБЖАРОЧНАЯ',
  micro: 'ТРЕСК  ·  ОБЖАРОЧНАЯ  ·  С НОВЫМ 2027  ·  ОБЖАРЕНО ДО ПЕРВОГО ТРЕСКА  ·  ',
  ink1: '#e2412a', ink2: '#1b2552', marker: '#1a1922',
  paperWrap: '#d8c49e', paperBack: '#d2be98', paperLabel: '#f3eee2', paperTicket: '#f5f1e6',
  flake: 'bean',            // что в середине снежинки: 'bean' кофейное зерно, иначе точка
  demo: true,               // можно ли подставлять адресата из адреса страницы (?demo&to=…); у настоящего заказчика false
};
// Письмо по умолчанию: руководитель поздравляет сотрудника. Письма адресатов лежат в cards/<код>.json и перекрывают эти поля.
//   copy   если задан, вторая кнопка копирует эту строку (код сертификата); иначе она ведёт по ссылке order
//   btnA   первая кнопка, ведёт по ссылке reply; пустая строка убирает кнопку, вторая тогда занимает всю ширину
//   btnS   у чека года: кнопка рамкой, отдаёт чек картинкой на память; пустая строка убирает её
export const CARD = {
  big: ['С НОВЫМ', '2027'], to: 'Ане', from: 'Макса', no: '0412', date: '25.12.26', hint: 'ВСКРЫВАТЬ ПАЛЬЦЕМ',
  kicker: 'ИТОГИ 2026 ДЛЯ КОМАНДЫ', label: 'ТВОЙ 2026 В «ТРЕСКЕ»', place: 'БАРИСТА, ЛЕСНАЯ, 4',
  amount: '9 412 ЧАШЕК', words: 'ПО 38 ЗА СМЕНУ. РЕКОРД КОФЕЙНИ', box: 'СПАСИБО ЗА ГОД',
  msg: ['Аня, гости спрашивают,', 'когда твоя смена. Спасибо!'], sign: 'Макс',
  giftLabel: 'ПОДАРОК ОТ КОМАНДЫ: 5 000 РУБ. НА МАРКЕТПЛЕЙС', until: 'ДО 31.03.2027', gift: 'TRSK-7Q4M-2K9D', copy: 'TRSK-7Q4M-2K9D',
  btnA: '', btnB: 'СКОПИРОВАТЬ КОД', btnS: 'СОХРАНИТЬ ЧЕК', footL: '', footR: 'ОТКРЫТЬ ЗАНОВО',
};

export async function loadFonts() {
  const need = [`900 80px ${BIG}`, `500 12px ${MONO}`, `600 12px ${MONO}`, `600 40px ${HAND}`, `16px "DotGothic16"`];
  await Promise.all(need.map((f) => document.fonts.load(f, 'С НОВЫМ 2027 ТРЕСК тресканя «»№·')));
}

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const CH = ['#ff0000', '#00ff00', '#0000ff'], KO = ['#00ffff', '#ff00ff', '#ffff00'];   // краска в канале и её вырубка
const ink = (g, ch) => { g.globalCompositeOperation = 'lighter'; g.fillStyle = g.strokeStyle = CH[ch]; };
const rnd = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

function fit(g, text, width, wt = 900, fam = BIG) {            // кегль, при котором строка занимает заданную ширину
  g.font = `${wt} 200px ${fam}`; let m = g.measureText(text);
  const size = 200 * width / (m.actualBoundingBoxLeft + m.actualBoundingBoxRight), font = `${wt} ${size}px ${fam}`;
  g.font = font; m = g.measureText(text);
  return { font, size, asc: m.actualBoundingBoxAscent, left: m.actualBoundingBoxLeft, w: m.actualBoundingBoxLeft + m.actualBoundingBoxRight };
}
function mono(g, text, x, y, size, ls, wt = 500, align = 'left', maxW = 1e9) {
  g.font = `${wt} ${size}px ${MONO}`; g.letterSpacing = ls + 'px';
  const w = g.measureText(text).width; if (w > maxW) { size *= maxW / w; g.font = `${wt} ${size}px ${MONO}`; }
  g.textAlign = align; g.fillText(text, align === 'right' ? x + ls : x, y); g.letterSpacing = '0px'; g.textAlign = 'left';
}
function arcText(g, text, cx, cy, r, mid, size, ls, top = true) {   // текст по дуге, середина в угле mid
  g.font = `600 ${size}px ${MONO}`; g.textAlign = 'center';
  const ws = [...text].map((ch) => g.measureText(ch).width + ls), total = ws.reduce((a, b) => a + b, 0);
  let a = mid - (top ? 1 : -1) * total / r / 2;
  [...text].forEach((ch, i) => { const da = ws[i] / r; a += (top ? 1 : -1) * da / 2;
    g.save(); g.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.rotate(a + (top ? Math.PI / 2 : -Math.PI / 2)); g.fillText(ch, 0, 0); g.restore(); a += (top ? 1 : -1) * da / 2; });
  g.textAlign = 'left';
}
// Снежинка: шесть тонких лучей с веточками. В середине знак компании: у обжарочной кофейное зерно с вырубленной бороздкой, у остальных точка.
// s это радиус луча.
function flake(g, cx, cy, s, ch, rot = 0, center = 'bean') {
  ink(g, ch); g.save(); g.translate(cx, cy); g.rotate(rot); g.lineCap = 'round'; g.lineWidth = s * 0.12;
  for (let i = 0; i < 6; i++) {
    g.save(); g.rotate(i * Math.PI / 3); g.beginPath(); g.moveTo(s * 0.36, 0); g.lineTo(s, 0);
    for (const [t, l] of [[0.58, 0.3], [0.8, 0.2]]) { g.moveTo(s * t, 0); g.lineTo(s * (t + l * 0.62), s * l * 0.78); g.moveTo(s * t, 0); g.lineTo(s * (t + l * 0.62), -s * l * 0.78); }
    g.stroke(); g.restore();
  }
  if (center === 'bean') {
    g.rotate(0.5); g.beginPath(); g.ellipse(0, 0, s * 0.3, s * 0.2, 0, 0, 7); g.fill();
    g.globalCompositeOperation = 'multiply'; g.strokeStyle = KO[ch]; g.lineWidth = s * 0.055;
    g.beginPath(); g.moveTo(-s * 0.24, 0); g.bezierCurveTo(-s * 0.08, -s * 0.09, s * 0.08, s * 0.09, s * 0.24, 0); g.stroke();
  } else { g.beginPath(); g.arc(0, 0, s * 0.2, 0, 7); g.fill(); }
  g.restore(); ink(g, ch);
}

// Залом листа: с одной стороны светлее, с другой темнее, по самой линии краска треснула. Пишется в канал G вспомогательного холста (128 нейтрально).
function crease(a, x0, y0, x1, y1, ridge, k = 1) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
  const lit = (-Math.sin(ang) * -0.42 + Math.cos(ang) * -0.52) > 0 ? 1 : -1;      // сторона +y локальной системы смотрит на свет (свет слева сверху)
  a.save(); a.translate(x0, y0); a.rotate(ang);
  for (const side of [1, -1]) {
    const up = side * lit * (ridge ? 1 : -1) > 0, wd = 30;
    const gr = a.createLinearGradient(0, 0, 0, side * wd);
    if (up) { a.globalCompositeOperation = 'lighter'; gr.addColorStop(0, `rgb(0,${Math.round(15 * k)},0)`); gr.addColorStop(1, 'rgb(0,0,0)'); }
    else { a.globalCompositeOperation = 'multiply'; gr.addColorStop(0, `rgb(255,${Math.round(255 - 30 * k)},255)`); gr.addColorStop(1, 'rgb(255,255,255)'); }
    a.fillStyle = gr; a.fillRect(0, Math.min(0, side * wd), len, wd);
  }
  a.globalCompositeOperation = ridge ? 'lighter' : 'multiply'; a.fillStyle = ridge ? `rgb(0,${Math.round(34 * k)},0)` : `rgb(255,${Math.round(255 - 44 * k)},255)`; a.fillRect(0, -0.45, len, 0.9);
  a.restore();
}

export function drawWrap(d = CARD, b = BRAND) {
  const [c, g] = mk(W * S, H * S), [ca, a] = mk(W * S, H * S);
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  a.fillStyle = 'rgb(0,128,0)'; a.fillRect(0, 0, c.width, c.height);
  const rot = -6 * Math.PI / 180;
  for (const q of [g, a]) { q.save(); q.scale(S, S); q.translate(W / 2, H / 2); q.rotate(rot); q.translate(-W / 2, -H / 2); }

  // крупный набор повтором вниз, как на рулонной бумаге: поздравление и год, под поздравлением бегущая строка, под годом полоса снежинок
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  const ww = 396, x0 = 18, gap = 26;
  const rows = [{ t: d.big[0], ch: 1 }, { t: d.big[1], ch: 0 }], m = rows.map((r) => fit(g, r.t, ww));
  const period = m[0].asc + m[1].asc + 2 * gap;
  for (let k = -1; k < 3; k++) {
    let y = 150 + k * period;
    rows.forEach((r, i) => {
      ink(g, r.ch); g.font = m[i].font; g.fillText(r.t, x0 + m[i].left, y + m[i].asc);
      const yb = y + m[i].asc + gap / 2, ch2 = 1 - r.ch;
      if (i === 0) {
        ink(g, ch2); g.textBaseline = 'middle';
        let t = b.micro; g.font = `600 7.2px ${MONO}`; g.letterSpacing = '1.5px'; while (g.measureText(t).width < ww + 300) t += b.micro;
        g.fillText(t, x0 - 80 - ((k * 53 + 400) % 120), yb + 0.5); g.letterSpacing = '0px'; g.textBaseline = 'alphabetic';
      } else {
        for (let j = 0, xi = x0 - 34 + ((k * 23 + 60) % 44); xi < W + 40; j++, xi += 44) flake(g, xi, yb, (j + k) & 1 ? 7.6 : 9, ch2, 0.18 * ((j * 3 + k) % 4), b.flake);
      }
      y += m[i].asc + gap;
    });
  }
  // заломы: лист был сложен втрое и пополам
  crease(a, -80, 262, W + 80, 262, true); crease(a, -80, 520, W + 80, 520, false); crease(a, 208, -80, 208, H + 80, true, 0.8);
  g.restore(); a.restore();

  // наклейка с адресом: белая бумага поверх обёртки, своя печать и надписи от руки
  const lw = 240, lh = 130, lx = 176, ly = 22, lrot = 2.4 * Math.PI / 180;
  for (const q of [g, a]) { q.save(); q.scale(S, S); q.translate(lx + lw / 2, ly + lh / 2); q.rotate(lrot); q.translate(-lw / 2, -lh / 2); }
  a.globalCompositeOperation = 'lighter'; a.shadowColor = 'rgb(0,0,255)'; a.shadowBlur = 7 * S; a.shadowOffsetX = 2.2 * S; a.shadowOffsetY = 3.2 * S;
  a.fillStyle = 'rgb(255,0,255)'; a.fillRect(0, 0, lw, lh); a.shadowColor = 'transparent';
  a.globalCompositeOperation = 'source-over'; a.fillStyle = 'rgb(255,128,255)'; a.fillRect(0, 0, lw, lh);      // под наклейкой заломы не видны
  g.globalCompositeOperation = 'source-over'; g.fillStyle = '#000'; g.fillRect(0, 0, lw, lh);
  ink(g, 0); g.font = `900 36px ${BIG}`; g.textBaseline = 'alphabetic'; g.fillText(b.name, 13, 37);
  ink(g, 1); mono(g, b.sub, lw - 13, 20, 6.3, 1.3, 600, 'right'); mono(g, 'ИТОГИ ГОДА № ' + d.no, lw - 13, 31, 6.3, 1.3, 500, 'right');
  g.fillRect(13, 45, lw - 26, 1.1);
  mono(g, 'КОМУ', 13, 73, 6.3, 1.3, 600); g.fillRect(52, 79.5, lw - 65, 0.6);
  mono(g, 'ОТ', 13, 106, 6.3, 1.3, 600); g.fillRect(52, 112.5, lw - 65, 0.6);
  mono(g, d.hint, lw - 34, lh - 6.5, 5.6, 1.5, 600, 'right');
  g.beginPath(); const ax = lw - 30; g.moveTo(ax + 6, lh - 13); g.lineTo(ax + 6, lh - 4.5); g.lineTo(ax + 3.2, lh - 8); g.moveTo(ax + 6, lh - 4.5); g.lineTo(ax + 8.8, lh - 8); g.lineWidth = 0.9; g.stroke();
  ink(g, 2);
  const handLine = (t, x, y, r, size) => { g.font = `600 ${size}px ${HAND}`; const w = g.measureText(t).width, k = Math.min(1, (lw - x - 10) / w); g.font = `600 ${size * k}px ${HAND}`; g.save(); g.translate(x, y); g.rotate(r); g.fillText(t, 0, 0); g.restore(); };
  handLine(d.to, 62, 77, -0.035, 42); handLine(d.from, 60, 110, -0.02, 36);
  g.restore(); a.restore();

  // календарный штемпель: ложится и на бумагу, и на угол наклейки
  g.save(); g.scale(S, S); const sx = lx - 2, sy = ly + lh - 12; g.translate(sx, sy); g.rotate(-0.21); ink(g, 1);
  g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 37, 0, 7); g.stroke(); g.lineWidth = 0.8; g.beginPath(); g.arc(0, 0, 25, 0, 7); g.stroke();
  g.textBaseline = 'middle'; arcText(g, b.name + ' · ' + b.sub, 0, 0, 31, -Math.PI / 2, 6.2, 1.6); arcText(g, d.big.join(' '), 0, 0, 31, Math.PI / 2, 6.2, 1.6, false);
  g.font = `600 9.5px ${MONO}`; g.textAlign = 'center'; g.fillText(d.date, 0, 0.5); g.textAlign = 'left';
  g.lineWidth = 1.2; for (let i = -2; i <= 2; i++) { g.beginPath(); for (let x = -118; x <= -42; x += 2) { const y = i * 6.5 + Math.sin((x + 42) / 6.2) * 2.1; x === -118 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); }
  g.restore();
  return { plates: c, aux: ca };
}

export function drawTicket(d = CARD, b = BRAND) {
  const [c, g] = mk(W * S, H * S), [c2, g2] = mk(W * S, H * S);
  for (const q of [g, g2]) { q.fillStyle = '#000'; q.fillRect(0, 0, c.width, c.height); q.save(); q.scale(S, S); q.textBaseline = 'alphabetic'; }
  const mx = 26, R = W - mx, ix = 104, iR = W - 104;               // поля листа и поля колонки, которую открывают первые два рывка
  // всё нужное собрано в полосе 200–660: её открывают первые рывки от середины
  const Y = { head: 90, lab: 206, cy: 290, from: 386, l0: 446, l1: 490, l2: 534, gift: 556, btn: 612, foot: 676, flakes: 720 };
  // шапка
  ink(g, 0); g.font = `900 58px ${BIG}`; g.fillText(b.name, mx - 2, 76);
  ink(g, 1); mono(g, b.sub, R, 52, 6.8, 1.5, 600, 'right'); mono(g, d.kicker, R, 64, 6.8, 1.5, 500, 'right', 200); mono(g, '№ ' + d.no + ' / 26', R, 76, 6.8, 1.5, 500, 'right');
  g.fillRect(mx, Y.head, R - mx, 1.5);
  // поле цифры года, подписи внутри колонки
  g.fillRect(mx, Y.lab, R - mx, 0.9); mono(g, d.label, ix, Y.lab + 17, 6.8, 1.5, 600, 'left', 100); mono(g, d.place, iR, Y.lab + 17, 6.8, 1.5, 500, 'right', 106);
  g.fillRect(mx, Y.from, R - mx, 0.9); mono(g, 'ОТ РУКИ', 58, Y.from + 17, 6.8, 1.5, 600);
  g.globalAlpha = 0.5; for (const y of [Y.l0 + 4, Y.l1 + 4, Y.l2 + 4]) for (let x = mx; x < R; x += 4) g.fillRect(x, y, 1.6, 0.7); g.globalAlpha = 1;
  // подарок и кнопки стоят с полями пошире: по краям листка лежат свёрнутые лоскуты обёртки и закрывают первые 30–40 px
  const bx = 48, bR = W - 48;
  g.fillRect(mx, Y.gift, R - mx, 0.9); mono(g, d.giftLabel, bx, Y.gift + 17, 6.8, 1.5, 600, 'left', 222); mono(g, d.until, bR, Y.gift + 17, 6.8, 1.5, 500, 'right', 104);
  mono(g, d.gift, bx, Y.gift + 42, 18, 1.2, 600, 'left', bR - bx);
  // кнопки напечатаны на том же листе; без первой кнопки вторая занимает всю ширину
  const bh = 40, hasA = !!d.btnA, hasB = !!d.btnB, wA = 162, bA = [bx, Y.btn, wA, bh], bB = hasA ? [bx + wA + 12, Y.btn, bR - bx - wA - 12, bh] : [bx, Y.btn, bR - bx, bh];
  if (hasA) { g.lineWidth = 1.4; g.strokeRect(bA[0] + 0.7, bA[1] + 0.7, bA[2] - 1.4, bh - 1.4); mono(g, d.btnA, bA[0] + bA[2] / 2, Y.btn + 24, 8.4, 1.6, 600, 'center', wA - 16); }
  if (hasB) {
    g.fillRect(...bB);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = '#ff00ff'; g.textAlign = 'center'; g.font = '600 8.4px ' + MONO; g.letterSpacing = '1.6px'; g.fillText(d.btnB, bB[0] + bB[2] / 2 + 0.8, Y.btn + 24, bB[2] - 16); g.letterSpacing = '0px'; g.textAlign = 'left';
  }
  ink(g, 1); if (d.footL) mono(g, d.footL, bx, Y.foot, 6.8, 1.5, 500, 'left', 200); if (d.footR) mono(g, d.footR, bR, Y.foot, 6.8, 1.5, 500, 'right', 140);
  for (let x = mx + 12, j = 0; x < R; x += 38, j++) flake(g, x, Y.flakes, j % 2 ? 7 : 8.2, 0, 0.2 * (j % 3), b.flake);      // полоса снежинок по низу листка

  // удар первый: цифра года, краска 1 (канал B). Удар второй: контур со съездом, подпись и рамка, краска 2 (второй холст, канал R)
  const cx = W / 2, cy = Y.cy, rotS = -4.6 * Math.PI / 180;
  for (const q of [g, g2]) { q.save(); q.translate(cx, cy); q.rotate(rotS); }
  // «312 КГ» ложится одной строкой; если после числа длинное слово («48 ПОСТАВОК»), число бьётся крупно, а слово вторым ударом рядом
  const sp = String(d.amount).match(/^(\d[\d\s]*\d|\d)\s+([^\d\s].*)$/), long = !!sp && sp[2].length > 3, main = long ? sp[1].trim() : d.amount;
  const f = fit(g, main, long ? Math.min(150, 64 * main.replace(/\s/g, '').length) : 232); g2.font = f.font;
  let uw = 0, uf = '';
  if (long) { uf = `900 ${Math.round(f.asc * 0.42)}px ${BIG}`; g2.font = uf; uw = Math.min(232 - f.w - 10, g2.measureText(sp[2]).width); g2.font = f.font; }
  const tw = long ? Math.max(f.w + 10 + uw, 150) : f.w, dx = -tw / 2, by = f.asc / 2 - 6;
  ink(g, 2); g.fillText(main, dx + f.left, by);
  ink(g2, 0); g2.lineWidth = 1.6; g2.lineJoin = 'round'; g2.strokeText(main, dx + f.left + 5, by - 4);
  if (long) { g2.font = uf; g2.fillText(sp[2], dx + f.w + 10, by - 2, Math.max(40, 232 - f.w - 10)); }
  mono(g2, d.words, dx + 2, by + 21, 7, 1.5, 600, 'left', Math.max(tw, 200));
  g2.lineWidth = 1.2; g2.strokeRect(dx + tw - 108, by + 29, 108, 20); mono(g2, d.box, dx + tw - 54, by + 42.8, 7.4, 1.4, 600, 'center', 100);
  for (const q of [g, g2]) q.restore();

  // послание от руки: временная замена шрифтом, сюда придут настоящие штрихи отправителя. Конец каждой строки нужен шейдеру, чтобы проявлять её слева направо.
  g2.globalCompositeOperation = 'lighter'; g2.fillStyle = '#00ff00';
  const hand = (t, x, y, r, size, maxW) => { g2.font = `600 ${size}px ${HAND}`; let w = g2.measureText(t).width;    // строки уже колонки, чтобы не уходить под край дыры
    if (w > maxW) { size *= maxW / w; g2.font = `600 ${size}px ${HAND}`; w = maxW; }
    g2.save(); g2.translate(x, y); g2.rotate(r); g2.fillText(t, 0, 0); g2.restore(); return x + w * Math.cos(r); };
  const e0 = hand(d.msg[0] || '', 60, Y.l0, -0.028, 40, 296), e1 = hand(d.msg[1] || '', 66, Y.l1, -0.02, 40, 290), s0 = 232, e2 = hand(d.sign || '', s0, Y.l2, -0.06, 46, 140);
  for (const q of [g, g2]) q.restore();
  const box = (a) => ({ x: a[0], y: a[1], w: a[2], h: a[3] });
  return { plates: c, plates2: c2, amountBox: { x: 100, y: Y.cy - 62, w: 232, h: 120 }, hand: [e0, e1, s0, e2], handY: [Y.l0, Y.l1, Y.l2], stampY: Y.cy + 2,
    buttons: { ...(hasA && { a: box(bA) }), ...(hasB && { b: box(bB) }), foot: { x: bR - 150, y: Y.foot - 14, w: 150, h: 22 } } };
}

// Волокна бумаги: плитка 512, серое 128 нейтрально, светлые и тёмные волоски и редкие вкрапления.
export function drawFiber(seed = 11) {
  const N = 512, [c, g] = mk(N, N), r = rnd(seed);
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, N, N); g.lineCap = 'round';
  const line = (x, y, len, ang, bend, w, col) => { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
    if (x + ox < -40 || x + ox > N + 40 || y + oy < -40 || y + oy > N + 40) continue;
    g.beginPath(); g.moveTo(x + ox, y + oy); g.quadraticCurveTo(x + ox + Math.cos(ang + bend) * len * 0.5, y + oy + Math.sin(ang + bend) * len * 0.5, x + ox + Math.cos(ang) * len, y + oy + Math.sin(ang) * len);
    g.lineWidth = w; g.strokeStyle = col; g.stroke(); } };
  for (let i = 0; i < 5200; i++) { const v = r() < 0.5 ? 255 : 0, al = 0.05 + r() * 0.16; line(r() * N, r() * N, 5 + r() * 26, r() * 6.283, (r() - 0.5) * 1.4, 0.5 + r() * 0.8, `rgba(${v},${v},${v},${al})`); }
  for (let i = 0; i < 420; i++) { const al = 0.2 + r() * 0.45; line(r() * N, r() * N, 2 + r() * 9, r() * 6.283, (r() - 0.5) * 2, 0.7 + r() * 1.1, `rgba(40,30,20,${al})`); }
  for (let i = 0; i < 260; i++) { const al = 0.25 + r() * 0.4; line(r() * N, r() * N, 3 + r() * 14, r() * 6.283, (r() - 0.5) * 2, 0.6 + r() * 0.8, `rgba(255,250,240,${al})`); }
  return c;
}

// ---------- чек года ----------
// Под обёрткой лежит кассовый чек на подкладке конверта. Лента длиннее листа: холсты выше листа на EXT, чек вытягивают вверх на всю длину.
// Третий холст: R лента чека, G её тень на подкладке, B узор подкладки (шейдер держит узор на месте, когда ленту тянут).
// На первом холсте G это термопечать, R красная шапка, B первый удар печати; на втором R второй удар, G ручка.
// Шапка начинается ниже верхнего рулона обёртки, итог с печатью стоит в первом окне. Послание и подарок выходят, когда ленту тянут.
// o.share: тот же чек картинкой на память, 1080x1920. Лента кончается после подписи: подарка и кода на картинке нет, её можно показывать другим.
const RF = '"DotGothic16"', EXT = 293, SHARE_H = 768;
export function drawReceipt(d = CARD, b = BRAND, o = {}) {
  const share = !!o.share, HS = share ? SHARE_H : H, EX = share ? 0 : EXT, HH = HS + EX, PW = Math.round(W * S), PH = Math.round(HH * S);
  const [c, g] = mk(PW, PH), [c2, g2] = mk(PW, PH), [c3, g3] = mk(PW, PH);
  for (const q of [g, g2, g3]) { q.fillStyle = '#000'; q.fillRect(0, 0, PW, PH); q.save(); q.scale(S, S); q.textBaseline = 'alphabetic'; }
  const x0 = 82, x1 = 350, cx = (x0 + x1) / 2, L = x0 + 13, N = 26, P = (x1 - x0 - 26) / N, SZ = 12;   // лента, поля, 26 знаков в строке
  const up = (s) => String(s || '').toUpperCase();
  const who = (d.who || []).slice(0, 2), lines = (d.lines || []).slice(0, 7);
  const hasB = !share && !!d.btnB, hasS = !share && !!d.btnS;
  // строки по вертикали: всё ниже позиций считается от их числа, поэтому короткий чек не оставляет дыр
  const yLogo = 244, yTitle = 263, yMeta = 276, yWho = 293, yEq = yWho + 14.5 * Math.max(0, who.length - 1) + 11.5, yIt = yEq + 15, yLast = yIt + 14.5 * Math.max(0, lines.length - 1);
  const sy = yLast + 73, sx = cx + 63, R = 54, hy = [sy + 103, sy + 134, sy + 166], yT = 196, yB = share ? sy + 208 : sy + (hasS ? 351 : 318);   // печать стоит справа от итога и не ложится на строки
  const dy = share ? Math.round((HS - yT - yB) / 2) : 0;       // на картинке лента стоит посередине

  // подкладка: мелкие снежинки вразбежку по всему листу
  for (let j = 0, y = 14; y < HH + 20; j++, y += 30) for (let x = (j % 2 ? 6 : 24); x < W + 20; x += 36) flake(g3, x, y, 5.4, 2, 0.26 * ((j * 3 + (x / 36 | 0)) % 4), b.flake);

  // лента лежит чуть криво, как положили рукой; края отрезаны зубчатым ножом принтера
  const rot = -1.0 * Math.PI / 180, py = (yT + yB) / 2; for (const q of [g, g2, g3]) { q.translate(cx, py + dy); q.rotate(rot); q.translate(-cx, -py); }
  const strip = (q) => { q.beginPath(); q.moveTo(x0, yT); for (let x = x0; x < x1; x += 5) { q.lineTo(x + 2.5, yT - 3); q.lineTo(Math.min(x1, x + 5), yT); }
    q.lineTo(x1, yB); for (let x = x1; x > x0; x -= 5) { q.lineTo(x - 2.5, yB + 3); q.lineTo(Math.max(x0, x - 5), yB); } q.closePath(); };
  g3.globalCompositeOperation = 'lighter';
  g3.fillStyle = '#00ff00'; g3.shadowColor = '#00ff00'; g3.shadowBlur = 13 * S; g3.shadowOffsetX = 3 * S; g3.shadowOffsetY = 7 * S; strip(g3); g3.fill(); g3.shadowColor = 'transparent';
  g3.fillStyle = '#ff0000'; strip(g3); g3.fill();          // узор подкладки под лентой остаётся: он покажется, когда ленту вытянут

  // печать по сетке: у кассового принтера все знаки одной ширины
  const cells = (q, text, x, y, size = SZ, pitch = P, bold = 0.34) => { q.font = size + 'px ' + RF; q.textAlign = 'center'; q.lineWidth = bold; q.lineJoin = 'round';
    [...text].forEach((ch, i) => { if (ch === ' ') return; q.fillText(ch, x + (i + 0.5) * pitch, y); if (bold) q.strokeText(ch, x + (i + 0.5) * pitch, y); }); q.textAlign = 'left'; };
  const mid = (q, text, y, size = SZ, pitch = P, bold = 0.34) => cells(q, text, cx - text.length * pitch / 2, y, size, pitch, bold);
  const wide = (q, text, y) => { const k = Math.min(1.45, N / text.length); q.save(); q.translate(cx, 0); q.scale(k, 1); cells(q, text, -text.length * P / 2, y, SZ, P, 0.3); q.restore(); };   // строка в полтора раза шире: заголовок
  const rule = (ch, y) => cells(g, ch.repeat(N), L, y, SZ, P, 0.25);
  const row = (name, val, y) => { name = name.slice(0, Math.max(1, N - val.length - 3)); const k = N - name.length - val.length - 2; cells(g, name + ' ' + '.'.repeat(Math.max(1, k)) + ' ' + val, L, y); };   // длинное название режется, число остаётся целым
  const wrap = (t, n) => { const out = ['']; for (const w of t.split(' ')) { const k = out.length - 1; if ((out[k] + ' ' + w).trim().length <= n) out[k] = (out[k] + ' ' + w).trim(); else out.push(w); } return out.slice(0, 2); };
  const small = (t, y) => mid(g, t.slice(0, 30), y, 10.4, 7.9, 0.22);

  // шапка: знак компании красным, как на заранее отпечатанной ленте
  ink(g, 0); const lf = fit(g, b.name, Math.min(68, 16 * b.name.length)); g.font = lf.font; g.fillText(b.name, cx - lf.w / 2 + lf.left, yLogo);
  ink(g, 1);
  wide(g, up(d.title), yTitle); small(up(d.meta), yMeta);
  who.forEach(([k, v], i) => cells(g, (up(k).padEnd(8) + up(v)).slice(0, N), L, yWho + i * 14.5));
  rule('=', yEq);
  lines.forEach(([k, v], i) => row(up(k), String(v), yIt + i * 14.5));
  rule('=', yLast + 11);
  // итог: слева подпись, крупное число и две строки пояснения; справа место под круглую печать
  cells(g, up(d.totalLabel).slice(0, 13), L, sy - 38);
  const amt = String(d.amount), ap = Math.min(23, 124 / Math.max(1, amt.length)); cells(g, amt, L, sy + 4, 38 * ap / 23, ap, 1.1 * ap / 23);
  (Array.isArray(d.words) ? d.words : wrap(String(d.words || ''), 14)).slice(0, 2).forEach((t, i) => cells(g, up(t).slice(0, 14), L, sy + 26 + i * 13.5)); rule('-', sy + 70);
  rule('-', sy + 180);
  const wB = x1 - x0 - 26, btn = [L, sy + 262, wB, 27], sav = [L, sy + 295, wB, 27];
  if (share) mid(g, up((d.big || []).join(' ') + '!').slice(0, N), sy + 197);       // картинка на память кончается поздравлением
  else {
    // подарок: строки, штрихкод из знаков кода, сам код и кнопка вывороткой
    mid(g, up(d.giftTitle).slice(0, N), sy + 196); mid(g, up(d.giftLine).slice(0, N), sy + 210);
    const code = String(d.copy || d.gift || ''), bh = 110; let bx = cx - bh;
    for (let i = 0, k = 7; ; i++) { k = (k * 31 + code.charCodeAt(i % Math.max(1, code.length)) + i) % 97; const w = 1 + (k % 3), gap = 1 + ((k >> 2) % 3); if (bx + w > cx + bh) break; g.fillRect(bx, sy + 219, w, 23); bx += w + gap; }
    mid(g, code, sy + 255, SZ, 10, 0.4);
    if (hasB) { g.fillRect(...btn); g.globalCompositeOperation = 'multiply'; g.fillStyle = g.strokeStyle = '#ff00ff'; mid(g, up(d.btnB).slice(0, N), sy + 280.5, SZ, P, 0.4); ink(g, 1); }
    // вторая кнопка рамкой: чек картинкой на память
    if (hasS) { g.lineWidth = 1.3; g.strokeRect(sav[0] + 0.65, sav[1] + 0.65, sav[2] - 1.3, sav[3] - 1.3); mid(g, up(d.btnS).slice(0, N), sy + 313.5, SZ, P, 0.4); }
    if (d.footR) small(up(d.footR), sy + (hasS ? 337 : 304));
  }

  // первый удар: круглая печать красным справа от итога. Второй: прямоугольный штамп «оплачено» второй краской, справа от кассира и гостя
  const seal = d.seal || ['СПАСИБО ЗА ГОД', b.name + ' · 2026'];
  g.save(); g.translate(sx, sy); g.rotate(-0.09); ink(g, 2);
  g.lineWidth = 3; g.beginPath(); g.arc(0, 0, R, 0, 7); g.stroke(); g.lineWidth = 1.1; g.beginPath(); g.arc(0, 0, R - 4.6, 0, 7); g.stroke(); g.beginPath(); g.arc(0, 0, R - 18, 0, 7); g.stroke();
  g.textBaseline = 'middle'; arcText(g, up(seal[0]), 0, 0, R - 11.2, -Math.PI / 2, 9.4, 1.9); arcText(g, up(seal[1]), 0, 0, R - 11.2, Math.PI / 2, 9.4, 1.9, false);
  for (const a of [0, Math.PI]) { g.save(); g.rotate(a); g.translate(R - 11.2, 0); g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 1.8 : 4, t = i * Math.PI / 5; g.lineTo(Math.cos(t) * r, Math.sin(t) * r); } g.closePath(); g.fill(); g.restore(); }
  g.restore();
  flake(g, sx, sy, 27, 2, 0.2, b.flake);                    // в середине печати та же снежинка со знаком компании, что на обёртке
  g2.save(); g2.translate(cx + 55, yWho + 6.5); g2.rotate(-0.13); ink(g2, 0); g2.lineWidth = 1.9; g2.strokeRect(-53, -14.5, 106, 29); g2.lineWidth = 0.7; g2.strokeRect(-49.5, -11, 99, 22);
  g2.textBaseline = 'middle'; g2.font = '600 10px ' + MONO; g2.textAlign = 'center'; g2.letterSpacing = '1.4px'; g2.fillText(up(d.paid), 0.7, 0.5, 92); g2.letterSpacing = '0px'; g2.textAlign = 'left'; g2.restore();

  // слова ручкой прямо по чеку
  g2.globalCompositeOperation = 'lighter'; g2.fillStyle = '#00ff00'; g2.textBaseline = 'alphabetic';
  const hand = (t, x, y, r, size, maxW) => { g2.font = '600 ' + size + 'px ' + HAND; let w = g2.measureText(t).width; if (w > maxW) { size *= maxW / w; g2.font = '600 ' + size + 'px ' + HAND; w = maxW; }
    g2.save(); g2.translate(x, y); g2.rotate(r); g2.fillText(t, 0, 0); g2.restore(); return x + w * Math.cos(r); };
  const e0 = hand(d.msg[0] || '', 96, hy[0], -0.03, 30, 246), e1 = hand(d.msg[1] || '', 99, hy[1], -0.022, 30, 242), s0 = 246, e2 = hand(d.sign || '', s0, hy[2], -0.06, 34, 92);
  for (const q of [g, g2, g3]) q.restore();
  const box = (a) => ({ x: a[0], y: a[1], w: a[2], h: a[3] });
  // строки по порядку для выезда ленты: шапка и линейки проходят быстро, позиции по одной, итог медленно
  const rows = [[yLogo, 'L'], [yTitle, 'h'], [yMeta, 'h'], ...who.map((_, i) => [yWho + i * 14.5, 'h']), [yEq, 'r'], ...lines.map((_, i) => [yIt + i * 14.5, 'i']), [yLast + 11, 'r'],
    [sy - 38, 't'], [sy + 4, 'A'], [sy + 26, 'w'], [sy + 39.5, 'w'], [sy + 70, 'r'], [hy[0], 'b'], [hy[1], 'b'], [hy[2], 'b'], [sy + 180, 'r'], [sy + 196, 'h'], [sy + 210, 'h'], [sy + 242, 'b'], [sy + 255, 'h'],
    [sy + 289, 'b'], [sy + 322, 'b'], [yB, 'b']];
  return { plates: c, plates2: c2, plates3: c3, ext: EX, amountBox: { x: L - 4, y: sy - R - 2, w: sx + R + 6 - L, h: 2 * R + 4 }, hand: [e0, e1, s0, e2], handY: hy.map((v) => v + dy), stampX: sx, stampY: sy + dy,
    handBox: { x: 96, y: hy[0] - 26, w: 240, h: hy[2] - hy[0] + 34 }, maxUp: Math.min(EX, yB - 556), feed: { top: yT, rows },
    buttons: { ...(hasB && { b: box(btn) }), ...(hasS && { s: box(sav) }), foot: { x: cx - 80, y: sy + (hasS ? 325 : 292), w: 160, h: 20 } } };
}
