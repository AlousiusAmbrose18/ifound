import {randomBytes} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
let content=existsSync('.env')?readFileSync('.env','utf8'):'';
const required={MYSQL_PASSWORD:randomBytes(32).toString('hex'),MYSQL_ROOT_PASSWORD:randomBytes(32).toString('hex'),API_TOKEN:randomBytes(32).toString('hex'),ADMIN_USERNAME:'admin',ADMIN_PASSWORD:randomBytes(24).toString('hex'),APP_PORT:'3000'};
let added=0;for(const[key,value]of Object.entries(required))if(!new RegExp(`^${key}=`, 'm').test(content)){content+=`${content.endsWith('\n')||!content?'':'\n'}${key}=${value}\n`;added++;}
writeFileSync('.env',content,{mode:0o600});chmodSync('.env',0o600);console.log(added?'Missing configuration added; existing values retained.':'Existing configuration retained.');

// Check effective dotenv values without printing secrets. Existing passwords are never reset.
const { parseEnv } = await import('node:util');
const values = parseEnv(content);
if (!values.ADMIN_PASSWORD || values.ADMIN_PASSWORD.length < 12 || values.ADMIN_PASSWORD.length > 200) {
  console.error('ADMIN_PASSWORD in .env must contain 12–200 characters. Update it before running Docker Compose. Existing database account passwords are changed in Account, not through .env.');
  process.exitCode = 1;
}
