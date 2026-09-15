(async function () {
  const app = window.ProgressApp;
  if (!app.client) { document.body.classList.add('config-missing'); return; }
  const requestForm = document.getElementById('requestResetForm');
  const changeForm = document.getElementById('changePasswordForm');
  const title = document.getElementById('passwordTitle');
  const intro = document.getElementById('passwordIntro');

  function showChangePassword() {
    title.textContent = 'Choose a new password';
    intro.textContent = 'Use at least 6 characters, then sign in again with your new password.';
    requestForm.classList.add('hidden');
    changeForm.classList.remove('hidden');
  }

  const { data: { session } } = await app.client.auth.getSession();
  if (session) showChangePassword();
  app.client.auth.onAuthStateChange((event, nextSession) => {
    if (event === 'PASSWORD_RECOVERY' || nextSession) showChangePassword();
  });

  requestForm.addEventListener('submit', async event => {
    event.preventDefault();
    const email = new FormData(requestForm).get('email');
    app.setStatus('Sending reset link…');
    const { error } = await app.client.auth.resetPasswordForEmail(email, {
      redirectTo: new URL('progress-password.html', location.href).href
    });
    app.setStatus(error ? error.message : 'If this email is authorized, a reset link is on its way.', error ? 'error' : 'success');
  });

  changeForm.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(changeForm);
    const password = values.get('password');
    if (password !== values.get('confirmPassword')) {
      app.setStatus('The two passwords do not match.', 'error');
      return;
    }
    const { error } = await app.client.auth.updateUser({ password });
    if (error) { app.setStatus(error.message, 'error'); return; }
    app.setStatus('Password updated. You can now sign in with your new password.', 'success');
    await app.client.auth.signOut();
    setTimeout(() => location.replace('progress-login.html'), 900);
  });
})();
