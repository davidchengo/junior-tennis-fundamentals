import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://www.rallyschoolonline.com',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
});

const cleanText = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const cleanOptionalDate = (value: unknown) => {
  const date = cleanText(value);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
};

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);

  const projectUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const authorization = request.headers.get('Authorization');
  if (!projectUrl || !anonKey || !serviceRoleKey || !authorization) return reply({ error: 'Service configuration is incomplete.' }, 500);

  const userClient = createClient(projectUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return reply({ error: 'Please sign in again.' }, 401);

  // Use the authenticated coach session for this authorization decision.
  // Its RLS policy exposes only the caller's own role record.
  const { data: coachRole, error: coachRoleError } = await userClient
    .from('profile_roles')
    .select('profile_id')
    .eq('profile_id', user.id)
    .eq('role', 'coach')
    .maybeSingle();
  if (coachRoleError || !coachRole) return reply({ error: 'Only an authorized coach can add players and parent access.' }, 403);

  const admin = createClient(projectUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let payload: Record<string, unknown>;
  try { payload = await request.json(); } catch { return reply({ error: 'Invalid request.' }, 400); }
  const incomingPlayer = payload.player && typeof payload.player === 'object' ? payload.player as Record<string, unknown> : null;
  const incomingParent = payload.parent && typeof payload.parent === 'object' ? payload.parent as Record<string, unknown> : null;
  if (!incomingPlayer || !incomingParent) return reply({ error: 'Player and parent details are required.' }, 400);

  const firstName = cleanText(incomingPlayer.first_name);
  const lastName = cleanText(incomingPlayer.last_name);
  const ballStage = cleanText(incomingPlayer.current_ball_stage).toLowerCase();
  const parentEmail = cleanText(incomingParent.email).toLowerCase();
  const accountMode = cleanText(incomingParent.accountMode);
  const password = typeof incomingParent.password === 'string' ? incomingParent.password : '';
  if (!firstName || !lastName) return reply({ error: 'Player first and last name are required.' }, 400);
  if (!['red', 'orange', 'green', 'yellow'].includes(ballStage)) return reply({ error: 'Choose a valid ball stage.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) return reply({ error: 'Enter a valid parent email.' }, 400);
  if (!['new', 'existing'].includes(accountMode)) return reply({ error: 'Choose how to set up the parent account.' }, 400);
  if (accountMode === 'new' && password.length < 6) return reply({ error: 'The initial parent password must have at least 6 characters.' }, 400);

  let parentId = '';
  let createdParentAccount = false;
  if (accountMode === 'new') {
    const { data, error } = await admin.auth.admin.createUser({ email: parentEmail, password, email_confirm: true });
    if (error || !data.user) {
      const message = /already|exists|registered/i.test(error?.message || '')
        ? 'That email already has an account. Choose “Use an existing parent account.”'
        : error?.message || 'Unable to create the parent account.';
      return reply({ error: message }, 409);
    }
    parentId = data.user.id;
    createdParentAccount = true;
  } else {
    const { data: parentProfile, error } = await admin
      .from('profiles')
      .select('id')
      .eq('email', parentEmail)
      .maybeSingle();
    if (error || !parentProfile) return reply({ error: 'No Player Progress account uses that email. Choose “Create a new parent account.”' }, 404);
    parentId = parentProfile.id;
    const { data: coachAccount } = await admin
      .from('profile_roles')
      .select('role')
      .eq('profile_id', parentId)
      .eq('role', 'coach')
      .maybeSingle();
    if (coachAccount) return reply({ error: 'That email belongs to a coach account and cannot be assigned as a parent.' }, 400);
  }

  const { error: roleError } = await admin
    .from('profile_roles')
    .upsert({ profile_id: parentId, role: 'parent' }, { onConflict: 'profile_id,role' });
  if (roleError) {
    if (createdParentAccount) await admin.auth.admin.deleteUser(parentId);
    return reply({ error: 'Unable to enable the parent sign-in account.' }, 500);
  }

  const player = {
    first_name: firstName,
    last_name: lastName,
    date_of_birth: cleanOptionalDate(incomingPlayer.date_of_birth),
    tennis_start_date: cleanOptionalDate(incomingPlayer.tennis_start_date),
    current_ball_stage: ballStage,
    rally_school_start_date: cleanOptionalDate(incomingPlayer.rally_school_start_date),
    tennis_experience_note: cleanText(incomingPlayer.tennis_experience_note) || null,
    created_by: user.id
  };
  const { data: createdPlayer, error: playerError } = await admin.from('players').insert(player).select('id').single();
  if (playerError || !createdPlayer) {
    if (createdParentAccount) await admin.auth.admin.deleteUser(parentId);
    return reply({ error: playerError?.message || 'Unable to create the player.' }, 500);
  }

  const { error: accessError } = await admin.from('player_access').insert([
    { player_id: createdPlayer.id, profile_id: user.id, access_role: 'coach' },
    { player_id: createdPlayer.id, profile_id: parentId, access_role: 'parent' }
  ]);
  if (accessError) {
    await admin.from('players').delete().eq('id', createdPlayer.id);
    if (createdParentAccount) await admin.auth.admin.deleteUser(parentId);
    return reply({ error: accessError.message || 'Unable to assign player access.' }, 500);
  }

  return reply({ playerId: createdPlayer.id, parentEmail, createdParentAccount });
});
