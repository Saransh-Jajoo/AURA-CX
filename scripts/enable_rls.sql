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
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_monitor_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_mentions ENABLE ROW LEVEL SECURITY;

-- ── Policies: tenant can only see own rows ───────────────────

-- tickets
DROP POLICY IF EXISTS tenant_isolation_tickets ON tickets;
CREATE POLICY tenant_isolation_tickets ON tickets
    USING (tenant_id = current_setting('app.current_tenant', true));

-- customer_profiles
DROP POLICY IF EXISTS tenant_isolation_profiles ON customer_profiles;
CREATE POLICY tenant_isolation_profiles ON customer_profiles
    USING (tenant_id = current_setting('app.current_tenant', true));

-- integrations
DROP POLICY IF EXISTS tenant_isolation_integrations ON integrations;
CREATE POLICY tenant_isolation_integrations ON integrations
    USING (tenant_id = current_setting('app.current_tenant', true));

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

-- ── Bypass for the application superuser ─────────────────────
-- The 'aura' role (our app user) needs BYPASSRLS or we need explicit
-- superuser policies. If running as table owner, RLS is bypassed
-- by default. For shared-role setups, grant:
--   ALTER ROLE aura BYPASSRLS;  -- Only if using a shared superuser role.

-- ── Verification ─────────────────────────────────────────────
-- Run this to verify RLS is active:
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND rowsecurity = true;
