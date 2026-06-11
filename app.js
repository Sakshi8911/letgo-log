/* ═══════════════════════════════════════════════════════════
   THREAD SAFETY
   Pure client-side. JS is single-threaded per browser tab;
   every user runs an isolated instance with no shared memory,
   so hundreds of simultaneous users never collide here. The
   only shared state is the global counter — plug a server API
   into the COUNTERS section; the server handles concurrency.
═══════════════════════════════════════════════════════════ */
gsap.registerPlugin(MotionPathPlugin);

/* ═══════════ FIREBASE REAL-TIME BROADCAST ═══════════ */
const _fbConfig = {
  apiKey: "AIzaSyCItp3NNvFo6B2YeEP8vzB87_S7EVd8EXQ",
  authDomain: "letgo-log.firebaseapp.com",
  databaseURL: "https://letgo-log-default-rtdb.firebaseio.com",
  projectId: "letgo-log",
  storageBucket: "letgo-log.firebasestorage.app",
  messagingSenderId: "347754645860",
  appId: "1:347754645860:web:9faa3575efd46a4cd6d271"
};
firebase.initializeApp(_fbConfig);
const _db = firebase.database();
const _bcastRef = _db.ref('broadcasts');
const _SESSION = Math.random().toString(36).slice(2);
const _PAGE_TS  = Date.now();

/* ── Global counter state (populated from Firebase) ── */
let _globalFireToday = 0, _globalFireYear = 0;
let _globalPlantToday = 0, _globalPlantYear = 0;

/* Listen for other users' submissions */
_bcastRef.on('child_added', snap => {
  const d = snap.val();
  if (!d || d.session === _SESSION || d.ts < _PAGE_TS) return;
  if (d.type === 'fire'  && currentView === 'night') { spawnFireWord(d.text); fireFlare(); }
  if (d.type === 'plant' && currentView === 'day')   { _spawnPlantMist(d.text); }
});

/* Cleanup entries older than 20 s every 15 s */
setInterval(() => {
  _bcastRef.orderByChild('ts').endAt(Date.now() - 20000).once('value', snap => {
    snap.forEach(c => c.ref.remove());
  });
}, 15000);

function _broadcast(type, text) {
  _bcastRef.push({ type, text, session: _SESSION, ts: Date.now() });
}

function _spawnPlantMist(text) {
  const mist = document.createElement('div');
  mist.className = 'mist-text';
  mist.textContent = text;
  mist.style.cssText = `left:${sceneCX()-80}px;top:${groundY()-120}px;max-width:200px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;`;
  document.body.appendChild(mist);
  setTimeout(() => mist.remove(), 2700);
}

/* ── Firebase global counters ── */
function _incFireCounter() {
  const today = new Date().toISOString().slice(0, 10);
  _db.ref('counters/fire').transaction(d => {
    if (!d) d = {};
    if (!d.daily || d.daily.date !== today) d.daily = { date: today, count: 0 };
    d.daily.count = (d.daily.count || 0) + 1;
    d.yearly = (d.yearly || 0) + 1;
    return d;
  });
}
function _incPlantCounter() {
  const today = new Date().toISOString().slice(0, 10);
  _db.ref('counters/plant').transaction(d => {
    if (!d) d = {};
    if (!d.daily || d.daily.date !== today) d.daily = { date: today, count: 0 };
    d.daily.count = (d.daily.count || 0) + 1;
    d.yearly = (d.yearly || 0) + 1;
    return d;
  });
}
function _initCounters() {
  const today = new Date().toISOString().slice(0, 10);

  _db.ref('counters/fire').on('value', snap => {
    const d = snap.val() || {};
    _globalFireToday = (d.daily && d.daily.date === today) ? (d.daily.count || 0) : 0;
    _globalFireYear  = d.yearly || 0;
    /* Sync fire intensity to global daily count */
    fireDayCount = _globalFireToday;
    fireIntensity = Math.min(0.1 + fireDayCount * 0.055, 2.0);
    if (typeof updateFireUI === 'function') updateFireUI();
  });

  _db.ref('counters/plant').on('value', snap => {
    const d = snap.val() || {};
    _globalPlantToday = (d.daily && d.daily.date === today) ? (d.daily.count || 0) : 0;
    _globalPlantYear  = d.yearly || 0;
    /* Sync tree growth to global daily count */
    const prevCompleted = Math.floor(plantDayCount / PLANTS_PER_TREE);
    plantDayCount = _globalPlantToday;
    const newCompleted = Math.floor(plantDayCount / PLANTS_PER_TREE);
    if (newCompleted > prevCompleted) {
      if (typeof gsap !== 'undefined' && tree) { gsap.killTweensOf(tree); tree.g = 0; tree.target = 0; }
    } else {
      if (typeof setPlantTarget === 'function') setPlantTarget();
      if (typeof animateTreeGrowth === 'function') animateTreeGrowth();
    }
    if (typeof updatePlantUI === 'function') updatePlantUI();
  });
}
/* Call after rest of script has defined todayKey etc. */
setTimeout(_initCounters, 0);

/* ═══════════ MODERATION ═══════════ */

/* ── Crisis: suicidal ideation, self-harm intent, hopelessness ── */
const CRISIS_WORDS = [
  /* direct suicidal statements */
  'suicide','suicidal','kill myself','killing myself','gonna kill myself',
  'going to kill myself','kms','end my life','ending my life','end it all',
  'end myself','take my life','taking my life','take my own life',
  /* wanting to die */
  'want to die','wanna die','i want to die','i wanna die',
  'wish i was dead','wish i were dead','wished i was dead',
  'better off dead','rather be dead','deserve to die','should be dead',
  'want to be dead','wanting to be dead',
  /* unaliving (modern euphemism) */
  'unalive myself','unaliving myself','gonna unalive',
  /* self-harm actions */
  'self harm','self-harm','selfharm',
  'cut myself','cutting myself','cut my wrists','slit my wrists',
  'hurt myself','hurting myself','harm myself','harming myself',
  'burn myself','burning myself','starve myself','starving myself',
  'hit myself','hitting myself',
  'overdose','take all my pills','took all my pills',
  'bleed out','bleed to death',
  'hang myself','hanging myself','hung myself',
  'jump off','jumping off','jumped off',
  'shoot myself','shooting myself',
  /* hopelessness / giving up */
  'not worth living','no reason to live','no point in living','no point living',
  'life is not worth living',"life isn't worth living",'living is not worth it',
  'tired of living','tired of life','exhausted from living',
  "can't go on",'cant go on','cannot go on',
  "don't want to go on",'dont want to go on',
  'giving up on life','give up on life','given up on life',
  'stop existing','cease to exist','i want to cease to exist',
  "don't want to exist",'dont want to exist',
  "don't want to be alive",'dont want to be alive',
  "don't want to be here","dont want to be here",
  'no will to live','lost the will to live',
  /* farewell signals */
  'suicide note','goodbye note','farewell note',
  'final goodbye','last goodbye','my last day','saying my goodbyes',
  'goodbye everyone','goodbye world',
  /* crisis state */
  'in crisis','having a crisis','mental breakdown',
  'about to do something','cant take it anymore',"can't take it anymore",
  'end the pain','make the pain stop','make it all stop',
];

/* ── Profanity: strong expletives, slurs, hate language ── */
const PROFANITY_WORDS = [
  /* strong expletives */
  'fuck','fucking','fucker','fucks','fucked','fuckin',
  'motherfucker','motherfucking','mf','stfu',
  'shit','shitting','shitty','bullshit','dipshit','horseshit',
  'cunt','cunts','cuntface',
  'bitch','bitches','bitching','son of a bitch',
  'dick','dicks','dickhead','dickface',
  'cock','cocksucker','cock sucker',
  'pussy','pussies',
  'ass','asshole','arsehole','asshat','asswipe','dumbass','jackass','smartass',
  'bastard','bastards',
  'prick','wanker','wanking','twat','tosser',
  'piss','pissed','pissing',
  'douchebag','douche',
  'fag',
  /* kill / violence */
  'kill','killing','murder','murderer','gonna murder','i will kill',
  'slaughter','massacre','torture',
  'unalive',
  /* racial slurs */
  'nigger','nigga','niggas','niggers',
  'kike','kikes','heeb','heebs',
  'spic','spics','beaner','beaners','wetback','wetbacks',
  'chink','chinks','gook','gooks','slope','slopes',
  'jap','japs','nip','nips',
  'raghead','towelhead','sandnigger',
  'coon','coons','porch monkey',
  'cracker','white trash',
  'redskin','squaw',
  'zipperhead',
  /* homophobic / transphobic slurs */
  'faggot','faggots','fags',
  'dyke','dykes',
  'homo','homos',
  'tranny','trannies','shemale',
  /* gendered slurs */
  'whore','whores','slut','sluts','skank','skanks','harlot',
  'prostitute',
  /* ableist slurs */
  'retard','retarded','retards',
  'spaz','spastic','spastics',
  /* sexual violence */
  'rape','rapist','rapists','raping','raped',
  'molest','molester','molestation','molested',
  'pedo','pedophile','pedophilia','paedophile','paedophilia',
  'groomer','grooming',
  /* hate speech */
  'nazi','nazis','heil',
  'genocide','ethnic cleansing',
  'terrorist','terrorism',
];

/* ── Negative affirmations: self-directed cruelty in the planting space ── */
const NEGATIVE_AFFIRMATION_WORDS = [
  /* worthlessness */
  'hate myself','i hate myself',
  'i am worthless','im worthless','i am worth nothing','i am nothing',
  'i am useless','im useless','i am a waste','i am a waste of space',
  'i am a failure','im a failure','i am failing at everything',
  'i am a disappointment','i am disappointing',
  /* self-criticism */
  'i am stupid','im stupid','i am so stupid','i am an idiot',
  'i am terrible','i am awful','i am horrible',
  'i am pathetic','im pathetic','i am so pathetic',
  'i am weak','im weak','i am so weak',
  'i am ugly','im ugly','i am so ugly','i hate my body',
  'i am a loser','im a loser',
  'i am a bad person','i am evil','i am toxic',
  /* isolation */
  'i am nobody','i am no one',
  'nobody loves me','no one loves me','nobody cares about me',
  'no one cares','everyone hates me','i am alone','i am so alone',
  'i am unlovable','i am unworthy of love','nobody wants me',
  /* hopeless self-talk */
  'i am broken','i am damaged','i am beyond repair',
  'i deserve to suffer','i deserve bad things','i deserve to be hurt',
  'i am hopeless','there is no hope for me','i am beyond hope',
  'i am a burden','i am a burden to everyone',
  'i am not enough','i am never enough','i am not good enough',
  'i cant do anything right','i cant do anything',
  'i always mess up','i always fail','i ruin everything',
  'i am too much','i am not worthy',
];
const checkModeration = t => {
  const l = t.toLowerCase();
  for (const w of CRISIS_WORDS)    if (l.includes(w)) return 'crisis';
  for (const w of PROFANITY_WORDS) if (l.includes(w)) return 'profanity';
  return null;
};
const checkAffirmation = t => {
  const m = checkModeration(t); if (m) return m;
  const l = t.toLowerCase();
  for (const w of NEGATIVE_AFFIRMATION_WORDS) if (l.includes(w)) return 'negative-affirmation';
  return null;
};
function showModAlert(type) {
  const el = document.getElementById('modAlert');
  el.className = 'mod-alert'; void el.offsetWidth; el.classList.add(type, 'show');
  const main = document.getElementById('modAlertMain'), sub = document.getElementById('modAlertSub');
  if (type === 'crisis') {
    main.textContent = 'You are not alone. You matter. 💜';
    sub.innerHTML = `Please reach out to someone who cares:<br>
<strong>988</strong> US &amp; Canada &nbsp;·&nbsp;
<strong>116 123</strong> UK &amp; Ireland &nbsp;·&nbsp;
<strong>13 11 14</strong> Australia &nbsp;·&nbsp;
<strong>1737</strong> New Zealand<br>
<strong>3114</strong> France &nbsp;·&nbsp;
<strong>0800 111 0 111</strong> Germany &nbsp;·&nbsp;
<strong>0800-0113</strong> Netherlands<br>
<strong>188</strong> Brazil &nbsp;·&nbsp;
<strong>135</strong> Argentina &nbsp;·&nbsp;
<strong>800 290 0024</strong> Mexico<br>
<strong>iCall 9152987821</strong> India &nbsp;·&nbsp;
<strong>1393</strong> South Korea &nbsp;·&nbsp;
<strong>0120-783-556</strong> Japan<br>
<strong>1800-221-4444</strong> Singapore &nbsp;·&nbsp;
<strong>0800 567 567</strong> South Africa<br>
<a href="https://findahelpline.com" target="_blank" style="color:inherit;opacity:.8;text-decoration:underline">findahelpline.com</a> — find your local line`;
  } else if (type === 'negative-affirmation') {
    main.textContent = 'Your inner critic is loud today 🌱';
    sub.textContent = 'This space is for kindness. What would you say to a dear friend right now?';
  } else {
    main.textContent = 'This is a calm, gentle space 🌿';
    sub.textContent = 'Please keep your words peaceful.';
  }
  setTimeout(() => el.className = 'mod-alert', type === 'crisis' ? 12000 : 5200);
}

/* ═══════════ STATE ═══════════ */
let currentView = localStorage.getItem('letgo_view') || 'night';
let audioEnabled = false;
/* Set audio button label based on screen size on load */
document.getElementById('audioBtn').textContent = window.innerWidth <= 560 ? '🔇' : '🔇 Unmute';
/* Show welcome popup only on first visit */
if (!localStorage.getItem('letgo_welcomed')) {
  document.getElementById('welcomeOverlay').classList.remove('hidden');
}
function dismissWelcome() {
  localStorage.setItem('letgo_welcomed', '1');
  const overlay = document.getElementById('welcomeOverlay');
  overlay.style.transition = 'opacity .4s ease';
  overlay.style.opacity = '0';
  setTimeout(() => overlay.classList.add('hidden'), 400);
}

/* ═══════════ COUNTERS (user-driven only) ═══════════
   PRODUCTION: replace baselines with a fetch, e.g.
     const d = await (await fetch('/api/counts')).json();
     fireToday=d.fireToday; ... ; updateFireUI(); updatePlantUI();
   On submit: fetch('/api/increment/fire',{method:'POST'}); */
/* BFY / BPY = yearly global baselines shown in the "This Year" counter.
   BFT / BPT are no longer used — "Today" always shows just today's local count
   so changing these baselines never causes a confusing jump. */
const BFY = 0, BPY = 0;
const fmt = n => n.toLocaleString();
/* These track today's local session totals (start at 0 each day) */
let fireTodayCount  = 0;   /* incremented in throwLog, synced to fireDayCount */
let plantTodayCount = 0;   /* incremented in waterPlant, synced to plantDayCount */
const updateFireUI  = () => {
  document.getElementById('fireTodayEl').textContent  = fmt(_globalFireToday);
  document.getElementById('fireYearEl').textContent   = fmt(_globalFireYear);
};
const updatePlantUI = () => {
  document.getElementById('plantTodayEl').textContent = fmt(_globalPlantToday);
  document.getElementById('plantYearEl').textContent  = fmt(_globalPlantYear);
};
/* NOTE: updateFireUI() / updatePlantUI() are called AFTER fireDayCount and
   plantDayCount are initialised below — calling them here would crash the
   script with a temporal-dead-zone ReferenceError. */

/* ═══════════ STARS (slow, sparse twinkle) ═══════════ */
(function () {
  const layer = document.getElementById('starsLayer');
  for (let i = 0; i < 170; i++) {
    const s = document.createElement('div'); s.className = 'star';
    const sz = Math.random()*2.4+.5, op = .15+Math.random()*.3;
    s.style.cssText = `width:${sz}px;height:${sz}px;top:${Math.random()*78}%;left:${Math.random()*100}%;opacity:${op};--base-op:${op};`;
    layer.appendChild(s);
  }
  const stars = Array.from(document.querySelectorAll('.star'));
  (function one() {
    const s = stars[Math.floor(Math.random()*stars.length)];
    s.classList.remove('sparkle'); void s.offsetWidth; s.classList.add('sparkle');
    s.addEventListener('animationend', () => s.classList.remove('sparkle'), {once:true});
    setTimeout(one, 3500+Math.random()*5000);
  })();
  setInterval(() => {
    const n = 2+Math.floor(Math.random()*3), p = new Set();
    while (p.size < n) p.add(Math.floor(Math.random()*stars.length));
    p.forEach(i => { stars[i].classList.remove('sparkle'); void stars[i].offsetWidth; stars[i].classList.add('sparkle');
      stars[i].addEventListener('animationend', () => stars[i].classList.remove('sparkle'), {once:true}); });
  }, 12000+Math.random()*12000);
})();

/* ═══════════════════════════════════════════════════════════
   FULL-PAGE CANVAS ENGINE
═══════════════════════════════════════════════════════════ */
const canvas = document.getElementById('sceneCanvas');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.visualViewport ? window.visualViewport.width  : window.innerWidth;
  H = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  canvas.width = Math.round(W*DPR); canvas.height = Math.round(H*DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

/* Scene anchors (live) */
const groundY = () => H - 175;       /* ground line */
const sceneCX = () => W / 2;         /* horizontal centre */

let wind = 0; /* global wind phase for sway */

/* Small math helpers */
const lerp = (a,b,t) => a + (b-a)*t;
const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = (e0,e1,x) => { const t = clamp01((x-e0)/(e1-e0)); return t*t*(3-2*t); };
function qbez(p0,p1,p2,t){ const m=1-t; return { x:m*m*p0.x+2*m*t*p1.x+t*t*p2.x, y:m*m*p0.y+2*m*t*p1.y+t*t*p2.y }; }
function rr(c,x,y,w,h,r){ if(c.roundRect){c.beginPath();c.roundRect(x,y,w,h,r);return;} c.beginPath();c.rect(x,y,w,h); }

/* ═══════════════════════════════════════════════════════════
   FIRE  (calm particle system)
═══════════════════════════════════════════════════════════ */
/* ── Daily fire state (localStorage) ── */
function todayKey() { return new Date().toISOString().slice(0,10); }
function loadFireDay() {
  const saved = JSON.parse(localStorage.getItem('letgo_fire') || '{}');
  if (saved.date !== todayKey()) return 0;
  return saved.count || 0;
}
function saveFireDay(count) {
  localStorage.setItem('letgo_fire', JSON.stringify({ date: todayKey(), count }));
}
let fireDayCount = loadFireDay();
fireTodayCount = fireDayCount;   /* seed today's fire counter from persisted count */
updateFireUI();                  /* safe to call now — fireDayCount is initialised */

/* Starts very small (0.1) and grows with each log thrown today */
let fireIntensity = 0.1 + Math.min(fireDayCount * 0.055, 1.9);
const particles = [];
const MAX_P = 200;

/* ── Crackle sparks (burst when a log lands) ── */
const crackleParticles = [];
class CrackleParticle {
  constructor() {
    const ang = Math.random() * Math.PI * 2;
    const spd = 1.8 + Math.random() * 3.8;
    this.x = sceneCX() + (Math.random() - 0.5) * 38;
    this.y = groundY() - 22;
    this.vx = Math.cos(ang) * spd;
    this.vy = Math.sin(ang) * spd - 2.5;
    this.life = 1;
    this.decay = 0.038 + Math.random() * 0.055;
    this.r = 1.2 + Math.random() * 2.2;
    this.white = Math.random() < 0.35;
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.vy += 0.18; this.vx *= 0.96;
    this.life -= this.decay;
  }
  draw() {
    if (this.life <= 0) return;
    const a = this.life;
    ctx.fillStyle = this.white
      ? `rgba(255,255,220,${a})`
      : `rgba(255,${(180 * this.life) | 0},10,${a})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(0.3, this.r * this.life), 0, 7);
    ctx.fill();
  }
  get dead() { return this.life <= 0; }
}

class FireParticle {
  constructor() {
    const spread = 42 * Math.min(fireIntensity, 1.4);
    this.x  = sceneCX() + (Math.random()-.5)*spread;
    this.y  = groundY() - 18 + (Math.random()-.5)*6;
    this.vx = (Math.random()-.5)*0.7;
    /* CALM: gentle upward velocity */
    this.vy = -(0.7 + Math.random()*1.1) * (0.55 + Math.min(fireIntensity,1.6)*0.3);
    this.decay = (0.004 + Math.random()*0.008) / Math.max(fireIntensity*0.5+0.5, 0.6);
    this.life = 1;
    this.size = (12 + Math.random()*16) * Math.min(fireIntensity*0.6+0.4, 1.4);
    this.ember = Math.random() < 0.08;
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.vy -= 0.013;                       /* soft buoyancy */
    this.vx += (Math.random()-.5)*0.08;
    this.vx *= 0.99;
    this.life -= this.decay;
  }
  draw() {
    if (this.life <= 0) return;
    const a = Math.pow(Math.max(this.life,0), .5);
    const sz = this.size * Math.sqrt(Math.max(this.life,0));
    if (this.ember) {
      ctx.fillStyle = `rgba(255,${(120*this.life)|0},0,${a*.9})`;
      ctx.beginPath(); ctx.arc(this.x, this.y, 2.2, 0, 7); ctx.fill(); return;
    }
    const t = 1-this.life; let r=255,g=0,b=0;
    if      (t<.22){ g=(255-t/.22*55)|0; b=(200-t/.22*200)|0; }
    else if (t<.5 ){ g=(200-(t-.22)/.28*200)|0; }
    else if (t<.78){ r=(255-(t-.5)/.28*55)|0; }
    else           { r=200; }
    const gr = ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,sz);
    gr.addColorStop(0,`rgba(${r},${g},${b},${a*.9})`);
    gr.addColorStop(.42,`rgba(${r},${g},${b},${a*.4})`);
    gr.addColorStop(1,`rgba(${r},${g},${b},0)`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(this.x,this.y,sz,0,7); ctx.fill();
  }
  get dead() { return this.life <= 0; }
}

function updateFlame() {
  /* fireDayCount is kept in sync with the global Firebase counter */
  fireIntensity = Math.min(0.1 + fireDayCount * 0.055, 2.0);
}
updateFlame();
function fireFlare() {
  const base = fireIntensity, o = { v: base + 0.65 };
  fireIntensity = o.v;
  gsap.to(o, { v: base, duration: 3.2, ease: 'power3.out', onUpdate: () => fireIntensity = o.v });
  /* burst of crackle sparks */
  for (let i = 0; i < 22; i++) crackleParticles.push(new CrackleParticle());
}

/* ── Realistic campfire logs (canvas) ── */
function drawLog(x, y, angle, len, rad, light, dark) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  /* shadow */
  ctx.fillStyle='rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0, rad*0.8, len/2, rad*0.6, 0, 0, 7); ctx.fill();
  /* body with length gradient (lit on top) */
  const bg = ctx.createLinearGradient(0,-rad,0,rad);
  bg.addColorStop(0, light); bg.addColorStop(.45, dark);
  bg.addColorStop(.5, dark); bg.addColorStop(1, '#2a1606');
  rr(ctx, -len/2, -rad, len, rad*2, rad*0.7); ctx.fillStyle=bg; ctx.fill();
  /* bark grain streaks */
  ctx.strokeStyle='#3a1d08'; ctx.lineWidth=1; ctx.globalAlpha=.35;
  for (let i=0;i<5;i++){ const gy=-rad+rad*2*(i+1)/6; ctx.beginPath();
    for (let gx=-len/2+rad; gx<=len/2-rad; gx+=8){ ctx.lineTo(gx, gy+Math.sin(gx*0.3+i)*0.8); } ctx.stroke(); }
  ctx.globalAlpha=1;
  /* end caps with rings (end grain) */
  [[-len/2,1],[len/2,-1]].forEach(([ex])=>{
    const cg = ctx.createRadialGradient(ex,0,0,ex,0,rad);
    cg.addColorStop(0,'#caa06a'); cg.addColorStop(.55,'#9c6b3a'); cg.addColorStop(1,dark);
    ctx.beginPath(); ctx.arc(ex,0,rad,0,7); ctx.fillStyle=cg; ctx.fill();
    ctx.strokeStyle='#6b4423'; ctx.globalAlpha=.5; ctx.lineWidth=.9;
    for (let ri=rad*0.25; ri<rad; ri+=rad*0.26){ ctx.beginPath(); ctx.arc(ex,0,ri,0,7); ctx.stroke(); }
    ctx.globalAlpha=1;
    /* radial crack */
    ctx.strokeStyle='#3a1d08'; ctx.globalAlpha=.4; ctx.lineWidth=1.1;
    ctx.beginPath(); ctx.moveTo(ex,0); ctx.lineTo(ex, -rad*0.8); ctx.stroke(); ctx.globalAlpha=1;
  });
  /* charred mossy top highlight */
  ctx.strokeStyle='rgba(255,180,90,.18)'; ctx.lineWidth=rad*0.5; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(-len/2+rad,-rad*0.45); ctx.lineTo(len/2-rad,-rad*0.45); ctx.stroke();
  ctx.restore();
}

function drawFireBase() {
  const cx = sceneCX(), gy = groundY();

  /* ── Night ground plane ── drawn first so everything sits on top of it */
  const gg = ctx.createLinearGradient(0, gy - 2, 0, H);
  gg.addColorStop(0,    '#22110500');          /* transparent at sky/ground seam */
  gg.addColorStop(0.01, '#221105');            /* dark warm earth at surface */
  gg.addColorStop(0.18, '#180c03');
  gg.addColorStop(1,    '#0c0602');            /* near-black at very bottom */
  ctx.fillStyle = gg; ctx.fillRect(0, gy, W, H - gy);

  /* Horizon edge — a subtle warm strip that defines where sky ends and ground begins */
  const he = ctx.createLinearGradient(cx - W * 0.55, 0, cx + W * 0.55, 0);
  he.addColorStop(0,   'rgba(0,0,0,0)');
  he.addColorStop(0.18,'rgba(70,30,8,0.30)');
  he.addColorStop(0.50,'rgba(90,40,10,0.42)');
  he.addColorStop(0.82,'rgba(70,30,8,0.30)');
  he.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = he; ctx.fillRect(0, gy - 3, W, 7);

  /* warm ground light */
  const glow = ctx.createRadialGradient(cx, gy+6, 0, cx, gy+6, 150);
  const gp = 0.32 + Math.sin(wind*4)*0.03 + (fireIntensity-0.8)*0.08;
  glow.addColorStop(0, `rgba(255,120,30,${Math.max(0,gp)})`);
  glow.addColorStop(.5, 'rgba(255,60,0,.10)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(cx, gy+6, 150, 32, 0, 0, 7); ctx.fill();
  /* dark earth mound */
  ctx.fillStyle = '#1a0e07'; ctx.beginPath(); ctx.ellipse(cx, gy+14, 110, 18, 0, 0, 7); ctx.fill();
  /* ring of stones around fire */
  const stoneR = 72;
  for (let i=0;i<9;i++){
    const ang = (i/9)*Math.PI*2;
    const sx = cx + Math.cos(ang)*stoneR, sy = gy+10 + Math.sin(ang)*stoneR*0.28;
    ctx.fillStyle='#2e2018'; ctx.beginPath(); ctx.ellipse(sx, sy, 11, 8, ang*0.3, 0, 7); ctx.fill();
    ctx.fillStyle='#3e2e22'; ctx.beginPath(); ctx.ellipse(sx, sy-2, 8, 5, ang*0.3, 0, 7); ctx.fill();
  }
  /* classic campfire: 2 logs crossing in a shallow X + 1 resting on top */
  /* bottom-left log */
  drawLog(cx - 8, gy - 2,  0.32, 160, 12, '#9a5a28', '#6b3712');
  /* bottom-right log */
  drawLog(cx + 8, gy - 2, -0.32, 158, 12, '#8a5026', '#5d2e0c');
  /* top log resting on the X (slightly elevated, more horizontal) */
  drawLog(cx,     gy - 14,  0.06, 140, 10, '#a86030', '#7a3c10');
  /* small kindling/embers at the very centre */
  ctx.strokeStyle='#3a1a06'; ctx.lineWidth=3.5; ctx.lineCap='round';
  [[-10, 0.5],[8,-0.3],[0,0.9]].forEach(([ox,a])=>{
    ctx.save(); ctx.translate(cx+ox, gy-8); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(-12,0); ctx.lineTo(12,0); ctx.stroke(); ctx.restore();
  });
}


/* ═══════════════════════════════════════════════════════════
   PLANT / FOREST  daily persistence
═══════════════════════════════════════════════════════════ */
function loadPlantDay() {
  const s = JSON.parse(localStorage.getItem('letgo_plant') || '{}');
  if (s.date !== todayKey()) return 0;
  return s.count || 0;
}
function savePlantDay(c) {
  localStorage.setItem('letgo_plant', JSON.stringify({ date: todayKey(), count: c }));
}
let plantDayCount = loadPlantDay();
/* align running counter with today's saved count */
plantTodayCount = plantDayCount;   /* seed today counter from persisted daily count */
updatePlantUI();                   /* safe to call now — plantDayCount is initialised */

/* ── Forest: trees complete every PLANTS_PER_TREE waterings ── */
const PLANTS_PER_TREE  = 12;
const TREES_PER_ROW    = 10;   /* trees needed to complete one silhouette layer */
const MAX_SIL_LAYERS   = 14;   /* max silhouette layers; beyond this, flowers appear */

/* Fill order for current row: outside-in, alternating left/right
   so the growing-tree zone (centre) stays clear the longest */
const ROW_ORDER = (() => {
  const o = [];
  for (let i = 0; i < TREES_PER_ROW / 2; i++) {
    o.push(i); o.push(TREES_PER_ROW - 1 - i);
  }
  return o;
})();

function getForestState() {
  const completed     = Math.floor(plantDayCount / PLANTS_PER_TREE);
  const local         = plantDayCount - completed * PLANTS_PER_TREE;
  const completedRows = Math.floor(completed / TREES_PER_ROW);
  const rowTrees      = completed % TREES_PER_ROW;
  return { completed, localGrowth: Math.min(local / 10, 1.18), completedRows, rowTrees };
}

/* ═══════════════════════════════════════════════════════════
   TREE & FOREST SYSTEM
   Background: community forest silhouette (always lush)
   Midground:  user's completed trees from today
   Foreground: user's currently growing tree
   Tree types cycle: oak → pine → cherry → oak …
═══════════════════════════════════════════════════════════ */
const TREE_TYPES = ['oak', 'pine', 'cherry'];
const getTreeType = n => TREE_TYPES[n % TREE_TYPES.length];

const tree = { g: 0, target: 0 };
let lastCompleted = Math.floor(loadPlantDay() / PLANTS_PER_TREE);

/* Static fruit anchors for oak (lx/ly in unit canopy space) */
const OAK_FRUIT = [
  { lx: 0.32, ly: 0.08, phase: 0.5 },
  { lx:-0.28, ly: 0.18, phase: 1.8 },
  { lx: 0.10, ly: 0.38, phase: 3.2 },
  { lx:-0.42, ly: 0.02, phase: 2.1 },
  { lx: 0.50, ly:-0.08, phase: 4.0 },
];

function setPlantTarget() {
  const { localGrowth } = getForestState();
  tree.target = localGrowth;
}
setPlantTarget();
function animateTreeGrowth() { gsap.to(tree, { g: tree.target, duration: 1.6, ease: 'back.out(1.4)' }); }
tree.g = tree.target;

/* ──────────────────────────────────────────────────────────
   SHARED: leaf-blade (used by sprout stage + oak edge leaves)
────────────────────────────────────────────────────────── */
function drawLeafBlade(x, y, ang, len, col) {
  ctx.save(); ctx.translate(x,y); ctx.rotate(ang);
  const g = ctx.createLinearGradient(0,0,len,0);
  g.addColorStop(0,col[0]); g.addColorStop(1,col[1]);
  ctx.fillStyle=g; ctx.beginPath(); ctx.moveTo(0,0);
  ctx.quadraticCurveTo(len*.5,-len*.3,len,0);
  ctx.quadraticCurveTo(len*.5, len*.3,0,0); ctx.fill();
  ctx.strokeStyle='rgba(20,60,20,.4)'; ctx.lineWidth=.7;
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(len*.88,0); ctx.stroke();
  ctx.restore();
}

/* ── Apple ── */
function drawApple(x, y, r) {
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(x, y+r*.9, r*.8, r*.4, 0, 0, 7); ctx.fill();
  const g = ctx.createRadialGradient(x-r*.3,y-r*.3,0,x,y,r);
  g.addColorStop(0,'#ff8a80'); g.addColorStop(.5,'#e53935'); g.addColorStop(1,'#a31515');
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
  ctx.strokeStyle='#5d3a1a'; ctx.lineWidth=1.4; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(x,y-r); ctx.quadraticCurveTo(x+2,y-r-6,x+5,y-r-8); ctx.stroke();
  ctx.fillStyle='#fff'; ctx.globalAlpha=.5;
  ctx.beginPath(); ctx.ellipse(x-r*.35,y-r*.35,r*.22,r*.3,-.5,0,7); ctx.fill();
  ctx.globalAlpha=1; ctx.restore();
}

let fallingApple = null;
let canopyShake  = 0;

/* ──────────────────────────────────────────────────────────
   SHARED TRUNK  (used by all tree types)
────────────────────────────────────────────────────────── */
function drawTrunk(cx, gy, topY, baseW, woody, swayTop, swayMid) {
  const topW  = baseW * 0.28;
  const stemH = gy - topY;
  const darkC = `rgb(${(55*woody+30)|0},${(30*woody+14)|0},${(10*woody+5)|0})`;
  const midC  = `rgb(${(92*woody+40)|0},${(58*woody+25)|0},${(28*woody+10)|0})`;

  /* root flares */
  if (woody > 0.25) {
    ctx.save(); ctx.globalAlpha = woody * 0.65;
    ctx.fillStyle = darkC;
    [[-1.5,-0.1],[-0.7,0.12],[0.7,0.12],[1.5,-0.1]].forEach(([dx,dy])=>{
      ctx.beginPath(); ctx.moveTo(cx, gy);
      ctx.quadraticCurveTo(cx+dx*baseW*.9, gy-stemH*.12+dy*8, cx+dx*baseW*1.8, gy+5);
      ctx.lineTo(cx+dx*baseW*.7, gy); ctx.fill();
    });
    ctx.restore();
  }

  /* main trunk shape */
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - baseW*.5, gy);
  ctx.bezierCurveTo(cx-baseW*.5+swayMid*.3, gy-stemH*.35,
                    cx-topW*.5+swayMid*.7,  topY+stemH*.25,
                    cx-topW*.5+swayTop, topY);
  ctx.lineTo(cx+topW*.5+swayTop, topY);
  ctx.bezierCurveTo(cx+topW*.5+swayMid*.7, topY+stemH*.25,
                    cx+baseW*.5+swayMid*.3, gy-stemH*.35,
                    cx+baseW*.5, gy);
  ctx.closePath();
  const tg = ctx.createLinearGradient(cx-baseW,0,cx+baseW,0);
  tg.addColorStop(0, darkC); tg.addColorStop(.35, midC);
  tg.addColorStop(.65, midC); tg.addColorStop(1, darkC);
  ctx.fillStyle = tg; ctx.fill();

  /* bark striations */
  if (woody > 0.2) {
    ctx.globalAlpha = woody*.30; ctx.strokeStyle=darkC; ctx.lineWidth=1;
    for (let yy=topY+6; yy<gy-4; yy+=10) {
      const pr=(yy-topY)/stemH, hw=lerp(topW,baseW,pr)*.4;
      ctx.beginPath();
      ctx.moveTo(cx-hw+Math.sin(yy*.18)*1.2, yy);
      ctx.quadraticCurveTo(cx+Math.sin(yy*.11)*hw*.18, yy-2, cx+hw+Math.sin(yy*.18)*1.2, yy);
      ctx.stroke();
    }
    ctx.globalAlpha=1;
  }
  ctx.restore();
}

/* ──────────────────────────────────────────────────────────
   OAK TREE  — three deliberate crown masses
────────────────────────────────────────────────────────── */
function drawOakTree(cx, g, gy, showApples, localN) {
  if (g <= 0.001) return;
  const stemH = lerp(18,185,clamp01(g));
  const topY  = gy - stemH;
  const baseW = lerp(5,32,clamp01(g));
  const woody = smooth(0.22,0.56,g);
  const sAmt  = lerp(.5,7,clamp01(g));
  const swT   = Math.sin(wind*.88)*sAmt, swM=Math.sin(wind*.88+.3)*sAmt*.5;

  /* trunk + branches */
  drawTrunk(cx, gy, topY, baseW, woody, swT, swM);
  const cR = lerp(0,115,smooth(0.18,1.05,g));
  if (woody > 0.28 && cR > 18) {
    const darkC=`rgb(${(60*woody)|0},${(35*woody)|0},${(15*woody)|0})`;
    ctx.save(); ctx.lineCap='round';
    [[-1,.60,.80,.26,.36],[1,.52,.76,.20,.34],
     [-1,.76,.62,.18,.25],[1,.72,.64,.16,.23]].forEach(([d,hF,sp,dr,minW])=>{
      if (woody<minW) return;
      const by=lerp(gy,topY,hF), bx=cx+swM*hF;
      const ex=bx+d*cR*sp, ey=by-cR*dr;
      ctx.strokeStyle=darkC; ctx.lineWidth=Math.max(1.2,baseW*(1-hF)*.5);
      ctx.beginPath(); ctx.moveTo(bx,by);
      ctx.quadraticCurveTo(bx+d*cR*sp*.45,by-cR*dr*.5,ex,ey); ctx.stroke();
    });
    ctx.restore();
  }

  if (cR < 6) {
    /* sprout leaf blades */
    if (g < 0.3) {
      const pairs=g>0.18?2:1;
      for (let i=0;i<pairs;i++){
        const t=.55-i*.28, ly=lerp(gy,topY,t), sw=Math.sin(wind+i)*3;
        drawLeafBlade(cx+1,ly,-.5+sw*.02,lerp(10,26,g),['#4caf50','#66bb6a']);
        drawLeafBlade(cx-1,ly,Math.PI+.5-sw*.02,lerp(10,26,g),['#2e7d32','#388e3c']);
      }
    }
    return;
  }

  /* ── 4 crown masses — wide oval overall shape ── */
  const ccx = cx + swT*1.2 + (showApples?canopyShake:0);
  const ccy = topY - cR*.12;
  /* [dx,   dy,   rx,   ry,   rot,  lightCol,   baseCol,    shadowCol] */
  const masses = [
    [  0,  -.08, 1.02,  .68,  .03, '#5cb85c','#2d8a2d','#1a5e1a'],  /* centre — wide, low */
    [ -.56, .10,  .80,  .56, -.04, '#4caa44','#267a26','#155515'],  /* left wing */
    [  .52, .12,  .76,  .54,  .04, '#52a84a','#28782a','#165616'],  /* right wing */
    [  0,   .26,  .68,  .46,  .02, '#3d9a38','#1e6a1e','#104010'],  /* bottom fill */
  ];
  masses.forEach(([dx,dy,rx,ry,rot,lCol,bCol,sCol])=>{
    const mx=ccx+dx*cR+swT*Math.abs(dx)*.4, my=ccy+dy*cR;
    /* shadow mass */
    ctx.fillStyle=sCol; ctx.globalAlpha=.55;
    ctx.beginPath(); ctx.ellipse(mx+cR*rx*.05,my+cR*ry*.06,cR*rx,cR*ry,rot,0,7); ctx.fill();
    ctx.globalAlpha=1;
    /* gradient body */
    const gr=ctx.createRadialGradient(mx-cR*rx*.32,my-cR*ry*.38,cR*rx*.04,mx,my,cR*rx*1.08);
    gr.addColorStop(0,lCol); gr.addColorStop(.45,bCol);
    gr.addColorStop(.82,'#1e5a22'); gr.addColorStop(1,'#112e14');
    ctx.fillStyle=gr;
    ctx.beginPath(); ctx.ellipse(mx,my,cR*rx,cR*ry,rot,0,7); ctx.fill();
  });

  /* top specular highlight */
  const hl=ctx.createRadialGradient(ccx-cR*.22,ccy-cR*.50,0,ccx-cR*.08,ccy-cR*.32,cR*.58);
  hl.addColorStop(0,'rgba(180,255,130,.28)'); hl.addColorStop(.65,'rgba(100,200,80,.06)'); hl.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=hl; ctx.beginPath(); ctx.ellipse(ccx-cR*.08,ccy-cR*.32,cR*.72,cR*.56,0,0,7); ctx.fill();

  /* edge leaf blades around silhouette */
  for (let i=0;i<18;i++){
    const ang=(i/18)*Math.PI*2;
    const er=cR*(.78+Math.sin(i*2.3+1.1)*.12);
    const ex=ccx+Math.cos(ang)*er, ey=ccy+Math.sin(ang)*er*.85;
    const len=cR*(.07+Math.sin(i*3.1)*.025);
    const wAng=ang+Math.sin(wind*1.2+i*.8)*.1;
    const cols=[['#1b5e20','#388e3c'],['#2e7d32','#4caf50'],['#33691e','#558b2f']][i%3];
    drawLeafBlade(ex,ey,wAng,len,cols);
  }

  /* AO shadow under canopy */
  ctx.save(); ctx.globalAlpha=.10; ctx.fillStyle='#1a3a10';
  ctx.beginPath(); ctx.ellipse(ccx,ccy+cR*.55,cR*.72,cR*.24,0,0,7); ctx.fill(); ctx.restore();

  /* apples */
  if (showApples) {
    const showFruit=[localN>=7,localN>=9,localN>=10,localN>=11,localN>=12];
    OAK_FRUIT.forEach((f,i)=>{
      if (!showFruit[i]) return;
      const sw=Math.sin(wind*1.1+f.phase)*cR*.05;
      drawApple(ccx+f.lx*cR+sw, ccy+f.ly*cR+cR*.12, Math.min(cR*.085,11));
    });
  }
}

/* ──────────────────────────────────────────────────────────
   PINE TREE  — stacked triangular tiers
────────────────────────────────────────────────────────── */
function drawPineTree(cx, g, gy) {
  if (g <= 0.001) return;
  const stemH=lerp(20,200,clamp01(g)), topY=gy-stemH;
  const baseW=lerp(4,14,clamp01(g));
  const woody=smooth(0.20,0.50,g);
  const sAmt=lerp(.3,4,clamp01(g));
  const swT=Math.sin(wind*.7)*sAmt, swM=Math.sin(wind*.7+.3)*sAmt*.4;
  drawTrunk(cx,gy,topY,baseW,woody,swT,swM);

  const maxW=lerp(0,96,smooth(0.15,1.05,g));
  if (maxW < 4) return;

  const TIERS=5;
  for (let ti=0;ti<TIERS;ti++){
    const t=ti/(TIERS-1);
    const tierY=lerp(gy-stemH*.14, topY+4, t);
    if (tierY > gy-8) continue;
    const tierW=maxW*(1-t*.72)*(1+Math.sin(wind*.8+ti*.6)*.018);
    const tierH=tierW*.38;

    /* shadow bottom */
    ctx.fillStyle='#0b3010';
    ctx.beginPath(); ctx.ellipse(cx+swT*.3,tierY+tierH*.5,tierW,tierH*.65,0,0,7); ctx.fill();
    /* main dark-to-mid gradient */
    const pg=ctx.createLinearGradient(cx-tierW,tierY,cx+tierW,tierY);
    pg.addColorStop(0,'#163d1c'); pg.addColorStop(.5,'#2a6e30'); pg.addColorStop(1,'#163d1c');
    ctx.fillStyle=pg;
    ctx.beginPath();
    ctx.moveTo(cx-tierW+swT*.4, tierY+tierH*.22);
    ctx.quadraticCurveTo(cx+swT*.2, tierY-tierH*.18, cx+tierW+swT*.4, tierY+tierH*.22);
    ctx.quadraticCurveTo(cx+swT*.2, tierY+tierH*.88, cx-tierW+swT*.4, tierY+tierH*.22);
    ctx.fill();
    /* highlight */
    ctx.fillStyle='rgba(80,180,80,.20)';
    ctx.beginPath(); ctx.ellipse(cx-tierW*.18+swT*.2, tierY-tierH*.06, tierW*.58, tierH*.28,0,0,7); ctx.fill();
  }
  /* tip */
  ctx.fillStyle='#163d1c';
  ctx.beginPath(); ctx.moveTo(cx-5+swT,topY+18); ctx.lineTo(cx+5+swT,topY+18); ctx.lineTo(cx+swT,topY); ctx.fill();
}

/* ──────────────────────────────────────────────────────────
   CHERRY TREE  — three blossom masses, high-contrast colors
   Colors chosen to stay visible against the warm day sky.
────────────────────────────────────────────────────────── */
function drawCherryTree(cx, g, gy, showApples, localN) {
  if (g <= 0.001) return;

  const stemH = lerp(18, 172, clamp01(g));
  const topY  = gy - stemH;
  const baseW = lerp(5, 26, clamp01(g));
  const woody = smooth(0.22, 0.56, g);
  const sAmt  = lerp(0.5, 6, clamp01(g));
  const swT   = Math.sin(wind * 0.88) * sAmt;
  const swM   = Math.sin(wind * 0.88 + 0.3) * sAmt * 0.5;
  drawTrunk(cx, gy, topY, baseW, woody, swT, swM);

  const cR = lerp(0, 118, smooth(0.13, 0.95, g));
  if (cR < 6) {
    /* sprout — small pink buds */
    const pairs = g > 0.14 ? 2 : 1;
    for (let i = 0; i < pairs; i++) {
      const t = 0.55 - i * 0.28, ly = lerp(gy, topY, t);
      const sw = Math.sin(wind + i) * 3;
      drawLeafBlade(cx + 1, ly, -0.5 + sw * 0.02, lerp(8, 22, g), ['#e91e63', '#f48fb1']);
      drawLeafBlade(cx - 1, ly, Math.PI + 0.5 - sw * 0.02, lerp(8, 22, g), ['#c2185b', '#e91e63']);
    }
    return;
  }

  ctx.save(); /* ← protect globalAlpha for everything below */

  const ccx = cx + swT * 1.2 + (showApples ? canopyShake : 0);
  const ccy = topY - cR * 0.10;

  /* Dark ambient shadow under whole canopy — anchors the tree visually */
  ctx.fillStyle = 'rgba(80,10,40,0.18)';
  ctx.beginPath();
  ctx.ellipse(ccx + cR * 0.04, ccy + cR * 0.12, cR * 1.0, cR * 0.82, 0, 0, 7);
  ctx.fill();

  /* Four blossom masses — wide oval silhouette, same structure as oak */
  const masses = [
    /* [dx,   dy,   rx,   ry,   lightCol,   baseCol,    deepCol   ] */
    [  0,   -0.07, 1.02, 0.68, '#ff4081',  '#e91e63',  '#880e4f' ],  /* centre — wide */
    [ -0.54,  0.10, 0.82, 0.56, '#f06292',  '#d81b60',  '#780046' ], /* left wing */
    [  0.50,  0.12, 0.78, 0.54, '#ff80ab',  '#c2185b',  '#6a0036' ], /* right wing */
    [  0,     0.26, 0.66, 0.46, '#e91e63',  '#ad1457',  '#5a0030' ], /* bottom fill */
  ];

  masses.forEach(([dx, dy, rx, ry, lCol, bCol, dCol]) => {
    const mx = ccx + dx * cR + swT * Math.abs(dx) * 0.4;
    const my = ccy + dy * cR;

    /* soft drop shadow */
    ctx.fillStyle = dCol; ctx.globalAlpha = 0.38;
    ctx.beginPath();
    ctx.ellipse(mx + cR * rx * 0.06, my + cR * ry * 0.08, cR * rx, cR * ry, 0, 0, 7);
    ctx.fill();

    /* main body gradient */
    ctx.globalAlpha = 1;
    const gr = ctx.createRadialGradient(
      mx - cR * rx * 0.30, my - cR * ry * 0.38, cR * rx * 0.04,
      mx, my, cR * rx * 1.06
    );
    gr.addColorStop(0,    lCol);
    gr.addColorStop(0.42, bCol);
    gr.addColorStop(0.80, dCol);
    gr.addColorStop(1,    '#3a000f');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.ellipse(mx, my, cR * rx, cR * ry, 0, 0, 7);
    ctx.fill();
  });

  /* Individual blossom clusters at silhouette edge — visible pink petals */
  ctx.globalAlpha = 1;
  for (let i = 0; i < 20; i++) {
    const ang = (i / 20) * Math.PI * 2;
    const er  = cR * (0.72 + Math.sin(i * 2.1 + 0.5) * 0.14);
    const ex  = ccx + Math.cos(ang) * er;
    const ey  = ccy + Math.sin(ang) * er * 0.85;
    const pr  = Math.max(1.2, cR * 0.07 + Math.sin(i * 1.7) * 0.6); /* always positive */

    /* cluster centre */
    ctx.fillStyle = '#ff80ab';
    ctx.beginPath(); ctx.arc(ex, ey, pr, 0, 7); ctx.fill();

    /* 5 petals per cluster */
    for (let p = 0; p < 5; p++) {
      const pa = (p / 5) * Math.PI * 2;
      ctx.fillStyle = '#ffc1d8';
      ctx.beginPath();
      ctx.arc(ex + Math.cos(pa) * pr * 0.58, ey + Math.sin(pa) * pr * 0.58, Math.max(0.5, pr * 0.44), 0, 7);
      ctx.fill();
    }
    /* petal centre dot */
    ctx.fillStyle = '#fff0f5';
    ctx.beginPath(); ctx.arc(ex, ey, Math.max(0.4, pr * 0.28), 0, 7); ctx.fill();
  }

  /* Top luminance highlight */
  const hl = ctx.createRadialGradient(ccx - cR * 0.22, ccy - cR * 0.50, 0, ccx, ccy, cR * 0.85);
  hl.addColorStop(0, 'rgba(255,200,220,0.38)');
  hl.addColorStop(0.6, 'rgba(255,150,190,0.08)');
  hl.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hl;
  ctx.beginPath(); ctx.ellipse(ccx, ccy, cR * 0.90, cR * 0.82, 0, 0, 7); ctx.fill();

  ctx.restore(); /* ← restore globalAlpha */
}

/* ──────────────────────────────────────────────────────────
   DRAW PERSONAL TREE  — picks type based on tree index
────────────────────────────────────────────────────────── */
function drawPersonalTree(cx, g, localN, showApples, treeIndex) {
  const type = getTreeType(treeIndex);
  const gy   = groundY();
  if      (type==='pine')   drawPineTree(cx, g, gy);
  else if (type==='cherry') drawCherryTree(cx, g, gy, showApples, localN);
  else                      drawOakTree(cx, g, gy, showApples, localN);
}

/* ──────────────────────────────────────────────────────────
   SILHOUETTE LAYER SYSTEM
   Each completed row of TREES_PER_ROW trees becomes one
   silhouette layer. Layers stack from ground up, darkest/
   farthest at bottom. Up to MAX_SIL_LAYERS layers; beyond
   that, each new row adds flowers instead.
────────────────────────────────────────────────────────── */
/* Curated green palette — darkest/farthest to brightest/nearest */
const SIL_COLORS = [
  'rgb(6,16,8)',     /* 0  very dark forest */
  'rgb(9,24,12)',    /* 1 */
  'rgb(12,34,16)',   /* 2 */
  'rgb(16,46,20)',   /* 3 */
  'rgb(22,60,28)',   /* 4 */
  'rgb(30,76,36)',   /* 5 */
  'rgb(40,96,48)',   /* 6 */
  'rgb(52,116,62)',  /* 7 */
  'rgb(64,136,76)',  /* 8 */
  'rgb(76,154,90)',  /* 9 */
  'rgb(90,172,106)', /* 10 */
  'rgb(106,188,122)',/* 11 bright spring */
  'rgb(122,202,138)',/* 12 */
  'rgb(138,216,156)',/* 13 lightest/nearest */
];

function drawSilhouetteLayer(layerIndex, totalLayers) {
  const gy    = groundY();
  const depth = totalLayers - 1 - layerIndex; /* 0=nearest, large=farthest */

  /* Layers are stacked tightly — 13 px vertical step so many layers fit */
  const yTop   = gy - (60 + layerIndex * 13);
  const amp    = 12 + layerIndex * 1.5;
  const seed   = layerIndex * 2.3 + 0.8;
  const wScale = Math.max(0, 0.05 - layerIndex * 0.004);

  const color = SIL_COLORS[Math.min(layerIndex, SIL_COLORS.length - 1)];
  const alpha = Math.min(0.97, 0.78 + layerIndex * 0.016);

  /* Points span slightly beyond both canvas edges so the bezier curve fills
     the full width without the last segment dropping straight down. */
  const N = 36;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * (W + 40) - 20;   /* -20 … W+20 */
    const y = yTop
      + Math.sin(i * 1.88 + seed) * amp
      + Math.sin(i * 0.65 + seed * 1.6) * amp * 0.5
      + Math.sin(i * 3.14 + seed * 0.85 + wind * wScale) * amp * 0.22
      + Math.sin(i * 5.3  + seed * 1.1) * amp * 0.10;
    pts.push({ x, y });
  }

  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(-24, gy + 4);
  ctx.lineTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i+1].x) / 2;
    const my = (pts[i].y + pts[i+1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.lineTo(W + 24, gy + 4);
  ctx.closePath(); ctx.fill(); ctx.restore();
}

function drawFlowerOnSilhouette(seed, layerIndex) {
  const gy = groundY();
  /* Deterministic position from seed */
  const x   = (Math.sin(seed * 7.3) * 0.5 + 0.5) * W;
  const y   = gy - 72 - layerIndex * 20 + (Math.cos(seed * 3.1) * 12);
  const r   = 5 + (Math.sin(seed * 11.7) * 2);
  const hue = (seed * 137) % 360;

  ctx.save(); ctx.globalAlpha = 0.85;
  /* 5-petal flower */
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2 + seed;
    ctx.fillStyle = `hsl(${hue},80%,72%)`;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85, r * 0.55, 0, 7);
    ctx.fill();
  }
  ctx.fillStyle = `hsl(${(hue + 30) % 360},90%,90%)`;
  ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, 7); ctx.fill();
  ctx.restore();
}

/* ──────────────────────────────────────────────────────────
   MAIN drawTree — row-by-row growth → silhouette conversion
────────────────────────────────────────────────────────── */
function drawTree() {
  if (currentView !== 'day') return;   /* defensive */
  const { completed, completedRows, rowTrees } = getForestState();
  const gy  = groundY();
  const cx0 = sceneCX();

  /* 1. Draw silhouette layers for completed rows (back to front = oldest first) */
  const numSilLayers = Math.min(completedRows, MAX_SIL_LAYERS);
  for (let r = 0; r < numSilLayers; r++) {
    drawSilhouetteLayer(r, numSilLayers);
  }

  /* Flowers for rows beyond MAX_SIL_LAYERS */
  if (completedRows > MAX_SIL_LAYERS) {
    const extraRows = completedRows - MAX_SIL_LAYERS;
    for (let r = 0; r < extraRows; r++) {
      /* 3 flowers per extra row, seeded deterministically */
      for (let f = 0; f < 3; f++) {
        drawFlowerOnSilhouette(r * 17 + f * 5.3 + 1.2, MAX_SIL_LAYERS - 1);
      }
    }
  }

  /* 2. Current-row completed trees — fill positions outside-in (ROW_ORDER)
        Scale is small so many fit; they stand to the sides of the growing tree */
  const ROW_SCALE = 0.34;
  for (let i = 0; i < Math.min(rowTrees, TREES_PER_ROW); i++) {
    const slot = ROW_ORDER[i];
    const tx   = W * (slot + 0.5) / TREES_PER_ROW;
    if (Math.abs(tx - cx0) < 30) continue; /* skip if too close to centre */
    ctx.save();
    ctx.globalAlpha = 0.80;
    ctx.translate(tx, gy);
    ctx.scale(ROW_SCALE, ROW_SCALE);
    ctx.translate(-tx, -gy);
    drawPersonalTree(tx, 1.0, PLANTS_PER_TREE, false, completed - rowTrees + i);
    ctx.restore();
  }

  /* 3. Growing tree — always at centre, full visual scale */
  const localN = plantDayCount - completed * PLANTS_PER_TREE;
  drawPersonalTree(cx0, tree.g, localN, true, completed);
}

/* falling apple physics (canvas) */
function triggerAppleFall() {
  if (currentView !== 'day' || fallingApple) return;
  const { completed } = getForestState();
  const localN = plantDayCount - completed * PLANTS_PER_TREE;
  if (localN < 7) return;
  const g = tree.g, cx = sceneCX(), gy = groundY();
  const canopyR = lerp(0,122, smooth(0.18,1.1,g)); if (canopyR < 10) return;
  const topY = gy - lerp(14,168,clamp01(g));
  const ccx = cx, ccy = topY - canopyR*0.34;
  const avail = OAK_FRUIT.filter((_,i)=>[localN>=7,localN>=9,localN>=10,localN>=11,localN>=12][i]);
  if (!avail.length) return;
  const c = avail[Math.floor(Math.random()*avail.length)];
  fallingApple = {
    x: ccx + c.lx*canopyR, y: ccy + c.ly*canopyR + canopyR*0.12,
    vx:(Math.random()-.5)*0.8, vy:0, r:Math.min(canopyR*0.085,11), rot:0, bounces:0, opacity:1, settled:false,
  };
  canopyShake = 6;
}
function updateApple() {
  if (canopyShake !== 0) { canopyShake = Math.sin(wind*40)*Math.abs(canopyShake); canopyShake *= 0.9;
    if (Math.abs(canopyShake) < 0.2) canopyShake = 0; }
  if (!fallingApple) return;
  const a = fallingApple, gy = groundY();
  if (!a.settled) {
    a.vy += 0.5; a.x += a.vx; a.y += a.vy; a.rot += a.vy*3;
    if (a.y >= gy - a.r - 2) { a.y = gy - a.r - 2; a.vy *= -0.42; a.vx *= 0.6; a.bounces++;
      if (a.bounces >= 3 || Math.abs(a.vy) < 1.2) a.settled = true; }
  } else { a.opacity -= 0.01; if (a.opacity <= 0) { fallingApple = null; return; } }
  ctx.save(); ctx.globalAlpha = a.opacity;
  ctx.translate(a.x, a.y); ctx.rotate(a.rot*Math.PI/180); ctx.translate(-a.x, -a.y);
  drawApple(a.x, a.y, a.r); ctx.restore();
}

/* ── ground (day) ── */
function drawDayGround() {
  const gy = groundY();
  const gg = ctx.createLinearGradient(0, gy-6, 0, H);
  gg.addColorStop(0,'#6aa84a'); gg.addColorStop(.18,'#4a8234'); gg.addColorStop(.5,'#5c3d1e'); gg.addColorStop(1,'#3d2408');
  ctx.fillStyle = gg; ctx.fillRect(0, gy, W, H-gy);
  ctx.fillStyle='#5a9240'; ctx.beginPath(); ctx.ellipse(sceneCX(), gy, W*0.5, 16, 0, Math.PI, 7); ctx.fill();
  /* grass blades swaying */
  for (let i=0;i<Math.ceil(W/22);i++){ const x=i*22+11; const h=8+((i*53)%9); const sw=Math.sin(wind*1.4+i)*3;
    ctx.strokeStyle=`hsl(${96+(i%5)*4},55%,${36+(i%4)*4}%)`; ctx.lineWidth=1.8; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(x,gy+2); ctx.quadraticCurveTo(x+sw*0.5,gy-h*0.6,x+sw,gy-h); ctx.stroke(); }
}

/* ═══════════════════════════════════════════════════════════
   BIRD  (cute, natural: pecks ground, looks around, multi-dir)
═══════════════════════════════════════════════════════════ */
const bird = {
  state:'hidden', p:0, flap:0,
  start:{x:0,y:0}, ctrl:{x:0,y:0}, end:{x:0,y:0},
  x:0, y:0, sit:0, sitMax:0, opacity:1, dir:1,
  /* perch behavior */
  onGround: false,
  lookAngle: 0, lookTarget: 0, lookTimer: 0,
  peckPhase: 0, peckTimer: 0, pecking: false, peckAmt: 0,
};

function drawBird(x, y, flapDeg, perched, dir, headTilt, peckDrop) {
  /* dir:  1 = faces right (beak at +x),  -1 = faces left
     The entire bird is drawn facing RIGHT in local space.
     ctx.scale(dir,1) flips it when dir=-1. */
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir * 0.72, 0.72);   /* flip when dir=-1, and shrink to 72% */

  /* body bob while flying */
  const bob = perched ? 0 : Math.sin(bird.flap * 2);
  ctx.translate(0, bob);

  /* ── far wing (behind body) ── */
  ctx.save(); ctx.rotate(flapDeg * Math.PI/180 * 0.6);
  const fwg = ctx.createLinearGradient(-30,0,-4,0);
  fwg.addColorStop(0,'#1a4a80'); fwg.addColorStop(1,'#3a7bd5');
  ctx.fillStyle = fwg; ctx.beginPath();
  ctx.moveTo(-4,-1); ctx.quadraticCurveTo(-18,-7,-29,3);
  ctx.quadraticCurveTo(-17,6,-4,7); ctx.closePath(); ctx.fill();
  ctx.restore();

  /* ── tail ── */
  ctx.fillStyle='#1e3d6e';
  ctx.beginPath(); ctx.moveTo(-16,3); ctx.lineTo(-28,-3); ctx.lineTo(-30,3);
  ctx.lineTo(-27,9); ctx.lineTo(-22,10); ctx.closePath(); ctx.fill();
  /* tail highlight */
  ctx.fillStyle='#2d5fa8';
  ctx.beginPath(); ctx.moveTo(-16,3); ctx.lineTo(-25,-1); ctx.lineTo(-27,4); ctx.lineTo(-22,8); ctx.closePath(); ctx.fill();

  /* ── body ── */
  const bg = ctx.createRadialGradient(0,-2,2,0,2,17);
  bg.addColorStop(0,'#4a9ae8'); bg.addColorStop(0.5,'#2d6fba'); bg.addColorStop(1,'#1a4a80');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0,2,17,10,-0.1,0,7); ctx.fill();
  /* orange-rust breast patch */
  const chg = ctx.createRadialGradient(2,6,1,2,7,10);
  chg.addColorStop(0,'#f59a3a'); chg.addColorStop(1,'#d06820');
  ctx.fillStyle = chg; ctx.globalAlpha=.85;
  ctx.beginPath(); ctx.ellipse(2,7,9,6,0.15,0,7); ctx.fill(); ctx.globalAlpha=1;
  /* blue wing gloss */
  ctx.strokeStyle='rgba(180,220,255,.28)'; ctx.lineWidth=2.2; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(-12,-1); ctx.quadraticCurveTo(-4,-5,5,-2); ctx.stroke();

  /* ── near wing (flaps) ── */
  ctx.save(); ctx.rotate(-flapDeg * Math.PI/180);
  const nwg = ctx.createLinearGradient(-30,0,-2,0);
  nwg.addColorStop(0,'#1a4a80'); nwg.addColorStop(0.55,'#2d6fba'); nwg.addColorStop(1,'#4a9ae8');
  ctx.fillStyle = nwg; ctx.beginPath();
  ctx.moveTo(-2,-2); ctx.quadraticCurveTo(-16,-12,-30,-1);
  ctx.quadraticCurveTo(-16,4,-2,6); ctx.closePath(); ctx.fill();
  /* feather detail */
  ctx.strokeStyle='rgba(20,50,110,.45)'; ctx.lineWidth=.9;
  for (let i=0;i<4;i++){
    ctx.beginPath(); ctx.moveTo(-8-i*5,-1+i*0.4); ctx.lineTo(-11-i*5.5,5+i*0.4); ctx.stroke();
  }
  ctx.restore();

  /* ── head + neck (peck drop moves the whole head unit) ── */
  /* peckDrop: 0 = neutral, 1 = fully pecked down.
     Translate head forward+down to simulate pecking without moving feet. */
  const peckX = peckDrop * 5;    /* head lurches forward */
  const peckY = peckDrop * 8;    /* head dips down */

  ctx.save();
  ctx.translate(12 + peckX, -5 + peckY);
  /* positive canvas rotation = CW = beak tilts downward (toward ground).
     peckDrop makes bird peck (beak toward ground) — must be positive.
     headTilt positive = look forward/down, negative = look up/alert. */
  ctx.rotate(headTilt + peckDrop * 0.45);

  /* round head (larger than before for cuteness) */
  const hg = ctx.createRadialGradient(-1,-2,1,0,0,12);
  hg.addColorStop(0,'#4a9ae8'); hg.addColorStop(0.6,'#2060a8'); hg.addColorStop(1,'#153a70');
  ctx.fillStyle=hg; ctx.beginPath(); ctx.arc(0,0,12,0,7); ctx.fill();
  /* blue cap shine */
  ctx.fillStyle='rgba(160,210,255,.22)'; ctx.beginPath();
  ctx.arc(-3,-6,5,0,7); ctx.fill();

  /* large round eye (cartoon-cute) */
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(6,-2,5,0,7); ctx.fill();
  ctx.fillStyle='#0a1a30'; ctx.beginPath(); ctx.arc(6,-2,3.2,0,7); ctx.fill();
  /* iris ring */
  ctx.strokeStyle='rgba(30,80,160,.35)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(6,-2,5,0,7); ctx.stroke();
  /* catch light */
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(7.2,-3.2,1.2,0,7); ctx.fill();

  /* beak — short and stubby (cute), opens slightly when pecking */
  const gape = peckDrop > 0.3 ? (peckDrop - 0.3) * 0.45 : 0;
  ctx.fillStyle='#f5c842';
  ctx.beginPath(); ctx.moveTo(11,-2+gape*0.3); ctx.lineTo(20,-1-gape); ctx.lineTo(11,0); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#d4a020';
  ctx.beginPath(); ctx.moveTo(11,0); ctx.lineTo(20,-1+gape); ctx.lineTo(11,2+gape); ctx.closePath(); ctx.fill();
  /* beak tip */
  ctx.fillStyle='#c09010'; ctx.beginPath(); ctx.arc(19.5,-1,1.5,0,7); ctx.fill();

  ctx.restore();

  /* ── legs (fixed position — feet stay planted) ── */
  if (perched) {
    ctx.strokeStyle='#4a2818'; ctx.lineWidth=1.8; ctx.lineCap='round';
    [[-5,0],[3,0]].forEach(([fx])=>{
      /* shin — stays vertical */
      ctx.beginPath(); ctx.moveTo(fx,10); ctx.lineTo(fx, 18); ctx.stroke();
      /* toes (spread on ground) */
      ctx.lineWidth=1.4;
      [[-5,4],[0,5],[5,3],[-6,1]].forEach(([dx,dy])=>{
        ctx.beginPath(); ctx.moveTo(fx,18); ctx.lineTo(fx+dx, 18+dy); ctx.stroke();
      });
      ctx.lineWidth=1.8;
    });
  }

  ctx.restore();
}

function updateAndDrawBird() {
  if (bird.state === 'hidden') return;
  const b = bird;

  if (b.state === 'flyIn' || b.state === 'through' || b.state === 'flyOut') {
    b.flap += 0.22;           /* slower, more natural wingbeat */
    const pos = qbez(b.start, b.ctrl, b.end, b.p);
    b.x = pos.x; b.y = pos.y;
    b.opacity = Math.min(b.opacity + 0.05, 1);
    const flapDeg = Math.sin(b.flap) * 22;   /* reduced amplitude */
    ctx.save(); ctx.globalAlpha = b.opacity;
    drawBird(b.x, b.y, flapDeg, false, b.dir, 0, 0);
    ctx.restore();

  } else if (b.state === 'perch') {
    b.flap += 0.03;
    const flapDeg = Math.sin(b.flap) * 4;

    /* look-around: head nods up/down noticeably.
       Negative = beak up (alert), positive = beak slightly down (foraging). */
    b.lookTimer--;
    if (b.lookTimer <= 0) {
      /* 60% chance looks down/forward, 40% looks up alertly */
      b.lookTarget = Math.random() < 0.6
        ? 0.12 + Math.random() * 0.22     /* pecking-forward tilt */
        : -(0.08 + Math.random() * 0.22); /* head-up alert tilt */
      b.lookTimer = 55 + Math.floor(Math.random() * 110);
    }
    b.lookAngle += (b.lookTarget - b.lookAngle) * 0.055;

    /* pecking (ground only) */
    let peckDrop = 0;
    if (b.onGround) {
      b.peckTimer--;
      if (b.peckTimer <= 0) {
        b.pecking = !b.pecking;
        b.peckTimer = b.pecking ? 18 + Math.floor(Math.random()*14) : 60 + Math.floor(Math.random()*100);
        b.peckPhase = 0;
      }
      if (b.pecking) {
        b.peckPhase += 0.22;
        peckDrop = Math.max(0, Math.sin(b.peckPhase));
      }
    }

    ctx.save(); ctx.globalAlpha = b.opacity;
    drawBird(b.x, b.y, flapDeg, true, b.dir, b.lookAngle, peckDrop);
    ctx.restore();
    b.sit++;
    if (b.sit >= b.sitMax) startBirdExit();
  }
}

function startBirdExit() {
  const b = bird;
  b.start = { x: b.x, y: b.y };
  /* exit in a random direction: sometimes left, sometimes right, sometimes up */
  const exitDir = Math.random() < 0.5 ? -1 : 1;
  b.dir = exitDir;
  b.end   = { x: exitDir > 0 ? W + 120 : -120, y: b.y - 60 - Math.random()*80 };
  b.ctrl  = { x: b.x + exitDir * (W * 0.35), y: b.y - 120 - Math.random()*60 };
  b.p = 0; b.state = 'flyOut';
  gsap.to(b, { p: 1, duration: 2.8 + Math.random(), ease: 'power1.in',
    onComplete: () => { b.state = 'hidden'; scheduleBird(); } });
}

function spawnBird() {
  if (bird.state !== 'hidden' || currentView !== 'day') { scheduleBird(); return; }
  const b = bird;
  b.opacity = 0; b.flap = 0; b.onGround = false;
  b.lookAngle = 0; b.lookTarget = 0; b.lookTimer = 50; b.peckTimer = 60; b.pecking = false;

  const roll = Math.random();

  if (roll < 0.30 && W >= 560) {
    /* ── Perch on the Plant button ── */
    const btn = document.getElementById('plantSubmit');
    const r = btn.getBoundingClientRect();
    const destX = r.left + r.width/2, destY = r.top - 14;
    /* come from whichever side makes the bird fly toward the button */
    const fromRight = destX < W / 2;
    b.dir = fromRight ? -1 : 1;
    b.start = fromRight ? { x: W+90, y: 80+Math.random()*150 } : { x:-80, y: 80+Math.random()*150 };
    /* correct dir to match actual travel direction */
    b.dir = destX > b.start.x ? 1 : -1;
    b.end  = { x: destX, y: destY };
    b.ctrl = { x: (b.start.x + destX)/2, y: Math.min(b.start.y, destY) - 110 };
    b.p = 0; b.state = 'flyIn'; b.onGround = false;
    gsap.to(b, { p: 1, duration: 3.2, ease: 'power2.inOut', onComplete: () => {
      b.x = b.end.x; b.y = b.end.y; b.state = 'perch'; b.sit = 0; b.sitMax = (7+Math.random()*9)*60;
      gsap.fromTo(b, {y: b.end.y-8}, {y: b.end.y, duration:.28, ease:'bounce.out'});
    }});

  } else if (roll < 0.65) {
    /* ── Perch on the ground ── */
    const gx = sceneCX() + (Math.random()-0.5)*W*0.55;
    const gy = groundY() - 10;
    /* always enter from the opposite side */
    const fromRight = gx < W / 2;
    b.start = fromRight ? { x: W+90, y: 80+Math.random()*160 } : { x:-80, y: 80+Math.random()*160 };
    b.dir = gx > b.start.x ? 1 : -1;   /* face the direction of travel */
    b.end  = { x: gx, y: gy };
    b.ctrl = { x: (b.start.x + gx)/2, y: Math.min(b.start.y, gy) - 140 };
    b.p = 0; b.state = 'flyIn'; b.onGround = true;
    gsap.to(b, { p: 1, duration: 3.6, ease: 'power2.inOut', onComplete: () => {
      b.x = b.end.x; b.y = b.end.y; b.state = 'perch'; b.sit = 0; b.sitMax = (8+Math.random()*12)*60;
      /* face a natural direction when settled (random, slightly biased toward center) */
      b.dir = b.x < sceneCX() ? 1 : -1;
      b.lookTarget = 0; b.lookAngle = 0;
      b.peckTimer = 50; b.pecking = false; b.peckPhase = 0;
      gsap.fromTo(b, {y: b.end.y-8}, {y: b.end.y, duration:.25, ease:'bounce.out'});
    }});

  } else {
    /* ── Fly through ── always enter opposite to exit */
    const toRight = Math.random() < 0.5;
    b.dir = toRight ? 1 : -1;
    b.start = toRight ? { x:-90, y: 70+Math.random()*180 } : { x: W+90, y: 70+Math.random()*180 };
    b.end   = toRight ? { x: W+100, y: 70+Math.random()*180 } : { x:-100, y: 70+Math.random()*180 };
    b.ctrl  = { x: W/2+(Math.random()-0.5)*W*0.25, y: Math.min(b.start.y, b.end.y)-50+Math.random()*60 };
    b.p = 0; b.state = 'through';
    gsap.to(b, { p: 1, duration: 6+Math.random()*4, ease: 'sine.inOut',
      onComplete: () => { b.state = 'hidden'; scheduleBird(); }});
  }
}

let birdScheduled = false;
function scheduleBird() {
  if (birdScheduled) return;
  birdScheduled = true;
  setTimeout(() => { birdScheduled = false; currentView === 'day' ? spawnBird() : scheduleBird(); }, (18 + Math.random()*32)*1000);
}
scheduleBird();

function scheduleAppleDrop() {
  setTimeout(() => { triggerAppleFall(); scheduleAppleDrop(); }, (30 + Math.random()*50)*1000);
}
scheduleAppleDrop();

/* ═══════════════════════════════════════════════════════════
   CLOUDS  (day view — gentle drift across the sky)
═══════════════════════════════════════════════════════════ */
const clouds = [];
(function initClouds() {
  /* 7 clouds spread across the full width at random heights in the upper sky */
  const configs = [
    { xFrac: 0.05, yFrac: 0.08, scale: 1.1, speed: 0.18, alpha: 0.30 },
    { xFrac: 0.22, yFrac: 0.18, scale: 0.75, speed: 0.24, alpha: 0.22 },
    { xFrac: 0.40, yFrac: 0.06, scale: 1.30, speed: 0.14, alpha: 0.28 },
    { xFrac: 0.55, yFrac: 0.20, scale: 0.65, speed: 0.30, alpha: 0.20 },
    { xFrac: 0.68, yFrac: 0.10, scale: 1.00, speed: 0.20, alpha: 0.26 },
    { xFrac: 0.82, yFrac: 0.16, scale: 0.85, speed: 0.16, alpha: 0.24 },
    { xFrac: 0.93, yFrac: 0.05, scale: 1.20, speed: 0.22, alpha: 0.28 },
  ];
  configs.forEach(({ xFrac, yFrac, scale, speed, alpha }) => {
    clouds.push({ xFrac, yFrac, scale, speed, alpha });
  });
})();

function drawCloud(x, y, scale, alpha) {
  /* Fluffy cloud built from overlapping soft ellipses */
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(255,252,245,1)';
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  /* puff positions [dx, dy, rx, ry] */
  const puffs = [
    [  0,   0, 52, 32],   /* main body */
    [-52,  10, 36, 24],   /* left */
    [ 52,  10, 36, 24],   /* right */
    [-26, -22, 38, 28],   /* upper-left */
    [ 26, -22, 38, 28],   /* upper-right */
    [  0, -32, 30, 22],   /* top centre */
    [-70,  16, 26, 18],   /* far left tail */
    [ 70,  16, 26, 18],   /* far right tail */
  ];
  puffs.forEach(([dx, dy, rx, ry]) => {
    ctx.beginPath(); ctx.ellipse(dx, dy, rx, ry, 0, 0, 7); ctx.fill();
  });
  /* soft shadow on the underside */
  ctx.fillStyle = 'rgba(180,195,220,0.18)';
  ctx.beginPath(); ctx.ellipse(0, 20, 58, 14, 0, 0, 7); ctx.fill();
  ctx.restore();
}

function updateAndDrawClouds() {
  const skyH = groundY() * 0.52; /* clouds only in top ~half of sky */
  clouds.forEach(c => {
    /* drift left, wrap around when fully off-screen */
    c.xFrac -= c.speed / W;
    if (c.xFrac < -0.22) c.xFrac = 1.18;

    const x = c.xFrac * W;
    const y = 40 + c.yFrac * skyH;
    drawCloud(x, y, c.scale, c.alpha);
  });
}

/* ═══════════════════════════════════════════════════════════
   MOON  (canvas, realistic sphere with craters)
   Positioned in upper-right area, slightly left of the audio button.
═══════════════════════════════════════════════════════════ */
function drawMoon() {
  /* Soft, unobtrusive moon — background element, not the focus */
  const mx = W < 600 ? W - 80 : W - 310, my = 72, r = 30;
  ctx.save();

  /* Large outer glow — the main visible feature, very soft */
  const halo = ctx.createRadialGradient(mx, my, r * 0.5, mx, my, r * 3.5);
  halo.addColorStop(0,   'rgba(255,250,215,.13)');
  halo.addColorStop(0.4, 'rgba(240,235,200,.05)');
  halo.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(mx, my, r * 3.5, 0, 7); ctx.fill();

  /* Clip to disc */
  ctx.beginPath(); ctx.arc(mx, my, r, 0, 7); ctx.clip();

  /* Base fill — pale warm grey */
  ctx.fillStyle = '#d8d4c8';
  ctx.fillRect(mx - r, my - r, r * 2, r * 2);

  /* Very faint, blurry surface patches — barely visible */
  [[0.2, 0.1, 0.38, 0.28], [-0.22, 0.25, 0.30, 0.22], [0.05, -0.28, 0.24, 0.18]]
    .forEach(([dx, dy, rx, ry]) => {
      ctx.fillStyle = 'rgba(60,65,80,0.07)';
      ctx.beginPath(); ctx.ellipse(mx+dx*r, my+dy*r, rx*r, ry*r, 0.3, 0, 7); ctx.fill();
    });

  /* Spherical shading — very gentle, lit from upper-left */
  const lit = ctx.createRadialGradient(mx - r*0.32, my - r*0.30, 0, mx, my, r);
  lit.addColorStop(0,    'rgba(255,252,238,0.80)');
  lit.addColorStop(0.55, 'rgba(210,205,185,0.30)');
  lit.addColorStop(1,    'rgba(30,35,55,0.30)');
  ctx.fillStyle = lit;
  ctx.fillRect(mx - r, my - r, r * 2, r * 2);

  ctx.restore();

  /* Outer edge glow ring on the lit side (drawn outside clip) */
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.strokeStyle = '#fffde0';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(mx, my, r, Math.PI * 0.8, Math.PI * 1.7); ctx.stroke();
  ctx.restore();
}

/* ═══════════════════════════════════════════════════════════
   MAIN RENDER LOOP
═══════════════════════════════════════════════════════════ */
function loop() {
  ctx.clearRect(0, 0, W, H);
  wind += 0.01;

  if (currentView === 'night') {
    drawMoon();
    drawFireBase();
    /* spawn calm particles */
    const spawn = Math.max(1, Math.round(1.4 * fireIntensity));
    if (particles.length < MAX_P) for (let i=0;i<spawn;i++) particles.push(new FireParticle());
    for (let i=particles.length-1;i>=0;i--){ particles[i].update(); if (particles[i].dead) particles.splice(i,1); }
    for (let i=crackleParticles.length-1;i>=0;i--){ crackleParticles[i].update(); if (crackleParticles[i].dead) crackleParticles.splice(i,1); }
    ctx.globalCompositeOperation = 'lighter';
    [...particles].sort((a,b)=>a.life-b.life).forEach(p=>p.draw());
    crackleParticles.forEach(p=>p.draw());
    ctx.globalCompositeOperation = 'source-over';

  } else {
    updateAndDrawClouds();   /* behind everything — drawn before ground */
    drawDayGround();
    drawTree();
    updateApple();
    updateAndDrawBird();
  }
  requestAnimationFrame(loop);
}
loop();

/* Restore last-used view after render loop starts */
if (currentView !== 'night') switchView(currentView);

/* ═══════════ VIEW SWITCH ═══════════ */
function switchView(mode) {
  currentView = mode;
  localStorage.setItem('letgo_view', mode);
  document.body.className = mode;
  document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.${mode}-btn`).classList.add('active');
  document.getElementById('viewNight').classList.toggle('active', mode === 'night');
  document.getElementById('viewDay').classList.toggle('active',   mode === 'day');
  /* clear bird if leaving day */
  if (mode === 'night' && bird.state !== 'hidden') { gsap.killTweensOf(bird); bird.state = 'hidden'; scheduleBird(); }
  if (mode === 'day')   scheduleBird();
  if (audioEnabled) {
    if (mode === 'night') { document.getElementById('plantAudio').pause(); document.getElementById('fireAudio').play().catch(()=>{}); }
    else                  { document.getElementById('fireAudio').pause();  document.getElementById('plantAudio').play().catch(()=>{}); }
  }
}

/* ═══════════ AUDIO ═══════════ */
function toggleAudio() {
  audioEnabled = !audioEnabled;
  const _mob = window.innerWidth <= 560;
  document.getElementById('audioBtn').textContent = audioEnabled
    ? (_mob ? '🔊' : '🔊 Mute')
    : (_mob ? '🔇' : '🔇 Unmute');
  if (audioEnabled) {
    const el = document.getElementById(currentView === 'night' ? 'fireAudio' : 'plantAudio');
    el.play().catch(err => console.error('[Audio] play() failed:', err, '| src:', el.currentSrc));
  } else {
    document.getElementById('fireAudio').pause();
    document.getElementById('plantAudio').pause();
  }
}
setInterval(()=>{ if(audioEnabled&&currentView==='night') document.getElementById('owlAudio').play().catch(()=>{}); }, (45+Math.random()*60)*1000);

/* ═══════════ THROW LOG ═══════════ */
function makeBarkLog(text) {
  const w = document.createElement('div'); w.className = 'flying-log-wrap';
  const s = text.replace(/</g,'&lt;').replace(/>/g,'&gt;');
  w.innerHTML = `<svg width="110" height="38" viewBox="0 0 110 38" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="lgbody" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#c07840"/>
        <stop offset=".3" stop-color="#8a5026"/>
        <stop offset=".7" stop-color="#6b3712"/>
        <stop offset="1" stop-color="#3e1c06"/>
      </linearGradient>
      <radialGradient id="lgcap" cx="42%" cy="38%" r="60%">
        <stop offset="0" stop-color="#e8c07a"/>
        <stop offset="4" stop-color="#b8824a"/>
        <stop offset=".7" stop-color="#8a5226"/>
        <stop offset="1" stop-color="#5d2e0c"/>
      </radialGradient>
      <filter id="lgshadow"><feDropShadow dx="1" dy="3" stdDeviation="2" flood-color="rgba(0,0,0,0.4)"/></filter>
    </defs>
    <g filter="url(#lgshadow)">
      <!-- log body -->
      <rect x="16" y="5" width="78" height="28" rx="13" fill="url(#lgbody)"/>
      <!-- bark grain lines -->
      <line x1="24" y1="11" x2="87" y2="11" stroke="#3a1d08" stroke-width="1.1" opacity=".3"/>
      <line x1="24" y1="17" x2="87" y2="17" stroke="#3a1d08" stroke-width="1.2" opacity=".25"/>
      <line x1="24" y1="23" x2="87" y2="23" stroke="#3a1d08" stroke-width="1.1" opacity=".28"/>
      <line x1="24" y1="29" x2="87" y2="29" stroke="#3a1d08" stroke-width="1" opacity=".2"/>
      <!-- highlight streak along top -->
      <path d="M26 9 Q55 7 86 9" stroke="rgba(220,150,80,.35)" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <!-- left end cap -->
      <ellipse cx="16" cy="19" rx="12" ry="14" fill="url(#lgcap)"/>
      <ellipse cx="16" cy="19" rx="8" ry="9.5" fill="none" stroke="#7a4a22" stroke-width=".9" opacity=".55"/>
      <ellipse cx="16" cy="19" rx="4.5" ry="5.5" fill="none" stroke="#7a4a22" stroke-width=".8" opacity=".5"/>
      <ellipse cx="16" cy="19" rx="1.8" ry="2.2" fill="none" stroke="#7a4a22" stroke-width=".7" opacity=".45"/>
      <line x1="16" y1="10" x2="16" y2="28" stroke="#5a3018" stroke-width=".8" opacity=".4"/>
      <!-- right end cap -->
      <ellipse cx="94" cy="19" rx="12" ry="14" fill="url(#lgcap)"/>
      <ellipse cx="94" cy="19" rx="8" ry="9.5" fill="none" stroke="#7a4a22" stroke-width=".9" opacity=".55"/>
      <ellipse cx="94" cy="19" rx="4.5" ry="5.5" fill="none" stroke="#7a4a22" stroke-width=".8" opacity=".5"/>
      <ellipse cx="94" cy="19" rx="1.8" ry="2.2" fill="none" stroke="#7a4a22" stroke-width=".7" opacity=".45"/>
    </g>
    <foreignObject x="24" y="8" width="62" height="22">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font:600 8.5px Georgia,serif;color:#f5deb3;text-shadow:0 1px 2px rgba(0,0,0,0.6);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;line-height:22px;text-align:center;">${s}</div>
    </foreignObject>
  </svg>`;
  return w;
}

function throwLog() {
  const input = document.getElementById('fireInput'); const text = input.value.trim();
  if (!text) { input.focus(); return; }
  const v = checkModeration(text); if (v) { showModAlert(v); return; }
  fireTodayCount++; fireDayCount++; saveFireDay(fireDayCount); updateFlame();
  _incFireCounter();

  const ir = input.getBoundingClientRect();
  const sx = ir.left + ir.width/2 - 55, sy = ir.top - 10;
  const ex = sceneCX() - 55, ey = groundY() - 26;
  const midY = Math.min(sy, ey) - 90;

  const log = makeBarkLog(text);
  log.style.cssText += `left:${sx}px;top:${sy}px;`;
  document.body.appendChild(log);

  gsap.to(log, {
    duration: 2.5,
    ease: 'power1.inOut',
    motionPath: {
      path: [{ x:0,y:0 }, { x:(ex-sx)*0.5, y:midY-sy }, { x:ex-sx, y:ey-sy }],
      curviness: 1.2
    },
    rotation: 200,
    scale: 0.06,
    opacity: 0,
    transformOrigin: '55px 19px',
    onComplete: () => { log.remove(); spawnFireWord(text); fireFlare(); }
  });

  _broadcast('fire', text);
  input.value = ''; input.focus();
}
function spawnFireWord(text) {
  const el = document.createElement('div'); el.className='fire-word';
  const drift=(Math.random()-.5)*80, dur=5+Math.random()*2;
  el.style.cssText=`left:${sceneCX()-70}px;top:${groundY()-50}px;--wr-drift:${drift}px;--wr-dur:${dur}s;`;
  el.textContent=text; document.body.appendChild(el);
  setTimeout(()=>el.remove(), dur*1000+300);
}

/* ═══════════ WATER PLANT ═══════════ */
function waterPlant() {
  const input = document.getElementById('plantInput'); const text = input.value.trim();
  if (!text) { input.focus(); return; }
  const v = checkAffirmation(text); if (v) { showModAlert(v); return; }
  const prevCompleted = Math.floor(plantDayCount / PLANTS_PER_TREE);
  plantTodayCount++; plantDayCount++; savePlantDay(plantDayCount);
  _incPlantCounter();
  const newCompleted = Math.floor(plantDayCount / PLANTS_PER_TREE);
  if (newCompleted > prevCompleted) {
    /* Tree just completed — snap new sapling to g=0 instantly, no shrink animation */
    gsap.killTweensOf(tree);
    tree.g = 0; tree.target = 0;
    lastCompleted = newCompleted;
  } else {
    setPlantTarget(); animateTreeGrowth();
  }

  const can = document.getElementById('wateringCan');
  const currentTreeHeight = lerp(14, 168, clamp01(tree.target));
  const topY = groundY() - currentTreeHeight;
  const canopyR = lerp(0, 122, smooth(0.18, 1.1, tree.target));

  /* Place can so its nozzle tip (SVG x=82, y=14) hovers above the canopy centre.
     After the 52° CSS tilt the nozzle moves down-left ~30px, so offset accordingly. */
  const nozzleTargetX = sceneCX();
  const nozzleTargetY = topY - canopyR * 0.5 - 20;
  can.style.left = (nozzleTargetX - 82 + 55) + 'px';   /* shift can right so nozzle is above tree */
  can.style.top  = (nozzleTargetY - 14) + 'px';

  can.classList.remove('active');
  void can.offsetWidth;
  can.classList.add('active');
  setTimeout(() => can.classList.remove('active'), 4500);

  const mist = document.createElement('div'); mist.className='mist-text'; mist.textContent=text;
  mist.style.cssText=`left:${sceneCX()-80}px;top:${groundY()-120}px;max-width:200px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;`;
  document.body.appendChild(mist); setTimeout(()=>mist.remove(), 2700);

  _broadcast('plant', text);
  input.value=''; input.focus();
}

/* ═══════════ KEYBOARD ═══════════ */
document.getElementById('fireInput').addEventListener('keydown', e=>{ if(e.key==='Enter') throwLog(); });
document.getElementById('plantInput').addEventListener('keydown',e=>{ if(e.key==='Enter') waterPlant(); });
