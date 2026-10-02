import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Explicit local recovery: use the private .env password, never command-line secrets.
const env = parseEnv(readFileSync('.env', 'utf8'));
const username = (env.ADMIN_USERNAME || 'admin').toLowerCase();
const password = env.ADMIN_PASSWORD;
if (!/^[a-z0-9._-]{3,64}$/.test(username)) throw new Error('Invalid ADMIN_USERNAME in .env.');
if (!password || password.length < 12 || password.length > 200) throw new Error('ADMIN_PASSWORD must contain 12–200 characters.');
const salt = randomBytes(16);
const hash = `210000:${salt.toString('hex')}:${pbkdf2Sync(password, salt, 210000, 32, 'sha256').toString('hex')}`;
const sql = `START TRANSACTION;
UPDATE app_users SET password_hash='${hash}' WHERE username='${username}' AND role='Admin' AND active=TRUE;
SET @changed=ROW_COUNT();
DELETE FROM app_sessions WHERE user_id IN (SELECT id FROM app_users WHERE username='${username}' AND role='Admin' AND active=TRUE) AND @changed=1;
DELETE FROM login_attempts WHERE username='${username}' AND @changed=1;
INSERT INTO audit_events(actor,action,subject) SELECT 'local-recovery','ADMIN_PASSWORD_RESET','${username}' WHERE @changed=1;
COMMIT;
SELECT @changed;`;
const result = spawnSync('docker', ['compose', 'exec', '-T', 'mysql', 'sh', '-c', 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --protocol=TCP -h 127.0.0.1 -u ifound -D ifound --batch --skip-column-names'], { input: sql, encoding: 'utf8' });
if (result.error || result.status !== 0) throw new Error('Database recovery failed. Ensure the MySQL Compose service is running.');
if (result.stdout.trim() !== '1') throw new Error('No active Admin account matched ADMIN_USERNAME; no account was reset.');
console.log('Admin password updated from .env; lockout cleared; existing sessions invalidated.');
