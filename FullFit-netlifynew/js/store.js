/* Fit&Full – store.js
   Unico punto di accesso ai dati dell'utente.
   - Con account: profilo nei metadati di Supabase Auth, pesi nella tabella weight_logs.
   - Senza account (ospite) o se la tabella non esiste ancora: tutto resta su questo dispositivo.
   I dati locali sono separati per utente, così due persone sullo stesso browser non si mescolano. */
const FF = (() => {
  'use strict';

  const K = {
    profile: 'fitandfull_user_profile',
    weights: 'fitandfull_weight_log',
    done: 'fitandfull_workout_done'
  };

  const db = () => window.FFClient;
  let session = null;
  let uid = null;

  /* ---------- localStorage sicuro ---------- */
  const read = (k, fallback) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  };
  const write = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  };
  const remove = (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignora */ } };
  const scoped = (base) => (uid ? `${base}:${uid}` : base);   // ospite = chiave base

  const pad = (n) => String(n).padStart(2, '0');
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;   // data locale, non UTC
  };
  const byDate = (a, b) => a.date.localeCompare(b.date);

  /* ---------- sessione ---------- */
  async function init() {
    session = null; uid = null;
    try {
      if (db()) {
        const { data } = await db().auth.getSession();
        session = (data && data.session) || null;
      }
    } catch (e) { console.warn('[FF] sessione non disponibile:', e.message || e); }
    uid = session ? session.user.id : null;
    if (uid) adoptGuestData();
    return session;
  }

  // Dopo registrazione/accesso, i dati creati da ospite passano al nuovo account.
  function adoptGuestData() {
    [K.profile, K.weights, K.done].forEach((base) => {
      const guest = read(base, null);
      if (guest != null && read(scoped(base), null) == null) {
        write(scoped(base), guest);
        remove(base);
      }
    });
  }

  const getSession = () => session;

  // Verifica rapida che il servizio di accesso risponda (utile per spiegare gli errori "Failed to fetch").
  async function ping(timeoutMs = 6000) {
    const cfg = window.FFConfig;
    if (!cfg || !db()) return false;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(`${cfg.url}/auth/v1/health`, { headers: { apikey: cfg.key }, signal: ctl.signal });
      return res.ok;
    } catch (e) {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- profilo ---------- */
  async function pushProfile(profile) {
    try { await db().auth.updateUser({ data: { profile } }); }
    catch (e) { console.warn('[FF] profilo non sincronizzato:', e.message || e); }
  }

  async function getProfile() {
    const meta = session && session.user && session.user.user_metadata && session.user.user_metadata.profile;
    if (meta && meta.goal) { write(scoped(K.profile), meta); return meta; }
    const mine = read(scoped(K.profile), null);
    if (mine && mine.goal) {
      if (session) pushProfile(mine);          // account creato prima degli ultimi aggiornamenti
      return mine;
    }
    return null;
  }

  async function saveProfile(profile) {
    write(scoped(K.profile), profile);
    if (session) await pushProfile(profile);
  }

  /* ---------- peso ---------- */
  const readLocalWeights = () => read(scoped(K.weights), []);

  async function getWeights() {
    const local = readLocalWeights();
    if (!session) return local;
    try {
      const { data, error } = await db().from('weight_logs')
        .select('logged_on,weight_kg').eq('user_id', uid).order('logged_on', { ascending: true });
      if (error) throw error;
      const cloud = (data || []).map((r) => ({ date: r.logged_on, kg: Number(r.weight_kg) }));
      const have = new Set(cloud.map((w) => w.date));
      const missing = local.filter((w) => !have.has(w.date));
      if (missing.length) {
        const { error: upErr } = await db().from('weight_logs').upsert(
          missing.map((w) => ({ user_id: uid, logged_on: w.date, weight_kg: w.kg })),
          { onConflict: 'user_id,logged_on' });
        if (upErr) throw upErr;
      }
      const merged = [...cloud, ...missing].sort(byDate);
      write(scoped(K.weights), merged);
      return merged;
    } catch (e) {
      console.warn('[FF] pesi: uso la copia locale.', e.message || e);
      return local;
    }
  }

  async function addWeight(value, date = today()) {
    const kg = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(kg) || kg < 30 || kg > 300) {
      return { ok: false, error: 'Inserisci un peso valido (tra 30 e 300 kg).' };
    }
    const rounded = Math.round(kg * 10) / 10;
    const log = readLocalWeights().filter((w) => w.date !== date);     // un check-in al giorno
    log.push({ date, kg: rounded });
    log.sort(byDate);
    write(scoped(K.weights), log);

    let cloud = false;
    if (session) {
      try {
        const { error } = await db().from('weight_logs').upsert(
          { user_id: uid, logged_on: date, weight_kg: rounded }, { onConflict: 'user_id,logged_on' });
        cloud = !error;
        if (error) console.warn('[FF] peso non sincronizzato:', error.message);
      } catch (e) { console.warn('[FF] peso non sincronizzato:', e.message || e); }
    }
    return { ok: true, cloud, log };
  }

  /* ---------- checklist allenamento: { 'AAAA-MM-GG': ['d1e1', ...] } ---------- */
  const getDoneAll = () => read(scoped(K.done), {});
  const getDone = (date = today()) => getDoneAll()[date] || [];
  function toggleDone(id, date = today()) {
    const all = getDoneAll();
    const set = new Set(all[date] || []);
    if (set.has(id)) set.delete(id); else set.add(id);
    all[date] = [...set];
    write(scoped(K.done), all);
    return all[date];
  }

  return { init, getSession, ping, getProfile, saveProfile, getWeights, addWeight, getDone, getDoneAll, toggleDone, today };
})();
