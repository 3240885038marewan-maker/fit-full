/* Fit&Full – supabase-client.js
   Configurazione unica del client Supabase (prima era duplicata in più file).
   La chiave "publishable" è pensata per stare nel browser: la sicurezza dei dati
   è garantita dalle regole Row Level Security (vedi supabase-setup.sql). */
(function () {
  'use strict';
  const SUPABASE_URL = 'https://zwujgvmtoivruvtnfzth.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_NCckpUZ7nWYRHGdGue08tQ_nDtLjrDD';

  window.FFConfig = { url: SUPABASE_URL, key: SUPABASE_KEY };
  window.FFClient = (window.supabase && typeof window.supabase.createClient === 'function')
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;
})();
