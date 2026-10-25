/* Fit&Full – script.js (pagina iniziale)
   Ordine di caricamento: supabase-js (CDN) -> js/supabase-client.js -> js/store.js -> js/reviews.js -> script.js */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const db = window.FFClient;

  /* ---------- elementi ---------- */
  const calcForm = $('calculator-form');
  const profilingModal = $('profiling-modal');
  const profilingForm = $('profiling-form');
  const authModal = $('auth-modal');
  const authForm = $('auth-form');
  const authTitle = $('auth-title');
  const authSubtitle = $('auth-subtitle');
  const authSubmit = $('btn-auth-submit');
  const authToggle = $('toggle-auth-mode');
  const authMessage = $('auth-message');
  const authContinue = $('auth-continue');
  const navLogin = $('btn-nav-login');
  const equipmentGroup = $('equipment-group');
  const serviceBanner = $('service-banner');

  let session = await FF.init();
  let isSignUp = true;
  const userProfile = {};

  /* ---------- modali (scorrevoli, con blocco dello scroll della pagina) ---------- */
  const openModal = (m) => {
    m.classList.remove('hidden');
    document.body.classList.add('modal-open');
    m.scrollTop = 0;
    const card = m.querySelector('.modal-card');
    if (card) { card.scrollTop = 0; card.focus({ preventScroll: true }); }
  };
  const closeModal = (m) => {
    m.classList.add('hidden');
    if (!document.querySelector('.modal-overlay:not(.hidden)')) document.body.classList.remove('modal-open');
  };
  document.querySelectorAll('.modal-overlay').forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target === m) closeModal(m); });
  });
  document.querySelectorAll('.modal-close').forEach((b) => {
    b.addEventListener('click', () => closeModal(b.closest('.modal-overlay')));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = document.querySelector('.modal-overlay:not(.hidden)');
    if (open) closeModal(open);
  });

  /* ---------- messaggi del modulo di accesso ---------- */
  const showMessage = (type, text) => {
    authMessage.className = `auth-message ${type}`;
    authMessage.textContent = text;
    authMessage.classList.remove('hidden');
  };
  const clearMessage = () => { authMessage.classList.add('hidden'); authContinue.classList.add('hidden'); };

  const isNetworkError = (err) =>
    !!err && (err.name === 'TypeError' || /failed to fetch|networkerror|load failed|network request failed/i.test(err.message || ''));

  const friendlyError = (err) => {
    const msg = (err && err.message) || '';
    if (isNetworkError(err)) {
      return 'Impossibile contattare il server di accesso. Controlla la connessione e riprova: se il problema continua il servizio potrebbe essere temporaneamente non disponibile. Nel frattempo puoi usare il tuo piano senza account.';
    }
    if (/invalid login credentials/i.test(msg)) return 'Email o password non corretti.';
    if (/email not confirmed/i.test(msg)) return 'Devi prima confermare l’email: controlla la tua casella di posta.';
    if (/already registered|already been registered/i.test(msg)) return 'Questa email è già registrata: usa “Accedi”.';
    if (/password/i.test(msg) && /6|short|weak/i.test(msg)) return 'La password deve avere almeno 6 caratteri.';
    if (/rate limit|too many/i.test(msg)) return 'Troppi tentativi ravvicinati. Attendi qualche minuto e riprova.';
    return msg || 'Errore durante l’autenticazione. Riprova.';
  };

  const setAuthMode = (signUp) => {
    isSignUp = signUp;
    clearMessage();
    if (signUp) {
      authTitle.textContent = 'Salva il tuo piano online';
      authSubtitle.textContent = 'Crea un account gratuito per ritrovare piano e progressi da qualsiasi dispositivo.';
      authSubmit.textContent = 'Crea account e salva il piano';
      authToggle.textContent = 'Hai già un account? Accedi';
    } else {
      authTitle.textContent = 'Bentornato in Fit&Full';
      authSubtitle.textContent = 'Accedi con le tue credenziali per aprire la tua dashboard.';
      authSubmit.textContent = 'Accedi alla dashboard';
      authToggle.textContent = 'Non hai un account? Registrati';
    }
  };

  /* ---------- navbar ---------- */
  if (session) {
    navLogin.textContent = 'La mia dashboard';
    navLogin.addEventListener('click', () => { window.location.href = 'dashboard.html'; });
  } else {
    navLogin.addEventListener('click', () => { setAuthMode(false); openModal(authModal); });
    if (new URLSearchParams(window.location.search).get('login') === '1') { setAuthMode(false); openModal(authModal); }
  }

  /* ---------- stato del servizio ---------- */
  FF.ping().then((ok) => {
    if (!ok && serviceBanner) serviceBanner.classList.remove('hidden');
    if (!ok) console.warn('[Fit&Full] Il servizio Supabase non risponde: l’accesso online non è disponibile.');
  });

  /* ---------- STEP 1: dati biometrici ---------- */
  calcForm.addEventListener('submit', (e) => {
    e.preventDefault();
    userProfile.gender = $('gender').value;
    userProfile.age = parseFloat($('age').value);
    userProfile.weight = parseFloat($('weight').value);
    userProfile.height = parseFloat($('height').value);
    userProfile.activity = parseFloat($('activity').value);
    userProfile.goal = $('goal').value;
    openModal(profilingModal);
  });

  /* ---------- STEP 2: preferenze. Se ti alleni a casa, chiede gli attrezzi ---------- */
  const syncEquipment = () => {
    const home = (document.querySelector('input[name="location"]:checked') || {}).value === 'home';
    equipmentGroup.classList.toggle('hidden', !home);
  };
  document.querySelectorAll('input[name="location"]').forEach((r) => r.addEventListener('change', syncEquipment));
  syncEquipment();

  const calcTargetKcal = (p) => {
    let bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age;          // Mifflin-St Jeor
    bmr += p.gender === 'M' ? 5 : -161;
    let kcal = bmr * p.activity;                                      // TDEE
    if (p.goal === 'cut') kcal *= 0.85;
    else if (p.goal === 'bulk') kcal *= 1.10;
    const floor = p.gender === 'F' ? 1200 : 1500;                    // soglia minima di sicurezza
    p.kcalFloorApplied = kcal < floor;
    return Math.round(Math.max(kcal, floor));
  };

  profilingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = profilingForm.querySelector('button[type="submit"]');
    btn.disabled = true;

    userProfile.location = (document.querySelector('input[name="location"]:checked') || {}).value || 'gym';
    userProfile.equipment = userProfile.location === 'home'
      ? [...document.querySelectorAll('input[name="equipment"]:checked')].map((i) => i.value)
      : [];
    userProfile.workoutDays = $('workout-days').value;
    userProfile.dietStyle = $('diet-style').value;
    userProfile.intolerances = $('intolerances-select').value;
    userProfile.targetKcal = calcTargetKcal(userProfile);

    await FF.saveProfile(userProfile);          // locale (e online se già connesso)
    await FF.addWeight(userProfile.weight);     // primo check-in del peso

    closeModal(profilingModal);
    btn.disabled = false;

    if (session) { window.location.href = 'dashboard.html'; return; }
    setAuthMode(true);
    openModal(authModal);
  });

  /* ---------- STEP 3: account ---------- */
  authToggle.addEventListener('click', (e) => { e.preventDefault(); setAuthMode(!isSignUp); });
  authContinue.addEventListener('click', () => { window.location.href = 'dashboard.html'; });
  $('btn-skip-auth').addEventListener('click', (e) => { e.preventDefault(); window.location.href = 'dashboard.html'; });

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();
    const email = $('auth-email').value.trim();
    const password = $('auth-password').value;
    authSubmit.disabled = true;
    const label = authSubmit.textContent;
    authSubmit.textContent = 'Un momento…';

    try {
      if (!db) throw new TypeError('Failed to fetch');

      if (isSignUp) {
        const options = userProfile.goal ? { data: { profile: userProfile } } : undefined;
        const { data, error } = await db.auth.signUp({ email, password, options });
        if (error) throw error;
        const user = data.user;
        if (user && Array.isArray(user.identities) && user.identities.length === 0) {
          throw new Error('User already registered');
        }
        if (data.session) {
          session = await FF.init();                       // i dati creati come ospite passano all'account
          if (userProfile.gender) {
            const { error: dbErr } = await db.from('user_profiles').insert([{
              id: user.id, gender: userProfile.gender, age: userProfile.age,
              weight: userProfile.weight, height: userProfile.height, activity: userProfile.activity
            }]);
            if (dbErr) console.warn('[user_profiles]', dbErr.message);
          }
          window.location.href = 'dashboard.html';
          return;
        }
        showMessage('info', 'Account creato. Ti abbiamo inviato un’email di conferma: dopo averla confermata, accedi per ritrovare il piano da qualsiasi dispositivo.');
        authContinue.classList.remove('hidden');
      } else {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        session = await FF.init();
        if (userProfile.goal) await FF.saveProfile(userProfile);   // se hai appena rifatto la configurazione
        window.location.href = 'dashboard.html';
        return;
      }
    } catch (err) {
      showMessage('error', friendlyError(err));
      if (isNetworkError(err)) authContinue.classList.remove('hidden');
    } finally {
      authSubmit.disabled = false;
      authSubmit.textContent = label;
    }
  });

  /* ---------- recensioni ---------- */
  Reviews.mountPublic({ list: 'reviews-list', summary: 'reviews-summary' });
  $('btn-write-review').addEventListener('click', () => {
    if (session) { window.location.href = 'dashboard.html#recensione'; return; }
    setAuthMode(false);
    openModal(authModal);
  });
});
