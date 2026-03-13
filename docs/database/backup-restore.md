# 💾 Backup & Restore

> Стратегія резервного копіювання. pg_dump, WAL archiving, recovery procedures.

---

## Backup Strategy

| Тип | Метод | Частота | Retention | RPO | RTO |
|---|---|---|---|---|---|
| Logical backup | pg_dump | Щоденно (03:00 UTC) | 30 днів | < 24 год | < 1 год |
| WAL archiving | pg_basebackup + WAL | Безперервно | 7 днів | < 5 хв | < 30 хв |
| Redis snapshot | RDB + AOF | Кожні 15 хв | 7 днів | < 15 хв | < 5 хв |

---

## PostgreSQL Backup

### Daily Logical Backup (pg_dump)

```bash
#!/bin/bash
# /scripts/backup-daily.sh

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/postgres"
DB_NAME="nailio"
S3_BUCKET="s3://nailio-backups/postgres"

# Create backup
pg_dump \
  --host=localhost \
  --port=5432 \
  --username=nailio_admin \
  --format=custom \
  --compress=9 \
  --file="${BACKUP_DIR}/nailio_${TIMESTAMP}.dump" \
  ${DB_NAME}

# Upload to S3 (MinIO)
mc cp "${BACKUP_DIR}/nailio_${TIMESTAMP}.dump" \
  "${S3_BUCKET}/daily/nailio_${TIMESTAMP}.dump"

# Cleanup local (keep 7 days)
find ${BACKUP_DIR} -name "*.dump" -mtime +7 -delete

# Cleanup S3 (keep 30 days)
mc rm --recursive --older-than 30d "${S3_BUCKET}/daily/"

echo "[$(date)] Backup completed: nailio_${TIMESTAMP}.dump"
```

### Cron Schedule

```cron
# Daily backup at 03:00 UTC
0 3 * * * /scripts/backup-daily.sh >> /var/log/backup.log 2>&1
```

### WAL Archiving (Point-in-Time Recovery)

```yaml
# postgresql.conf
wal_level: replica
archive_mode: 'on'
archive_command: 'mc cp %p s3://nailio-backups/wal/%f'
archive_timeout: 300  # 5 minutes max
```

### Base Backup (weekly)

```bash
#!/bin/bash
# /scripts/backup-base.sh

TIMESTAMP=$(date +%Y%m%d_%H%M%S)

pg_basebackup \
  --host=localhost \
  --port=5432 \
  --username=replication_user \
  --pgdata=/backups/base/${TIMESTAMP} \
  --format=tar \
  --gzip \
  --checkpoint=fast

mc cp /backups/base/${TIMESTAMP}/* \
  s3://nailio-backups/base/${TIMESTAMP}/
```

---

## Redis Backup

### Configuration

```yaml
# redis.conf
save 900 1        # Save if at least 1 key changed in 15 min
save 300 10       # Save if at least 10 keys changed in 5 min
save 60 10000     # Save if at least 10000 keys changed in 1 min

appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec

# RDB file
dbfilename dump.rdb
dir /data/redis
```

### Redis Backup Script

```bash
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Trigger RDB snapshot
redis-cli BGSAVE
sleep 5

# Copy RDB file
mc cp /data/redis/dump.rdb \
  s3://nailio-backups/redis/dump_${TIMESTAMP}.rdb
```

---

## Restore Procedures

### Scenario 1: Full Database Restore (from pg_dump)

```bash
# 1. Stop application
docker compose stop api worker

# 2. Drop and recreate database
psql -U postgres -c "DROP DATABASE nailio;"
psql -U postgres -c "CREATE DATABASE nailio OWNER nailio_admin;"

# 3. Restore from dump
pg_restore \
  --host=localhost \
  --port=5432 \
  --username=nailio_admin \
  --dbname=nailio \
  --verbose \
  /backups/postgres/nailio_YYYYMMDD_HHMMSS.dump

# 4. Run pending migrations
npx prisma migrate deploy

# 5. Restart application
docker compose up -d api worker
```

### Scenario 2: Point-in-Time Recovery (WAL)

```bash
# 1. Stop PostgreSQL
pg_ctl stop

# 2. Restore base backup
rm -rf /var/lib/postgresql/data
tar xzf /backups/base/YYYYMMDD/base.tar.gz -C /var/lib/postgresql/data

# 3. Create recovery.conf (PostgreSQL 16: recovery.signal + postgresql.conf)
touch /var/lib/postgresql/data/recovery.signal

cat >> /var/lib/postgresql/data/postgresql.conf << EOF
restore_command = 'mc cp s3://nailio-backups/wal/%f %p'
recovery_target_time = '2024-01-15 14:30:00 UTC'
recovery_target_action = 'promote'
EOF

# 4. Start PostgreSQL (will replay WAL)
pg_ctl start

# 5. Verify data integrity
psql -U nailio_admin -d nailio -c "SELECT count(*) FROM bookings;"
```

### Scenario 3: Redis Restore

```bash
# 1. Stop Redis
redis-cli SHUTDOWN

# 2. Replace dump file
cp /backups/redis/dump_YYYYMMDD.rdb /data/redis/dump.rdb

# 3. Start Redis
redis-server /etc/redis/redis.conf
```

### Scenario 4: Single Tenant Restore

```bash
# For cases where a single tenant's data needs restoration

# 1. Restore full dump to temporary database
createdb nailio_temp
pg_restore --dbname=nailio_temp /backups/postgres/nailio_YYYYMMDD.dump

# 2. Export tenant data
TENANT_ID="uuid-here"
pg_dump nailio_temp \
  --data-only \
  --table=tenants --table=masters --table=bots \
  --table=clients --table=services --table=working_hours \
  --table=bookings --table=transactions --table=notifications \
  | grep "${TENANT_ID}" > /tmp/tenant_restore.sql

# 3. Apply to production (carefully!)
psql nailio < /tmp/tenant_restore.sql

# 4. Cleanup
dropdb nailio_temp
```

---

## Monitoring

### Backup Health Checks

```bash
#!/bin/bash
# /scripts/check-backup-health.sh

# Check latest backup age
LATEST=$(mc ls s3://nailio-backups/postgres/daily/ | tail -1 | awk '{print $1, $2}')
LATEST_TS=$(date -d "${LATEST}" +%s)
NOW=$(date +%s)
AGE_HOURS=$(( (NOW - LATEST_TS) / 3600 ))

if [ $AGE_HOURS -gt 26 ]; then
  echo "ALERT: Latest backup is ${AGE_HOURS} hours old!"
  # Send alert to admin
fi

# Check backup size (should be growing)
LATEST_SIZE=$(mc ls s3://nailio-backups/postgres/daily/ | tail -1 | awk '{print $5}')
PREV_SIZE=$(mc ls s3://nailio-backups/postgres/daily/ | tail -2 | head -1 | awk '{print $5}')

if [ $LATEST_SIZE -lt $(( PREV_SIZE / 2 )) ]; then
  echo "ALERT: Backup size decreased significantly!"
fi
```

### Metrics

| Metric | Threshold | Alert |
|---|---|---|
| Backup age | > 25 hours | Warning |
| Backup age | > 48 hours | Critical |
| Backup size decrease | > 50% | Warning |
| WAL archive lag | > 10 min | Warning |
| Redis last save | > 30 min | Warning |

---

## Disaster Recovery Plan

| Сценарій | Дія | RTO | RPO |
|---|---|---|---|
| DB corruption | Restore pg_dump + replay WAL | 30 min | 5 min |
| Server crash | New server + restore from S3 | 1 hour | 5 min |
| Accidental DELETE | PITR to before incident | 30 min | Exact |
| Ransomware | Restore from immutable S3 backup | 2 hours | 24 hours |
| Region outage | Manual failover to backup region | 4 hours | 5 min |

### Quarterly DR Testing

- [ ] Restore backup to test environment
- [ ] Verify data integrity (row counts, checksums)
- [ ] Test application functionality on restored data
- [ ] Measure actual RTO
- [ ] Document findings and update procedures
