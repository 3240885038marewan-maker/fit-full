/* Fit&Full – dashboard.js
   Ordine di caricamento: supabase-client.js -> store.js -> planner.js -> reviews.js -> dashboard.js */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  const session = await FF.init();
  const profile = await FF.getProfile();

  /* ---------- identità ---------- */
  const email = session && session.user && session.user.email;
  const rawName = email ? email.split('@')[0] : 'Ospite';
  const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  ['user-name', 'user-name-display'].forEach((id) => { $(id).textContent = name; });
  $('welcome-user-name').textContent = name;
  ['header-avatar', 'sidebar-avatar-ring'].forEach((id) => { $(id).textContent = name.charAt(0).toUpperCase(); });

  if (!session) {
    $('guest-note').classList.remove('hidden');
    $('btn-logout-action').textContent = 'Torna alla home';
  }

  /* ---------- piano ---------- */
  let plan = null;
  if (profile) {
    try { plan = Planner.generate(profile); }
    catch (e) { console.error('[Planner]', e); }
  }
  if (!plan) {
    $('no-profile').classList.remove('hidden');
    document.querySelectorAll('[data-needs-profile]').forEach((n) => n.classList.add('hidden'));
  } else {
    renderKpis(profile, plan);
    renderWorkout(plan);
    renderDiet(plan);
  }

  /* ---------- peso, recensioni, logout ---------- */
  await initWeights();
  Reviews.mountDashboard({ session, defaultName: name });

  $('btn-logout-action').addEventListener('click', async () => {
    if (session && window.FFClient) { try { await window.FFClient.auth.signOut(); } catch (e) { console.warn(e); } }
    window.location.href = 'index.html';
  });

  /* ======================================================================
     KPI
     ====================================================================== */
  function renderKpis(p, pl) {
    $('dash-kcal').replaceChildren(
      document.createTextNode(pl.targets.kcal.toLocaleString('it-IT')),
      el('span', null, ' kcal/gg'));

    const goalMap = { cut: 'Definizione', maintain: 'Mantenimento e ricomposizione', bulk: 'Ipertrofia e massa' };
    $('dash-goal').textContent = goalMap[p.goal] || 'Mantenimento e ricomposizione';

    const days = pl.meta.days;
    const where = pl.meta.place === 'gym' ? 'Palestra' : 'Casa';
    const eq = Planner.equipmentLabels(pl.meta.equipment);
    const detail = pl.meta.place === 'gym'
      ? where
      : `${where} · ${eq.length ? eq.join(', ') : 'corpo libero'}`;
    $('dash-days').replaceChildren(
      document.createTextNode(`${days} ${days === 1 ? 'sessione' : 'sessioni'} / sett.`),
      el('span', 'stat-sub', detail));

    const t = pl.targets;
    $('dash-macros').replaceChildren(
      document.createTextNode(`P ${t.p} · C ${t.c} · G ${t.f}`),
      el('span', null, ' g'));
  }

  /* ======================================================================
     ALLENAMENTO
     ====================================================================== */
  function nextSessionIndex(pl) {
    const all = FF.getDoneAll();
    const dates = Object.keys(all).sort().reverse();
    for (const d of dates) {
      for (let i = pl.workout.length - 1; i >= 0; i--) {
        const s = pl.workout[i];
        if (s.exercises.length && s.exercises.every((e) => all[d].includes(e.id))) return (i + 1) % pl.workout.length;
      }
    }
    return 0;
  }

  function renderWorkout(pl) {
    const tabs = $('session-tabs');
    const list = $('workout-list');
    let current = nextSessionIndex(pl);

    const updateBadge = () => {
      const s = pl.workout[current];
      const done = FF.getDone();
      const n = s.exercises.filter((e) => done.includes(e.id)).length;
      $('session-badge').textContent = n === s.exercises.length && n > 0 ? 'Completata' : `${n}/${s.exercises.length}`;
    };

    const show = (i) => {
      current = i;
      const s = pl.workout[i];
      [...tabs.children].forEach((b, k) => {
        b.classList.toggle('active', k === i);
        b.setAttribute('aria-selected', String(k === i));
      });
      $('session-focus').textContent = `${s.title} — ${s.focus}`;
      $('session-note').textContent = s.note;
      const done = new Set(FF.getDone());
      list.replaceChildren(...s.exercises.map((ex) => {
        const row = el('div', 'workout-item');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.id = ex.id;
        cb.checked = done.has(ex.id);
        cb.addEventListener('change', () => { FF.toggleDone(ex.id); updateBadge(); });
        const label = el('label');
        label.htmlFor = ex.id;
        label.appendChild(el('strong', null, ex.name));
        label.appendChild(el('span', null, `${ex.scheme} · recupero ${ex.rest} s`));
        row.append(cb, label);
        return row;
      }));
      updateBadge();
    };

    pl.workout.forEach((s, i) => {
      const b = el('button', 'pill-tab', s.title);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => show(i));
      tabs.appendChild(b);
    });
    show(current);
  }

  /* ======================================================================
     ALIMENTAZIONE
     ====================================================================== */
  function renderDiet(pl) {
    const DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
    const tabs = $('diet-tabs');
    let idx = (new Date().getDay() + 6) % 7;          // lunedì = 0

    const stat = (label, val, target, unit) => {
      const s = el('span');
      s.append(`${label} `, el('b', null, `${val}`), ` / ${target} ${unit}`);
      return s;
    };

    const show = (i) => {
      idx = i;
      [...tabs.children].forEach((b, k) => {
        b.classList.toggle('active', k === i);
        b.setAttribute('aria-selected', String(k === i));
      });
      const day = pl.diet[i];
      const T = pl.targets;
      $('macro-bar').replaceChildren(
        stat('Kcal', day.totals.kcal, T.kcal, ''),
        stat('Proteine', day.totals.p, T.p, 'g'),
        stat('Carboidrati', day.totals.c, T.c, 'g'),
        stat('Grassi', day.totals.f, T.f, 'g'));

      $('meal-grid').replaceChildren(...day.meals.map((m) => {
        const tile = el('div', 'meal-tile');
        const info = el('div', 'meal-info');
        info.appendChild(el('h4', null, m.name));
        info.appendChild(el('span', 'meal-kcal', `${m.kcal} kcal · P ${m.p} · C ${m.c} · G ${m.f}`));
        const ul = el('ul', 'meal-items');
        m.items.forEach((t) => ul.appendChild(el('li', null, t)));
        info.appendChild(ul);
        tile.appendChild(info);
        return tile;
      }));
    };

    DAYS.forEach((d, i) => {
      const b = el('button', 'pill-tab', d);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => show(i));
      tabs.appendChild(b);
    });
    $('plan-notes').replaceChildren(...pl.notes.map((n) => el('li', null, n)));
    show(idx);
  }

  /* ======================================================================
     PESO
     ====================================================================== */
  async function initWeights() {
    const ACCENT = '#1ce9fb';
    const GRID = 'rgba(255, 255, 255, 0.10)';
    const TICK = 'rgba(255, 255, 255, 0.70)';

    const fmtDay = (iso) => {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
    };

    let chart = null;
    if (window.Chart) {
      chart = new Chart($('weightChart').getContext('2d'), {
        type: 'line',
        data: { labels: [], datasets: [{
          label: 'Peso corporeo (kg)', data: [],
          borderColor: ACCENT, backgroundColor: 'rgba(28, 233, 251, 0.12)',
          fill: true, tension: 0.3, borderWidth: 2.5, pointRadius: 4,
          pointBackgroundColor: ACCENT, pointBorderColor: '#031445'
        }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: false, grid: { color: GRID }, ticks: { color: TICK } },
            x: { grid: { display: false }, ticks: { color: TICK } }
          }
        }
      });
    } else {
      $('weight-summary').textContent = 'Impossibile caricare il grafico. Controlla la connessione e ricarica la pagina.';
    }

    const render = async () => {
      let log = await FF.getWeights();
      if (!log.length && profile && profile.weight) log = [{ date: FF.today(), kg: Number(profile.weight) }];
      if (chart) {
        chart.data.labels = log.map((w) => fmtDay(w.date));
        chart.data.datasets[0].data = log.map((w) => w.kg);
        chart.update();
      }
      if (log.length) {
        const last = log[log.length - 1];
        let txt = `Ultimo check-in: ${String(last.kg).replace('.', ',')} kg`;
        if (log.length > 1) {
          const diff = Math.round((last.kg - log[0].kg) * 10) / 10;
          txt += ` · Variazione dal primo check-in: ${diff > 0 ? '+' : ''}${String(diff).replace('.', ',')} kg`;
        }
        $('weight-summary').textContent = txt;
      } else if (chart) {
        $('weight-summary').textContent = 'Nessuna misurazione: registra il tuo primo peso.';
      }
    };

    /* modale check-in */
    const modal = $('weight-modal');
    const err = $('weight-error');
    const open = () => {
      err.classList.add('hidden');
      modal.classList.remove('hidden');
      document.body.classList.add('modal-open');
      $('input-new-weight').focus();
    };
    const close = () => { modal.classList.add('hidden'); document.body.classList.remove('modal-open'); };
    $('btn-add-weight').addEventListener('click', open);
    $('close-weight-modal').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });

    $('weight-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await FF.addWeight($('input-new-weight').value);
      if (!r.ok) { err.textContent = r.error; err.classList.remove('hidden'); return; }
      $('input-new-weight').value = '';
      close();
      await render();
    });

    await render();
  }
});
