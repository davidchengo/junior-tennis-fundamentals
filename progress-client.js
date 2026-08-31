/* global supabase */
(function () {
  const config = window.RALLY_PROGRESS_CONFIG || {};
  const isPlaceholder = !config.supabaseUrl || !config.supabaseAnonKey || /YOUR_|example/i.test(`${config.supabaseUrl}${config.supabaseAnonKey}`);
  const client = isPlaceholder ? null : supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const splitList = value => String(value || '').split(',').map(item => item.trim()).filter(Boolean);
  const formatDate = value => value ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value)) : 'Not set';
  const formatDateTime = value => value ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not set';
  const ageFromDob = dob => {
    if (!dob) return null;
    const born = new Date(`${dob}T00:00:00`); const now = new Date();
    let age = now.getFullYear() - born.getFullYear();
    if (now < new Date(now.getFullYear(), born.getMonth(), born.getDate())) age--;
    return age;
  };
  const setStatus = (message, type = '') => {
    const node = document.querySelector('[data-status]');
    if (node) { node.textContent = message; node.className = `status-message ${type}`; }
  };
  async function requireUser() {
    if (!client) { document.body.classList.add('config-missing'); return null; }
    const { data: { user } } = await client.auth.getUser();
    if (!user) { location.replace(`progress-login.html?next=${encodeURIComponent(location.pathname.split('/').pop() + location.search)}`); return null; }
    return user;
  }
  async function getRole() {
    const { data, error } = await client.from('profile_roles').select('role');
    if (error) throw error;
    const roles = data.map(item => item.role);
    return roles.includes('coach') ? 'coach' : roles.includes('parent') ? 'parent' : null;
  }
  window.ProgressApp = { client, escapeHtml, splitList, formatDate, formatDateTime, ageFromDob, setStatus, requireUser, getRole };
})();
