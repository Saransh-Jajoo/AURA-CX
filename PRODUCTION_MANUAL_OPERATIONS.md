# AURA-CX Production Security & Compliance Manual Operations Guide

## Overview
This document outlines all MANUAL steps required for production deployment of AURA-CX as a bank-facing fintech application in India. These are items that cannot be automated and require human decision-making, configuration, or third-party service integration.

---

## Phase 1: Pre-Deployment (Week 1-2)

### 1.1 Cloudflare WAF Setup (MANUAL)

**Why:** Add edge protection layer before traffic reaches your FastAPI server.

**Steps:**

1. **Create Cloudflare Account**
   - Sign up at https://www.cloudflare.com
   - Choose Free tier or Pro ($200/month) for WAF access
   - Add your domain to Cloudflare nameservers

2. **Enable WAF Rules**
   - Go to Security → WAF Rules
   - Enable: Cloudflare Managed Ruleset (OWASP Core Ruleset)
   - Recommended sensitivity: "High"
   - Enable challenges for suspicious traffic

3. **Rate Limiting at Edge**
   - Security → Rate Limiting
   - Rule: Block IPs with >100 requests/min
   - Rule: Challenge IPs with >500 requests/hour
   - Webhook sources: Limit to 20 POST requests/min per IP

4. **DDoS Protection**
   - Automatically enabled with WAF
   - Set to "High" sensitivity for fintech
   - Enable "Advanced DDoS" if on Pro plan

5. **TLS Configuration**
   - SSL/TLS → Edge Certificates
   - Set minimum TLS version: 1.2
   - Recommended: Always HTTPS
   - Enable HSTS: max-age=31536000

6. **Cache Configuration**
   - Caching → Cache Rules
   - Set longer TTLs for static content (24h)
   - Bypass cache for /api/* endpoints

**Verification:**
```bash
# After setup, verify:
curl -I https://your-domain.com/health
# Should show: Strict-Transport-Security header
```

---

### 1.2 AWS/Azure Regional Setup (MANUAL - COMPLIANCE CRITICAL)

**Why:** RBI guidelines require data residency in India.

**Option A: AWS Mumbai (ap-south-1)**

1. Create AWS Account (if not exists)
2. Set up VPC in `ap-south-1` (Mumbai region)
3. Create RDS PostgreSQL instance in Mumbai
4. Create ElastiCache Redis cluster in Mumbai
5. Enable CloudTrail for audit logging (5-year retention)
6. Set up S3 buckets in Mumbai with encryption

**Option B: Azure India**

1. Create Azure Account
2. Set up resource groups in "Central India" or "South India"
3. Create Azure Database for PostgreSQL (in India region)
4. Create Azure Cache for Redis (in India region)
5. Enable Azure Activity Log (5-year retention)
6. Set up Azure Blob Storage with encryption

**Action Item:**
- [ ] Choose AWS or Azure
- [ ] Create account in India region
- [ ] Verify resources are in India (compliance requirement)
- [ ] Enable audit logging with 5-year retention

---

### 1.3 Vault Secrets Manager Setup (MANUAL)

**Why:** Replace environment variables with centralized secrets management.

**Steps:**

1. **Deploy Vault**
   - Option 1: HashiCorp Cloud (https://cloud.hashicorp.com) - Recommended
   - Option 2: Self-hosted Vault on EC2/VM

2. **Create Vault Secrets**
   ```
   vault kv put aura-cx/api \
     SECRET_KEY=<generate-random-256-bit-key> \
     WEBHOOK_SIGNING_SECRET=<generate-random-256-bit-key> \
     ENCRYPTION_KEY=<generate-fernet-key>
   
   vault kv put aura-cx/gemini \
     api_key=<your-gemini-api-key>
   
   vault kv put aura-cx/stripe \
     secret_key=<your-stripe-secret-key> \
     price_starter=price_xxx \
     price_pro=price_yyy \
     price_enterprise=price_zzz
   
   vault kv put aura-cx/twilio \
     account_sid=<your-twilio-sid> \
     auth_token=<your-twilio-token> \
     phone_number=+1xxxxxxxxxx
   
   vault kv put aura-cx/database \
     password=<generate-strong-db-password>
   
   vault kv put aura-cx/redis \
     password=<generate-strong-redis-password>
   ```

3. **Enable Automatic Rotation**
   - Configure Vault to rotate database passwords every 90 days
   - Set up notifications when rotation occurs

4. **Access Control**
   - Create Vault policy for your backend service
   - Limit backend service to read-only access to secrets
   - Restrict secret reads by tenant (if using Vault Enterprise)

**Verification:**
```bash
vault kv get aura-cx/api
vault kv get aura-cx/gemini
```

---

### 1.4 SSL/TLS Certificates (MANUAL)

**Why:** Enforce HTTPS for all traffic (TLS 1.2+).

**Steps:**

1. **Generate Certificates**
   - Option 1: Let's Encrypt (free, automatic renewal)
     ```bash
     certbot certonly --manual -d api.aura-cx.example.com
     ```
   - Option 2: AWS Certificate Manager (free if using AWS)
   - Option 3: Paid CA (DigiCert, Sectigo)

2. **Place Certificates**
   ```bash
   mkdir -p ./certs
   cp /path/to/cert.pem ./certs/cert.pem
   cp /path/to/key.pem ./certs/key.pem
   chmod 400 ./certs/key.pem
   ```

3. **Update nginx.conf**
   - Uncomment the HTTPS server block
   - Update certificate paths
   - Reload nginx

4. **Test TLS**
   ```bash
   openssl s_client -connect api.aura-cx.example.com:443
   # Should show: TLSv1.2 or TLSv1.3
   ```

---

## Phase 2: Database Security (Week 2)

### 2.1 PostgreSQL Row-Level Security (RLS) Configuration (MANUAL)

**Why:** Prevent tenant data leakage even if application code has bugs.

**Steps:**

1. **Connect to PostgreSQL**
   ```bash
   psql -h postgres.your-domain.com -U postgres -d aura_cx
   ```

2. **Enable RLS on All Tables**
   ```sql
   -- Enable RLS on all tenant-scoped tables
   ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
   ALTER TABLE users ENABLE ROW LEVEL SECURITY;
   ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
   ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
   ALTER TABLE integration_sources ENABLE ROW LEVEL SECURITY;
   ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
   ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
   
   -- ... for ALL tenant-scoped tables
   ```

3. **Create RLS Policy for Tenant Isolation**
   ```sql
   -- Policy: Users can only see their own tenant's data
   CREATE POLICY tenant_isolation_tickets ON tickets
   USING (tenant_id = current_setting('app.current_tenant')::uuid);
   
   CREATE POLICY tenant_isolation_profiles ON customer_profiles
   USING (tenant_id = current_setting('app.current_tenant')::uuid);
   
   CREATE POLICY tenant_isolation_users ON users
   USING (tenant_id = current_setting('app.current_tenant')::uuid);
   
   -- ... for ALL tenant-scoped tables
   ```

4. **Update FastAPI to Set Tenant Context**
   - In each route, before database queries:
     ```python
     from sqlalchemy import text
     await session.execute(text(f"SET app.current_tenant = '{tenant_id}'"))
     ```

5. **Test RLS**
   ```sql
   SET app.current_tenant = '00000000-0000-0000-0000-000000000001';
   SELECT * FROM tickets;
   -- Should only return tickets for tenant 1
   
   SET app.current_tenant = '00000000-0000-0000-0000-000000000002';
   SELECT * FROM tickets;
   -- Should only return tickets for tenant 2 (or empty if none)
   ```

**Action Item:**
- [ ] Connect to production PostgreSQL
- [ ] Enable RLS on all tables
- [ ] Create policies
- [ ] Test tenant isolation

---

### 2.2 PostgreSQL Encryption at Rest (MANUAL)

**Why:** Encrypt PII fields: customer names, emails, phone numbers.

**Steps:**

1. **Enable pgcrypto Extension**
   ```sql
   CREATE EXTENSION IF NOT EXISTS pgcrypto;
   ```

2. **Create Encryption Key (store in Vault)**
   - Generate: `openssl rand -hex 32` → store as ENCRYPTION_KEY in Vault

3. **Encrypt Existing Data**
   ```sql
   -- Example: Encrypt customer_profiles.email
   UPDATE customer_profiles 
   SET email = pgp_sym_encrypt(email, current_setting('app.encryption_key'))
   WHERE email IS NOT NULL AND email NOT LIKE 'x'||'%'||'x';
   -- (checking if already encrypted)
   ```

4. **Create Transparent View for Decryption**
   ```sql
   CREATE OR REPLACE VIEW customer_profiles_decrypted AS
   SELECT 
     id, tenant_id,
     pgp_sym_decrypt(email::bytea, current_setting('app.encryption_key')) as email,
     pgp_sym_decrypt(name::bytea, current_setting('app.encryption_key')) as name,
     -- ... other fields
   FROM customer_profiles;
   ```

5. **Update ORM Models**
   - In FastAPI routes, query from the decrypted view
   - Or decrypt in application layer

**Testing:**
```bash
# Verify encrypted column
SELECT id, email FROM customer_profiles LIMIT 1;
# Should show gibberish (encrypted binary)

# Verify decryption
SELECT id, pgp_sym_decrypt(email::bytea, 'your-key') FROM customer_profiles LIMIT 1;
# Should show actual email
```

---

## Phase 3: Operational Setup (Week 3)

### 3.1 Grafana Dashboards Creation (MANUAL)

**Why:** Monitor production health and alert on anomalies.

**Steps:**

1. **Access Grafana**
   - Navigate to http://grafana.your-domain.com:3001
   - Login: admin / ${GRAFANA_PASSWORD}

2. **Create Dashboard: API Health**
   - Add panels for:
     - API response time (p50, p95, p99)
     - Request rate (requests/sec)
     - Error rate (5xx status codes)
     - Rate limit hits

3. **Create Dashboard: Task Processing**
   - Add panels for:
     - Celery queue depth (should be < 500)
     - Task success rate (should be > 95%)
     - Task execution time (p95 should be < 10 seconds)
     - Webhook processing latency

4. **Create Dashboard: Data Quality**
   - Add panels for:
     - AI classification confidence (should be > 0.85)
     - Auto-reply success rate (should be > 90%)
     - Duplicate detection rate
     - Message language distribution

5. **Create Alerts** (Alertmanager integration)
   - Alert: Celery queue depth > 500 → Page on-call engineer
   - Alert: Task failure rate > 5% in 5 min → Page
   - Alert: API response time p95 > 5s → Warn
   - Alert: Database connection pool > 80% → Warn

**Action Items:**
- [ ] Create API Health dashboard
- [ ] Create Task Processing dashboard
- [ ] Create Data Quality dashboard
- [ ] Set up alert rules in Prometheus
- [ ] Configure Slack/PagerDuty integration

---

### 3.2 Set Up Centralized Logging (MANUAL)

**Why:** Immutable audit trail for compliance + troubleshooting.

**Steps:**

1. **Loki Log Aggregation**
   - Already running in docker-compose
   - All containers log to Loki (via Docker logging driver)

2. **Create Log Retention Policy**
   ```
   In loki-config.yml:
   - Set retention_period: 2160h (3 months minimum)
   - Consider 5 years for audit logs
   ```

3. **Create Loki Queries in Grafana**
   - Query: `{container_name="aura-cx-backend"} | json | level="ERROR"`
   - Query: `{container_name="aura-cx-backend"} | json | action="webhook_received"`

4. **Set Up Log Alerts**
   - Alert: Authentication failures > 10 in 5 min → Investigate
   - Alert: Database errors > 5 in 5 min → Page
   - Alert: Webhook signature failures → Investigate

**Testing:**
```bash
# Verify logs reach Loki
curl http://localhost:3100/loki/api/v1/query?query='%7Bcontainer_name%3D%22aura-cx-backend%22%7D'
```

---

## Phase 4: Compliance & Security (Week 4)

### 4.1 RBI Compliance Checklist (MANUAL REVIEW)

**Why:** Fintech apps in India serving banking customers must meet RBI IT guidelines.

**Checklist:**

- [ ] **Data Residency**
  - All data hosted in India (AWS Mumbai or Azure India)
  - No cross-border data transfer
  - Verify: `aws ec2 describe-instances --region ap-south-1`

- [ ] **Encryption in Transit**
  - TLS 1.2+ for all external communication
  - mTLS between internal services
  - Verify: `openssl s_client -connect api:443` shows TLSv1.2 or TLSv1.3

- [ ] **Encryption at Rest**
  - PostgreSQL: Enabled pgcrypto
  - Redis: AUTH required (already done)
  - S3/Storage: AES-256 encryption
  - Verify: `SELECT * FROM information_schema.enabled_roles WHERE role_name LIKE '%cryp%'`

- [ ] **Audit Logging**
  - All API calls logged to audit_events table
  - Immutable logs (no delete permissions)
  - 5-year retention configured
  - Verify: `SELECT COUNT(*) FROM audit_events` returns > 0

- [ ] **Access Control**
  - RBAC implemented (tenant_admin, support_agent, qa_reviewer, executive, super_admin)
  - No shared credentials
  - Each user has unique login
  - Verify: `SELECT COUNT(DISTINCT email) FROM users`

- [ ] **Vulnerability Management**
  - Monthly dependency audits (`pip audit`, `npm audit`)
  - SAST scanning in CI/CD (CodeQL enabled)
  - Container image scanning (Trivy enabled)
  - Verify: GitHub Actions workflow runs on every push

- [ ] **Incident Response**
  - Documented runbook for security incidents
  - < 4-hour response SLA for critical issues
  - Contact person assigned
  - Escalation path defined

- [ ] **API Rate Limiting**
  - Per-tenant: 500 requests/min
  - Per-IP: 100 requests/min
  - Webhook: 20 POST requests/min
  - Verify: Test with `ab -n 600 -c 1 http://localhost:8000/health`

- [ ] **Input Validation**
  - All API inputs validated
  - SQL injection protected (using ORM)
  - XSS protected (Frontend CSP header)
  - Verify: Use OWASP ZAP to scan

- [ ] **Secret Rotation**
  - Database passwords: every 90 days (Vault automation)
  - API keys: every 180 days
  - Encryption keys: every 365 days
  - Verify: Scheduled CloudWatch/Cron jobs

---

### 4.2 Pen Testing & Security Audit (MANUAL - ANNUAL)

**Why:** Professional security assessment for fintech compliance.

**Steps:**

1. **Hire Approved Penetration Tester**
   - For India-based fintech: Approved by RBI (DSCI certified recommended)
   - Cost: ~₹1-5 lakhs (1-2 weeks, depending on scope)
   - Scope: Full infrastructure, APIs, frontend, webhooks

2. **Run Penetration Test**
   - OWASP Top 10 coverage
   - Infrastructure assessment (AWS/Azure)
   - API security testing
   - Data exfiltration attempts

3. **Review Results**
   - Critical issues: Fix within 7 days
   - High issues: Fix within 30 days
   - Medium issues: Fix within 90 days
   - Low issues: Fix within 180 days

4. **Report & Compliance**
   - Keep pen test report (proof of due diligence)
   - Document all fixes
   - Re-test fixed issues

**Action Items:**
- [ ] Schedule pen test (Q1, Q2, Q3, or Q4)
- [ ] Assign budget (₹2-5 lakhs annually)
- [ ] Create incident response runbook
- [ ] Brief team on findings

---

### 4.3 Policy Documentation (MANUAL)

**Why:** Required for regulatory compliance & internal governance.

**Documents to Create:**

1. **Data Classification Policy**
   - PII: Customer names, emails, phone numbers → Encrypt
   - Sensitive: API keys, secrets → Vault
   - Public: Product info → No encryption needed
   - Action: [ ] Classify all fields in models.py

2. **Access Control Policy**
   - Super Admin: Can manage all tenants, users, system config
   - Tenant Admin: Can manage own tenant's users, integrations, billing
   - Support Agent: Can view/respond to tickets, view profiles
   - QA Reviewer: Can review agent edits, approve RLHF signals
   - Executive: View-only analytics, billing, risk reports
   - Action: [ ] Document in RBAC.md

3. **Data Retention Policy**
   - Audit logs: 5 years (RBI requirement)
   - Tickets/Messages: 3 years
   - Backups: 1 month
   - Temporary data (sessions, cache): TTL configured
   - Action: [ ] Document in DATA_RETENTION.md

4. **Incident Response Policy**
   - Definition of critical incident
   - Escalation contacts
   - Notification procedures (customers, RBI)
   - Post-incident review
   - Action: [ ] Document in INCIDENT_RESPONSE.md

5. **Change Management Policy**
   - Code review requirements (≥2 approvals)
   - Testing requirements (unit + integration)
   - Deployment windows (business hours only)
   - Rollback procedures
   - Action: [ ] Document in CHANGE_MANAGEMENT.md

---

## Phase 5: Monitoring & Maintenance (Ongoing)

### 5.1 Weekly Operations Checklist

- [ ] Review error logs in Grafana/Loki
- [ ] Check Celery queue depth (should be < 500)
- [ ] Verify automated backups completed
- [ ] Check SSL certificate expiry (< 30 days warning)
- [ ] Review security alerts from Cloudflare
- [ ] Verify all rate limits functioning
- [ ] Check database connection pool usage

### 5.2 Monthly Operations

- [ ] Audit log size & retention
- [ ] Update dependencies (`pip install --upgrade`, `npm update`)
- [ ] Review API metrics & identify slowdowns
- [ ] Test disaster recovery procedures
- [ ] Review access logs for suspicious activity

### 5.3 Quarterly Operations

- [ ] Security audit of IAM policies
- [ ] Review and update runbooks
- [ ] Performance tuning (Celery workers, DB indexes)
- [ ] Compliance review (audit logs, data residency)
- [ ] Capacity planning (storage, compute)

### 5.4 Annual Operations

- [ ] Professional penetration test
- [ ] Code security audit (SAST results review)
- [ ] Dependency audit deep-dive
- [ ] Disaster recovery drill
- [ ] Compliance certification renewal

---

## Environment Variables Checklist (GENERATE AND SECURE IN VAULT)

Before deploying, ensure these are set in your `.env` file or Vault:

```bash
# Security
SECRET_KEY=<generate-256-bit-key>
WEBHOOK_SIGNING_SECRET=<generate-random-key>
ENCRYPTION_KEY=<generate-fernet-key>

# Database
DB_PASSWORD=<generate-strong-password>

# Redis
REDIS_PASSWORD=<generate-strong-password>

# API Keys
GEMINI_API_KEY=<from-google-cloud>
STRIPE_SECRET_KEY=<from-stripe>
STRIPE_PRICE_STARTER=price_xxx
STRIPE_PRICE_PRO=price_yyy
STRIPE_PRICE_ENTERPRISE=price_zzz

# Communication
TWILIO_ACCOUNT_SID=<from-twilio>
TWILIO_AUTH_TOKEN=<from-twilio>
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx

# Monitoring
GRAFANA_PASSWORD=<generate-strong-password>

# Bootstrap
BOOTSTRAP_TENANT_ID=<uuid-v4>
BOOTSTRAP_TENANT_NAME="Your Company Name"
BOOTSTRAP_ADMIN_EMAIL=admin@your-domain.com
BOOTSTRAP_ADMIN_PASSWORD=<generate-strong-password>
```

---

## Manual Verification Tests

### Test 1: Webhook Signature Verification
```bash
curl -X POST http://localhost:8000/api/v1/ingestion/webhook \
  -H "X-Aura-Webhook-Signature: invalid-signature" \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}'
# Should return 401 Unauthorized
```

### Test 2: Rate Limiting
```bash
# Generate 600 requests in 1 minute
for i in {1..600}; do
  curl http://localhost:8000/health &
done
# After 500 requests, should receive 429 Too Many Requests
```

### Test 3: RLS Isolation
```sql
-- Connect as two different tenants
SET app.current_tenant = 'tenant-1';
SELECT COUNT(*) FROM tickets;  -- Should return number of tenant-1 tickets

SET app.current_tenant = 'tenant-2';
SELECT COUNT(*) FROM tickets;  -- Should return different count
```

### Test 4: HTTPS/TLS
```bash
openssl s_client -connect api.your-domain.com:443
# Should show: TLSv1.2 or TLSv1.3
# Should show: Strict-Transport-Security header
```

---

## Support & Escalation

For issues with production deployment:

1. **Check Logs First**
   - Grafana/Loki dashboards
   - Container logs: `docker logs container-name`

2. **Escalation Path**
   - Application errors → Engineering team
   - Infrastructure errors → DevOps/Cloud team
   - Security incidents → Security team + RBI notification

3. **Emergency Contacts**
   - On-call engineer: [Phone/Email]
   - DevOps lead: [Phone/Email]
   - Security officer: [Phone/Email]

---

**Last Updated:** 2026-05-17
**Reviewed By:** [Your Name/Team]
**Next Review Date:** [Date + 3 months]
