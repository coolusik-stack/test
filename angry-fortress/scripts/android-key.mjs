// Makes the Android upload key (once, on your own computer) and prints the four values to put in
// GitHub → Settings → Secrets and variables → Actions. Needs Java's keytool (comes with Android
// Studio, or `brew install openjdk` on a Mac).
//   npm run android:key
// Keep the .jks file and the password somewhere safe (a password manager): every Play Store
// update must be signed with this same key. Never commit it; never paste it into a chat.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

const file = join(homedir(), 'dotori-kkang-upload.jks');
if (existsSync(file)) {
  console.error(`${file} already exists: use that one (or move it away to make a new key).`);
  process.exit(1);
}
const pass = randomBytes(18).toString('base64url');
const alias = 'upload';
try {
  execFileSync('keytool', ['-genkeypair', '-v', '-keystore', file, '-alias', alias, '-keyalg', 'RSA', '-keysize', '4096', '-validity', '10000',
    '-storepass', pass, '-keypass', pass, '-dname', 'CN=Dotori Kkang, O=Dotori Kkang, C=KR'], { stdio: 'ignore' });
} catch (e) {
  console.error('keytool was not found or failed. Install Java (Android Studio includes it), then run this again.');
  process.exit(1);
}
console.log(`Upload key saved to ${file}. Back it up with the password below.\n`);
console.log('GitHub → Settings → Secrets and variables → Actions → New repository secret, four times:\n');
console.log(`ANDROID_KEYSTORE_B64      (long text below)`);
console.log(`ANDROID_KEYSTORE_PASSWORD ${pass}`);
console.log(`ANDROID_KEY_ALIAS         ${alias}`);
console.log(`ANDROID_KEY_PASSWORD      ${pass}\n`);
console.log(readFileSync(file).toString('base64'));
