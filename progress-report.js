(async function () {
  const app = window.ProgressApp;
  const reportId = new URLSearchParams(location.search).get('id');
  if (!reportId) { app.setStatus('Missing report ID.', 'error'); return; }
  const user = await app.requireUser(); if (!user) return;
  document.getElementById('signOut').addEventListener('click', async () => { await app.client.auth.signOut(); location.replace('progress-login.html'); });
  try {
    const { data:report, error } = await app.client.from('training_report_snapshots').select('*').eq('id', reportId).single();
    if (error) throw error;
    render(report);
  } catch (error) {
    app.setStatus(error.code === 'PGRST116' ? 'This report does not exist or your account is not authorized to view it.' : error.message, 'error');
  }

  function render(report) {
    const session = report.session_snapshot || {};
    const player = report.player_snapshot || {}; const goals = report.goals_snapshot || []; const assessments = report.assessments_snapshot || [];
    const fullName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Player';
    document.title = `${fullName} Training Report | Rally School`;
    document.getElementById('reportTitle').textContent = `${fullName} · Training Report`;
    document.getElementById('reportMeta').textContent = `Published ${app.formatDateTime(report.published_at)} · Session ${app.formatDateTime(session.session_started_at)} · ${session.duration_minutes} minutes`;
    document.getElementById('playerBackLink').href = `progress-player.html?id=${encodeURIComponent(report.player_id)}`;
    document.getElementById('reportSummary').innerHTML = `<p class="eyebrow">Parent summary</p><h2>What we worked on</h2><p>${app.escapeHtml(report.parent_summary)}</p><div class="tag-list">${tags(session.focus_areas)}</div>`;
    document.getElementById('playerSnapshot').innerHTML = `<article class="stat-card"><span>Ball stage</span><strong>${app.escapeHtml(title(player.current_ball_stage || 'Not set'))}</strong></article><article class="stat-card"><span>Development stage</span><strong>${app.escapeHtml(player.current_development_stage || 'Not set')}</strong></article><article class="stat-card"><span>Target stage</span><strong>${app.escapeHtml(player.target_stage || 'Not set')}</strong></article><article class="stat-card"><span>Tennis start</span><strong>${app.formatDate(player.tennis_start_date)}</strong></article><article class="stat-card"><span>Rally School start</span><strong>${app.formatDate(player.rally_school_start_date)}</strong></article><article class="stat-card"><span>Focus at publication</span><div class="tag-list" style="margin-top:10px">${tags(player.current_focus_areas)}</div></article>`;
    document.getElementById('reportGoals').innerHTML = goals.length ? goals.map(goal => `<article class="list-item"><header><strong>${app.escapeHtml(goal.skill)}</strong><span class="tag">${app.escapeHtml(goal.status)}</span></header><p class="muted">${app.escapeHtml(goal.metric)}</p><p>${goal.baseline_value} baseline → <strong>${goal.current_value}</strong> current → ${goal.target_value} target</p><small class="muted">Target ${app.formatDate(goal.target_date)}</small></article>`).join('') : '<p class="muted">No goals were recorded when this report was published.</p>';
    const superseded = new Set(assessments.map(item => item.supersedes_assessment_id).filter(Boolean));
    document.getElementById('reportAssessments').innerHTML = assessments.length ? assessments.map(item => `<article class="list-item"><header><strong>${app.escapeHtml(item.skill)}</strong><div class="tag-list"><span class="tag">${app.escapeHtml(item.difficulty_context)}</span>${item.supersedes_assessment_id ? '<span class="tag">Correction</span>' : ''}${superseded.has(item.id) ? '<span class="tag">Superseded</span>' : ''}</div></header><p class="muted">${app.formatDateTime(item.evaluated_at)}</p>${item.correction_reason ? `<p><strong>Correction reason:</strong> ${app.escapeHtml(item.correction_reason)}</p>` : ''}${scoreTags(item)}${objectiveText(item)}${item.note ? `<p>${app.escapeHtml(item.note)}</p>` : ''}</article>`).join('') : '<p class="muted">No assessments were recorded when this report was published.</p>';
  }
  function tags(items=[]) { return items && items.length ? items.map(item => `<span class="tag">${app.escapeHtml(item)}</span>`).join('') : '<span class="muted">Not set</span>'; }
  function title(value='') { return value.charAt(0).toUpperCase()+value.slice(1); }
  function scoreTags(item) { const values=[['Control',item.control_placement],['Shape',item.shape_net_clearance],['Depth',item.depth],['Movement',item.movement_recovery],['Contact',item.contact_preparation],['Rally',item.rally_consistency]].filter(([,value])=>value!==null); return values.length ? `<div class="tag-list">${values.map(([name,value])=>`<span class="tag">${name}: ${value}/3</span>`).join('')}</div>` : ''; }
  function objectiveText(item) { const values=[['Targets',item.successful_target_balls===null?null:`${item.successful_target_balls}/${item.target_ball_attempts||10}`],['Serves in',item.serves_in===null?null:`${item.serves_in}/${item.serve_attempts}`],['Returns',item.returns_in_play===null?null:`${item.returns_in_play}/${item.return_attempts}`],['Longest rally',item.longest_rally]].filter(([,value])=>value!==null); return values.length ? `<p>${values.map(([name,value])=>`${name}: <strong>${value}</strong>`).join(' · ')}</p>` : ''; }
})();
