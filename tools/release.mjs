// Build, sign and publish a release that installed copies will offer as an update.
//
//   npm run release -- --notes "What changed"        build + publish to GitHub
//   npm run release -- --notes "..." --dry-run       build + latest.json only
//   --repo owner/name   publish to another repository (default: Shalby-Industries/sonic-dominion)
//
// Needs: the signing key at ~/.tauri/sonic-dominion.key (or TAURI_SIGNING_PRIVATE_KEY),
// the GitHub CLI logged in, and the version already bumped in src-tauri/tauri.conf.json.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const repoAt = args.indexOf("--repo");
const REPO = repoAt >= 0 ? args[repoAt + 1] : "Shalby-Industries/sonic-dominion";
const skipBuild = args.includes("--skip-build"); // reuse the last build, e.g. to publish the same version to a second repo
const notesAt = args.indexOf("--notes");
const notes = notesAt >= 0 ? args[notesAt + 1] : "";
if (!notes) throw new Error('Give release notes: npm run release -- --notes "What changed"');

const conf = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
const version = conf.version;
const tag = `v${version}`;

const env = { ...process.env };
if (!env.TAURI_SIGNING_PRIVATE_KEY) {
  const keyFile = join(homedir(), ".tauri", "sonic-dominion.key");
  if (!existsSync(keyFile)) throw new Error(`Signing key not found at ${keyFile}`);
  env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(keyFile, "utf8").trim();
}
env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= "";

if (!skipBuild) {
  console.log(`Building ${tag}...`);
  execFileSync("npx", ["tauri", "build"], { cwd: root, env, stdio: "inherit", shell: true });
}

const target = env.CARGO_TARGET_DIR || join(root, "src-tauri", "target");
const built = join(target, "release", "bundle", "nsis", `${conf.productName}_${version}_x64-setup.exe`);
if (!existsSync(`${built}.sig`)) throw new Error(`Missing signature next to ${built}`);

// GitHub turns spaces in asset names into dots, so publish under a stable dashed name.
const outDir = join(root, "dist-release");
mkdirSync(outDir, { recursive: true });
const assetName = `Sonic-Dominion_${version}_x64-setup.exe`;
const asset = join(outDir, assetName);
copyFileSync(built, asset);
const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: readFileSync(`${built}.sig`, "utf8").trim(),
      url: `https://github.com/${REPO}/releases/download/${tag}/${assetName}`
    }
  }
};
const manifestPath = join(outDir, "latest.json");
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`Wrote ${manifestPath}`);

if (dry) {
  console.log("Dry run: nothing published.");
} else {
  execFileSync("gh", ["release", "create", tag, asset, manifestPath, "--repo", REPO, "--title", `Sonic Dominion ${version}`, "--notes", notes], { stdio: "inherit" });
  console.log(`Published ${tag}. Installed copies will offer it within 6 hours (or on next launch).`);
}
