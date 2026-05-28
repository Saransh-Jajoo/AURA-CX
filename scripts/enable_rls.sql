-- ════════════════════════════════════════════════════════════════
-- AURA-CX  ·  Row-Level Security (RLS) Policies
-- ════════════════════════════════════════════════════════════════
-- Run once against the aura_cx database to enable tenant isolation
-- at the database level. Every query must SET app.current_tenant first.
--
-- Usage:
--   psql -U aura -d aura_cx -f scripts/enable_rls.sql
--
-- The application sets the tenant context via:
--   SET app.current_tenant = '<tenant_id>';
-- ════════════════════════════════════════════════════════════════

-- ── Helper: Set a default for the GUC so it never errors ─────
DO $$
BEGIN
    PERFORM set_config('app.current_tenant', '', true);
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- ── Enable RLS on all tenant-scoped tables ───────────────────

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_api_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_token_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE rlhf_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_monitor_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;

-- ── Policies: tenant can only see own rows ───────────────────

-- tickets
DROP POLICY IF EXISTS tenant_isolation_tickets ON tickets;
CREATE POLICY tenant_isolation_tickets ON tickets
    USING (tenant_id = current_setting('app.current_tenant', true));

-- customer_profiles
DROP POLICY IF EXISTS tenant_isolation_profiles ON customer_profiles;
CREATE POLICY tenant_isolation_profiles ON customer_profiles
    USING (tenant_id = current_setting('app.current_tenant', true));

-- integration_sources
DROP POLICY IF EXISTS tenant_isolation_integration_sources ON integration_sources;
CREATE POLICY tenant_isolation_integration_sources ON integration_sources
    USING (tenant_id = current_setting('app.current_tenant', true));

-- tenant_configs
DROP POLICY IF EXISTS tenant_isolation_tenant_configs ON tenant_configs;
CREATE POLICY tenant_isolation_tenant_configs ON tenant_configs
    USING (tenant_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation_platform_api_connections ON platform_api_connections;
CREATE POLICY tenant_isolation_platform_api_connections ON platform_api_connections
    USING (tenant_id = current_setting('app.current_tenant', true));

-- team_invitations
DROP POLICY IF EXISTS tenant_isolation_team_invitations ON team_invitations;
CREATE POLICY tenant_isolation_team_invitations ON team_invitations
    USING (tenant_id = current_setting('app.current_tenant', true));

-- refresh_token_sessions
DROP POLICY IF EXISTS tenant_isolation_refresh_token_sessions ON refresh_token_sessions;
CREATE POLICY tenant_isolation_refresh_token_sessions ON refresh_token_sessions
    USING (tenant_id = current_setting('app.current_tenant', true));

-- password_reset_tokens are user scoped; app queries by hashed token only.
DROP POLICY IF EXISTS tenant_isolation_password_reset_tokens ON password_reset_tokens;
CREATE POLICY tenant_isolation_password_reset_tokens ON password_reset_tokens
    USING (true);

-- knowledge_documents
DROP POLICY IF EXISTS tenant_isolation_kb ON knowledge_documents;
CREATE POLICY tenant_isolation_kb ON knowledge_documents
    USING (tenant_id = current_setting('app.current_tenant', true));

-- campaign_triggers
DROP POLICY IF EXISTS tenant_isolation_campaigns ON campaign_triggers;
CREATE POLICY tenant_isolation_campaigns ON campaign_triggers
    USING (tenant_id = current_setting('app.current_tenant', true));

-- audit_events
DROP POLICY IF EXISTS tenant_isolation_audit ON audit_events;
CREATE POLICY tenant_isolation_audit ON audit_events
    USING (tenant_id = current_setting('app.current_tenant', true));

-- social_monitor_configs
DROP POLICY IF EXISTS tenant_isolation_social_configs ON social_monitor_configs;
CREATE POLICY tenant_isolation_social_configs ON social_monitor_configs
    USING (tenant_id = current_setting('app.current_tenant', true));

-- social_mentions
DROP POLICY IF EXISTS tenant_isolation_social_mentions ON social_mentions;
CREATE POLICY tenant_isolation_social_mentions ON social_mentions
    USING (tenant_id = current_setting('app.current_tenant', true));

-- rlhf_signals
DROP POLICY IF EXISTS tenant_isolation_rlhf_signals ON rlhf_signals;
CREATE POLICY tenant_isolation_rlhf_signals ON rlhf_signals
    USING (tenant_id = current_setting('app.current_tenant', true));

-- sla_events
DROP POLICY IF EXISTS tenant_isolation_sla_events ON sla_events;
CREATE POLICY tenant_isolation_sla_events ON sla_events
    USING (tenant_id = current_setting('app.current_tenant', true));

-- ticket timeline and messages
DROP POLICY IF EXISTS tenant_isolation_ticket_timeline_events ON ticket_timeline_events;
CREATE POLICY tenant_isolation_ticket_timeline_events ON ticket_timeline_events
    USING (tenant_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation_ticket_messages ON ticket_messages;
CREATE POLICY tenant_isolation_ticket_messages ON ticket_messages
    USING (tenant_id = current_setting('app.current_tenant', true));

-- ── Bypass for the application superuser ─────────────────────
-- The 'aura' role (our app user) needs BYPASSRLS or we need explicit
-- superuser policies. If running as table owner, RLS is bypassed
-- by default. For shared-role setups, grant:
--   ALTER ROLE aura BYPASSRLS;  -- Only if using a shared superuser role.

-- ── Verification ─────────────────────────────────────────────
-- Run this to verify RLS is active:
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND rowsecurity = true;
