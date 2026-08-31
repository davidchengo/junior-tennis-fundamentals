(async function () {
  const app = window.ProgressApp;
  const user = await app.requireUser(); if (!user) return;
  document.getElementById('signOut').addEventListener('click', async () => { await app.client.auth.signOut(); location.replace('progress-login.html'); });
  try {
    const role = await app.getRole();
    if (!role) throw new Error('This account has not been assigned a coach or parent role.');
    document.getElementById('roleLabel').textContent = role === 'coach' ? 'Coach dashboard' : 'Parent view · Read only';
    document.getElementById('pageTitle').textContent = role === 'coach' ? 'Your Players' : 'Your Player Progress';
    document.getElementById('pageIntro').textContent = role === 'coach' ? 'Manage profiles, training reports, assessments, and goals.' : 'View reports, goals, assessments, and progress for your assigned child or children.';
    if (role === 'coach') setupCoachForm(user);
    const { data, error } = await app.client.from('players').select('*').order('last_name').order('first_name');
    if (error) throw error;
    renderPlayers(data || [], role);
  } catch (error) { app.setStatus(error.message, 'error'); }

  function renderPlayers(players, role) {
    const grid = document.getElementById('playerGrid');
    if (!players.length) { grid.innerHTML = `<section class="panel"><h2>No assigned players yet</h2><p class="muted">${role === 'coach' ? 'Add your first player to begin.' : 'Ask the coach to link this email to a player.'}</p></section>`; return; }
    grid.innerHTML = players.map(player => {
      const age = app.ageFromDob(player.date_of_birth);
      return `<a class="player-card" href="progress-player.html?id=${encodeURIComponent(player.id)}"><span class="stage">${app.escapeHtml(player.current_ball_stage)} ball</span><h2>${app.escapeHtml(player.first_name)} ${app.escapeHtml(player.last_name)}</h2><p class="muted">${age === null ? 'Age not set' : `Age ${age}`} · ${app.escapeHtml(player.current_development_stage || 'Development stage not set')}</p><span class="eyebrow">Open profile →</span></a>`;
    }).join('');
  }

  function setupCoachForm(user) {
    const modal = document.getElementById('playerModal'); const form = document.getElementById('playerForm');
    document.getElementById('addPlayerButton').classList.remove('hidden');
    document.getElementById('addPlayerButton').addEventListener('click', () => modal.classList.remove('hidden'));
    document.querySelector('[data-close-modal]').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', event => { if (event.target === modal) modal.classList.add('hidden'); });
    form.addEventListener('submit', async event => {
      event.preventDefault(); const status = document.querySelector('[data-form-status]'); status.textContent = 'Saving…';
      const raw = Object.fromEntries(new FormData(form));
      const record = { first_name: raw.first_name.trim(), last_name: raw.last_name.trim(), date_of_birth: raw.date_of_birth || null, tennis_start_date: raw.tennis_start_date || null, current_ball_stage: raw.current_ball_stage, rally_school_start_date: raw.rally_school_start_date || null, tennis_experience_note: raw.tennis_experience_note || null, current_focus_areas: app.splitList(raw.current_focus_areas), current_development_stage: raw.current_development_stage || null, target_stage: raw.target_stage || null };
      const { data: playerId, error } = await app.client.rpc('create_player', { p_player: record });
      if (error) { status.textContent = error.message; status.className = 'status-message error'; return; }
      location.href = `progress-player.html?id=${encodeURIComponent(playerId)}`;
    });
  }
})();
