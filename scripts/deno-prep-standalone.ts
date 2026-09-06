import * as fs from "node:fs";
import * as path from "node:path";

const rootDir = process.cwd();
const standaloneDir = path.join(rootDir, ".next", "standalone");
const rootNodeModules = path.join(rootDir, "node_modules");
const standaloneNodeModules = path.join(standaloneDir, "node_modules");

console.log("Preparing standalone build for Deno Deploy...");

// 1. Copy public -> .next/standalone/public
const publicSrc = path.join(rootDir, "public");
const publicDest = path.join(standaloneDir, "public");
if (fs.existsSync(publicSrc)) {
  console.log("Copying public/ to .next/standalone/public...");
  fs.cpSync(publicSrc, publicDest, { recursive: true });
}

// 2. Copy .next/static -> .next/standalone/.next/static
const staticSrc = path.join(rootDir, ".next", "static");
const staticDest = path.join(standaloneDir, ".next", "static");
if (fs.existsSync(staticSrc)) {
  console.log("Copying .next/static/ to .next/standalone/.next/static...");
  fs.cpSync(staticSrc, staticDest, { recursive: true });
}

// 3. Update .next/standalone/package.json
const pkgPath = path.join(standaloneDir, "package.json");
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  pkg.type = "commonjs";
  delete pkg.devDependencies;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf-8");
  console.log("Updated .next/standalone/package.json with type: commonjs");
}

// 4. Fill in incomplete packages in .next/standalone/node_modules
function inspectAndFixPackages(dir: string, relScope = "") {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.name.startsWith("@")) {
      inspectAndFixPackages(fullPath, entry.name);
    } else if (entry.isDirectory()) {
      const pkgRel = relScope ? `${relScope}/${entry.name}` : entry.name;
      const rootPkgPath = path.join(rootNodeModules, pkgRel);
      if (fs.existsSync(rootPkgPath)) {
        const standaloneFiles = fs.readdirSync(fullPath);
        if (standaloneFiles.length === 1 && standaloneFiles[0] === "package.json") {
          console.log(`Fixing incomplete package: ${pkgRel}`);
          fs.cpSync(rootPkgPath, fullPath, { recursive: true, force: true });
        } else if (pkgRel === "@swc/helpers" || pkgRel === "semver" || pkgRel.startsWith("@libsql/")) {
          console.log(`Ensuring full copy for critical runtime package: ${pkgRel}`);
          fs.cpSync(rootPkgPath, fullPath, { recursive: true, force: true });
        }
      }
    }
  }
}

console.log("Scanning and fixing incomplete packages in .next/standalone/node_modules...");
inspectAndFixPackages(standaloneNodeModules);

const criticalPackages = ["@swc/helpers", "semver", "@libsql/client", "@libsql/core", "@libsql/hrana-client", "@libsql/isomorphic-ws"];
for (const pkg of criticalPackages) {
  const src = path.join(rootNodeModules, pkg);
  const dest = path.join(standaloneNodeModules, pkg);
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(src, dest, { recursive: true, force: true });
  }
}

// Clean up native libsql if present to avoid runtime load errors on non-Windows/serverless environments
const standaloneLibsql = path.join(standaloneNodeModules, "libsql");
if (fs.existsSync(standaloneLibsql)) {
  console.log("Removing native node addon package: libsql from standalone node_modules...");
  fs.rmSync(standaloneLibsql, { recursive: true, force: true });
}

function patchLibsqlClient(clientPkgDir: string) {
  if (!fs.existsSync(clientPkgDir)) return;
  console.log(`Patching @libsql/client in ${clientPkgDir} for Deno serverless...`);

  // 1. Patch package.json exports so Deno defaults to web.js
  const pkgJsonPath = path.join(clientPkgDir, "package.json");
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      if (pkg.exports && pkg.exports["."]) {
        if (pkg.exports["."].import) {
          pkg.exports["."].import.deno = "./lib-esm/web.js";
          pkg.exports["."].import.default = "./lib-esm/web.js";
        }
        pkg.exports["."].require = "./lib-cjs/web.js";
        pkg.exports["."].default = "./lib-esm/web.js";
      }
      fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2), "utf-8");
    } catch (e) {
      console.warn("Failed to patch package.json in " + clientPkgDir, e);
    }
  }

  // 2. Patch lib-esm/sqlite3.js so static import Database from "libsql" is eliminated
  const esmSqlite3 = path.join(clientPkgDir, "lib-esm", "sqlite3.js");
  if (fs.existsSync(esmSqlite3)) {
    let content = fs.readFileSync(esmSqlite3, "utf-8");
    content = content.replace(
      'import Database from "libsql";',
      'const Database = class { constructor() { throw new Error("Local SQLite is not supported in Deno Deploy"); } };'
    );
    fs.writeFileSync(esmSqlite3, content, "utf-8");
  }

  // 3. Patch lib-cjs/sqlite3.js so require("libsql") is eliminated
  const cjsSqlite3 = path.join(clientPkgDir, "lib-cjs", "sqlite3.js");
  if (fs.existsSync(cjsSqlite3)) {
    let content = fs.readFileSync(cjsSqlite3, "utf-8");
    content = content.replace(
      'const libsql_1 = __importDefault(require("libsql"));',
      'const libsql_1 = { default: class { constructor() { throw new Error("Local SQLite is not supported in Deno Deploy"); } } };'
    );
    fs.writeFileSync(cjsSqlite3, content, "utf-8");
  }
}



// 5. Dereference any symlinks in .next/standalone to ensure completely self-contained files
let symlinkCount = 0;
function dereferenceSymlinks(dir: string) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".deno") {
      fs.rmSync(path.join(dir, entry.name), { recursive: true, force: true });
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      symlinkCount++;
      const target = fs.readlinkSync(fullPath);
      const resolvedTarget = path.isAbsolute(target) ? target : path.resolve(dir, target);
      console.log(`Dereferencing symlink: ${entry.name} -> ${resolvedTarget}`);
      fs.unlinkSync(fullPath);
      if (fs.existsSync(resolvedTarget)) {
        const stat = fs.statSync(resolvedTarget);
        if (stat.isDirectory()) {
          fs.cpSync(resolvedTarget, fullPath, { recursive: true });
        } else {
          fs.copyFileSync(resolvedTarget, fullPath);
        }
      } else {
        console.warn(`Target does not exist: ${resolvedTarget}`);
      }
    } else if (entry.isDirectory()) {
      dereferenceSymlinks(fullPath);
    }
  }
}

dereferenceSymlinks(standaloneDir);
console.log(`Dereferencing completed. Total symlinks dereferenced: ${symlinkCount}`);

// 6. Patch all @libsql/client instances in standalone so they never require native libsql
function patchAllLibsqlClients(dir: string) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const fullPath = path.join(dir, entry.name);
      if (entry.name === "@libsql") {
        const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
        for (const sub of subEntries) {
          if (sub.isDirectory() && sub.name.startsWith("client")) {
            patchLibsqlClient(path.join(fullPath, sub.name));
          }
        }
      } else if (!entry.name.startsWith(".")) {
        patchAllLibsqlClients(fullPath);
      }
    }
  }
}

patchAllLibsqlClients(standaloneDir);
// Also explicitly patch the standalone .next/node_modules/@libsql if present
const standaloneNextNodeModules = path.join(standaloneDir, ".next", "node_modules");
if (fs.existsSync(standaloneNextNodeModules)) {
  patchAllLibsqlClients(standaloneNextNodeModules);
}

console.log("Standalone preparation complete!");

