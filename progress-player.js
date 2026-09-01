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
    renderReports(); renderAssessments(); renderChart();
  }
  function renderReports() {
    document.getElementById('reports').innerHTML = reports.length ? reports.map((report,index) => {
      const session = sessions.find(item => item.id === report.session_id); const historicalSession = report.session_snapshot || {};
      return `<article class="list-item"><header><div><strong>${index === 0 ? 'Latest report · ' : ''}${app.formatDateTime(report.published_at)}</strong><p class="muted">${historicalSession.duration_minutes || 0} minutes · trained ${app.formatDateTime(historicalSession.session_started_at)}</p></div><a class="button secondary" href="progress-report.html?id=${encodeURIComponent(report.id)}">Open report</a></header><p>${app.escapeHtml(report.parent_summary)}</p>${role === 'coach' && session && session.private_note ? `<p><strong>Private coach note:</strong> ${app.escapeHtml(session.private_note)}</p>` : ''}</article>`;
    }).join('') : '<p class="muted">No published reports yet.</p>';
  }
  function renderAssessments() {
    const corrections = new Map(
      assessments
        .filter(item => item.supersedes_assessment_id)
        .map(item => [item.supersedes_assessment_id, item])
    );

    document.getElementById('assessments').innerHTML =
      assessments.length
        ? assessments.map(item => {
            const scores = scorePairs(item);
            const objectives = objectivePairs(item);
            const replacement = corrections.get(item.id);

            return `
              <article class="list-item">

                <header>
                  <div>
                    <strong>Assessment</strong>
                    <p class="muted">
                      ${app.formatDateTime(item.evaluated_at)}
                      ${
                        item.training_duration_minutes
                          ? ` · ${item.training_duration_minutes} min`
                          : ''
                      }
                    </p>
                  </div>

                  <div class="button-row">
                    ${
                      item.supersedes_assessment_id
                        ? '<span class="tag">Correction</span>'
                        : ''
                    }

                    ${
                      replacement
                        ? '<span class="tag">Superseded—retained in history</span>'
                        : ''
                    }

                    ${
                      role === 'coach'
                        ? `<button
                             class="ghost-button"
                             type="button"
                             data-delete-assessment="${item.id}"
                           >
                             Delete
                           </button>`
                        : ''
                    }
                  </div>
                </header>

                ${
                  objectives.length
                    ? `<div class="tag-list">
                         ${objectives.map(
                           ([name, value]) =>
                             `<span class="tag">
                                ${name}: ${app.escapeHtml(String(value))}
                              </span>`
                         ).join('')}
                       </div>`
                    : ''
                }

                ${
                  scores.length
                    ? `<div class="tag-list" style="margin-top:10px">
                         ${scores.map(
                           ([name, value]) =>
                             `<span class="tag">
                                ${name}: ${value}/3
                              </span>`
                         ).join('')}
                       </div>`
                    : ''
                }

                ${
                  item.note
                    ? `<p>${app.escapeHtml(item.note)}</p>`
                    : ''
                }

              </article>
            `;
          }).join('')
        : '<p class="muted">No assessments yet.</p>';

    if (role === 'coach') {
      document
        .querySelectorAll('[data-delete-assessment]')
        .forEach(button => {
          button.addEventListener('click', async () => {
            const assessmentId =
              button.dataset.deleteAssessment;

            const item =
              assessments.find(
                assessment => assessment.id === assessmentId
              );

            if (!item) return;

            const confirmed = window.confirm(
              'Delete this assessment?\n\n' +
              'This assessment and all of its progress values ' +
              'will disappear from the player profile.'
            );

            if (!confirmed) return;

            button.disabled = true;

            const { error } =
              await app.client
                .from('assessment_deletions')
                .insert({
                  assessment_id: assessmentId,
                  player_id: playerId,
                  deleted_by: user.id
                });

            if (error) {
              button.disabled = false;
              app.setStatus(error.message, 'error');
              return;
            }

            app.setStatus(
              'Assessment deleted.',
              'success'
            );

            setTimeout(() => location.reload(), 400);
          });
        });
    }
  }

  function renderChart() {
    const container =
      document.getElementById('assessmentChart');

    const panel =
      container.closest('.panel');

    if (panel) {
      const heading =
        panel.querySelector('h2');

      if (heading) {
        heading.textContent =
          'Yearly Assessment Progress';
      }
    }

    // If a visible correction supersedes another visible
    // assessment, only the correction is plotted.
    const supersededIds = new Set(
      assessments
        .map(item => item.supersedes_assessment_id)
        .filter(Boolean)
    );

    const activeAssessments =
      [...assessments]
        .filter(item => !supersededIds.has(item.id))
        .sort(
          (a, b) =>
            new Date(a.evaluated_at) -
            new Date(b.evaluated_at)
        )
        .slice(-54);

    if (!activeAssessments.length) {
      container.innerHTML =
        '<p class="muted">' +
        'Assessment progress will appear here over time.' +
        '</p>';
      return;
    }

    const bandPercent = value => {
      return ({
        '1-5': 25,
        '6-10': 50,
        '11-20': 75,
        '21+': 100
      })[value] || 0;
    };

    const ratingPercent = value => {
      if (
        value === null ||
        value === undefined
      ) {
        return 0;
      }

      return Math.round(
        Number(value) / 3 * 100
      );
    };

    const ratingLabel = value => {
      if (
        value === null ||
        value === undefined
      ) {
        return null;
      }

      return ({
        0: '0',
        1: '1',
        2: '2',
        3: '3'
      })[Number(value)];
    };

    const metrics = [
      {
        label: 'Longest Rally',
        value: item => assessmentRallyBand(item),
        percent: bandPercent
      },
      {
        label: 'Deep-Ball Streak',
        value: item =>
          item.longest_deep_ball_streak_band,
        percent: bandPercent
      },
      {
        label: 'Shape / Net Clearance',
        value: item => item.shape_net_clearance,
        display: ratingLabel,
        percent: ratingPercent
      },
      {
        label: 'Contact / Preparation',
        value: item => item.contact_preparation,
        display: ratingLabel,
        percent: ratingPercent
      },
      {
        label: 'Movement / Recovery',
        value: item => item.movement_recovery,
        display: ratingLabel,
        percent: ratingPercent
      },
      {
        label: 'Control / Placement',
        value: item => item.control_placement,
        display: ratingLabel,
        percent: ratingPercent
      }
    ];

    function cell(metric, item) {
      const raw =
        metric.value(item);

      const value =
        metric.display
          ? metric.display(raw)
          : raw;

      if (
        value === null ||
        value === undefined ||
        value === ''
      ) {
        return `
          <td class="progress-matrix-cell empty">
            —
          </td>
        `;
      }

      const percent =
        metric.percent(raw);

      const duration =
        item.training_duration_minutes
          ? ` · ${item.training_duration_minutes} min`
          : '';

      const title =
        `${app.formatDate(item.evaluated_at)} · ` +
        `${metric.label}: ${value}${duration}`;

      return `
        <td
          class="progress-matrix-cell"
          title="${app.escapeHtml(title)}"
        >
          <div class="matrix-value">
            ${app.escapeHtml(String(value))}
          </div>

          <div class="matrix-mini-track">
            <div
              class="matrix-mini-fill"
              style="width:${percent}%"
            ></div>
          </div>
        </td>
      `;
    }

    container.innerHTML = `
      <p class="muted progress-matrix-description">
        Up to 54 assessments are shown from oldest to newest.
        Scroll horizontally to review the year.
        Blank cells mean that field was not measured.
      </p>

      <div class="progress-matrix-wrap">
        <table class="progress-matrix">

          <thead>
            <tr>
              <th class="progress-matrix-metric">
                Measurement
              </th>

              ${activeAssessments.map(
                (item, index) => `
                  <th class="progress-matrix-session">
                    <strong>
                      S${index + 1}
                    </strong>
                    <span>
                      ${app.formatDate(item.evaluated_at)}
                    </span>
                    ${
                      item.training_duration_minutes
                        ? `<small>
                             ${item.training_duration_minutes}m
                           </small>`
                        : ''
                    }
                  </th>
                `
              ).join('')}
            </tr>
          </thead>

          <tbody>
            ${metrics.map(metric => `
              <tr>
                <th class="progress-matrix-metric">
                  ${app.escapeHtml(metric.label)}
                </th>

                ${activeAssessments
                  .map(item => cell(metric, item))
                  .join('')}
              </tr>
            `).join('')}
          </tbody>

        </table>
      </div>

      <div class="progress-scale">
        <span>
          Ratings: 0 Not demonstrated
          · 1 Emerging
          · 2 Functional
          · 3 Consistent
        </span>
      </div>
    `;
  }

  function setupCoachForms() {
    document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.open).classList.toggle('hidden')));
    setupPlayerEdit(); setupAssessmentForm();
  }
  function setupPlayerEdit() {
    const form = document.getElementById('editPlayerForm');

    const developmentLevels = [
      'No prior experience',
      'Beginner – Green Ball',
      'Beginner – Yellow Ball',
      'Intermediate – Yellow Ball',
      'USTA L7 level',
      'USTA L6 level',
      'USTA L5+ level'
    ];

    function developmentOptions(currentValue) {
      const values = [...developmentLevels];

      if (currentValue && !values.includes(currentValue)) {
        values.unshift(currentValue);
      }

      return `
        <option value="">Not set</option>
        ${values.map(value => `
          <option
            value="${attr(value)}"
            ${value === currentValue ? 'selected' : ''}
          >
            ${app.escapeHtml(value)}
          </option>
        `).join('')}
      `;
    }

    form.innerHTML = `
      <div class="form-field">
        <label>
          First name
          <input
            name="first_name"
            required
            value="${attr(player.first_name)}"
          >
        </label>
      </div>

      <div class="form-field">
        <label>
          Last name
          <input
            name="last_name"
            required
            value="${attr(player.last_name)}"
          >
        </label>
      </div>

      <div class="form-field">
        <label>
          Date of birth
          <input
            name="date_of_birth"
            type="date"
            value="${attr(player.date_of_birth || '')}"
          >
        </label>
      </div>

      <div class="form-field">
        <label>
          Tennis start date
          <input
            name="tennis_start_date"
            type="date"
            value="${attr(player.tennis_start_date || '')}"
          >
        </label>
      </div>

      <div class="form-field">
        <label>
          Ball stage
          <select name="current_ball_stage">
            ${['red','orange','green','yellow'].map(stage => `
              <option
                value="${stage}"
                ${stage === player.current_ball_stage ? 'selected' : ''}
              >
                ${title(stage)}
              </option>
            `).join('')}
          </select>
        </label>
      </div>

      <div class="form-field">
        <label>
          First Rally School training
          <input
            name="rally_school_start_date"
            type="date"
            value="${attr(player.rally_school_start_date || '')}"
          >
        </label>
      </div>

      <div class="form-field full">
        <label>
          Current Focus Area
          <select name="current_focus_area">
            ${[
              '',
              'Fundamentals / Technique',
              'Rally Consistency',
              'Movement / Recovery',
              'Control / Placement',
              'Match Play'
            ].map(value => {
              const current =
                (player.current_focus_areas || [])[0] || '';

              return `
                <option
                  value="${attr(value)}"
                  ${value === current ? 'selected' : ''}
                >
                  ${value || 'Not set'}
                </option>
              `;
            }).join('')}
          </select>
        </label>
      </div>

      <div class="form-field">
        <label>
          Current Development Level
          <select name="current_development_stage">
            ${developmentOptions(player.current_development_stage)}
          </select>
        </label>
      </div>

      <div class="form-field">
        <label>
          Target Development Level
          <select name="target_stage">
            ${developmentOptions(player.target_stage)}
          </select>
        </label>
      </div>

      <div>
        <button class="button" type="submit">
          Update player
        </button>
      </div>
    `;

    form.querySelectorAll('input[type="date"]').forEach(input => {
      input.addEventListener('click', () => {
        if (typeof input.showPicker === 'function') {
          try {
            input.showPicker();
          } catch (_) {
            // Native calendar icon remains available as fallback.
          }
        }
      });
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();

      const raw =
        Object.fromEntries(new FormData(form));

      raw.current_focus_areas =
        raw.current_focus_area
          ? [raw.current_focus_area]
          : [];

      delete raw.current_focus_area;

      for (const key of [
        'date_of_birth',
        'tennis_start_date',
        'rally_school_start_date'
      ]) {
        raw[key] ||= null;
      }

      raw.current_development_stage ||= null;
      raw.target_stage ||= null;

      const { error } =
        await app.client
          .from('players')
          .update(raw)
          .eq('id', playerId);

      finish(error, 'Player updated.');
    });
  }

  function setupAssessmentForm() {
    const form = document.getElementById('assessmentForm');

    const modeSelect = form.elements.assessment_mode;
    const previousSelect = form.elements.previous_assessment_id;
    const evaluatedAtInput = form.elements.evaluated_at;
    const durationSelect = form.elements.training_duration_minutes;
    const previousField =
      document.getElementById('previousAssessmentField');

    const reference =
      document.getElementById('originalAssessmentReference');

    const ratingFields = [
      'shape_net_clearance',
      'contact_preparation',
      'movement_recovery',
      'control_placement'
    ];

    const supersededIds = new Set(
      assessments
        .map(item => item.supersedes_assessment_id)
        .filter(Boolean)
    );

    previousSelect.innerHTML =
      assessments.length
        ? assessments.map(item => {
            const superseded =
              supersededIds.has(item.id);

            const label =
              `${app.formatDateTime(item.evaluated_at)} · Assessment` +
              `${superseded ? ' · Already superseded' : ''}`;

            return `
              <option
                value="${item.id}"
                ${superseded ? 'disabled' : ''}
              >
                ${app.escapeHtml(label)}
              </option>
            `;
          }).join('')
        : '<option value="">No previous assessments</option>';

    const latestActiveAssessment =
      assessments.find(
        item => !supersededIds.has(item.id)
      ) || null;




    function setRating(name, value) {
      form.elements[name].value =
        value === null ||
        value === undefined
          ? ''
          : String(value);
    }


    function clearAssessment() {
      evaluatedAtInput.value =
        localDateTimeValue(new Date());

      durationSelect.value = '60';
      form.elements.longest_rally_band.value = '';
      form.elements.longest_deep_ball_streak_band.value = '';

      ratingFields.forEach(name => {
        form.elements[name].value = '';
      });

      form.elements.note.value = '';
      reference.innerHTML = '';
      reference.classList.add('hidden');
    }


    function renderOriginalReference(item) {
      const longestRally =
        assessmentRallyBand(item) || 'Not measured';

      const deepBall =
        item.longest_deep_ball_streak_band ||
        'Not measured';

      reference.innerHTML = `
        <article class="list-item">

          <header>
            <div>
              <strong>Previous assessment reference</strong>
              <p class="muted">
                ${app.formatDateTime(item.evaluated_at)}
              </p>
            </div>

          </header>

          <div class="tag-list">
            <span class="tag">
              Longest rally: ${app.escapeHtml(longestRally)}
            </span>

            <span class="tag">
              Deep-ball streak: ${app.escapeHtml(deepBall)}
            </span>
          </div>

          <div class="tag-list" style="margin-top:10px">
            <span class="tag">
              Shape: ${
                item.shape_net_clearance ?? 'Not measured'
              }
            </span>

            <span class="tag">
              Contact: ${
                item.contact_preparation ?? 'Not measured'
              }
            </span>

            <span class="tag">
              Movement: ${
                item.movement_recovery ?? 'Not measured'
              }
            </span>

            <span class="tag">
              Control: ${
                item.control_placement ?? 'Not measured'
              }
            </span>
          </div>

          ${
            item.note
              ? `<p>
                   <strong>Previous note:</strong>
                   ${app.escapeHtml(item.note)}
                 </p>`
              : ''
          }

        </article>
      `;

      reference.classList.remove('hidden');
    }


    function loadAssessment(item) {
      if (!item) return;

      evaluatedAtInput.value =
        localDateTimeValue(new Date(item.evaluated_at));

      durationSelect.value =
        item.training_duration_minutes
          ? String(item.training_duration_minutes)
          : '60';

      form.elements.longest_rally_band.value =
        assessmentRallyBand(item) || '';

      form.elements.longest_deep_ball_streak_band.value =
        item.longest_deep_ball_streak_band || '';

      ratingFields.forEach(name => {
        setRating(name, item[name]);
      });

      form.elements.note.value =
        item.note || '';

      renderOriginalReference(item);
    }


    function selectedPreviousAssessment() {
      return assessments.find(
        item => item.id === previousSelect.value
      ) || null;
    }


    function applyMode() {
      if (modeSelect.value === 'new') {
        previousField.classList.add('hidden');
        previousSelect.required = false;

        clearAssessment();
        return;
      }

      previousField.classList.remove('hidden');
      previousSelect.required = true;

      if (!latestActiveAssessment) {
        previousSelect.value = '';

        reference.innerHTML =
          '<p class="muted">No previous active assessment is available to correct.</p>';

        reference.classList.remove('hidden');
        return;
      }

      // Always default to the newest eligible assessment.
      previousSelect.value =
        latestActiveAssessment.id;

      // Automatically populate its values.
      loadAssessment(latestActiveAssessment);
    }


    evaluatedAtInput.addEventListener('click', () => {
      if (typeof evaluatedAtInput.showPicker === 'function') {
        try {
          evaluatedAtInput.showPicker();
        } catch (_) {
          // Native date/time controls remain available.
        }
      }
    });


    modeSelect.addEventListener(
      'change',
      applyMode
    );


    previousSelect.addEventListener(
      'change',
      () => {
        const item =
          selectedPreviousAssessment();

        if (item) {
          loadAssessment(item);
        }
      }
    );


    // Default state
    clearAssessment();


    form.addEventListener(
      'submit',
      async event => {
        event.preventDefault();

        const raw =
          Object.fromEntries(
            new FormData(form)
          );

        const mode =
          raw.assessment_mode || 'new';

        const previousAssessmentId =
          raw.previous_assessment_id || null;

        const previousAssessment =
          mode === 'correction'
            ? assessments.find(
                item =>
                  item.id === previousAssessmentId
              )
            : null;

        delete raw.assessment_mode;
        delete raw.previous_assessment_id;

        if (
          mode === 'correction' &&
          !previousAssessment
        ) {
          app.setStatus(
            'Select a previous assessment.',
            'error'
          );
          return;
        }

        // Ratings
        ratingFields.forEach(name => {
          raw[name] =
            raw[name] === ''
              ? null
              : Number(raw[name]);
        });


        raw.longest_rally_band ||=
          null;

        raw.longest_deep_ball_streak_band ||=
          null;

        raw.note ||=
          null;

        raw.training_duration_minutes =
          Number(raw.training_duration_minutes);

        raw.evaluated_at =
          new Date(raw.evaluated_at).toISOString();


        // Preserve session relationship automatically
        // when correcting a historical assessment.
        raw.session_id =
          previousAssessment
            ? previousAssessment.session_id || null
            : null;


        // Area/stroke are no longer exposed in the UI.
        // Preserve them for corrections; use generic Groundstrokes
        // classification for new assessments.
        if (previousAssessment) {
          raw.skill =
            previousAssessment.skill || 'Groundstrokes';

          raw.assessment_area =
            previousAssessment.assessment_area ||
            assessmentArea(previousAssessment);

          raw.groundstroke_stroke =
            previousAssessment.groundstroke_stroke ||
            assessmentStroke(previousAssessment);
        } else {
          raw.skill = 'Groundstrokes';
          raw.assessment_area = 'Groundstrokes';
          raw.groundstroke_stroke = null;
        }


        // Difficulty has been retired from the new UI.
        raw.difficulty_context = null;


        raw.supersedes_assessment_id =
          mode === 'correction'
            ? previousAssessmentId
            : null;

        raw.correction_kind =
          mode === 'correction'
            ? 'correction'
            : null;

        raw.correction_reason = null;


        Object.assign(raw, {
          player_id: playerId,
          coach_id: user.id
        });


        const { error } =
          await app.client
            .from('assessments')
            .insert(raw);


        finish(
          error,
          mode === 'correction'
            ? 'Correction appended; original retained.'
            : 'Assessment appended to history.'
        );
      }
    );
  }

  function finish(error, success='Saved.') { if (error) { app.setStatus(error.message, 'error'); return; } app.setStatus(success, 'success'); setTimeout(() => location.reload(), 500); }
  function tags(items=[]) { return items.length ? items.map(item => `<span class="tag">${app.escapeHtml(item)}</span>`).join('') : '<span class="muted">Not set</span>'; }
  function attr(value) { return app.escapeHtml(value).replace(/`/g,'&#96;'); }
  function title(value='') { return value.charAt(0).toUpperCase()+value.slice(1); }
  function formatDuration(minutes) { const hours=Math.floor(minutes/60), remainder=minutes%60; return hours ? `${hours}h ${remainder ? `${remainder}m` : ''}` : `${remainder}m`; }
  function localDateTimeValue(date) { const local = new Date(date.getTime()-date.getTimezoneOffset()*60000); return local.toISOString().slice(0,16); }
  function assessmentArea(item) {
    if (item.assessment_area) {
      return item.assessment_area;
    }

    const skill =
      String(item.skill || '').toLowerCase();

    if (skill.includes('serve')) {
      return 'Serve';
    }

    if (skill.includes('return')) {
      return 'Return';
    }

    if (
      skill.includes('point') ||
      skill.includes('movement')
    ) {
      return 'Point Play';
    }

    return 'Groundstrokes';
  }


  function assessmentStroke(item) {
    if (assessmentArea(item) !== 'Groundstrokes') {
      return null;
    }

    if (item.groundstroke_stroke) {
      return item.groundstroke_stroke;
    }

    const skill =
      String(item.skill || '').toLowerCase();

    if (skill.includes('forehand')) {
      return 'Forehand';
    }

    if (skill.includes('backhand')) {
      return 'Backhand';
    }

    return 'Both';
  }


  function assessmentRallyBand(item) {
    if (item.longest_rally_band) {
      return item.longest_rally_band;
    }

    if (
      item.longest_rally === null ||
      item.longest_rally === undefined
    ) {
      return null;
    }

    const value =
      Number(item.longest_rally);

    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }

    if (value <= 5) return '1-5';
    if (value <= 10) return '6-10';
    if (value <= 20) return '11-20';

    return '21+';
  }


  function scorePairs(item) {
    return [
      ['Shape', item.shape_net_clearance],
      ['Contact', item.contact_preparation],
      ['Movement', item.movement_recovery],
      ['Control', item.control_placement]
    ].filter(([, value]) => value !== null);
  }


  function objectivePairs(item) {
    return [
      ['Longest rally', assessmentRallyBand(item)],
      [
        'Deep-ball streak',
        item.longest_deep_ball_streak_band
      ]
    ].filter(([, value]) => value);
  }


  function averageScore(item) {
    const values =
      scorePairs(item)
        .map(([, value]) => value);

    return values.length
      ? values.reduce(
          (a, b) => a + b,
          0
        ) / values.length
      : null;
  }


  function goalProgress(goal) { const span=Number(goal.target_value)-Number(goal.baseline_value); if (!span) return Number(goal.current_value) >= Number(goal.target_value) ? 100 : 0; return Math.round(Math.max(0,Math.min(1,(Number(goal.current_value)-Number(goal.baseline_value))/span))*100); }
})();
