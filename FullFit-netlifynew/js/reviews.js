/* Fit&Full – reviews.js
   Recensioni reali degli utenti, salvate su Supabase (tabella `reviews`, vedi supabase-setup.sql).
   - Pagina iniziale: elenco pubblico delle recensioni visibili.
   - Dashboard: l'utente con account scrive (una sola recensione) o elimina la propria.
   Nessuna recensione è inventata: finché non ce ne sono, si mostra uno stato vuoto onesto.
   Tutto il testo degli utenti è inserito con textContent, mai come HTML. */
const Reviews = (() => {
  'use strict';

  const db = () => window.FFClient;
  const MIN_BODY = 10;
  const MAX_BODY = 600;

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  const starsEl = (n) => {
    const wrap = el('span', 'stars');
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', `${n} stelle su 5`);
    for (let i = 1; i <= 5; i++) wrap.appendChild(el('span', i <= n ? '' : 'off', '★'));
    return wrap;
  };

  const fmtMonth = (iso) => new Date(iso).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const fmtAvg = (v) => v.toFixed(1).replace('.', ',');

  const tableMissing = (err) => /PGRST205|schema cache|does not exist|42P01/i.test(`${err.code || ''} ${err.message || ''}`);

  /* ---------- lettura ---------- */
  async function loadPublic(limit = 9) {
    if (!db()) return { ok: false, rows: [], count: 0, avg: 0 };
    try {
      const [list, ratings] = await Promise.all([
        db().from('reviews').select('id,display_name,rating,body,created_at')
          .eq('visible', true).order('created_at', { ascending: false }).limit(limit),
        db().from('reviews').select('rating').eq('visible', true)
      ]);
      if (list.error) throw list.error;
      if (ratings.error) throw ratings.error;
      const all = (ratings.data || []).map((r) => r.rating);
      const avg = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0;
      return { ok: true, rows: list.data || [], count: all.length, avg };
    } catch (e) {
      console.warn('[reviews]', e.message || e);
      return { ok: false, rows: [], count: 0, avg: 0 };
    }
  }

  /* ---------- pagina iniziale ---------- */
  async function mountPublic(ids) {
    const list = document.getElementById(ids.list);
    const summary = document.getElementById(ids.summary);
    if (!list) return;
    const { ok, rows, count, avg } = await loadPublic();

    list.replaceChildren();
    if (summary) summary.replaceChildren();

    if (!rows.length) {
      list.className = '';
      const empty = el('div', 'reviews-empty');
      empty.appendChild(el('strong', null, ok ? 'Ancora nessuna recensione.' : 'Le recensioni non sono disponibili al momento.'));
      empty.appendChild(el('p', null, ok
        ? 'Fit&Full è appena nato: sii tra i primi a raccontare la tua esperienza.'
        : 'Riprova tra qualche minuto.'));
      list.appendChild(empty);
      return;
    }

    list.className = 'reviews-grid';
    rows.forEach((r) => {
      const card = el('article', 'review-card');
      card.appendChild(starsEl(r.rating));
      card.appendChild(el('p', null, r.body));
      const meta = el('div', 'review-meta');
      meta.appendChild(el('span', 'review-author', r.display_name));
      meta.appendChild(el('span', null, fmtMonth(r.created_at)));
      card.appendChild(meta);
      list.appendChild(card);
    });

    if (summary) {
      summary.appendChild(starsEl(Math.round(avg)));
      summary.appendChild(el('span', null, `${fmtAvg(avg)} / 5 · ${count} ${count === 1 ? 'recensione' : 'recensioni'}`));
    }
  }

  /* ---------- dashboard ---------- */
  function mountDashboard({ session, defaultName }) {
    const $ = (id) => document.getElementById(id);
    const needLogin = $('review-login-needed');
    const mine = $('review-mine');
    const form = $('review-form');
    const status = $('review-status');
    if (!form) return;

    const say = (type, text) => {
      status.className = `auth-message ${type}`;
      status.textContent = text;
      status.classList.remove('hidden');
    };
    const clearSay = () => status.classList.add('hidden');

    if (!session || !db()) {
      needLogin.classList.remove('hidden');
      return;
    }

    let rating = 0;
    const starBtns = [...form.querySelectorAll('.star-btn')];
    const paintStars = () => starBtns.forEach((b) => {
      const on = Number(b.dataset.v) <= rating;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(Number(b.dataset.v) === rating));
    });
    starBtns.forEach((b) => b.addEventListener('click', () => { rating = Number(b.dataset.v); paintStars(); }));

    const nameInput = $('review-name');
    const bodyInput = $('review-body');
    const counter = $('review-count');
    nameInput.value = defaultName || '';
    bodyInput.maxLength = MAX_BODY;
    bodyInput.addEventListener('input', () => { counter.textContent = `${bodyInput.value.length} / ${MAX_BODY}`; });

    const showMine = (row) => {
      mine.replaceChildren();
      mine.appendChild(starsEl(row.rating));
      mine.appendChild(el('p', 'review-mine-body', row.body));
      const meta = el('div', 'review-meta');
      meta.appendChild(el('span', null, `Pubblicata come ${row.display_name}`));
      const del = el('button', 'btn-secondary-sm', 'Elimina la mia recensione');
      del.type = 'button';
      del.addEventListener('click', async () => {
        if (!window.confirm('Vuoi eliminare la tua recensione?')) return;
        const { error } = await db().from('reviews').delete().eq('id', row.id);
        if (error) { say('error', 'Non è stato possibile eliminare la recensione. Riprova.'); return; }
        mine.classList.add('hidden');
        form.classList.remove('hidden');
        say('info', 'Recensione eliminata.');
      });
      meta.appendChild(del);
      mine.appendChild(meta);
      mine.classList.remove('hidden');
      form.classList.add('hidden');
    };

    (async () => {
      const { data, error } = await db().from('reviews').select('*').eq('user_id', session.user.id).maybeSingle();
      if (error && !tableMissing(error)) console.warn('[reviews]', error.message);
      if (data) showMine(data); else form.classList.remove('hidden');
    })();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearSay();
      const name = nameInput.value.trim();
      const body = bodyInput.value.trim();
      if (!rating) return say('error', 'Scegli un voto da 1 a 5 stelle.');
      if (name.length < 2 || name.length > 40) return say('error', 'Il nome pubblicato deve avere tra 2 e 40 caratteri.');
      if (body.length < MIN_BODY) return say('error', `Scrivi almeno ${MIN_BODY} caratteri.`);

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      const { data, error } = await db().from('reviews')
        .insert({ user_id: session.user.id, display_name: name, rating, body })
        .select().single();
      btn.disabled = false;

      if (error) {
        if (error.code === '23505') return say('error', 'Hai già pubblicato una recensione.');
        if (tableMissing(error)) return say('error', 'Le recensioni non sono ancora attive. Riprova più tardi.');
        return say('error', 'Non è stato possibile pubblicare la recensione. Riprova.');
      }
      showMine(data);
      say('info', 'Grazie! La tua recensione è stata pubblicata.');
    });
  }

  return { mountPublic, mountDashboard };
})();
