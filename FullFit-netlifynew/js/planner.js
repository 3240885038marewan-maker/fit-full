/* Fit&Full – planner.js
   Genera scheda di allenamento e piano alimentare a partire dal profilo utente.
   Funzioni pure e deterministiche: stesso profilo -> stesso piano (nessun dato casuale),
   quindi il piano si può rigenerare su qualsiasi dispositivo senza salvarlo. */
const Planner = (() => {
  'use strict';

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const roundTo = (v, step) => Math.round(v / step) * step;
  const rotate = (list, seed) => list.map((_, i) => list[(i + seed) % list.length]);

  /* =====================================================================
     ATTREZZI
     ===================================================================== */
  const EQUIPMENT = [
    { id: 'dumbbells',  label: 'Manubri (anche componibili)' },
    { id: 'bands',      label: 'Bande elastiche' },
    { id: 'kettlebell', label: 'Kettlebell' },
    { id: 'pullupbar',  label: 'Sbarra per trazioni' },
    { id: 'bench',      label: 'Panca' }
  ];
  const HOME_TAGS = EQUIPMENT.map((e) => e.id);
  const GYM_TAGS = [...HOME_TAGS, 'barbell', 'cable', 'machine'];   // palestra completa
  const equipmentLabels = (ids) =>
    (ids || []).map((id) => (EQUIPMENT.find((e) => e.id === id) || {}).label).filter(Boolean);

  /* =====================================================================
     ALLENAMENTO
     Ogni "slot" è uno schema di movimento con una lista di esercizi in ordine di
     preferenza. Per ogni slot si sceglie il primo esercizio realizzabile con gli
     attrezzi disponibili: la scheda cambia quindi con luogo e attrezzi dichiarati.
     eq = attrezzi necessari (tutti); [] = corpo libero. t: 'c' composto, 'i' isolamento.
     ===================================================================== */
  const X = (n, eq, t = 'c', o = {}) => ({ n, eq, t, ...o });

  const SLOTS = {
    squat: [
      X('Squat con bilanciere', ['barbell']),
      X('Leg press', ['machine']),
      X('Goblet squat con manubrio', ['dumbbells']),
      X('Goblet squat con kettlebell', ['kettlebell']),
      X('Squat con banda elastica', ['bands']),
      X('Squat a corpo libero con pausa', [])
    ],
    hinge: [
      X('Stacco rumeno con bilanciere', ['barbell']),
      X('Stacco rumeno con manubri', ['dumbbells']),
      X('Stacco a una gamba con kettlebell', ['kettlebell'], 'c', { per: 'per lato' }),
      X('Kettlebell swing', ['kettlebell'], 'c', { reps: '12–15' }),
      X('Stacco rumeno con banda elastica', ['bands']),
      X('Glute bridge monopodalico', [], 'c', { per: 'per lato' })
    ],
    lunge: [
      X('Affondo bulgaro con manubri', ['dumbbells', 'bench'], 'c', { per: 'per lato' }),
      X('Affondi camminati con manubri', ['dumbbells'], 'c', { per: 'per lato' }),
      X('Affondi con kettlebell', ['kettlebell'], 'c', { per: 'per lato' }),
      X('Affondo bulgaro a corpo libero (piede su una sedia)', [], 'c', { per: 'per lato' })
    ],
    hpush: [
      X('Panca piana con bilanciere', ['barbell', 'bench']),
      X('Panca piana con manubri', ['dumbbells', 'bench']),
      X('Chest press ai macchinari', ['machine']),
      X('Floor press con manubri', ['dumbbells']),
      X('Piegamenti con banda elastica', ['bands']),
      X('Piegamenti sulle braccia', []),
      X('Piegamenti con piedi rialzati', [])
    ],
    vpush: [
      X('Military press con bilanciere', ['barbell']),
      X('Shoulder press con manubri', ['dumbbells']),
      X('Lento avanti con kettlebell', ['kettlebell'], 'c', { per: 'per lato' }),
      X('Shoulder press con banda elastica', ['bands']),
      X('Pike push-up', [])
    ],
    hpull: [
      X('Rematore con bilanciere', ['barbell']),
      X('Pulley basso', ['cable']),
      X('Rematore con manubrio a un braccio', ['dumbbells'], 'c', { per: 'per lato' }),
      X('Rematore con kettlebell a un braccio', ['kettlebell'], 'c', { per: 'per lato' }),
      X('Rematore con banda elastica', ['bands']),
      X('Rematore inverso (sotto un tavolo molto stabile)', [])
    ],
    vpull: [
      X('Lat machine', ['cable']),
      X('Trazioni alla sbarra', ['pullupbar']),
      X('Chin-up (presa supina)', ['pullupbar']),
      X('Trazioni con banda di assistenza', ['pullupbar', 'bands']),
      X('Lat pulldown con banda elastica', ['bands']),
      X('Pullover con manubrio a terra', ['dumbbells'], 'i'),
      X('Estensioni dorsali a corpo libero (superman)', [], 'i', { reps: '12–15' })
    ],
    biceps: [
      X('Curl con manubri', ['dumbbells'], 'i'),
      X('Curl ai cavi', ['cable'], 'i'),
      X('Curl con bilanciere', ['barbell'], 'i'),
      X('Curl con banda elastica', ['bands'], 'i')
    ],
    triceps: [
      X('Pushdown ai cavi', ['cable'], 'i'),
      X('French press con manubri', ['dumbbells'], 'i'),
      X('Estensioni sopra la testa con banda elastica', ['bands'], 'i'),
      X('Piegamenti a mani strette (diamante)', [], 'i')
    ],
    lateral: [
      X('Alzate laterali con manubri', ['dumbbells'], 'i'),
      X('Alzate laterali ai cavi', ['cable'], 'i'),
      X('Alzate laterali con banda elastica', ['bands'], 'i')
    ],
    reardelt: [
      X('Face pull ai cavi', ['cable'], 'i'),
      X('Alzate a 90° con manubri (deltoidi posteriori)', ['dumbbells'], 'i'),
      X('Face pull con banda elastica', ['bands'], 'i'),
      X('Y-T-W a corpo libero', [], 'i', { per: 'per posizione', reps: '10–12' })
    ],
    chest: [
      X('Croci ai cavi', ['cable'], 'i'),
      X('Croci con manubri su panca', ['dumbbells', 'bench'], 'i'),
      X('Croci con banda elastica', ['bands'], 'i'),
      X('Piegamenti con piedi rialzati', [], 'c')
    ],
    glute: [
      X('Leg curl ai macchinari', ['machine'], 'i'),
      X('Hip thrust con bilanciere', ['barbell', 'bench']),
      X('Hip thrust con manubrio', ['dumbbells', 'bench']),
      X('Glute bridge con manubrio', ['dumbbells']),
      X('Glute bridge con banda elastica', ['bands']),
      X('Glute bridge monopodalico', [], 'c', { per: 'per lato' })
    ],
    calves: [
      X('Calf raise in piedi al macchinario', ['machine'], 'i', { reps: '12–20' }),
      X('Calf raise con manubri', ['dumbbells'], 'i', { reps: '12–20' }),
      X('Calf raise a corpo libero su un gradino', [], 'i', { reps: '12–20' })
    ],
    core: [
      X('Plank', [], 'i', { sch: { sets: 3, reps: '30–60 s', rest: 45 } }),
      X('Dead bug', [], 'i', { per: 'per lato', reps: '8–12' }),
      X('Pallof press con banda elastica', ['bands'], 'i', { per: 'per lato', reps: '10–12' }),
      X('Crunch ai cavi', ['cable'], 'i'),
      X('Sollevamenti delle ginocchia alla sbarra', ['pullupbar'], 'i')
    ]
  };

  const SESSIONS = {
    full1:  ['squat', 'hpush', 'vpull', 'hinge', 'vpush', 'core'],
    fullA:  ['squat', 'hpush', 'hpull', 'hinge', 'core'],
    fullB:  ['lunge', 'vpush', 'vpull', 'glute', 'core'],
    upperA: ['hpush', 'hpull', 'vpush', 'vpull', 'triceps', 'biceps'],
    upperB: ['vpull', 'hpush', 'hpull', 'vpush', 'lateral', 'triceps'],
    lowerA: ['squat', 'hinge', 'lunge', 'calves', 'core'],
    lowerB: ['hinge', 'squat', 'glute', 'calves', 'core'],
    push:   ['hpush', 'vpush', 'chest', 'lateral', 'triceps'],
    pull:   ['vpull', 'hpull', 'reardelt', 'biceps', 'core'],
    legs:   ['squat', 'hinge', 'lunge', 'glute', 'calves']
  };

  // v = variante: sposta la scelta sul 2° esercizio disponibile, per differenziare sessioni simili.
  const SPLITS = {
    1: [{ key: 'full1',  label: 'Full body', v: 0 }],
    2: [{ key: 'fullA',  label: 'Full body A', v: 0 }, { key: 'fullB', label: 'Full body B', v: 0 }],
    3: [{ key: 'fullA',  label: 'Full body A', v: 0 }, { key: 'fullB', label: 'Full body B', v: 1 },
        { key: 'fullA',  label: 'Full body A', v: 0 }],
    4: [{ key: 'upperA', label: 'Upper body A', v: 0 }, { key: 'lowerA', label: 'Lower body A', v: 0 },
        { key: 'upperB', label: 'Upper body B', v: 1 }, { key: 'lowerB', label: 'Lower body B', v: 1 }],
    5: [{ key: 'push',   label: 'Push (spinta)', v: 0 }, { key: 'pull', label: 'Pull (trazione)', v: 0 },
        { key: 'legs',   label: 'Gambe', v: 0 }, { key: 'upperB', label: 'Upper body', v: 1 },
        { key: 'lowerB', label: 'Lower body', v: 1 }]
  };

  // Prescrizione per obiettivo: in definizione si mantiene l'intensità per preservare la massa magra.
  const PRESC = {
    cut:      { c: { sets: 3, reps: '6–10', rest: 120 }, i: { sets: 3, reps: '10–15', rest: 60 } },
    maintain: { c: { sets: 3, reps: '8–10', rest: 90 },  i: { sets: 3, reps: '10–15', rest: 60 } },
    bulk:     { c: { sets: 4, reps: '6–10', rest: 120 }, i: { sets: 3, reps: '10–15', rest: 75 } }
  };

  const prescribe = (x, goal) => {
    const base = PRESC[goal][x.t];
    const lowLoad = x.eq.length === 0 || x.eq.every((e) => e === 'bands');   // corpo libero / bande
    let { sets, reps, rest } = base;
    if (lowLoad && x.t === 'c' && !x.reps) { reps = '10–20'; rest = 75; }
    if (x.reps) reps = x.reps;
    if (x.sch) ({ sets, reps, rest } = x.sch);
    const isTime = / s$/.test(reps);
    const scheme = `${sets} serie × ${reps}${isTime ? '' : ' rip.'}${x.per ? ' ' + x.per : ''}`;
    return { scheme, rest };
  };

  const availability = (n) => new Set(['bodyweight', ...(n.place === 'gym' ? GYM_TAGS : n.equipment)]);

  // Classe di carico: 2 = carico esterno (bilanciere, manubri, macchine...), 1 = bande, 0 = corpo libero.
  const tier = (x) => (x.eq.length === 0 ? 0 : x.eq.every((e) => e === 'bands') ? 1 : 2);

  // Sceglie il primo esercizio realizzabile; la variante ruota solo tra esercizi di pari classe di carico,
  // così la sessione B non peggiora mai rispetto alla A.
  const pick = (slot, avail, v, used) => {
    const cands = SLOTS[slot].filter((x) => x.eq.every((e) => avail.has(e)) && !used.has(x.n));
    if (!cands.length) return null;
    const same = cands.filter((x) => tier(x) === tier(cands[0]));
    return same[v % same.length];
  };

  const WORKOUT_NOTE = 'Termina ogni serie con 1–3 ripetizioni di riserva. Quando completi tutte le serie al massimo '
    + 'dell’intervallo, aumenta il carico (o scegli una variante più difficile) la volta successiva.';

  const buildWorkout = (n) => {
    const avail = availability(n);
    return SPLITS[n.days].map((s, i) => {
      const used = new Set();
      const exercises = [];
      SESSIONS[s.key].forEach((slot) => {
        const x = pick(slot, avail, s.v, used);
        if (!x) return;                                  // slot non realizzabile con gli attrezzi disponibili
        used.add(x.n);
        exercises.push({ id: `d${i + 1}e${exercises.length + 1}`, name: x.n, ...prescribe(x, n.goal) });
      });
      return { day: i + 1, title: `Giorno ${i + 1}`, focus: s.label, note: WORKOUT_NOTE, exercises };
    });
  };

  /* =====================================================================
     NUTRIZIONE
     ===================================================================== */
  // Ripartizione macro per stile alimentare (quota di kcal).
  const STYLES = {
    mediterranean: { c: 0.50, p: 0.25, f: 0.25, lvl: 0 },
    flexible:      { c: 0.50, p: 0.25, f: 0.25, lvl: 0 },
    protein_fit:   { c: 0.40, p: 0.35, f: 0.25, lvl: 0 },
    low_carb:      { c: 0.12, p: 0.33, f: 0.55, lvl: 0, keto: true },
    vegetarian:    { c: 0.50, p: 0.25, f: 0.25, lvl: 1 },
    vegan:         { c: 0.50, p: 0.25, f: 0.25, lvl: 2 }
  };

  const AVOID_MAP = [
    ['lactose', /latt|lact|dairy/i],
    ['gluten',  /glut|celiac|celiach/i],
    ['nuts',    /guscio|nuts?\b|noci|mandorl/i],
    ['nickel',  /nichel|nickel/i]
  ];
  const parseAvoid = (v) => {
    const raw = Array.isArray(v) ? v.join(' ') : String(v || '');
    return AVOID_MAP.filter(([, re]) => re.test(raw)).map(([k]) => k);
  };

  // Proteine: almeno 1,6–2,0 g/kg in base all'obiettivo (e mai sotto la quota % dello stile).
  const dailyMacros = (kcal, weight, goal, style) => {
    const perKg = { cut: 2.0, maintain: 1.6, bulk: 1.8 }[goal];
    const P = Math.min(Math.max((style.p * kcal) / 4, perKg * weight), 3 * weight);
    let C; let F;
    if (style.keto) {
      C = (style.c * kcal) / 4;
      F = (kcal - 4 * P - 4 * C) / 9;
    } else {
      const fMin = (0.20 * kcal) / 9;
      F = Math.max((style.f * kcal) / 9, fMin);
      C = (kcal - 4 * P - 9 * F) / 4;
      if (C < 100) { F = Math.max(fMin, (kcal - 4 * P - 400) / 9); C = (kcal - 4 * P - 9 * F) / 4; }
      C = Math.max(C, 0);
    }
    return { kcal, p: P, c: C, f: F };
  };

  /* Alimenti: valori per 100 g (cotto/pronto salvo diversa indicazione nel nome).
     lvl: dieta più restrittiva che può mangiarlo (0 onnivora, 1 vegetariana, 2 vegana).
     main/light: adatto a pranzo-cena / colazione-spuntini. */
  const F = (name, role, lvl, kcal, p, c, f, o = {}) => ({ name, role, lvl, kcal, p, c, f, tags: [], ...o });
  const OIL = 'Olio extravergine d’oliva';

  const FOODS = [
    // Proteine
    F('Petto di pollo (cotto)', 'prot', 0, 165, 31, 0, 3.6, { main: true, max: 250 }),
    F('Fesa di tacchino (cotta)', 'prot', 0, 135, 29, 0, 1.5, { main: true, max: 250 }),
    F('Merluzzo o pesce bianco (cotto)', 'prot', 0, 105, 23, 0, 1, { main: true, max: 300 }),
    F('Salmone (cotto)', 'prot', 0, 208, 20, 0, 13, { main: true, max: 200 }),
    F('Tonno al naturale', 'prot', 0, 116, 26, 0, 1, { main: true, light: true, max: 160 }),
    F('Manzo magro (cotto)', 'prot', 0, 187, 27, 0, 8, { main: true, max: 200 }),
    F('Uova intere', 'prot', 1, 143, 13, 1, 10, { main: true, light: true, max: 240, step: 60, min: 60, pc: [60, 'uovo', 'uova'] }),
    F('Albume', 'prot', 1, 52, 11, 0.7, 0.2, { main: true, light: true, max: 300, step: 10, min: 50 }),
    F('Yogurt greco 0%', 'prot', 1, 59, 10, 3.6, 0.4, { light: true, max: 300, tags: ['lactose'] }),
    F('Yogurt greco intero', 'prot', 1, 97, 9, 4, 5, { light: true, max: 250, tags: ['lactose'] }),
    F('Skyr', 'prot', 1, 63, 11, 4, 0.2, { light: true, max: 300, tags: ['lactose'] }),
    F('Fiocchi di latte', 'prot', 1, 98, 11, 3.4, 4.3, { main: true, light: true, max: 250, tags: ['lactose'] }),
    F('Ricotta vaccina', 'prot', 1, 150, 9, 3, 11, { main: true, max: 200, tags: ['lactose'] }),
    F('Proteine whey in polvere', 'prot', 1, 380, 80, 6, 6, { light: true, max: 40, min: 20, tags: ['lactose'] }),
    F('Tofu naturale', 'prot', 2, 120, 13, 2, 7, { main: true, light: true, max: 250, tags: ['nickel'] }),
    F('Tempeh', 'prot', 2, 192, 20, 8, 11, { main: true, max: 200, tags: ['nickel'] }),
    F('Seitan', 'prot', 2, 130, 24, 4, 2, { main: true, max: 200, tags: ['gluten'] }),
    F('Lenticchie (cotte)', 'prot', 2, 116, 9, 20, 0.4, { main: true, max: 350, tags: ['nickel'] }),
    F('Ceci (cotti)', 'prot', 2, 164, 8.9, 27, 2.6, { main: true, max: 300, tags: ['nickel'] }),
    F('Proteine vegetali in polvere (pisello/riso)', 'prot', 2, 380, 78, 6, 6, { light: true, max: 40, min: 20, tags: ['nickel'] }),
    // Carboidrati
    F('Riso basmati (cotto)', 'carb', 2, 130, 2.7, 28, 0.3, { main: true, max: 350 }),
    F('Pasta di semola (cotta)', 'carb', 2, 158, 5.8, 31, 0.9, { main: true, max: 350, tags: ['gluten'] }),
    F('Pasta di riso o mais senza glutine (cotta)', 'carb', 2, 150, 3.2, 32, 0.7, { main: true, max: 350 }),
    F('Patate (cotte)', 'carb', 2, 87, 2, 20, 0.1, { main: true, max: 450 }),
    F('Patate dolci (cotte)', 'carb', 2, 90, 2, 21, 0.2, { main: true, max: 400 }),
    F('Polenta (cotta)', 'carb', 2, 70, 1.6, 15, 0.3, { main: true, max: 450 }),
    F('Cous cous (cotto)', 'carb', 2, 112, 3.8, 23, 0.2, { main: true, max: 300, tags: ['gluten'] }),
    F('Quinoa (cotta)', 'carb', 2, 120, 4.4, 21, 1.9, { main: true, max: 300, tags: ['nickel'] }),
    F('Pane', 'carb', 2, 265, 9, 49, 3.2, { main: true, light: true, max: 150, tags: ['gluten'] }),
    F('Pane senza glutine', 'carb', 2, 250, 3, 50, 3, { main: true, light: true, max: 150 }),
    F('Fiocchi d’avena (a crudo)', 'carb', 2, 370, 13, 60, 7, { light: true, max: 90, min: 20, tags: ['gluten', 'nickel'] }),
    F('Gallette di riso', 'carb', 2, 380, 7, 80, 1, { light: true, max: 50, min: 10 }),
    F('Banana', 'carb', 2, 89, 1.1, 23, 0.3, { light: true, max: 180, min: 60, pc: [120, 'frutto', 'frutti'] }),
    F('Mela', 'carb', 2, 52, 0.3, 14, 0.2, { light: true, max: 250, min: 80, pc: [150, 'frutto', 'frutti'] }),
    F('Frutti di bosco', 'carb', 2, 43, 1, 10, 0.3, { light: true, max: 200, min: 40, lowcarb: true }),
    // Grassi
    F(OIL, 'fat', 2, 884, 0, 0, 100, { main: true, max: 30, step: 5 }),
    F('Avocado', 'fat', 2, 160, 2, 9, 15, { main: true, light: true, max: 150, step: 10, min: 30 }),
    F('Mandorle', 'fat', 2, 579, 21, 22, 50, { main: true, light: true, max: 40, step: 5, min: 10, tags: ['nuts', 'nickel'] }),
    F('Noci', 'fat', 2, 654, 15, 14, 65, { main: true, light: true, max: 40, step: 5, min: 10, tags: ['nuts', 'nickel'] }),
    F('Burro di arachidi 100%', 'fat', 2, 588, 25, 20, 50, { light: true, max: 30, step: 5, min: 10, tags: ['nuts', 'nickel'] })
  ];
  const VEG = { name: 'Verdure di stagione', role: 'veg', kcal: 30, p: 2, c: 4.5, f: 0.3, tags: [] };

  const MEAL_PLAN = [
    { name: 'Colazione',           share: 0.25, type: 'light' },
    { name: 'Spuntino mattina',    share: 0.10, type: 'light' },
    { name: 'Pranzo',              share: 0.30, type: 'main' },
    { name: 'Spuntino pomeriggio', share: 0.10, type: 'light' },
    { name: 'Cena',                share: 0.25, type: 'main' }
  ];

  const recalc = (m) => {
    m.kcal = 0; m.p = 0; m.c = 0; m.f = 0;
    m.parts.forEach((pt) => {
      const k = pt.g / 100;
      m.kcal += pt.food.kcal * k; m.p += pt.food.p * k; m.c += pt.food.c * k; m.f += pt.food.f * k;
    });
  };

  const sumOthers = (parts, skip, key) =>
    parts.reduce((t, pt) => (skip.includes(pt) ? t : t + (pt.food[key] * pt.g) / 100), 0);

  function buildMeal(ctx, meal, d, mi, usedProt) {
    const { style, macros, pool } = ctx;
    const main = meal.type === 'main';
    const seed = d * 3 + mi;
    const okMeal = (x) => (main ? x.main : x.light);
    const T = { p: macros.p * meal.share, c: macros.c * meal.share, f: macros.f * meal.share };
    const parts = [];
    const mk = (food, g, fixed = false) => { const pt = { food, g, fixed }; parts.push(pt); return pt; };
    const stepOf = (x) => x.step || 5;
    const capOf = (x) => Math.floor(((x.max || 400) * ctx.capScale) / stepOf(x)) * stepOf(x);
    const gOf = (x, grams, lo = 0) => clamp(roundTo(grams, stepOf(x)), lo, capOf(x));

    const veg = main ? mk(VEG, 200, true) : null;

    // 1) Scelta degli alimenti
    const protPool = pool.prot.filter((x) => okMeal(x) && (!style.keto || x.c <= 6));
    if (!protPool.length) ctx.flags.noProtein = true;
    const pLeft = Math.max(0, T.p - (veg ? (VEG.p * 2) : 0));
    const fLeft = Math.max(0, T.f - (veg ? (VEG.f * 2) : 0));
    const guess = (x) => gOf(x, pLeft / (x.p / 100), x.min || 30);
    const cands = rotate(protPool, seed);
    const Pfood = cands.find((x) => !usedProt.has(x.name) && (x.f * guess(x)) / 100 <= fLeft + 4)
      || cands.find((x) => !usedProt.has(x.name)) || cands[0];
    const pP = Pfood ? (usedProt.add(Pfood.name), mk(Pfood, guess(Pfood))) : null;

    const P2food = rotate(protPool.filter((x) => x !== Pfood), seed + 2)[0];
    const pP2 = P2food ? mk(P2food, 0) : null;

    let pC = null;
    if (!(style.keto && main)) {
      const carbPool = pool.carb.filter((x) => okMeal(x) && (!style.keto || x.lowcarb));
      const Cfood = rotate(carbPool, seed + 1)[0];
      if (Cfood) pC = mk(Cfood, 0);
    }
    const fats = pool.fat.filter(okMeal);
    const oilFood = main ? fats.find((x) => x.name === OIL) : null;
    const pOil = oilFood ? mk(oilFood, 0) : null;
    const f2Food = rotate(fats.filter((x) => x !== oilFood), seed)[0];
    const pF2 = f2Food ? mk(f2Food, 0) : null;

    // 2) Quantità: si risolvono proteine, carboidrati e grassi insieme, perché ogni alimento
    //    apporta anche gli altri macro (es. l'avena porta proteine, il salmone porta grassi).
    for (let it = 0; it < 6; it++) {
      if (pP) pP.g = gOf(pP.food, (T.p - sumOthers(parts, [pP, pP2], 'p')) / (pP.food.p / 100), pP.food.min || 30);
      if (pP2) pP2.g = gOf(pP2.food, (T.p - sumOthers(parts, [pP2], 'p')) / (pP2.food.p / 100));
      if (pC) pC.g = gOf(pC.food, (T.c - sumOthers(parts, [pC], 'c')) / (pC.food.c / 100));
      if (pOil) pOil.g = gOf(pOil.food, T.f - sumOthers(parts, [pOil, pF2], 'f'));
      if (pF2) pF2.g = gOf(pF2.food, (T.f - sumOthers(parts, [pF2], 'f')) / (pF2.food.f / 100));
    }
    // Quantità sotto la porzione minima = alimento non necessario in questo pasto
    [pC, pOil, pF2].forEach((pt) => { if (pt && pt.g < (pt.food.min || 5)) pt.g = 0; });
    if (pP2 && pP2.g < (pP2.food.min || 30)) pP2.g = 0;
    if (pP2 && pP2.g > 0) usedProt.add(P2food.name);
    return { name: meal.name, parts: parts.filter((pt) => pt.g > 0) };
  }

  // Aggiusta le quantità di carboidrati (o di grassi nella chetogenica) per centrare le kcal del giorno.
  function calibrate(ctx, meals) {
    const role = ctx.style.keto ? 'fat' : 'carb';
    const target = ctx.macros.kcal;
    for (let pass = 0; pass < 3; pass++) {
      meals.forEach(recalc);
      const diff = target - meals.reduce((s, m) => s + m.kcal, 0);
      if (Math.abs(diff) <= target * 0.015) return;
      let adj = meals.flatMap((m) => m.parts.filter((pt) => !pt.fixed && pt.food.role === role));
      if (!adj.length) adj = meals.flatMap((m) => m.parts.filter((pt) => !pt.fixed && pt.food.role !== 'prot'));
      if (!adj.length) return;
      const base = adj.reduce((s, pt) => s + (pt.food.kcal * pt.g) / 100, 0) || adj.length;
      adj.forEach((pt) => {
        const share = ((pt.food.kcal * pt.g) / 100 || 1) / base;
        const g = pt.g + (diff * share) / (pt.food.kcal / 100);
        const st = pt.food.step || 5;
        pt.g = clamp(roundTo(g, st), 0, Math.floor(((pt.food.max || 500) * ctx.capScale) / st) * st);
      });
    }
    meals.forEach(recalc);
  }

  const ROLE_ORDER = { prot: 0, carb: 1, fat: 2, veg: 3 };
  const itemText = ({ food, g }) => {
    let s = `${food.name} ${g} g`;
    if (food.pc) {
      const k = Math.round(g / food.pc[0]);
      if (k >= 1) s += ` (circa ${k} ${k === 1 ? food.pc[1] : food.pc[2]})`;
    }
    return s;
  };

  function buildDay(ctx, d) {
    const usedProt = new Set();
    const meals = MEAL_PLAN.map((m, i) => buildMeal(ctx, m, d, i, usedProt));
    calibrate(ctx, meals);
    meals.forEach((m) => {
      m.parts = m.parts.filter((pt) => pt.fixed || pt.food.role === 'prot' || pt.g >= (pt.food.min || 5));
      recalc(m);
    });
    const tot = { kcal: 0, p: 0, c: 0, f: 0 };
    meals.forEach((m) => { tot.kcal += m.kcal; tot.p += m.p; tot.c += m.c; tot.f += m.f; });
    return {
      day: d + 1,
      meals: meals.map((m) => ({
        name: m.name,
        kcal: Math.round(m.kcal), p: Math.round(m.p), c: Math.round(m.c), f: Math.round(m.f),
        items: [...m.parts].sort((a, b) => ROLE_ORDER[a.food.role] - ROLE_ORDER[b.food.role]).map(itemText)
      })),
      totals: { kcal: Math.round(tot.kcal), p: Math.round(tot.p), c: Math.round(tot.c), f: Math.round(tot.f) }
    };
  }

  /* =====================================================================
     PROFILO -> PIANO
     ===================================================================== */
  const normalize = (p) => {
    const goal = ['cut', 'bulk'].includes(p.goal) ? p.goal : 'maintain';
    const place = p.location === 'home' ? 'home' : 'gym';
    const styleKey = STYLES[p.dietStyle] ? p.dietStyle : 'mediterranean';
    return {
      goal,
      place,
      days: clamp(parseInt(p.workoutDays, 10) || 3, 1, 5),
      equipment: place === 'home' ? (p.equipment || []).filter((e) => HOME_TAGS.includes(e)) : [],
      styleKey,
      avoid: parseAvoid(p.intolerances),
      kcal: Math.max(1200, Number(p.targetKcal) || 2000),
      weight: Number(p.weight) || 70,
      kcalFloorApplied: !!p.kcalFloorApplied
    };
  };

  const buildNotes = (n, ctx) => {
    const notes = ['Le quantità si riferiscono all’alimento cotto o pronto, salvo dove indicato (es. fiocchi d’avena a crudo).'];
    if (n.avoid.includes('gluten')) notes.push('Per celiachia scegli solo prodotti certificati senza glutine (avena, pane, pasta, gallette) e verifica sempre l’etichetta.');
    if (n.avoid.includes('nickel')) notes.push('Il piano evita i principali alimenti ricchi di nichel (legumi, soia, quinoa, avena, frutta secca), ma il contenuto varia con terreno e cottura: confrontati con un professionista.');
    if (n.kcalFloorApplied) notes.push('Per sicurezza il fabbisogno non scende sotto 1.200 kcal (donne) o 1.500 kcal (uomini).');
    if (ctx.flags.noProtein) notes.push('Con questa combinazione di dieta e intolleranze il nostro catalogo non riesce a coprire il fabbisogno proteico: rivolgiti a un dietista per un piano personalizzato.');
    return notes;
  };

  function generate(profile) {
    const n = normalize(profile || {});
    const style = STYLES[n.styleKey];
    const allowed = FOODS.filter((f) => f.lvl >= style.lvl && !f.tags.some((t) => n.avoid.includes(t)));
    const ctx = {
      style,
      macros: dailyMacros(n.kcal, n.weight, n.goal, style),
      pool: {
        prot: allowed.filter((f) => f.role === 'prot'),
        carb: allowed.filter((f) => f.role === 'carb'),
        fat: allowed.filter((f) => f.role === 'fat')
      },
      capScale: Math.max(1, n.kcal / 2400),
      flags: { noProtein: false }
    };
    const diet = Array.from({ length: 7 }, (_, d) => buildDay(ctx, d));
    return {
      targets: { kcal: Math.round(n.kcal), p: Math.round(ctx.macros.p), c: Math.round(ctx.macros.c), f: Math.round(ctx.macros.f) },
      workout: buildWorkout(n),
      diet,
      notes: buildNotes(n, ctx),
      meta: { days: n.days, place: n.place, equipment: n.equipment, goal: n.goal }
    };
  }

  return { generate, EQUIPMENT, equipmentLabels, HOME_TAGS, GYM_TAGS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Planner;
