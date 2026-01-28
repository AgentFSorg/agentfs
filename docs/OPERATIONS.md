# Operations Runbook

This document covers operational procedures for AgentFS.

## Database Backup

### Full Backup

```bash
# Set connection details
export PGHOST=localhost
export PGPORT=5432
export PGUSER=agentfs
export PGPASSWORD=agentfs
export PGDATABASE=agentfs

# Create timestamped backup
pg_dump -Fc -f "backup_$(date +%Y%m%d_%H%M%S).dump"

# Or with explicit connection string
pg_dump -Fc "postgresql://agentfs:agentfs@localhost:5432/agentfs" \
  -f "backup_$(date +%Y%m%d_%H%M%S).dump"
```

### Backup Specific Tables

```bash
# Backup only entry data (excluding embeddings for smaller size)
pg_dump -Fc -t tenants -t api_keys -t entries -t entry_versions \
  -f "backup_entries_$(date +%Y%m%d_%H%M%S).dump"
```

### Automated Backup Script

Create `/opt/agentfs/backup.sh`:

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/var/backups/agentfs"
RETENTION_DAYS=30
DATABASE_URL="${DATABASE_URL:-postgresql://agentfs:agentfs@localhost:5432/agentfs}"

mkdir -p "$BACKUP_DIR"

# Create backup
BACKUP_FILE="$BACKUP_DIR/agentfs_$(date +%Y%m%d_%H%M%S).dump"
pg_dump -Fc "$DATABASE_URL" -f "$BACKUP_FILE"

# Verify backup is not empty
if [ ! -s "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file is empty"
  exit 1
fi

# Remove old backups
find "$BACKUP_DIR" -name "agentfs_*.dump" -mtime +$RETENTION_DAYS -delete

echo "Backup complete: $BACKUP_FILE"
```

Add to crontab for daily backups:
```bash
0 2 * * * /opt/agentfs/backup.sh >> /var/log/agentfs-backup.log 2>&1
```

## Database Restore

### Full Restore

```bash
# Stop the API server first
docker compose stop api

# Restore from backup (drops and recreates)
pg_restore -d agentfs --clean --if-exists backup_20260128_120000.dump

# Or create a new database from backup
createdb agentfs_restored
pg_restore -d agentfs_restored backup_20260128_120000.dump

# Restart the API server
docker compose start api
```

### Restore to Point in Time

For point-in-time recovery, you need WAL archiving configured. This is beyond MVP scope but documented here for reference:

```bash
# Requires postgresql.conf settings:
# archive_mode = on
# archive_command = 'cp %p /var/lib/postgresql/wal_archive/%f'

# Restore with recovery target
pg_restore -d agentfs --clean backup.dump
# Then apply WAL logs up to target time
```

### Verify Restore

After restore, verify data integrity:

```bash
# Connect to database
psql -d agentfs

# Check row counts
SELECT 'tenants' as table_name, COUNT(*) FROM tenants
UNION ALL SELECT 'api_keys', COUNT(*) FROM api_keys
UNION ALL SELECT 'entries', COUNT(*) FROM entries
UNION ALL SELECT 'entry_versions', COUNT(*) FROM entry_versions
UNION ALL SELECT 'embeddings', COUNT(*) FROM embeddings;

# Verify foreign key integrity
SELECT COUNT(*) FROM entries e
LEFT JOIN entry_versions ev ON e.latest_version_id = ev.id
WHERE ev.id IS NULL;  -- Should be 0

# Test API health
curl http://localhost:8787/healthz
```

## Disaster Recovery Drill

Run this quarterly to verify backup/restore procedures:

1. **Create test data**
   ```bash
   curl -X POST http://localhost:8787/v1/put \
     -H "Authorization: Bearer $API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"agent_id":"dr-test","path":"/dr-test/marker","value":{"timestamp":"'$(date -Iseconds)'"}}'
   ```

2. **Create backup**
   ```bash
   pg_dump -Fc agentfs -f dr_test_backup.dump
   ```

3. **Verify backup file**
   ```bash
   pg_restore -l dr_test_backup.dump | head -20
   ```

4. **Restore to test database**
   ```bash
   createdb agentfs_dr_test
   pg_restore -d agentfs_dr_test dr_test_backup.dump
   ```

5. **Verify test data exists**
   ```bash
   psql -d agentfs_dr_test -c "SELECT * FROM entry_versions WHERE path = '/dr-test/marker'"
   ```

6. **Cleanup**
   ```bash
   dropdb agentfs_dr_test
   rm dr_test_backup.dump
   ```

## Monitoring

### Health Checks

```bash
# API health
curl -f http://localhost:8787/healthz || echo "API unhealthy"

# Database connection
pg_isready -h localhost -p 5432 -d agentfs || echo "DB unreachable"
```

### Metrics

Prometheus metrics available at `/metrics`:

- `agentfs_http_requests_total{route,method,status}` - Request counts
- `agentfs_http_request_duration_ms{route,method}` - Latency histogram
- `agentfs_embedding_jobs_total{status}` - Embedding job counts
- `agentfs_quota_denials_total{type}` - Quota denial counts

### Log Analysis

```bash
# Find errors in API logs
docker compose logs api 2>&1 | grep -i error

# Find slow requests (if structured logging enabled)
docker compose logs api 2>&1 | grep "responseTime" | awk '$NF > 1000'
```

## Scaling

### Horizontal Scaling

The API is stateless and can be scaled horizontally:

```yaml
# docker-compose.prod.yml
services:
  api:
    deploy:
      replicas: 3
    # Add load balancer in front
```

### Database Scaling

For read-heavy workloads, add read replicas:

```bash
# On primary
ALTER SYSTEM SET wal_level = replica;
ALTER SYSTEM SET max_wal_senders = 3;

# On replica
pg_basebackup -h primary -D /var/lib/postgresql/data -U replicator -P -R
```

### Connection Pooling

For high connection counts, use PgBouncer:

```ini
# pgbouncer.ini
[databases]
agentfs = host=localhost port=5432 dbname=agentfs

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20
```

## Troubleshooting

### API Not Starting

```bash
# Check logs
docker compose logs api

# Common issues:
# - DATABASE_URL not set or incorrect
# - Port 8787 already in use
# - Missing .env file
```

### Database Connection Errors

```bash
# Test connection
psql "$DATABASE_URL" -c "SELECT 1"

# Check if Postgres is running
docker compose ps db

# Check connection limits
psql -c "SELECT count(*) FROM pg_stat_activity"
```

### Quota Exceeded Errors

```bash
# Check current usage
psql -c "SELECT * FROM quota_usage WHERE day = CURRENT_DATE"

# Reset quota (emergency only)
psql -c "UPDATE quota_usage SET writes = 0 WHERE tenant_id = 'xxx' AND day = CURRENT_DATE"
```

### Embedding Jobs Stuck

```bash
# Check job status
psql -c "SELECT status, COUNT(*) FROM embedding_jobs GROUP BY status"

# Reset failed jobs
psql -c "UPDATE embedding_jobs SET status = 'queued', attempts = 0 WHERE status = 'failed'"

# Check worker logs
docker compose logs worker
```
