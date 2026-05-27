# AURA-CX Production Implementation Checklist

## Automated (Code/Config Changes Completed) ✅

### Zone 1: Edge / WAF
- [x] **nginx.conf created** with security headers
  - Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options, CSP, Referrer-Policy, Permissions-Policy
  - Rate limiting rules at edge (100 req/min per IP, 20 webhooks/min per IP)
  - HTTP to HTTPS redirect (commented for development, ready for production)

### Zone 2: API Gateway & Auth
- [x] **JWT Configuration Updated** in config.py
  - Access token expiry: 15 minutes (per fintech compliance)
  - Refresh token expiry: 7 days
  - JWS algorithm: HS256
- [x] **Webhook HMAC Verification** service created (`webhook_verifier.py`)
  - SHA-256 HMAC verification for X, Gmail, Threads, Slack
  - Constant-time comparison (prevents timing attacks)
  - Verification already integrated in ingestion routes
- [x] **Rate Limiting Middleware** created
  - Per-tenant: 500 requests/min
  - Per-IP: 100 requests/min
  - Webhook paths: 20 POST/min per source IP
- [x] **Audit Logging Service** created (`audit_logging.py`)
  - Immutable append-only logging to PostgreSQL
  - Comprehensive logging: API calls, webhooks, AI classification, auto-replies, data access, config changes, auth events
  - 5-year retention configured in models

### Zone 3: Core Services
- [x] **Deduplication Service** enhanced (already existed)
  - Message deduplication using Redis SET NX
  - 24-hour TTL per message
  - Atomic check-and-mark operation
- [x] **Webhook HMAC Integration** in routers/ingestion.py
  - Verification enforced on all incoming webhooks
  - Rejects unsigned or invalid-signature webhooks

### Zone 4: Data Layer
- [x] **PostgreSQL RLS Templates** documented
  - Configuration steps provided in PRODUCTION_MANUAL_OPERATIONS.md
  - Row-level security policies template for tenant isolation
- [x] **PostgreSQL Encryption** templates provided
  - pgcrypto extension setup documented
  - Example encryption queries for PII fields
- [x] **Redis Authentication** configured in docker-compose.yml
  - Password required with `--requirepass` flag
  - Updated all connection strings with `:${REDIS_PASSWORD}@`
  - HEALTHCHECK uses authenticated redis-cli

### Zone 5: Observability Stack (All Infrastructure in Place)
- [x] **docker-compose.yml Updated** with monitoring services
  - Prometheus for metrics collection
  - Grafana for visualization & alerting
  - Loki for log aggregation
  - All services configured with proper volumes & logging drivers
- [x] **prometheus.yml** created
  - Backend metrics scraping configured
  - Prometheus self-monitoring enabled
  - 30-day metrics retention configured
- [x] **grafana datasources** configured
  - Prometheus datasource configured
  - Loki datasource configured
- [x] **loki-config.yml** created
  - Log storage configured with filesystem backend
  - 5-month retention configured (adjustable for compliance)
  - Loki API enabled for log queries

### Zone 6: CI/CD Pipeline
- [x] **.github/workflows/deploy.yml** created with:
  - **SAST Scanning**: GitHub CodeQL for Python & JavaScript
  - **Dependency Audit**: pip-audit and npm audit integration
  - **Linting**: Ruff for Python code quality
  - **Container Scanning**: Trivy scanning for both backend & frontend
  - **Image Signing**: Cosign for signed container images
  - **Multi-stage Build**: Separate backend/frontend image builds
  - **Canary Deployment**: Ready for 10% traffic rollout (webhook trigger)

### Zone 7: Configuration
- [x] **config.py enhanced** with:
  - JWT scopes and short expiry times
  - Audit logging settings
  - Rate limiting configuration (all tunable per plan tier)
  - All settings with required validation

---

## Manual Operations (User Action Required) ⚠️

### Phase 1: Third-Party Services (Critical Path)

#### 1. Cloudflare WAF Setup (2-4 hours)
- [ ] Create Cloudflare account
- [ ] Add domain & update nameservers
- [ ] Enable WAF Managed Rulesets (OWASP Core)
- [ ] Configure rate limiting at edge
- [ ] Set TLS minimum to 1.2
- [ ] Enable HSTS headers
- [ ] Verify SSL certificate provisioning

**Reference:** PRODUCTION_MANUAL_OPERATIONS.md → Section 1.1

#### 2. AWS/Azure India Region Setup (4-8 hours)
- [ ] Choose cloud provider (AWS or Azure)
- [ ] Create account in India region (ap-south-1 for AWS, Central/South India for Azure)
- [ ] Set up VPC/Resource groups
- [ ] Create RDS/Azure PostgreSQL instance
- [ ] Create ElastiCache/Azure Redis instance
- [ ] Enable CloudTrail/Activity Log (5-year retention)
- [ ] Configure S3/Blob Storage with encryption

**Critical Compliance Requirement:** Data must stay in India (RBI guideline)

**Reference:** PRODUCTION_MANUAL_OPERATIONS.md → Section 1.2

#### 3. HashiCorp Vault Secrets Manager (4-6 hours)
- [ ] Sign up for HashiCorp Cloud or deploy self-hosted Vault
- [ ] Generate and store all secrets:
  - SECRET_KEY (256-bit)
  - WEBHOOK_SIGNING_SECRET
  - ENCRYPTION_KEY (Fernet format)
  - GEMINI_API_KEY
  - STRIPE_SECRET_KEY + price IDs
  - TWILIO_ACCOUNT_SID, AUTH_TOKEN, PHONE_NUMBER
  - Database password
  - Redis password
  - Grafana password
- [ ] Configure automatic secret rotation (90-day cycle)
- [ ] Create Vault policies for backend service access
- [ ] Test secret retrieval

**Reference:** PRODUCTION_MANUAL_OPERATIONS.md → Section 1.3

#### 4. SSL/TLS Certificates (2-4 hours)
- [ ] Generate SSL certificates (Let's Encrypt, AWS ACM, or paid CA)
- [ ] Place certificates in `./certs/` directory
- [ ] Update nginx.conf with certificate paths
- [ ] Uncomment HTTPS server block in nginx.conf
- [ ] Test HTTPS connectivity
- [ ] Verify TLS version 1.2+ is negotiated

**Reference:** PRODUCTION_MANUAL_OPERATIONS.md → Section 1.4

---

### Phase 2: Database Security (2-4 hours)

#### 5. PostgreSQL Row-Level Security (RLS) (2-3 hours)
- [ ] Connect to production PostgreSQL
- [ ] Run: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on all tables
- [ ] Create RLS policies for tenant isolation
- [ ] Update FastAPI backend to set tenant context: `SET app.current_tenant`
- [ ] Test RLS isolation between tenants
- [ ] Verify data cannot leak cross-tenant

**Reference:** PRODUCTION_MANUAL_OPERATIONS.md → Section 2.1

#### 6. PostgreSQL Encryption at Rest (1-2 hours)
- [ ] Enable pgcrypto extension: `CREATE EXTENSION pgcrypto`
- [ ] Encrypt existing PII fields (email, names, phone numbers)
- [ ] Create transparent decryption views
- [ ] Update ORM queries to use encrypted fields
- [ ] Test encryption/decryption pipeline

**Reference:** PRODUCTION_MANUAL_OPERATIONS.md → Section 2.2

---

### Phase 3: Operational Setup (3-5 hours)

#### 7. Grafana Dashboards (2-3 hours)
- [ ] Access Grafana (http://grafana-domain:3001)
- [ ] Create dashboard: API Health (response times, error rates, rate limits)
- [ ] Create dashboard: Task Processing (Celery queue, task success rate)
- [ ] Create dashboard: Data Quality (AI confidence, auto-reply success, dedup rate)
- [ ] Configure alert rules in Prometheus
- [ ] Set up Slack/PagerDuty notifications
- [ ] Create runbook links in dashboard panels

**Reference:** PRODUCTION_MANUAL_OPERATIONS.md → Section 3.1

#### 8. Centralized Logging (1-2 hours)
- [ ] Configure Loki retention policy (3 months minimum, 5 years recommended)
- [ ] Create Loki queries in Grafana for different log levels
- [ ] Set up log-based alerts (auth failures, database errors, webhook issues)
- [ ] Test log ingestion from all containers

**Reference:** PRODUCTION_MANUAL_OPERATIONS.md → Section 3.2

---

### Phase 4: Compliance & Security (4-6 hours)

#### 9. RBI Compliance Checklist Review (1-2 hours)
- [ ] Verify data residency (all in India region)
- [ ] Confirm TLS 1.2+ everywhere
- [ ] Verify encryption at rest (PostgreSQL, Redis, Storage)
- [ ] Check audit logging enabled (5-year retention)
- [ ] Review RBAC setup
- [ ] Verify rate limiting configured
- [ ] Confirm input validation in place
- [ ] Set up secret rotation schedule

**Reference:** PRODUCTION_MANUAL_OPERATIONS.md → Section 4.1

#### 10. Penetration Testing (Quarterly Task - ~1-2 weeks)
- [ ] Hire RBI-approved penetration tester (DSCI certified)
- [ ] Define scope (infrastructure, APIs, frontend, webhooks)
- [ ] Execute pen test
- [ ] Review results & create fix plan
- [ ] Fix critical issues within 7 days
- [ ] Fix high issues within 30 days
- [ ] Keep report for compliance audit

**Budget:** ₹2-5 lakhs annually

**Reference:** PRODUCTION_MANUAL_OPERATIONS.md → Section 4.2

#### 11. Policy Documentation (2-3 hours)
- [ ] Create Data Classification Policy (document PII, Sensitive, Public fields)
- [ ] Create Access Control Policy (define RBAC levels)
- [ ] Create Data Retention Policy (5-year audit logs, 3-year tickets, 1-month backups)
- [ ] Create Incident Response Policy (critical incident definition, escalation path)
- [ ] Create Change Management Policy (code review, testing, deployment windows)

**Reference:** PRODUCTION_MANUAL_OPERATIONS.md → Section 4.3

---

## Ongoing Maintenance (Weekly/Monthly/Quarterly)

### Weekly Checklist (30 minutes)
- [ ] Review error logs in Grafana
- [ ] Check Celery queue depth < 500
- [ ] Verify automated backups completed
- [ ] Check SSL certificate expiry
- [ ] Review Cloudflare WAF events

### Monthly Checklist (2 hours)
- [ ] Update dependencies (pip audit, npm audit)
- [ ] Review API metrics for slowdowns
- [ ] Test disaster recovery
- [ ] Review suspicious access patterns

### Quarterly Checklist (4 hours)
- [ ] Security IAM audit
- [ ] Update runbooks
- [ ] Performance tuning
- [ ] Compliance review
- [ ] Capacity planning

### Annual Checklist (1-2 weeks)
- [ ] Professional penetration test
- [ ] Full SAST review
- [ ] Disaster recovery drill
- [ ] Compliance certification renewal

---

## Summary: Automated vs Manual

| Component | Automated | Manual | Status |
|-----------|-----------|--------|--------|
| **Nginx Security Headers** | ✅ | - | Complete |
| **Rate Limiting** | ✅ | - | Complete |
| **Webhook Verification** | ✅ | - | Complete |
| **Audit Logging** | ✅ | - | Complete |
| **JWT Configuration** | ✅ | - | Complete |
| **PostgreSQL RLS** | 📋 | ⚠️ | Config provided, manual setup |
| **PostgreSQL Encryption** | 📋 | ⚠️ | Config provided, manual setup |
| **Redis Auth** | ✅ | - | Complete |
| **Prometheus** | ✅ | - | Complete |
| **Grafana Dashboards** | ✅ | ⚠️ | Infrastructure ready, dashboards manual |
| **Loki Logging** | ✅ | ⚠️ | Infrastructure ready, queries manual |
| **CI/CD Pipeline** | ✅ | - | Complete |
| **Cloudflare WAF** | - | ⚠️ | Manual setup required |
| **AWS/Azure Setup** | - | ⚠️ | Manual setup required |
| **Vault Integration** | - | ⚠️ | Manual setup required |
| **SSL/TLS Certs** | - | ⚠️ | Manual setup required |
| **Compliance Review** | - | ⚠️ | Manual audit required |
| **Pen Testing** | - | ⚠️ | Quarterly external engagement |

---

## Environment File Template

Create `.env` file in root with (or store in Vault):

```bash
# ═══════════════════════════════════════════════════════════
# AURA-CX Production Environment Variables
# ═══════════════════════════════════════════════════════════

# SECURITY KEYS (Generate and store in Vault)
SECRET_KEY=<256-bit-key-from-vault>
WEBHOOK_SIGNING_SECRET=<random-key-from-vault>
ENCRYPTION_KEY=<fernet-key-from-vault>

# DATABASE & CACHE
DB_PASSWORD=<strong-password>
REDIS_PASSWORD=<strong-password>

# API KEYS
GEMINI_API_KEY=<from-google-cloud>
STRIPE_SECRET_KEY=<from-stripe>
STRIPE_PRICE_STARTER=price_xxx
STRIPE_PRICE_PRO=price_yyy
STRIPE_PRICE_ENTERPRISE=price_zzz

# COMMUNICATION
TWILIO_ACCOUNT_SID=<from-twilio>
TWILIO_AUTH_TOKEN=<from-twilio>
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx

# BOOTSTRAP
BOOTSTRAP_TENANT_ID=<uuid>
BOOTSTRAP_TENANT_NAME=Your Company
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=<strong-password>

# MONITORING
GRAFANA_PASSWORD=<strong-password>

# INFRASTRUCTURE
ENVIRONMENT=production
FRONTEND_URL=https://app.your-domain.com
```

---

## Deployment Steps

1. **Set up Vault & configure all secrets** (Week 1)
2. **Deploy infrastructure to AWS/Azure India** (Week 1-2)
3. **Deploy docker-compose stack** (Week 2)
4. **Configure PostgreSQL RLS** (Week 2)
5. **Set up Cloudflare WAF** (Week 2-3)
6. **Configure monitoring dashboards** (Week 3)
7. **Compliance audit & documentation** (Week 4)
8. **Penetration testing** (Before go-live)
9. **Go-live with canary deployment** (When ready)

---

**Total Automated Setup Time:** ~2-3 hours (code review + testing)
**Total Manual Setup Time:** ~40-50 hours (third-party services, database, compliance)
**Estimated Full Deployment:** 4-6 weeks from start to production-ready

---

**Generated:** May 17, 2026
**Last Updated:** [Your Date]
**Owner:** [Your Team]
