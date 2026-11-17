// Разрыв листа лоскутами. Палец берёт бумагу в точке P0 и тянет: бумага перегибается по линии посередине между P0 и пальцем,
// схваченная точка всё время остаётся под пальцем. По бокам лоскута бегут две трещины и догоняют линию перегиба.
// Лоскут не растягивается: профиль изгиба задаётся углом касательной от длины, координаты получаются интегрированием.
// После отпускания лоскут сворачивается в завиток у края дыры и остаётся лежать.
//   rtS: поле расстояний текущего рывка (R расстояние до трещины, G настоящая дыра, а не запас за линией перегиба)
//   rtU: объединение всех законченных рывков, по нему лист знает, где он порван
//   у каждого лоскута своя текстура rtC: R свои трещины, G края старых дыр, по которым лоскут уже был оборван
import * as THREE from 'three';

export const RANGE = 16, EXT = 30, STEP = 3, HMAX = 64, NP = 256;
const V2 = THREE.Vector2;
const h1 = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
const n1 = (x, s) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return h1(i, s) * (1 - u) + h1(i + 1, s) * u; };

// ---------- шейдеры ----------
export const HEAD = /* glsl */`
#define RANGE 16.0
#define HMAX 64.0
uniform vec2 uSize; uniform float uDpr; uniform vec3 uL;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1., 0.)), f.x), mix(hash12(i + vec2(0., 1.)), hash12(i + vec2(1., 1.)), f.x), f.y); }
float edgeN(vec2 px) { vec2 q = mat2(.8, -.6, .6, .8) * px; return 6.4 * (vn(q / 31. + 3.1) - .5) + 5.2 * (vn(px / 12.) - .5) + 2.8 * (vn(q / 4.6 + 17.3) - .5) + 1.2 * (vn(px / 1.4 + 31.7) - .5); }
float rimW(vec2 px) { return 6.5 * smoothstep(.38, .82, vn(px / 24. + 53.1)) * (.55 + .45 * vn(px / 5. + 3.3)) + 1.3 * vn(px / 2.3 + 71.9) * vn(px / 11. + 5.); }
`;
export const FRAG = /* glsl */`
uniform sampler2D tFiber, tShadow, tWrap, tAux, tTicket, tTicket2, tTicket3, tU, tS;
uniform vec3 uInk1, uInk2, uMarker, uPaperW, uPaperB, uPaperL, uPaperT, uShadowTint, uThermal, uPaperR, uPen;
uniform float uShadowK, uLift, uHit1, uHit2, uHand, uWet, uPress, uInside;
uniform vec4 uHandL;   // концы строк послания: x1 первой, x1 второй, начало и конец подписи
uniform vec3 uHandY;   // базовые линии строк послания, от верха листа
uniform float uStampY; // середина штампа, от верха листа
uniform float uStampX; // и от левого края
uniform float uTicketOff; // на сколько листок вытянут вверх из обёртки
uniform float uExt;       // на сколько холсты чека длиннее листа вниз
uniform float uFeed;      // на сколько лента чека ещё не выехала снизу на своё место
float pressShade(vec2 px) { if (uPress <= 0.) return 1.; vec2 d = px - vec2(uStampX, uSize.y - uStampY);
  if (uInside > .5) { float wr = mix(30., 4., uPress); return 1. - .5 * uPress * uPress * (1. - smoothstep(58. - wr, 58. + wr * .4, length(d))); }   // у чека печать круглая
  d = vec2(.9968 * d.x + .0802 * d.y, -.0802 * d.x + .9968 * d.y);
  float w = mix(30., 4., uPress), m = (1. - smoothstep(136. - w, 136. + w * .4, abs(d.x))) * (1. - smoothstep(74. - w, 74. + w * .4, abs(d.y)));
  return 1. - .5 * uPress * uPress * m; }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
// тень от лоскутов: карта высот снята вдоль луча света, полутень шире там, где лоскут выше
float shadowAt(vec3 P, float bias) {
  vec2 q = (P.xy - uL.xy / uL.z * P.z) / uSize; float a0 = ign(gl_FragCoord.xy) * 6.2832, hb = 0., nb = 0.;
  for (int i = 0; i < 8; i++) { float r = sqrt((float(i) + .5) / 8.) * 10., a = a0 + float(i) * 2.39996;
    float h = textureLod(tShadow, q + vec2(cos(a), sin(a)) * r / uSize, 0.).r * HMAX; if (h > P.z + bias) { hb += h; nb += 1.; } }
  if (nb < .5) return 0.;
  hb /= nb; float pen = clamp((hb - P.z) * .45, 1.1, 12.), occ = 0.;
  for (int i = 0; i < 14; i++) { float r = sqrt((float(i) + .5) / 14.) * pen, a = a0 + float(i) * 2.39996;
    occ += step(P.z + bias, textureLod(tShadow, q + vec2(cos(a), sin(a)) * r / uSize, 0.).r * HMAX); }
  return occ / 14.;
}
float lambert(vec3 N) { float d = dot(N, uL); return mix(1., clamp((.34 + .66 * d) / (.34 + .66 * uL.z), .2, 1.15), .9); }
float lightGrad(vec2 p) { return 1. + .07 * dot(p / uSize - .5, normalize(uL.xy)); }
// как краска легла: мелкие непропечатки кучками и неровная плотность
const mat2 R1 = mat2(.8, -.6, .6, .8), R2 = mat2(-.28, .96, -.96, -.28);
float inkTake(vec2 px, float k) { vec2 a = R1 * px, b = R2 * px;
  float sp = smoothstep(.70, .86, vn(a * 2.3 + k)) * smoothstep(.44, .7, .5 * vn(a / 17. + k * 1.7) + .5 * vn(b / 29. + k * 3.1));
  return (.9 + .1 * vn(b / 41. + k)) * (1. - .55 * sp); }
float stampTake(vec2 px) { vec2 a = R1 * px, b = R2 * px; float sp = smoothstep(.66, .84, vn(a * 2.1 + 2.)) * smoothstep(.46, .72, .5 * vn(b / 15. + 8.) + .5 * vn(a / 23. + 3.));
  return (.9 + .1 * vn(a / 31. + 5.)) * (1. - .62 * sp) * (1. - .1 * smoothstep(.5, .8, vn(b / 6. + 40.))); }
vec3 coreCol(vec2 px) { float fib = texture2D(tFiber, px / 150. + .51).r - .5; return min(uPaperW * 1.16, vec3(1.)) * (1. + fib * .18); }
vec3 wrapFront(vec2 uv, vec2 px) {
  vec3 pl = texture2D(tWrap, uv).rgb, ax = texture2D(tAux, uv).rgb;
  float fib = texture2D(tFiber, px / 180.).r - .5, cl = vn(px / 52.) - .5;
  vec3 c = mix(uPaperW * (1. + fib * .24 + cl * .06), uPaperL * (1. + fib * .05 + cl * .02), ax.r);
  c *= 1. - .34 * ax.b * (1. - ax.r);
  c *= mix(vec3(1.), uInk1, pl.r * inkTake(px, 1.)); c *= mix(vec3(1.), uInk2, pl.g * inkTake(px, 7.)); c *= mix(vec3(1.), uMarker, pl.b * .94);
  return c * (.5 + ax.g);
}
vec3 wrapBack(vec2 uv, vec2 px) {
  float fib = texture2D(tFiber, px / 180. + .37).r - .5, cl = vn(px / 52. + 9.) - .5;
  vec3 c = uPaperB * (1. + fib * .22 + cl * .06), pl = texture2D(tWrap, uv, 1.3).rgb;
  c *= mix(vec3(1.), uInk1, pl.r * .06); c *= mix(vec3(1.), uInk2, pl.g * .12);
  return c;
}
float handK(vec2 px) { float sy = uSize.y - px.y, ln = sy < uHandY.x + 14. ? 0. : sy < uHandY.y + 14. ? 1. : 2.;
  float x0 = ln > 1.5 ? uHandL.z - 10. : 52., x1 = ln < .5 ? uHandL.x : ln < 1.5 ? uHandL.y : uHandL.w, e = mix(x0 - 6., x1 + 6., clamp(uHand - ln, 0., 1.));
  return 1. - smoothstep(e - 5., e, px.x); }
vec3 ticketFront(vec2 uv, vec2 px) {
  vec3 pl = texture2D(tTicket, uv).rgb, p2 = texture2D(tTicket2, uv).rgb;
  float fib = texture2D(tFiber, px / 230. + .11).r - .5, cl = vn(px / 60. + 4.) - .5;
  vec3 c = uPaperT * (1. + fib * .055 + cl * .025);
  float st = pl.b * uHit1 * mix(stampTake(px), 1., uWet);
  c *= mix(vec3(1.), uInk1, max(pl.r * inkTake(px, 3.), st)); c *= mix(vec3(1.), uInk2, max(pl.g * inkTake(px, 5.), p2.r * uHit2 * inkTake(px, 11.)));
  c *= mix(vec3(1.), uMarker, p2.g * handK(px) * .93);
  return c;
}
// Чек года: лента термобумаги на подкладке конверта. Термопечать идёт полосами (головка изношена) и с мелкими пропусками.
float thermalTake(vec2 px) { float band = 1. - .34 * smoothstep(.6, .9, vn(vec2(px.x / 2.4 + 11., 3.7))) - .16 * vn(vec2(px.x / 26., px.y / 190.));
  return clamp(band * (.88 + .12 * vn(px * 2.4)), 0., 1.); }
vec3 receiptFront(vec2 uv, vec2 px) {
  // холсты чека длиннее листа на uExt; подкладка конверта стоит на месте, пока ленту тянут вверх. rp: точка на самой ленте, пока она выезжает снизу
  float hh = uSize.y + uExt; vec2 sp = px + vec2(0., uTicketOff), rp = px + vec2(0., uFeed), ru = vec2(uv.x, (rp.y + uExt) / hh), lu = vec2(uv.x, (sp.y + uExt) / hh);
  vec3 pl = texture2D(tTicket, ru).rgb, p2 = texture2D(tTicket2, ru).rgb, p3 = texture2D(tTicket3, ru).rgb; p3.rg *= step(ru.y, 1.);   // выше холста ленты нет
  float fib = texture2D(tFiber, rp / 230. + .11).r - .5, cl = vn(rp / 64. + 4.) - .5, fl = texture2D(tFiber, sp / 230. + .11).r - .5, ll = vn(sp / 64. + 4.) - .5;
  vec3 liner = uInk2 * (1. + fl * .34 + ll * .1); liner = mix(liner, uPaperL * (.94 + fl * .1), texture2D(tTicket3, lu).b * .93 * inkTake(sp, 9.));   // подкладка: вторая краска, узор светлой
  liner *= 1. - .6 * p3.g;                                                                                      // тень ленты
  vec3 c = uPaperR * (1. + fib * .025 + cl * .03);
  c *= mix(vec3(1.), uThermal, pl.g * thermalTake(rp));
  float st = pl.b * uHit1 * mix(stampTake(rp), 1., uWet);
  c *= mix(vec3(1.), uInk1, max(pl.r * inkTake(rp, 3.), st)); c *= mix(vec3(1.), uInk2, p2.r * uHit2 * inkTake(rp, 11.));
  c *= mix(vec3(1.), uPen, p2.g * handK(rp) * .92);
  return mix(liner, c, p3.r);
}
float dReal(vec2 uv) { vec4 u = texture2D(tU, uv), s = texture2D(tS, uv);
  return max(u.g > .5 ? (u.r - .5) * 2. * RANGE : -RANGE, s.g > .5 ? (s.r - .5) * 2. * RANGE : -RANGE); }
`;
const PLANE_VS = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
export const BASE_FS = HEAD + FRAG + /* glsl */`
varying vec2 vUv;
void main() {
  vec2 px = vUv * uSize; float d = dReal(vUv), i = -(d + edgeN(px));
  vec2 gd = vec2(dFdx(d), dFdy(d)) * uDpr; float gn = length(gd); vec2 g = gn > 1e-4 ? gd / gn : vec2(1., 0.);
  float fx = max(0., vn(vec2(dot(px, vec2(-g.y, g.x)) * 2.7, dot(px, g) * .55) + 3.7) - .64) * 6. * smoothstep(.3, .6, vn(px / 7. + 91.)) * step(1e-4, gn);   // волокна торчат в дыру
  float alpha = smoothstep(-.45, .45, i + fx);
  if (alpha < .01) discard;
  float w = rimW(px); vec3 col = mix(wrapFront(vUv, px), coreCol(px), 1. - smoothstep(w - .5, w + .35, i));   // по краю сорван красочный слой, видно нутро бумаги
  float t = clamp((d + 10.) / 10., 0., 1.);                                                              // край приподнят
  vec3 N = normalize(vec3(-g * .11 * uLift * t * min(gn, 1.4), 1.));
  col *= lambert(N) * lightGrad(px) * pressShade(px); col *= mix(vec3(1.), uShadowTint, shadowAt(vec3(px, uLift * t * t), .8) * uShadowK);
  gl_FragColor = vec4(col, alpha);
}`;
export const TICKET_FS = HEAD + FRAG + /* glsl */`
varying vec2 vUv;
void main() {
  vec2 px = vUv * uSize, l2 = normalize(uL.xy); vec3 col = uInside > .5 ? receiptFront(vUv, px) : ticketFront(vUv, px);
  vec2 sp = px + vec2(0., uTicketOff), su = sp / uSize;                                          // где эта точка листка сейчас на экране
  float dA = dReal(su + l2 * 2.6 / uSize) + edgeN(sp + l2 * 2.6), dB = dReal(su + l2 * 6. / uSize);
  float s = max((1. - smoothstep(-1.4, 1.4, dA)) * .6, (1. - smoothstep(-2.2, 2.2, dB)) * .3);   // тень края обёртки на билете
  col *= lightGrad(sp) * pressShade(px); col *= mix(vec3(1.), uShadowTint, max(s, shadowAt(vec3(sp, -.5), .8) * uShadowK));
  gl_FragColor = vec4(col, 1.);
}`;
// Чек картинкой на память: та же бумага и печать, без обёртки и её теней.
export const SHARE_FS = HEAD + FRAG + /* glsl */`
varying vec2 vUv;
void main() { vec2 px = vUv * uSize; gl_FragColor = vec4(receiptFront(vUv, px) * lightGrad(px), 1.); }`;
const FOLD = /* glsl */`
uniform vec2 uF, uN, uC, uN2, uPiv; uniform vec4 uRig; uniform sampler2D tProf; uniform float uProfLen, uRollLen, uHop, uZ;
vec4 prof(float s, float len, int row) { float x = clamp(s / len, 0., 1.) * 255., i = floor(x);
  return mix(texelFetch(tProf, ivec2(int(i), row), 0), texelFetch(tProf, ivec2(int(min(i + 1., 255.)), row), 0), x - i); }
// оторванный лоскут движется целиком: поворот вокруг середины рулона (uPiv), сдвиг (uRig.xy), угол (uRig.z), подъём (uRig.w)
vec3 rigid(vec3 P, inout vec3 N) { float c = cos(uRig.z), sn = sin(uRig.z); vec2 d = P.xy - uPiv;
  P.xy = vec2(c * d.x - sn * d.y, sn * d.x + c * d.y) + uPiv + uRig.xy; N.xy = vec2(c * N.x - sn * N.y, sn * N.x + c * N.y); P.z += uRig.w; return P; }
vec3 fold(vec2 p, out vec3 N) {
  float s = dot(uF - p, uN); N = vec3(0., 0., 1.); vec3 P = vec3(p, 0.);
  if (s > 0.) {
    vec4 pr = prof(s, uProfLen, 0); P = vec3(p + uN * (s + pr.x), pr.y); N = vec3(uN * sin(pr.z), cos(pr.z));
    float sg = dot(P.xy - uC, uN2);                                // за линией сворачивания бумага намотана в завиток, печатью наружу
    if (sg > 0.) { vec4 sp = prof(sg, uRollLen, 1); P = vec3(P.xy + uN2 * (sp.x - sg), P.z + sp.y); N = vec3(uN2 * sin(sp.z), -cos(sp.z)); }
    P.z += uHop * smoothstep(0., 8., s);
  }
  P.z += uZ;
  return rigid(P, N);
}`;
const FLAP_VS = HEAD + FOLD + /* glsl */`
varying vec2 vUv; varying vec3 vP; varying vec3 vN;
void main() { vUv = position.xy / uSize; vec3 N; vec3 P = fold(position.xy, N); vP = P; vN = N; gl_Position = projectionMatrix * modelViewMatrix * vec4(P, 1.); }`;
const COVER = /* glsl */`
uniform sampler2D tC;
float member(vec2 uv, vec2 px, out float dInh) { vec4 c = texture2D(tC, uv); float n = edgeN(px);
  dInh = (c.g - .5) * 2. * RANGE - n; return min((c.r - .5) * 2. * RANGE + n, dInh); }`;
const FLAP_FS = HEAD + FRAG + COVER + /* glsl */`
varying vec2 vUv; varying vec3 vP; varying vec3 vN;
void main() {
  vec2 px = vUv * uSize; float dInh, m = member(vUv, px, dInh), alpha = smoothstep(-.45, .45, m);
  if (alpha < .01) discard;
  vec3 N = normalize(vN), col;
  if (gl_FrontFacing) { float w = rimW(px); col = mix(wrapFront(vUv, px), coreCol(px), 1. - smoothstep(w - .5, w + .35, dInh)); }
  else { N = -N; col = wrapBack(vUv, px); }
  col *= lambert(N) * lightGrad(vP.xy) * pressShade(vP.xy); col *= mix(vec3(1.), uShadowTint, shadowAt(vP, 4.5) * uShadowK);
  gl_FragColor = vec4(col, alpha);
}`;
const SHADOW_VS = HEAD + FOLD + /* glsl */`
varying vec2 vUv; varying float vH;
void main() { vUv = position.xy / uSize; vec3 N; vec3 P = fold(position.xy, N); vH = P.z;
  gl_Position = vec4((P.xy - uL.xy / uL.z * P.z) / uSize * 2. - 1., .9 - 1.8 * clamp(P.z / HMAX, 0., 1.), 1.); }`;
const SHADOW_FS = HEAD + COVER + /* glsl */`
varying vec2 vUv; varying float vH;
void main() { float dInh; if (member(vUv, vUv * uSize, dInh) < 0.) discard; gl_FragColor = vec4(vH / HMAX, 0., 0., 1.); }`;
const STRIP_VS = /* glsl */`attribute float aD, aG; varying float vD, vG; void main() { vD = aD; vG = aG; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const STRIP_FS = /* glsl */`varying float vD, vG; void main() { gl_FragColor = vec4(clamp(.5 + vD / 32., 0., 1.), vG, 0., 1.); }`;
const FS_VS = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;
const BAKE_FS = /* glsl */`uniform sampler2D tS, tU; varying vec2 vUv;
void main() { vec4 s = texture2D(tS, vUv), u = texture2D(tU, vUv); gl_FragColor = vec4(s.r, 1. - (u.g > .5 ? u.r : 0.), s.g, 1.); }`;
const MERGE_FS = /* glsl */`uniform sampler2D tS; varying vec2 vUv; void main() { vec4 s = texture2D(tS, vUv); gl_FragColor = vec4(s.g > .5 ? s.r : 0., s.g, 0., 1.); }`;

// Обрывок: островок бумаги, оторванный со всех сторон. Плоский кусок с той же печатью, форма задана маской по клеткам.
const SCRAP_PLACE = /* glsl */`
uniform vec4 uRig; uniform vec2 uPiv; uniform float uZ;
vec3 place(vec2 p) { float c = cos(uRig.z), sn = sin(uRig.z); vec2 d = p - uPiv; return vec3(vec2(c * d.x - sn * d.y, sn * d.x + c * d.y) + uPiv + uRig.xy, uZ + uRig.w); }`;
const SCRAP_MASK = /* glsl */`
uniform sampler2D tM; uniform vec4 uBox;
float scrapA(vec2 px) { float m = texture2D(tM, (px - uBox.xy) / uBox.zw).r; return smoothstep(-.45, .45, (m - .5) * 12. + edgeN(px) * .45); }`;
const SCRAP_VS = HEAD + SCRAP_PLACE + /* glsl */`
varying vec2 vUv; varying vec3 vP;
void main() { vUv = position.xy / uSize; vP = place(position.xy); gl_Position = projectionMatrix * modelViewMatrix * vec4(vP, 1.); }`;
const SCRAP_FS = HEAD + FRAG + SCRAP_MASK + /* glsl */`
varying vec2 vUv; varying vec3 vP;
void main() { vec2 px = vUv * uSize; float a = scrapA(px); if (a < .01) discard;
  vec3 col = wrapFront(vUv, px) * lightGrad(vP.xy); col *= mix(vec3(1.), uShadowTint, shadowAt(vP, 4.5) * uShadowK); gl_FragColor = vec4(col, a); }`;
const SCRAP_SH_VS = HEAD + SCRAP_PLACE + /* glsl */`
varying vec2 vUv; varying float vH;
void main() { vUv = position.xy / uSize; vec3 P = place(position.xy); vH = P.z;
  gl_Position = vec4((P.xy - uL.xy / uL.z * P.z) / uSize * 2. - 1., .9 - 1.8 * clamp(P.z / HMAX, 0., 1.), 1.); }`;
const SCRAP_SH_FS = HEAD + SCRAP_MASK + /* glsl */`
varying vec2 vUv; varying float vH;
void main() { if (scrapA(vUv * uSize) < .5) discard; gl_FragColor = vec4(vH / HMAX, 0., 0., 1.); }`;
const FILL_FS = /* glsl */`void main() { gl_FragColor = vec4(1., 1., 0., 1.); }`;      // убранный островок: внутри дыры, расстояние до края наибольшее

// ---------- профиль изгиба ----------
function thetaHold(s, p) {                    // петля у линии перегиба, дальше лоскут лежит оборотом вверх и прижат пальцем
  const a = Math.PI * p.R; if (s < a) return s / p.R;
  const u = (s - a) / p.Lb; if (u >= 1) return Math.PI;
  const b = Math.sin(Math.PI * u); return Math.PI + p.del * b * b;
}
function fillProfile(tbl, Lp, th) {
  let X = 0, Z = 0; const ds = Lp / (NP - 1); tbl[0] = 0; tbl[1] = 0; tbl[2] = th(0);
  for (let i = 1; i < NP; i++) { const s = i * ds, tm = th(s - ds / 2); X -= Math.cos(tm) * ds; Z += Math.sin(tm) * ds; tbl[i * 4] = X; tbl[i * 4 + 1] = Math.max(Z, 0); tbl[i * 4 + 2] = th(s); }
}
function fillSpiral(tbl, o, Lr, p) {          // завиток: наружный виток у линии сворачивания, свободный конец внутри
  const th = (s) => (p.rOut - Math.sqrt(Math.max(p.rOut * p.rOut - 2 * p.b * Math.min(s, p.len), p.r0 * p.r0 * 0.6))) / p.b;
  let X = 0, Z = 0; const ds = Lr / (NP - 1); tbl[o] = 0; tbl[o + 1] = 0; tbl[o + 2] = 0;
  for (let i = 1; i < NP; i++) { const s = i * ds, tm = th(s - ds / 2); X += Math.cos(tm) * ds; Z += Math.sin(tm) * ds; tbl[o + i * 4] = X; tbl[o + i * 4 + 1] = Math.max(Z, 0); tbl[o + i * 4 + 2] = th(s); }
}

function gridGeom(x0, y0, x1, y1, step) {
  const nx = Math.max(1, Math.ceil((x1 - x0) / step)), ny = Math.max(1, Math.ceil((y1 - y0) / step));
  const pos = new Float32Array((nx + 1) * (ny + 1) * 3), idx = new Uint32Array(nx * ny * 6);
  for (let j = 0, k = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { pos[k++] = x0 + (x1 - x0) * i / nx; pos[k++] = y0 + (y1 - y0) * j / ny; pos[k++] = 0; }
  for (let j = 0, k = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    if ((i + j) & 1) { idx[k++] = a; idx[k++] = b; idx[k++] = d; idx[k++] = a; idx[k++] = d; idx[k++] = c; } else { idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = b; idx[k++] = d; idx[k++] = c; } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1)); return g;
}

class Flap {
  constructor(tear, P0, n0, edge, back) {
    const T = this.T = tear, id = this.id = tear.flaps.length, seed = this.seed = tear.seed++ * 7.31;
    this.P0 = P0.clone(); this.n0 = n0.clone(); this.n = n0.clone(); this.F = P0.clone(); this.P = P0.clone();
    this.h0 = 124 + 14 * h1(1, seed); this.hw0 = this.h0 - 30 - 8 * h1(9, seed); this.lam = 34; this.fl = { 1: 0.7 + 0.6 * h1(4, seed), [-1]: 0.7 + 0.6 * h1(5, seed) };
    this.nick = P0.clone().addScaledVector(n0, -back); this.edge = edge;
    this.L = [this.nick.clone()]; this.R = [this.nick.clone()]; this.tau = 0;
    this.state = 'hold'; this.w = 0; this.a = 0; this.D = 0; this.hold = { R: 1, Lb: 20, del: 0 }; this.rest = null; this.Lp = 60; this.Lr = 60; this.hopT = -1; this.C = new V2(1e6, 1e6); this.n2 = n0.clone();
    this.loose = false; this.fall = null; this.kTo = null; this.pos = null; this.ang = 0; this.lift = 0;
    this.rtC = tear.rt(); this.prof = new Float32Array(NP * 8);
    this.tProf = new THREE.DataTexture(this.prof, NP, 2, THREE.RGBAFormat, THREE.FloatType); this.tProf.minFilter = this.tProf.magFilter = THREE.NearestFilter;
    this.u = { ...tear.U, tC: { value: this.rtC.texture }, tProf: { value: this.tProf }, uF: { value: new V2() }, uN: { value: new V2(1, 0) }, uC: { value: new V2(1e6, 1e6) }, uN2: { value: new V2(1, 0) }, uProfLen: { value: 60 }, uRollLen: { value: 60 }, uHop: { value: 0 }, uZ: { value: 0.05 + id * 0.3 }, uRig: { value: new THREE.Vector4() }, uPiv: { value: new V2() } };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: FLAP_VS, fragmentShader: FLAP_FS, side: THREE.DoubleSide, alphaToCoverage: true });
    this.smat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: SHADOW_VS, fragmentShader: SHADOW_FS, side: THREE.DoubleSide });
    this.box = null; this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat); this.smesh = new THREE.Mesh(this.mesh.geometry, this.smat);
    this.mesh.frustumCulled = this.smesh.frustumCulled = false; this.mesh.renderOrder = -1;
    tear.group.add(this.mesh); tear.shadowGroup.add(this.smesh);
  }
  angle(side) {                                // угол трещины от направления тяги наружу
    const t = this.tau; if (t < this.hw0) return this.edge ? Math.PI / 2 : 1.4 + 0.5 * (n1(t / 17, this.seed + 20 + side) - 0.5) + 0.36 * (n1(t / 5, this.seed + 30 + side) - 0.5);
    const e = Math.exp(-(t - this.hw0) / (this.lam * this.fl[side])), tl = this.L[this.L.length - 1], tr = this.R[this.R.length - 1];
    const conv = Math.hypot(tl.x - tr.x, tl.y - tr.y) < 30 ? -0.06 : 0.055;
    const jog = Math.max(0, n1(t / 7, this.seed + 40 + side) - 0.76) / 0.24 * (h1(Math.floor(t / 7), this.seed + 50 + side) < 0.5 ? 1 : -1);
    return 1.4 * e - conv * (1 - e) + (1 - e) * (0.42 * (n1(t / 33, this.seed + side) - 0.5) * 2 + 0.24 * (n1(t / 9, this.seed + 9 + side) - 0.5) * 2 + 0.85 * jog);
  }
  stepTip(tip, side, behind) {
    if (behind <= 0) return tip;
    const n = this.n, a = this.angle(side) * side, c = Math.cos(a), s = Math.sin(a), dx = n.x * c - n.y * s, dy = n.x * s + n.y * c, fwd = dx * n.x + dy * n.y;
    const st = fwd > 0.2 ? Math.min(STEP, behind / fwd + 0.3) : STEP;
    return new V2(tip.x + dx * st, tip.y + dy * st);
  }
  advance() {                                  // трещины догоняют линию перегиба
    const { L, R, F, n } = this;
    for (let k = 0, side = 0; k < 500 && L.length < this.T.MAXC; k++) {
      if (this.tau < this.hw0 && ++side > 8) break;                                           // поперечная трещина раскрывается за несколько кадров
      const tl = L[L.length - 1], tr = R[R.length - 1], bl = (F.x - tl.x) * n.x + (F.y - tl.y) * n.y, br = (F.x - tr.x) * n.x + (F.y - tr.y) * n.y;
      if (bl <= 0 && br <= 0) break;
      L.push(this.stepTip(tl, 1, bl)); R.push(this.stepTip(tr, -1, br)); this.tau += STEP;
    }
  }
  maxS() { const { F, n } = this; let m = 0; for (const q of this.L) m = Math.max(m, (F.x - q.x) * n.x + (F.y - q.y) * n.y); for (const q of this.R) m = Math.max(m, (F.x - q.x) * n.x + (F.y - q.y) * n.y); return m; }
  pull(P) {                                    // палец в точке P: где линия перегиба и какой у лоскута профиль
    const dx = P.x - this.P0.x, dy = P.y - this.P0.y, D = Math.hypot(dx, dy); if (D < 0.5 || dx * this.n0.x + dy * this.n0.y < 0.08 * D) return;   // назад за точку захвата лоскут не тянется
    this.P.copy(P); this.D = D; this.n.set(dx / D, dy / D);
    const h = this.hold; h.R = 11.5 * (1 - Math.exp(-D / 46)) + 0.6; h.Lb = Math.min(150, Math.max(14, this.a - Math.PI * h.R - 6)); h.del = Math.min(0.5, (2 * h.R - 1.2) * 2 / h.Lb);
    this.Lp = D / 2 + Math.PI * h.R / 2 + 110; fillProfile(this.prof, this.Lp, (s) => thetaHold(s, h));
    const ds = this.Lp / (NP - 1); let a = this.Lp;                                           // схваченная точка должна лечь под палец: s + X(s) = D
    for (let i = 1; i < NP; i++) { const g1 = i * ds + this.prof[i * 4] - D; if (g1 >= 0) { const g0 = (i - 1) * ds + this.prof[(i - 1) * 4] - D; a = (i - 1 + (g0 < 0 ? -g0 / (g1 - g0) : 0)) * ds; break; } }
    this.a = a; this.F.set(this.P0.x + this.n.x * a, this.P0.y + this.n.y * a);
    this.C.set(this.P0.x + this.n.x * 1e5, this.P0.y + this.n.y * 1e5); this.n2.copy(this.n); this.advance(); this.sync();
  }
  release() {
    if (this.state !== 'hold') return;
    const Lf = this.maxS() + 1, h = this.hold, sd = this.seed, k = this.T.rollK != null ? this.T.rollK : 0.55 + 0.4 * h1(8, sd);     // какая доля лоскута свернётся
    this.rest = { Lf, k, r0: 6.5 + 2.5 * h1(2, sd), b: 0.45 + 0.2 * h1(3, sd), psi: (h1(6, sd) < 0.5 ? 1 : -1) * (0.04 + 0.1 * h1(7, sd)), R0: h.R, Lb0: h.Lb };
    this.state = 'roll'; this.w = 0; this.dur = 0.32 + Lf * k / 560; this.Lp = Lf + 8; this.frame();
  }
  frame() {                                    // основание расслабляется, завиток катится от свободного конца к перегибу
    const r = this.rest, w = this.w, e = w * w * (3 - 2 * w), e2 = 1 - Math.pow(1 - w, 3);
    const R = r.R0 + (5.2 - r.R0) * e, Lb = r.Lb0 + (46 - r.Lb0) * e, hp = { R, Lb, del: Math.min(0.5, (2 * R - 2.2) * 2 / Lb) };
    fillProfile(this.prof, this.Lp, (s) => thetaHold(s, hp));
    const scEnd = Math.max(Math.PI * R + 5 + 50 * Math.abs(Math.tan(r.psi)), r.Lf * (1 - r.k)), len = Math.max(0, (r.Lf - scEnd) * e2), sc = r.Lf - len;
    this.Lr = len + 70; fillSpiral(this.prof, NP * 4, this.Lr, { r0: r.r0, b: r.b, rOut: Math.sqrt(r.r0 * r.r0 + 2 * r.b * len), len });
    const x = Math.min(NP - 1.001, sc / this.Lp * (NP - 1)), i = Math.floor(x), xb = this.prof[i * 4] + (this.prof[i * 4 + 4] - this.prof[i * 4]) * (x - i);
    this.C.set(this.F.x + this.n.x * (sc + xb), this.F.y + this.n.y * (sc + xb)); this.n2.copy(this.n).rotateAround(new V2(), r.psi);
    this.sync();
  }
  tick(dt) {
    let redo = false;
    if (this.kTo != null && this.rest) { const r = this.rest; r.k = Math.min(this.kTo, r.k + dt * 1.8); if (r.k >= this.kTo) this.kTo = null; redo = true; }   // оторванный докатывается в рулон
    if (this.state === 'roll') { this.w = Math.min(1, this.w + dt / this.dur); redo = true; }
    if (redo) this.frame();
    if (this.state === 'roll' && this.w >= 1) { this.state = 'rest'; this.T.settled(this); }
    if (this.fall) this.fallTick(dt);
    if (this.pos) { this.u.uPiv.value.copy(this.C); this.u.uRig.value.set(this.pos.x - this.C.x, this.pos.y - this.C.y, this.ang, this.lift + 2.5); }
    if (this.hopT >= 0) { this.hopT += dt; const k = this.hopT / this.hopDur; this.u.uHop.value = k < 1 ? this.hopH * 4 * k * (1 - k) : 0; if (k >= 1) this.hopT = -1; }
  }
  hop(h, dur, delay = 0) { this.hopH = h; this.hopDur = dur; this.hopT = -delay; }
  // Лоскут потерял опору: его оторвали целиком или под ним порвали бумагу. Он сворачивается до конца и скатывается к нижнему краю листа.
  // Там рулон остаётся лежать и не закрывает текст.
  loosen(delay = 0) { if (this.loose || !this.rest) return; this.loose = true; this.kTo = 1; this.fall = { t: -delay }; this.T.onLoose && this.T.onLoose(this); }
  fallTick(dt) {
    const fl = this.fall, T = this.T; fl.t += dt; if (fl.t < 0) return;
    if (!fl.from) {
      fl.from = this.C.clone(); const tl = this.L[this.L.length - 1], tr = this.R[this.R.length - 1], sd = this.seed;
      const half = Math.min(0.5 * Math.hypot(tl.x - tr.x, tl.y - tr.y) + 16, T.W / 2 - 8);
      let a = -(Math.atan2(this.n2.y, this.n2.x) + Math.PI / 2); a = ((a + Math.PI / 2) % Math.PI + Math.PI) % Math.PI - Math.PI / 2;   // кратчайший поворот, после которого рулон лежит горизонтально
      fl.a1 = a + (h1(11, sd) - 0.5) * 0.24;
      fl.to = new V2(Math.min(T.W - half - 6, Math.max(half + 6, fl.from.x + (h1(12, sd) - 0.5) * 70)), 14 + 16 * h1(13, sd) + 5 * (T.pile++ % 4));
      fl.dur = 0.42 + Math.abs(fl.from.y - fl.to.y) / 1100;
    }
    const k = Math.min(1, fl.t / fl.dur), kx = k * (2 - k);
    this.pos = new V2(fl.from.x + (fl.to.x - fl.from.x) * kx, fl.from.y + (fl.to.y - fl.from.y) * k * k);     // вбок плавно, вниз с разгоном
    this.ang = fl.a1 * kx; this.lift = 9 * Math.sin(Math.PI * k);
    if (k >= 1) { this.fall = null; this.hop(3.5, 0.16); T.onLand && T.onLand(this); }
  }
  poly() { return [...this.L, ...[...this.R].reverse()]; }
  sync() {
    this.tProf.needsUpdate = true; this.u.uProfLen.value = this.Lp; this.u.uRollLen.value = this.Lr; this.u.uF.value.copy(this.F); this.u.uN.value.copy(this.n); this.u.uC.value.copy(this.C); this.u.uN2.value.copy(this.n2);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const ex = this.n.x * EXT, ey = this.n.y * EXT;
    for (const q of [...this.L, ...this.R]) { x0 = Math.min(x0, q.x, q.x + ex); y0 = Math.min(y0, q.y, q.y + ey); x1 = Math.max(x1, q.x, q.x + ex); y1 = Math.max(y1, q.y, q.y + ey); }
    const b = this.box;
    if (!b || x0 - 22 < b[0] || y0 - 22 < b[1] || x1 + 22 > b[2] || y1 + 22 > b[3]) {
      this.box = [x0 - 100, y0 - 100, x1 + 100, y1 + 100]; this.mesh.geometry.dispose();
      this.mesh.geometry = this.smesh.geometry = gridGeom(...this.box, 3);
    }
  }
}

class Scrap {
  constructor(tear, comp) {
    const T = this.T = tear, cs = T.cs, cw = T.cw, sd = this.seed = 40 + T.scraps.length * 3.7; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (const i of comp) { const x = i % cw, y = (i / cw) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const bw = x1 - x0 + 3, bh = y1 - y0 + 3, m = new Uint8Array(bw * bh);                     // по клетке пустого поля вокруг, чтобы край сходил на нет
    for (const i of comp) m[(i % cw) - x0 + 1 + (((i / cw) | 0) - y0 + 1) * bw] = 255;
    const tM = new THREE.DataTexture(m, bw, bh, THREE.RedFormat); tM.minFilter = tM.magFilter = THREE.LinearFilter; tM.needsUpdate = true;
    const bx = (x0 - 1) * cs, by = (y0 - 1) * cs, w = bw * cs, h = bh * cs;
    this.c0 = new V2(bx + w / 2, by + h / 2); this.w = (x1 - x0 + 1) * cs; this.h = (y1 - y0 + 1) * cs; this.t = -0.04 - 0.1 * h1(1, sd); this.done = false; this.pos = this.c0.clone();
    this.u = { ...T.U, tM: { value: tM }, uBox: { value: new THREE.Vector4(bx, by, w, h) }, uRig: { value: new THREE.Vector4() }, uPiv: { value: this.c0.clone() }, uZ: { value: 9.5 + T.scraps.length * 0.1 } };
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([bx, by, 0, bx + w, by, 0, bx, by + h, 0, bx + w, by + h, 0]), 3)); g.setIndex([0, 1, 2, 1, 3, 2]);
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: SCRAP_VS, fragmentShader: SCRAP_FS, side: THREE.DoubleSide, alphaToCoverage: true }));
    this.smesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: SCRAP_SH_VS, fragmentShader: SCRAP_SH_FS, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = this.smesh.frustumCulled = false; this.mesh.renderOrder = -1; T.group.add(this.mesh); T.shadowGroup.add(this.smesh);
    const tall = this.h > this.w * 1.15, half = Math.min(Math.max(this.w, this.h) / 2 + 4, T.W / 2 - 6);       // длинной стороной ложится вдоль нижнего края
    this.a1 = (tall ? (h1(2, sd) < 0.5 ? 1 : -1) * Math.PI / 2 : 0) + (h1(3, sd) - 0.5) * 0.5;
    this.to = new V2(Math.min(T.W - half, Math.max(half, this.c0.x + (h1(4, sd) - 0.5) * 60)), 10 + 18 * h1(5, sd) + 5 * (T.pile++ % 4));
    this.dur = 0.4 + Math.abs(this.c0.y - this.to.y) / 1100;
  }
  tick(dt) {
    if (this.done) return; this.t += dt; if (this.t < 0) return;
    const k = Math.min(1, this.t / this.dur), kx = k * (2 - k);
    this.pos.set(this.c0.x + (this.to.x - this.c0.x) * kx, this.c0.y + (this.to.y - this.c0.y) * k * k);
    this.u.uRig.value.set(this.pos.x - this.c0.x, this.pos.y - this.c0.y, this.a1 * kx, 7 * Math.sin(Math.PI * k));
    if (k >= 1) { this.done = true; this.T.onLand && this.T.onLand(this); }
  }
}

export class Tear {
  constructor(renderer, U, W, H) {
    this.r = renderer; this.U = U; this.W = W; this.H = H; this.flaps = []; this.active = null; this.seed = 1; this.mode = null; this.MAXC = 900;
    this.vel = new V2(); this.tp = new V2(); this.cv = new V2(); this.rollK = null; this.pile = 0; this.chk = 0;
    // грубая карта листа по клеткам: 0 бумага, 1 сорвано лоскутом, 2 убранный островок. По ней ищутся куски, оторванные со всех сторон
    this.cs = 6; this.cw = Math.ceil(W / this.cs); this.ch = Math.ceil(H / this.cs); this.cell = new Uint8Array(this.cw * this.ch); this.scraps = [];
    this.fill = new THREE.ShaderMaterial({ vertexShader: "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }", fragmentShader: FILL_FS,
      blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    this.fillScene = new THREE.Scene(); this.fillMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.fill); this.fillMesh.frustumCulled = false; this.fillScene.add(this.fillMesh);
    this.cam = new THREE.OrthographicCamera(0, W, H, 0, -1, 1);
    this.rtS = this.rt(); this.rtU = this.rt(); U.tS = { value: this.rtS.texture }; U.tU = { value: this.rtU.texture };
    const n = (this.MAXC + 2) * 7, g = this.sg = new THREE.BufferGeometry();
    this.sp = new Float32Array(n * 3); this.sd = new Float32Array(n); this.sf = new Float32Array(n); this.si = new Uint32Array((this.MAXC + 2) * 36);
    g.setAttribute('position', new THREE.BufferAttribute(this.sp, 3)); g.setAttribute('aD', new THREE.BufferAttribute(this.sd, 1)); g.setAttribute('aG', new THREE.BufferAttribute(this.sf, 1)); g.setIndex(new THREE.BufferAttribute(this.si, 1));
    const max = { blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, depthTest: false, depthWrite: false };
    this.stripScene = new THREE.Scene(); const sm = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: STRIP_VS, fragmentShader: STRIP_FS, side: THREE.DoubleSide, ...max })); sm.frustumCulled = false; this.stripScene.add(sm);
    this.bake = new THREE.ShaderMaterial({ uniforms: { tS: { value: this.rtS.texture }, tU: { value: this.rtU.texture } }, vertexShader: FS_VS, fragmentShader: BAKE_FS, depthTest: false, depthWrite: false });
    this.merge = new THREE.ShaderMaterial({ uniforms: { tS: { value: this.rtS.texture } }, vertexShader: FS_VS, fragmentShader: MERGE_FS, ...max });
    this.fsScene = new THREE.Scene(); this.fsMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bake); this.fsMesh.frustumCulled = false; this.fsScene.add(this.fsMesh);
    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.group = new THREE.Group(); this.shadowGroup = new THREE.Group();
    this.clear(this.rtS); this.clear(this.rtU);
  }
  rt() { return new THREE.WebGLRenderTarget(this.W, this.H, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false }); }
  clear(rt) { const r = this.r; r.setRenderTarget(rt); r.setClearColor(0x000000, 1); r.clear(); r.setRenderTarget(null); }

  // --- палец ---
  tornAt(p) {
    if (p.x >= 0 && p.y >= 0 && p.x < this.W && p.y < this.H && this.cell[((p.x / this.cs) | 0) + ((p.y / this.cs) | 0) * this.cw] === 2) return true;
    for (const f of this.flaps) if (inPoly(p, f.polyC || f.poly())) return true; return false;
  }
  // --- островки ---
  // После каждого рывка лист проверяется по клеткам: бумага держится, если по бумаге можно дойти до края листа. Остальное оторвано со всех сторон и падает.
  markTorn(f) {
    const P = f.polyC, cs = this.cs, cw = this.cw; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of P) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    const p = new V2(), ax = Math.max(0, (x0 / cs) | 0), bx = Math.min(cw - 1, (x1 / cs) | 0), ay = Math.max(0, (y0 / cs) | 0), by = Math.min(this.ch - 1, (y1 / cs) | 0);
    for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) { const i = x + y * cw; if (this.cell[i] === 0 && inPoly(p.set((x + 0.5) * cs, (y + 0.5) * cs), P)) this.cell[i] = 1; }
  }
  dropIslands() {
    const { cw, ch, cell } = this, n = cw * ch, seen = new Uint8Array(n), q = [];
    const push = (i, list) => { if (!seen[i] && cell[i] === 0) { seen[i] = 1; list.push(i); } };
    const spread = (list) => { for (let k = 0; k < list.length; k++) { const i = list[k], x = i % cw, y = (i / cw) | 0; if (x > 0) push(i - 1, list); if (x < cw - 1) push(i + 1, list); if (y > 0) push(i - cw, list); if (y < ch - 1) push(i + cw, list); } };
    for (let x = 0; x < cw; x++) { push(x, q); push(x + (ch - 1) * cw, q); } for (let y = 0; y < ch; y++) { push(y * cw, q); push(cw - 1 + y * cw, q); }
    spread(q);
    for (let i = 0; i < n; i++) if (cell[i] === 0 && !seen[i]) { const comp = []; push(i, comp); spread(comp); this.dropIsland(comp); }
  }
  dropIsland(comp) {
    const cs = this.cs, cw = this.cw, e = 11, pos = new Float32Array(comp.length * 12), idx = new Uint32Array(comp.length * 6);      // с запасом: у старых краёв дыр шум рисует бумагу в полосе до 8 px
    comp.forEach((i, k) => { const x = (i % cw) * cs, y = ((i / cw) | 0) * cs; pos.set([x - e, y - e, 0, x + cs + e, y - e, 0, x - e, y + cs + e, 0, x + cs + e, y + cs + e, 0], k * 12); idx.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4 + 1, k * 4 + 3, k * 4 + 2], k * 6); this.cell[i] = 2; });
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.fillMesh.geometry.dispose(); this.fillMesh.geometry = g;
    const r = this.r, ac = r.autoClear; r.autoClear = false; r.setRenderTarget(this.rtU); r.render(this.fillScene, this.cam); r.setRenderTarget(null); r.autoClear = ac;
    if (comp.length >= 3 && this.scraps.length < 24) this.scraps.push(new Scrap(this, comp));        // совсем мелкая крошка просто пропадает
  }
  // --- опора лоскутов ---
  // Свернувшийся лоскут держится за бумагу сразу за линией перегиба и лежит на бумаге впереди неё. Если там дыра или край листа, опоры нет.
  offSheet(p) { return p.x < 3 || p.y < 3 || p.x > this.W - 3 || p.y > this.H - 3; }
  gone(p) { return p.x >= 0 && p.y >= 0 && p.x < this.W && p.y < this.H && this.cell[((p.x / this.cs) | 0) + ((p.y / this.cs) | 0) * this.cw] === 2; }   // здесь был островок, его уже нет
  tornBy(p, polys) { if (this.gone(p)) return true; for (const q of polys) if (inPoly(p, q)) return true; return false; }
  supportLost(f, polys, curl = true) {
    if (!f.rest || f.loose) return false;
    const tl = f.L[f.L.length - 1], tr = f.R[f.R.length - 1], p = new V2(); let lost = 0;
    for (const t of [0.2, 0.5, 0.8]) { p.set(tl.x + (tr.x - tl.x) * t + f.n.x * 7, tl.y + (tr.y - tl.y) * t + f.n.y * 7); if (this.offSheet(p) || this.tornBy(p, polys)) lost++; }
    if (lost >= 2) return true;
    if (!curl || f.state !== 'rest') return false;
    // сам рулон и полотно между перегибом и рулоном, по нескольким точкам вдоль лоскута. Лежать можно только на бумаге:
    // если хоть одна точка над дырой, лоскут закрывал бы письмо, поэтому он скатывается вниз
    const hw = Math.hypot(tl.x - tr.x, tl.y - tr.y), ax = -f.n2.y * hw, ay = f.n2.x * hw, mx = (f.F.x + f.C.x) / 2, my = (f.F.y + f.C.y) / 2;
    for (const t of [-0.44, -0.22, 0, 0.22, 0.44]) if (this.tornBy(p.set(f.C.x + ax * t, f.C.y + ay * t), polys)) return true;
    for (const t of [-0.3, 0, 0.3]) if (this.tornBy(p.set(mx + ax * t, my + ay * t), polys)) return true;
    return false;
  }
  others(f) { return this.flaps.filter((g) => g !== f && g.polyC).map((g) => g.polyC); }
  settled(f) { if (this.supportLost(f, this.others(f))) f.loosen(0.15); }      // лоскут докатился: проверяем, на бумаге ли он лежит

  down(p) { if (this.mode === 'coast') this.finish(); else if (this.mode) this.up(); this.pd = p.clone(); this.prev = p.clone(); this.mode = this.tornAt(p) ? 'slide' : 'press'; }
  move(p) {
    if (!this.mode) return;
    if (this.mode === 'press' && p.distanceTo(this.pd) > 5) this.begin(this.pd, p.clone().sub(this.pd).normalize(), false);
    else if (this.mode === 'slide' && !this.tornAt(p)) {                                      // палец съехал с билета на бумагу: зацепил край дыры
      let a = this.prev.clone(), b = p.clone(); for (let i = 0; i < 10; i++) { const m = a.clone().add(b).multiplyScalar(0.5); this.tornAt(m) ? a = m : b = m; }
      const n = p.clone().sub(this.prev); if (n.lengthSq() < 1e-6) return; n.normalize(); this.begin(b.addScaledVector(n, 3), n, true);
    }
    if (this.mode === 'tear') {                                // большой скачок пальца за одно событие дробится, чтобы трещины успели пробежать
      const a = this.prev.clone(), n = Math.min(40, Math.max(1, Math.ceil(a.distanceTo(p) / 8)));
      for (let i = 1; i <= n; i++) this.active.pull(a.clone().lerp(p, i / n));
      this.dirty = true;
    }
    this.prev.copy(p);
  }
  begin(P0, n0, edge) {
    if (this.flaps.length >= 28) { this.mode = null; return; }
    let back = 9; const q = new V2();
    if (edge || this.tornAt(q.copy(P0).addScaledVector(n0, -13))) { edge = true; let dep = 0; for (let k = 4; k <= 64; k += 4) { if (!this.tornAt(q.copy(P0).addScaledVector(n0, -k))) break; dep = k; } back = Math.max(12, Math.min(54, dep * 0.85)); }
    const f = new Flap(this, P0, n0, edge, back); this.flaps.push(f); this.active = f; this.mode = 'tear'; this.vel.set(0, 0); this.tp.copy(P0); this.onBegin && this.onBegin(f);
  }
  up() {
    if (this.mode === 'tear' && this.active) {
      const sp = this.vel.length();
      if (sp > 420) { this.mode = 'coast'; this.cv.copy(this.vel).multiplyScalar(Math.min(1, 2100 / sp)); return; }
      this.finish();
    }
    if (this.mode !== 'coast') this.mode = null;
  }
  finish() {
    const f = this.active; this.renderStrip(f);
    const r = this.r, ac = r.autoClear; r.autoClear = false; this.fsMesh.material = this.merge; r.setRenderTarget(this.rtU); r.render(this.fsScene, this.fsCam); r.setRenderTarget(null); r.autoClear = ac;
    this.clear(this.rtS); f.polyC = f.poly(); f.release(); this.active = null; this.mode = null; this.markTorn(f); this.dropIslands();
    if (this.supportLost(f, this.others(f), false)) f.loosen(0.1);                              // оторван целиком: за перегибом дыра или край листа
    for (const g of this.flaps) if (g !== f && this.supportLost(g, this.others(g))) g.loosen(); // под старым лоскутом порвали бумагу или упал его островок
    this.onRelease && this.onRelease(f);
  }
  tick(dt) {
    if (this.mode === 'tear' && dt > 0) { this.vel.lerp(this.prev.clone().sub(this.tp).divideScalar(dt), 0.55); this.tp.copy(this.prev); }
    if (this.mode === 'coast') {
      const p = this.prev.clone().addScaledVector(this.cv, dt), q = p.clone().clamp(new V2(3, 3), new V2(this.W - 3, this.H - 3)), out = q.distanceToSquared(p) > 0.01;
      this.cv.multiplyScalar(Math.exp(-dt / 0.085)); this.active.pull(q); this.prev.copy(q); this.dirty = true;
      if (out || this.cv.length() < 90) { this.finish(); this.dirty = false; }
    }
    if (this.active && (this.mode === 'tear' || this.mode === 'coast') && (this.chk = (this.chk + 1) % 3) === 0) {
      const poly = [this.active.poly()]; for (const g of this.flaps) if (g !== this.active && this.supportLost(g, poly)) g.loosen();
    }
    for (const f of this.flaps) f.tick(dt);
    for (const sc of this.scraps) sc.tick(dt);
    if (this.active && this.dirty) { this.renderStrip(this.active); this.dirty = false; }
  }
  // доля прямоугольника (в координатах листа), с которой бумага уже сорвана
  open(x, y, w, h, n = 12) { let k = 0; const p = new V2(); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { p.set(x + w * (i + 0.5) / n, y + h * (j + 0.5) / n); if (this.tornAt(p)) k++; } return k / (n * n); }

  // --- поле расстояний текущего рывка ---
  renderStrip(f) {
    const { L, R } = f, n = L.length, sp = this.sp, sd = this.sd, sf = this.sf, si = this.si; let v = 0, ii = 0;
    const tang = (A, i, out) => { let a = i, b = i; while (a > 0 && A[a].distanceToSquared(A[i]) < 0.01) a--; while (b < n - 1 && A[b].distanceToSquared(A[i]) < 0.01) b++;
      let x = A[b].x - A[a].x, y = A[b].y - A[a].y, l = Math.hypot(x, y); if (l < 1e-4) { x = f.n.x; y = f.n.y; l = 1; } out.set(x / l, y / l); };
    const tl = new V2(), tr = new V2(), put = (x, y, d, g) => { sp[v * 3] = x; sp[v * 3 + 1] = y; sp[v * 3 + 2] = 0; sd[v] = d; sf[v] = g; v++; };
    const row = (l, r, i, g) => {
      tang(L, i, tl); tang(R, i, tr); const w = Math.hypot(l.x - r.x, l.y - r.y), cx = (l.x + r.x) / 2, cy = (l.y + r.y) / 2;
      const back = f.tau > 0 && i * STEP < f.hw0 + 80 ? Math.max(0, (cx - f.nick.x) * f.n0.x + (cy - f.nick.y) * f.n0.y) : 1e9;
      const inn = Math.min(RANGE, w / 2), t = w > 1e-3 ? inn / w : 0.5, dv = Math.min(inn, back);
      put(l.x - tl.y * RANGE, l.y + tl.x * RANGE, -RANGE, g); put(l.x, l.y, 0, g);
      put(l.x + (r.x - l.x) * t, l.y + (r.y - l.y) * t, dv, g); put(cx, cy, dv, g); put(r.x + (l.x - r.x) * t, r.y + (l.y - r.y) * t, dv, g);
      put(r.x, r.y, 0, g); put(r.x + tr.y * RANGE, r.y - tr.x * RANGE, -RANGE, g);
    };
    for (let i = 0; i < n; i++) row(L[i], R[i], i, 1);
    const el = L[n - 1], er = R[n - 1], e = new V2(f.n.x * EXT, f.n.y * EXT);                         // запас за линией перегиба: там лоскут лежит на листе, шва не видно
    row(el, er, n - 1, 0); row(el.clone().add(e), er.clone().add(e), n - 1, 0);
    const quads = (r0, r1) => { for (let k = 0; k < 6; k++) { const a = r0 * 7 + k, b = a + 1, c = r1 * 7 + k, d = c + 1; si[ii++] = a; si[ii++] = b; si[ii++] = c; si[ii++] = b; si[ii++] = d; si[ii++] = c; } };
    for (let i = 0; i < n - 1; i++) quads(i, i + 1);
    quads(n, n + 1);
    const g = this.sg; g.attributes.position.needsUpdate = g.attributes.aD.needsUpdate = g.attributes.aG.needsUpdate = g.index.needsUpdate = true; g.setDrawRange(0, ii);
    const r = this.r; r.setRenderTarget(this.rtS); r.setClearColor(0x000000, 1); r.clear(); r.render(this.stripScene, this.cam);
    this.fsMesh.material = this.bake; r.setRenderTarget(f.rtC); r.render(this.fsScene, this.fsCam); r.setRenderTarget(null);
  }
}

function inPoly(p, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j];
  if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; }

export function makeMaterials(U) {
  return {
    base: new THREE.ShaderMaterial({ uniforms: U, vertexShader: PLANE_VS, fragmentShader: BASE_FS, alphaToCoverage: true }),
    ticket: new THREE.ShaderMaterial({ uniforms: U, vertexShader: PLANE_VS, fragmentShader: TICKET_FS }),
  };
}
export const makeShareMaterial = (SU) => new THREE.ShaderMaterial({ uniforms: SU, vertexShader: PLANE_VS, fragmentShader: SHARE_FS });
