# Player Progress: Supabase setup

Player Progress is a static HTML/CSS/JavaScript client backed by Supabase Auth and PostgreSQL Row Level Security. No demo players or production credentials are included.

## 1. Review and run the migration

The migration has intentionally not been run against any Supabase project. Review `supabase/migrations/202608300001_player_progress.sql`, then apply it to a local/test project before production.

The migration creates:

- `profiles` and admin-managed `profile_roles`
- `players` and admin-managed `player_access`
- `training_sessions` and coach-only `session_private_notes`
- append-only `assessments` with correction lineage
- current `goals`
- immutable `training_report_snapshots`
- private authorization and transactional implementation functions
- narrow public RPC wrappers for atomic player creation and report publication

Keep the `private` schema out of Supabase **API → Exposed schemas**. The browser calls only the two reviewed public RPC wrappers; the private functions contain the authorization checks and transactional writes.

Run `supabase/tests/player_progress_rls.test.sql` against a disposable local Supabase database after the migration. Do not run that test against production; it creates test identities and rolls them back.

## 2. Configure the browser client

Edit `progress-config.js` using only the Project URL and public publishable/anon key from **Project Settings → API**:

```js
window.RALLY_PROGRESS_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  supabaseAnonKey: 'YOUR_PUBLIC_ANON_KEY'
};
```

Never put a secret or service-role key in this repository or browser code. Those credentials bypass RLS.

## 3. Configure authentication

In **Authentication → URL Configuration**:

1. Set the production Site URL.
2. Add the exact production and local `progress-login.html` callback URLs used by the app.
3. Avoid wildcard production redirect patterns.

In **Authentication → Providers**:

1. Enable Google and configure its OAuth client and callback URL.
2. Keep email/password enabled as the fallback.
3. Disable public signup for V1; create authorized identities administratively.
4. Do not use magic links in training-report notifications or the normal report flow.

A notification email contains only a locator such as:

`https://rallyschoolonline.com/progress-report.html?id=REPORT_SNAPSHOT_UUID`

The URL is not a credential. An unauthenticated visitor is sent to Google or email/password sign-in, then returned to the same report. RLS checks `player_access` before returning the snapshot.

## 4. Create users and roles

Create coach and parent users in **Authentication → Users**. The signup trigger creates their profile rows. For users created before the migration, insert missing `profiles` rows before assigning roles.

Run role assignment only in the Supabase SQL Editor or another trusted administrative environment:

```sql
insert into public.profile_roles (profile_id, role)
values
  ('COACH_AUTH_USER_UUID', 'coach'),
  ('PARENT_AUTH_USER_UUID', 'parent');
```

Ordinary authenticated clients have no INSERT, UPDATE, or DELETE privileges or policies on `profile_roles`.

## 5. Administer player assignments

The browser creates a player through `public.create_player(jsonb)`. Its private transactional implementation verifies the caller has a coach role and atomically inserts both the player and that coach's initial assignment.

Assign parents or additional coaches only from the SQL Editor/trusted administration path:

```sql
insert into public.player_access (player_id, profile_id, access_role)
values ('PLAYER_UUID', 'PARENT_AUTH_USER_UUID', 'parent');

insert into public.player_access (player_id, profile_id, access_role)
values ('PLAYER_UUID', 'ADDITIONAL_COACH_UUID', 'coach');
```

Revoke access administratively:

```sql
delete from public.player_access
where player_id = 'PLAYER_UUID'
  and profile_id = 'PROFILE_UUID'
  and access_role = 'coach';
```

`player_access` is the sole authorization source. `players.created_by` is immutable audit metadata and grants no access. Removal takes effect on the next database request, and a removed coach cannot re-add themselves.

Before granting access, verify that the profile's `profile_roles` entry matches the requested access role. Normal clients cannot query or mutate `player_access` directly.

## 6. Historical publication and corrections

The browser publishes through `public.publish_training_report(...)`. Its private implementation performs one database transaction that inserts the session, optional private note, optional supplied assessments, and an immutable snapshot of the session details, public player profile, goals, and assessment history. A failure rolls back the entire publication.

Later profile, goal, or assessment changes do not alter an existing snapshot. Snapshot rows have no authenticated write grants/policies and also have a database trigger rejecting UPDATE and DELETE.

Assessments are append-only. A correction is a new assessment with `supersedes_assessment_id`, `correction_reason`, and `correction_kind`. The original remains stored and visible in history. Composite foreign keys prevent cross-player correction links, and a partial unique index permits only one direct replacement per assessment.

## 7. Required pre-production checks

Use separate accounts for Coach A, Coach B, an assigned parent, and an unrelated user. Run the included local pgTAP test and confirm:

- assigned coach allow cases and unassigned coach deny cases
- immediate revocation behavior
- assigned parent read-only behavior
- direct private-note denial for parents
- anon and unrelated-user denial
- role/assignment escalation denial
- immutable relationship enforcement
- historical snapshot stability
- assessment correction and cross-player constraints

Also configure a pinned/self-hosted Supabase JavaScript build and a Content Security Policy before production deployment.
