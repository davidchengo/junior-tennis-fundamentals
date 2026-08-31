(async function () {
  const app = window.ProgressApp;
  const playerId = new URLSearchParams(location.search).get('id');
  if (!playerId) { app.setStatus('Missing player ID.', 'error'); return; }
  const user = await app.requireUser(); if (!user) return;
  document.getElementById('signOut').addEventListener('click', async () => { await app.client.auth.signOut(); location.replace('progress-login.html'); });
  let role; let player; let sessions = []; let assessments = []; let goals = []; let reports = [];
  try {
    role = await app.getRole();
    const [playerResult, sessionResult, assessmentResult, goalResult, reportResult] = await Promise.all([
      app.client.from('players').select('*').eq('id', playerId).single(),
      app.client.from('training_sessions').select('*').eq('player_id', playerId).order('session_started_at', { ascending:false }),
      app.client.from('assessments').select('*').eq('player_id', playerId).order('evaluated_at', { ascending:false }),
      app.client.from('goals').select('*').eq('player_id', playerId).order('created_at', { ascending:false }),
      app.client.from('training_report_snapshots').select('id,session_id,published_at,parent_summary,session_snapshot').eq('player_id', playerId).order('published_at', { ascending:false })
    ]);
    if (playerResult.error) throw playerResult.error;
    for (const result of [sessionResult, assessmentResult, goalResult, reportResult]) if (result.error) throw result.error;
    player = playerResult.data; sessions = sessionResult.data || []; assessments = assessmentResult.data || []; goals = goalResult.data || []; reports = reportResult.data || [];
    if (role === 'coach') {
      document.getElementById('coachActions').classList.remove('hidden');
      setupCoachForms();
      const ids = sessions.map(item => item.id);
      if (ids.length) {
        const { data } = await app.client.from('session_private_notes').select('session_id,note').in('session_id', ids);
        const notes = Object.fromEntries((data || []).map(item => [item.session_id, item.note]));
        sessions = sessions.map(item => ({ ...item, private_note: notes[item.id] }));
      }
    }
    render();
  } catch (error) { app.setStatus(error.message === 'JSON object requested, multiple (or no) rows returned' ? 'You are not authorized to view this player.' : error.message, 'error'); }

  function render() {
    const age = app.ageFromDob(player.date_of_birth); const totalMinutes = sessions.reduce((sum, session) => sum + session.duration_minutes, 0);
    document.title = `${player.first_name} ${player.last_name} | Rally School`;
    document.getElementById('playerName').textContent = `${player.first_name} ${player.last_name}`;
    document.getElementById('playerMeta').textContent = `${age === null ? 'Age not set' : `Age ${age}`} · ${title(player.current_ball_stage)} Ball · ${player.current_development_stage || 'Stage not set'} → ${player.target_stage || 'Target not set'}`;
    document.getElementById('profileStats').innerHTML = `<article class="panel stat-card"><span>Sessions with Rally School</span><strong>${sessions.length}</strong><small class="muted">Since ${app.formatDate(player.rally_school_start_date)}</small></article><article class="panel stat-card"><span>Total training time</span><strong>${formatDuration(totalMinutes)}</strong><small class="muted">Derived from session records</small></article><article class="panel stat-card"><span>Current focus</span><div class="tag-list" style="margin-top:12px">${tags(player.current_focus_areas)}</div></article>`;
    renderReports(); renderGoals(); renderAssessments(); renderChart();
  }
  function renderReports() {
    document.getElementById('reports').innerHTML = reports.length ? reports.map((report,index) => {
      const session = sessions.find(item => item.id === report.session_id); const historicalSession = report.session_snapshot || {};
      return `<article class="list-item"><header><div><strong>${index === 0 ? 'Latest report · ' : ''}${app.formatDateTime(report.published_at)}</strong><p class="muted">${historicalSession.duration_minutes || 0} minutes · trained ${app.formatDateTime(historicalSession.session_started_at)}</p></div><a class="button secondary" href="progress-report.html?id=${encodeURIComponent(report.id)}">Open report</a></header><p>${app.escapeHtml(report.parent_summary)}</p>${role === 'coach' && session && session.private_note ? `<p><strong>Private coach note:</strong> ${app.escapeHtml(session.private_note)}</p>` : ''}</article>`;
    }).join('') : '<p class="muted">No published reports yet.</p>';
  }
  function renderGoals() {
    document.getElementById('goals').innerHTML = goals.length ? goals.map(goal => { const progress = goalProgress(goal); return `<article class="list-item"><header><strong>${app.escapeHtml(goal.skill)}</strong><span class="tag">${app.escapeHtml(goal.status)}</span></header><p class="muted">${app.escapeHtml(goal.metric)}</p><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div><p>${goal.baseline_value} baseline → <strong>${goal.current_value}</strong> current → ${goal.target_value} target</p><small class="muted">${progress}% complete · target ${app.formatDate(goal.target_date)}</small>${role === 'coach' ? `<div style="margin-top:10px"><button class="ghost-button" data-edit-goal="${goal.id}">Update goal</button></div>` : ''}</article>`; }).join('') : '<p class="muted">No goals yet.</p>';
    document.querySelectorAll('[data-edit-goal]').forEach(button => button.addEventListener('click', () => editGoal(button.dataset.editGoal)));
  }
  function renderAssessments() {
    const corrections = new Map(assessments.filter(item => item.supersedes_assessment_id).map(item => [item.supersedes_assessment_id, item]));
    document.getElementById('assessments').innerHTML = assessments.length ? assessments.map(item => { const scores = scorePairs(item); const objectives = objectivePairs(item); const replacement = corrections.get(item.id); return `<article class="list-item"><header><strong>${app.escapeHtml(item.skill)}</strong><div class="tag-list"><span class="tag">${item.difficulty_context} · ${contextName(item.difficulty_context)}</span>${item.supersedes_assessment_id ? `<span class="tag">${app.escapeHtml(item.correction_kind)} of prior assessment</span>` : ''}${replacement ? '<span class="tag">Superseded—retained in history</span>' : ''}</div></header><p class="muted">${app.formatDateTime(item.evaluated_at)}</p>${item.correction_reason ? `<p><strong>Correction reason:</strong> ${app.escapeHtml(item.correction_reason)}</p>` : ''}${scores.length ? `<div class="tag-list">${scores.map(([name,value]) => `<span class="tag">${name}: ${value}/3</span>`).join('')}</div>` : ''}${objectives.length ? `<p>${objectives.map(([name,value]) => `${name}: <strong>${value}</strong>`).join(' · ')}</p>` : ''}${item.note ? `<p>${app.escapeHtml(item.note)}</p>` : ''}</article>`; }).join('') : '<p class="muted">No assessments yet.</p>';
  }
  function renderChart() {
    const supersededIds = new Set(assessments.map(item => item.supersedes_assessment_id).filter(Boolean));
    const chronological = [...assessments].filter(item => !supersededIds.has(item.id)).reverse().map(item => ({ item, average: averageScore(item) })).filter(point => point.average !== null);
    document.getElementById('assessmentChart').innerHTML = chronological.length ? `<div class="chart" aria-label="Rubric score history">${chronological.map(point => `<div class="chart-point" title="${app.escapeHtml(point.item.skill)} · ${point.average.toFixed(1)} of 3"><div class="chart-bar" style="height:${Math.max(4,point.average / 3 * 110)}px"></div>${point.average.toFixed(1)}<br>${app.formatDate(point.item.evaluated_at)}</div>`).join('')}</div><p class="muted">Average recorded 0–3 rubric score by evaluation date.</p>` : '<p class="muted">Rubric measurements will appear here over time.</p>';
  }
  function setupCoachForms() {
    document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.open).classList.toggle('hidden')));
    setupPlayerEdit(); setupSessionForm(); setupAssessmentForm(); setupGoalForm();
  }
  function setupPlayerEdit() {
    const form = document.getElementById('editPlayerForm');
    form.innerHTML = `<div class="form-field"><label>First name<input name="first_name" required value="${attr(player.first_name)}"></label></div><div class="form-field"><label>Last name<input name="last_name" required value="${attr(player.last_name)}"></label></div><div class="form-field"><label>Date of birth<input name="date_of_birth" type="date" value="${attr(player.date_of_birth || '')}"></label></div><div class="form-field"><label>Tennis start date<input name="tennis_start_date" type="date" value="${attr(player.tennis_start_date || '')}"></label></div><div class="form-field"><label>Ball stage<select name="current_ball_stage">${['red','orange','green','yellow'].map(stage => `<option value="${stage}" ${stage === player.current_ball_stage ? 'selected' : ''}>${title(stage)}</option>`).join('')}</select></label></div><div class="form-field"><label>First Rally School training<input name="rally_school_start_date" type="date" value="${attr(player.rally_school_start_date || '')}"></label></div><div class="form-field full"><label>Tennis experience<textarea name="tennis_experience_note">${app.escapeHtml(player.tennis_experience_note || '')}</textarea></label></div><div class="form-field full"><label>Current focus areas<input name="current_focus_areas" value="${attr((player.current_focus_areas || []).join(', '))}"></label></div><div class="form-field"><label>Development stage<input name="current_development_stage" value="${attr(player.current_development_stage || '')}"></label></div><div class="form-field"><label>Target stage<input name="target_stage" value="${attr(player.target_stage || '')}"></label></div><div><button class="button" type="submit">Update player</button></div>`;
    form.addEventListener('submit', async event => { event.preventDefault(); const raw = Object.fromEntries(new FormData(form)); raw.current_focus_areas = app.splitList(raw.current_focus_areas); for (const key of ['date_of_birth','tennis_start_date','rally_school_start_date']) raw[key] ||= null; const { error } = await app.client.from('players').update(raw).eq('id', playerId); finish(error, 'Player updated.'); });
  }
  function setupSessionForm() {
    const form = document.getElementById('sessionForm'); form.elements.session_started_at.value = localDateTimeValue(new Date());
    form.addEventListener('submit', async event => { event.preventDefault(); const raw = Object.fromEntries(new FormData(form)); const { data:reportId, error } = await app.client.rpc('publish_training_report', { p_player_id:playerId, p_session_started_at:new Date(raw.session_started_at).toISOString(), p_duration_minutes:Number(raw.duration_minutes), p_focus_areas:app.splitList(raw.focus_areas), p_parent_summary:raw.parent_summary, p_private_note:raw.private_note || null, p_assessments:[] }); if (error) return finish(error); location.href = `progress-report.html?id=${encodeURIComponent(reportId)}`; });
  }
  function setupAssessmentForm() {
    const form = document.getElementById('assessmentForm'); form.elements.evaluated_at.value = localDateTimeValue(new Date()); form.elements.session_id.innerHTML += sessions.map(session => `<option value="${session.id}">${app.formatDateTime(session.session_started_at)}</option>`).join('');
    const alreadySuperseded = new Set(assessments.map(item => item.supersedes_assessment_id).filter(Boolean));
    form.elements.supersedes_assessment_id.innerHTML += assessments.filter(item => !alreadySuperseded.has(item.id)).map(item => `<option value="${item.id}">${app.escapeHtml(item.skill)} · ${app.formatDateTime(item.evaluated_at)}</option>`).join('');
    form.addEventListener('submit', async event => { event.preventDefault(); const raw = Object.fromEntries(new FormData(form)); if (raw.supersedes_assessment_id && (!raw.correction_reason.trim() || !raw.correction_kind)) { app.setStatus('A correction type and reason are required.', 'error'); return; } const numeric = ['control_placement','shape_net_clearance','depth','movement_recovery','contact_preparation','rally_consistency','successful_target_balls','target_ball_attempts','serve_attempts','serves_in','return_attempts','returns_in_play','longest_rally']; numeric.forEach(key => raw[key] = raw[key] === '' ? null : Number(raw[key])); raw.session_id ||= null; raw.note ||= null; raw.supersedes_assessment_id ||= null; raw.correction_reason = raw.supersedes_assessment_id ? raw.correction_reason.trim() : null; raw.correction_kind = raw.supersedes_assessment_id ? raw.correction_kind : null; Object.assign(raw,{ player_id:playerId, coach_id:user.id, evaluated_at:new Date(raw.evaluated_at).toISOString() }); const { error } = await app.client.from('assessments').insert(raw); finish(error, raw.supersedes_assessment_id ? 'Correction appended; original retained.' : 'Assessment appended to history.'); });
  }
  function setupGoalForm() {
    const form = document.getElementById('goalForm'); const id = document.createElement('input'); id.type='hidden'; id.name='id'; form.prepend(id);
    form.addEventListener('submit', async event => { event.preventDefault(); const raw = Object.fromEntries(new FormData(form)); const goalId = raw.id; delete raw.id; ['baseline_value','current_value','target_value'].forEach(key => raw[key] = Number(raw[key])); raw.target_date ||= null; let result; if (goalId) result = await app.client.from('goals').update(raw).eq('id',goalId); else result = await app.client.from('goals').insert({ ...raw, player_id:playerId, created_by:user.id }); finish(result.error, goalId ? 'Goal updated.' : 'Goal saved.'); });
  }
  function editGoal(id) { const goal = goals.find(item => item.id === id); const form = document.getElementById('goalForm'); document.getElementById('goalFormPanel').classList.remove('hidden'); Object.entries(goal).forEach(([key,value]) => { if (form.elements[key]) form.elements[key].value = value ?? ''; }); form.scrollIntoView({ behavior:'smooth' }); }
  function finish(error, success='Saved.') { if (error) { app.setStatus(error.message, 'error'); return; } app.setStatus(success, 'success'); setTimeout(() => location.reload(), 500); }
  function tags(items=[]) { return items.length ? items.map(item => `<span class="tag">${app.escapeHtml(item)}</span>`).join('') : '<span class="muted">Not set</span>'; }
  function attr(value) { return app.escapeHtml(value).replace(/`/g,'&#96;'); }
  function title(value='') { return value.charAt(0).toUpperCase()+value.slice(1); }
  function formatDuration(minutes) { const hours=Math.floor(minutes/60), remainder=minutes%60; return hours ? `${hours}h ${remainder ? `${remainder}m` : ''}` : `${remainder}m`; }
  function localDateTimeValue(date) { const local = new Date(date.getTime()-date.getTimezoneOffset()*60000); return local.toISOString().slice(0,16); }
  function contextName(value) { return ({A:'Easy Feed',B:'Rally Feed',C:'Movement',D:'Live Point'})[value]; }
  function scorePairs(item) { return [['Control',item.control_placement],['Shape',item.shape_net_clearance],['Depth',item.depth],['Movement',item.movement_recovery],['Contact',item.contact_preparation],['Rally',item.rally_consistency]].filter(([,value]) => value !== null); }
  function objectivePairs(item) { return [['Targets', item.successful_target_balls === null ? null : `${item.successful_target_balls}/${item.target_ball_attempts || 10}`],['Serves in',item.serves_in === null ? null : `${item.serves_in}/${item.serve_attempts}`],['Returns',item.returns_in_play === null ? null : `${item.returns_in_play}/${item.return_attempts}`],['Longest rally',item.longest_rally]].filter(([,value]) => value !== null); }
  function averageScore(item) { const values=scorePairs(item).map(([,value])=>value); return values.length ? values.reduce((a,b)=>a+b,0)/values.length : null; }
  function goalProgress(goal) { const span=Number(goal.target_value)-Number(goal.baseline_value); if (!span) return Number(goal.current_value) >= Number(goal.target_value) ? 100 : 0; return Math.round(Math.max(0,Math.min(1,(Number(goal.current_value)-Number(goal.baseline_value))/span))*100); }
})();
