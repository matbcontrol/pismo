// Звук только из настоящих записей: CC0 с freesound.org, авторы в sfx/CREDITS.txt. Синтеза и сгенерированных звуков нет. Класс взят из «Подарка».
// Записи нарезаны в банки (sfx/*.mp3, сборка dev/sfx_build.cjs): слоты одинаковой длины, звук в начале слота после 40 мс тишины.
// Правила сведения: у каждого звука есть видимая причина в кадре; мелкие события (обрывки) звучат редко и тихо, чтобы не сливаться в шум;
// звук идёт оттуда, где это происходит на экране (панорама).
const LEAD = 0.04;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class GiftAudio {
  constructor(base = 'sfx/') {
    this.base = base; this.ctx = null; this.muted = false; this.banks = {}; this.tv = null; this.printer = 'printer1';
    this.ready = this.load().catch(() => {});
  }

  // файлы качаются и декодируются сразу при загрузке страницы, без жеста пользователя
  async load() {
    const man = await (await fetch(this.base + 'banks.json')).json();
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC) return;
    const dec = new OAC(1, 1, 44100);
    await Promise.all(Object.entries(man).map(async ([name, m]) => {
      const ab = await (await fetch(this.base + m.file)).arrayBuffer();
      const buf = await new Promise((ok, no) => dec.decodeAudioData(ab, ok, no));
      this.banks[name] = { buf, slot: m.slot, count: m.count, durs: m.durs || [], pools: m.pools || null, last: -1, t: -1 };
    }));
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 1;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 2.5; comp.attack.value = 0.003; comp.release.value = 0.15;
      this.master.connect(comp); comp.connect(c.destination);
      this.bus = c.createGain(); this.bus.connect(this.master);
      // разрыв: громкость → фильтр → панорама. Фильтр и громкость ведёт скорость пальца
      this.tearGain = c.createGain(); this.tearGain.gain.value = 0;
      this.tearLP = c.createBiquadFilter(); this.tearLP.type = 'lowpass'; this.tearLP.frequency.value = 6000; this.tearLP.Q.value = 0.5;
      this.tearGain.connect(this.tearLP);
      if (c.createStereoPanner) { this.tearPan = c.createStereoPanner(); this.tearLP.connect(this.tearPan); this.tearPan.connect(this.bus); } else this.tearLP.connect(this.bus);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  pick(b, only) {
    const pool = only || [...Array(b.count).keys()];
    let k = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && k === b.last) k = pool[(pool.indexOf(k) + 1) % pool.length];
    return (b.last = k);
  }

  // Один звук из банка. pan: −1 слева, 1 справа; dur: обрезать с плавным хвостом; gap: не чаще одного раза в gap секунд
  play(name, { gain = 1, rate = 1, at = 0, only = null, pan = 0, dur = 0, gap = 0 } = {}) {
    const b = this.banks[name]; if (!b || !this.ctx || gain <= 0) return;
    const c = this.ctx, t0 = c.currentTime + at; if (gap && t0 - b.t < gap) return; b.t = t0;
    const k = this.pick(b, only), s = c.createBufferSource(), g = c.createGain();
    s.buffer = b.buf; s.playbackRate.value = rate; g.gain.value = gain; s.connect(g);
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(this.bus); } else g.connect(this.bus);
    if (dur) { g.gain.setValueAtTime(gain, t0 + dur * 0.5 / rate); g.gain.linearRampToValueAtTime(0, t0 + dur / rate); }
    s.start(t0, k * b.slot, dur ? dur + 0.02 : b.slot);
  }

  // Разрыв. Звучит одна настоящая длинная запись рвущейся бумаги, а не петля из кусков. Громкость, тембр и темп идут за пальцем:
  // ведёшь медленно, звук тише и глуше; дёрнул, громче и ярче. Палец замер, запись сама затихает. Запись кончилась, её подхватывает следующая
  tear(speed, pan = 0) {
    const c = this.ctx, b = this.banks.tear; if (!c || !b) return;
    const s = clamp(speed, 0, 1), t = c.currentTime, G = this.tearGain.gain;
    if (G.cancelAndHoldAtTime) G.cancelAndHoldAtTime(t); else G.cancelScheduledValues(t);
    if (s > 0.02) {
      if (!this.tv || t > this.tv.end - 0.16) this.tearVoice(t);
      G.setTargetAtTime(0.22 + 0.9 * s, t, 0.03); G.setTargetAtTime(0, t + 0.1, 0.07);   // без новых движений пальца звук уйдёт сам
      this.tearLP.frequency.setTargetAtTime(2400 + 13500 * s * s, t, 0.05);
      this.tv.src.playbackRate.setTargetAtTime(0.9 + 0.2 * s, t, 0.06);
      if (this.tearPan) this.tearPan.pan.setTargetAtTime(clamp(pan, -1, 1) * 0.6, t, 0.06);
    } else G.setTargetAtTime(0, t, 0.035);
  }
  tearVoice(t) {
    const c = this.ctx, b = this.banks.tear, k = this.pick(b), src = c.createBufferSource(), g = c.createGain(), dur = b.durs[k] || b.slot - LEAD;
    src.buffer = b.buf; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.015);
    src.connect(g); g.connect(this.tearGain); src.start(t, k * b.slot + LEAD, dur);
    if (this.tv) { const o = this.tv; o.g.gain.setTargetAtTime(0, t, 0.05); o.src.stop(t + 0.35); }   // прежняя запись уходит под новую
    this.tv = { src, g, end: t + dur };
  }

  rip(v = 1, pan = 0) { this.play('rip', { gain: 0.8 * v, rate: rnd(0.94, 1.06), pan, gap: 0.07 }); }
  crinkle(v = 0.5, pan = 0) { this.play('crinkle', { gain: 0.1 + 0.5 * v, rate: rnd(0.9, 1.1), pan }); }
  land(v = 0.4, pan = 0) { this.play('land', { gain: v, rate: rnd(0.9, 1.15), pan }); }
  tap(v = 0.5, pan = 0) { this.play('tap', { gain: v, rate: rnd(0.95, 1.05), pan }); }
  // обрывок бумаги: оторвался (хруст, только у заметных кусков и не чаще трёх раз в секунду) и упал на стол (одиночный щелчок)
  scrap(area, pan = 0) { if (area > 0.012) this.play('crinkle', { gain: Math.min(0.42, 0.12 + area * 1.2), rate: rnd(0.95, 1.2), pan: pan * 0.5, gap: 0.3 }); }
  tick(area, pan = 0) { this.play('tick', { gain: Math.min(0.5, 0.14 + area * 1.5), rate: rnd(0.9, 1.25), pan: pan * 0.5, gap: 0.1 }); }
  // бант: настоящая запись развязывания ленты и короткий взмах ткани следом
  ribbon() { this.play('untie', { gain: 0.9 }); this.play('ribbon', { gain: 0.35, at: 0.18, rate: rnd(0.95, 1.05) }); }
  ribbonPull(v = 0.5) { this.play('ribbon', { gain: 0.16 + 0.22 * v, rate: rnd(1.0, 1.15), gap: 0.22 }); }
  ribbonFlick(v = 0.5, pan = 0) { this.play('ribbon', { gain: 0.42 * v, rate: rnd(0.88, 1.08), pan: pan * 0.6 }); }                 // половина ленты взлетает
  ribbonLand(v = 0.4, pan = 0) { this.play('land', { gain: 0.3 * v, rate: rnd(1.3, 1.6), pan: pan * 0.6 }); }                        // и ложится на стол
  // папиросная бумага: seal — короткий надрыв (печать отходит), иначе шуршание листа
  tissue(v = 0.6, seal = false) { this.play('tissue', { gain: v, rate: rnd(0.92, 1.05), only: seal ? [4, 5] : [0, 1, 2, 3] }); }
  // Крышка снимается. Банк lidup: семь записей разного характера (dev/sfx_build.cjs). В демо звучит шестая, бумажные щелчки;
  // ?lid=N выбирает другую
  lidUp() { this.play('lidup', { gain: 0.95, only: this.lidOnly || [5], rate: rnd(0.97, 1.03) }); }
  lidDown(v = 0.7) { this.play('liddown', { gain: v, only: v > 0.6 ? [0, 1, 2] : [3, 4], pan: 0.15 }); }
  cardSlide() { this.play('cardslide', { gain: 0.5 }); }
  // Кассовый принтер печатает чек: один кусок записи на шаг ленты. kind: 's' короткая строка, 'l' позиция чека, 'x' ход ленты или крупный итог.
  // fill: сколько секунд должен длиться звук; если кусок короче, за ним идут следующие. Запись выбирается полем printer (банки printer1..3).
  print(kind, v = 0.5, fill = 0) {
    const b = this.banks[this.printer]; if (!b || !b.pools || !this.ctx) return 0;
    let at = 0, pool = b.pools[kind] || b.pools.s;
    for (let i = 0; i < 5; i++) { this.play(this.printer, { gain: v, only: pool, rate: rnd(0.97, 1.03), at }); at += Math.max(0.05, (b.durs[b.last] || 0.15) - 0.02); if (at >= fill - 0.05) break; pool = b.pools.l || pool; }
    return at;
  }
  cardFlip() { this.play('flip', { gain: 1.0, rate: rnd(0.95, 1.05) }); }
  stamp() { this.play('tap', { gain: 1 }); this.play('land', { gain: 0.55, rate: 0.85 }); this.play('liddown', { gain: 0.22, rate: 1.25, only: [3, 4] }); }   // удар штампа по карте

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.04); }
}
