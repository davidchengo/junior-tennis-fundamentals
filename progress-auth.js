(async function () {
  const app = window.ProgressApp;
  if (!app.client) { document.body.classList.add('config-missing'); return; }
  const next = new URLSearchParams(location.search).get('next') || 'progress.html';
  const safeNext = /^(progress|progress-player|progress-report)\.html(?:\?|$)/.test(next) ? next : 'progress.html';
  const { data: { user } } = await app.client.auth.getUser();
  if (user) { location.replace(safeNext); return; }

  const form = document.getElementById('loginForm');
  form.addEventListener('submit', async event => {
    event.preventDefault(); app.setStatus('Signing in…');
    const values = new FormData(form);
    const { error } = await app.client.auth.signInWithPassword({ email: values.get('email'), password: values.get('password') });
    if (error) { app.setStatus(error.message, 'error'); return; }
    location.replace(safeNext);
  });
  document.getElementById('googleSignIn').addEventListener('click', async () => {
    app.setStatus('Opening Google sign-in…');
    const redirectTo = new URL(`progress-login.html?next=${encodeURIComponent(safeNext)}`, location.href).href;
    const { error } = await app.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) app.setStatus(error.message, 'error');
  });
})();
