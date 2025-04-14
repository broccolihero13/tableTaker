const fs = require("fs");
const fse = require("fs-extra");

const target = process.argv[2]; // 'chrome' or 'firefox'
const manifest = `manifest.${target}.json`;
const outDir = `build/${target}`;

// Clean & copy files
fse.emptyDirSync(outDir);
fse.copySync("src", outDir);
fse.copyFileSync(manifest, `${outDir}/manifest.json`);

console.log(`✅ Built ${target} extension at ${outDir}`);
