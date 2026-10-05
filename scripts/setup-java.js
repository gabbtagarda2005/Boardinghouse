/**
 * Downloads a portable Java runtime (Eclipse Temurin 21) into ./.tools/jre.
 * Java is only needed to run the Firebase Emulator Suite on your computer during development.
 * Nothing is installed system-wide.   npm run setup:java
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TOOLS = path.join(__dirname, '..', '.tools');
const JRE = path.join(TOOLS, 'jre');

function javaBin() {
  if (!fs.existsSync(JRE)) return null;
  for (const dir of fs.readdirSync(JRE)) {
    const bin = path.join(JRE, dir, 'bin');
    if (fs.existsSync(path.join(bin, process.platform === 'win32' ? 'java.exe' : 'java'))) return bin;
  }
  return null;
}

async function main() {
  if (javaBin()) {
    console.log(`Java is already set up in ${JRE}`);
    return;
  }
  const os = { win32: 'windows', darwin: 'mac', linux: 'linux' }[process.platform];
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
  const ext = process.platform === 'win32' ? 'zip' : 'tar.gz';
  const url = `https://api.adoptium.net/v3/binary/latest/21/ga/${os}/${arch}/jre/hotspot/normal/eclipse`;
  fs.mkdirSync(JRE, { recursive: true });
  const archive = path.join(TOOLS, `jre.${ext}`);
  console.log('Downloading Java 21 runtime (about 50 MB)...');
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
  console.log('Extracting...');
  if (process.platform === 'win32') {
    execSync(`powershell -NoProfile -Command "Expand-Archive -Force -LiteralPath '${archive}' -DestinationPath '${JRE}'"`, { stdio: 'inherit' });
  } else {
    execSync(`tar -xzf "${archive}" -C "${JRE}"`, { stdio: 'inherit' });
  }
  fs.unlinkSync(archive);
  console.log(javaBin() ? `Java is ready (${javaBin()}).` : 'Extraction finished but java was not found.');
}

module.exports = { javaBin };

if (require.main === module) {
  main().catch((e) => {
    console.error(`Could not set up Java: ${e.message}`);
    process.exit(1);
  });
}
