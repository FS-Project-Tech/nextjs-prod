#!/usr/bin/env node

/**
 * Unused Code Scanner Script
 *
 * Scans for:
 * - Unused CSS classes (PurgeCSS)
 * - Unused JS/TS imports (unimported)
 * - Unused dependencies (depcheck)
 * - Auto-fixes ESLint issues
 *
 * Usage:
 *   npm run scan:unused
 *   npm run scan:unused -- --fix
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log("\n" + "=".repeat(60));
  log(title, "cyan");
  console.log("=".repeat(60) + "\n");
}

function runCommand(command, description, continueOnError = false) {
  try {
    log(`\n${description}...`, "blue");
    execSync(command, { stdio: "inherit", cwd: process.cwd() });
    log(`✓ ${description} completed`, "green");
    return true;
  } catch (error) {
    if (continueOnError) {
      log(`⚠ ${description} failed (continuing...)`, "yellow");
      return false;
    } else {
      log(`✗ ${description} failed`, "red");
      throw error;
    }
  }
}

function checkToolInstalled(tool) {
  try {
    // Cross-platform check: use `where` on Windows, `which` elsewhere
    const cmd = process.platform === "win32" ? `where ${tool}` : `which ${tool}`;
    execSync(cmd, { stdio: "ignore" });
    return true;
  } catch {
    try {
      // Fallback: try running the tool with --version
      execSync(`${tool} --version`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes("--fix");
  const shouldAutoFix = args.includes("--auto-fix");

  logSection("🔍 Unused Code Scanner");
  log("Scanning for unused CSS, JS imports, and dependencies...\n", "bright");

  // Check if tools are installed
  log("Checking required tools...", "blue");
  const tools = {
    npx: checkToolInstalled("npx"),
  };

  if (!tools.npx) {
    log("✗ npx is required but not found. Please install Node.js.", "red");
    process.exit(1);
  }

  const results = {
    purgecss: false,
    unimported: false,
    depcheck: false,
    eslint: false,
  };

  // 1. PurgeCSS - Scan for unused CSS
  logSection("1️⃣ PurgeCSS - Scanning for unused CSS");
  try {
    const purgecssCommand = "npx purgecss --config purgecss.config.js";
    results.purgecss = runCommand(purgecssCommand, "PurgeCSS scan", true);
  } catch (error) {
    log("⚠ PurgeCSS scan skipped (config file may not exist)", "yellow");
  }

  // 2. unimported - Scan for unused JS/TS imports
  logSection("2️⃣ unimported - Scanning for unused imports");
  try {
    const unimportedCommand = "npx unimported";
    results.unimported = runCommand(unimportedCommand, "unimported scan", true);
  } catch (error) {
    log("⚠ unimported scan skipped", "yellow");
  }

  // 3. depcheck - Scan for unused dependencies
  logSection("3️⃣ depcheck - Scanning for unused dependencies");
  try {
    const depcheckCommand =
      'npx depcheck --ignores="@types/*,eslint*,prettier,@next/*,@playwright/*,@tailwindcss/*,postcss*,autoprefixer,babel-plugin-*,rimraf"';
    results.depcheck = runCommand(depcheckCommand, "depcheck scan", true);
  } catch (error) {
    log("⚠ depcheck scan skipped", "yellow");
  }

  // 4. ESLint - Auto-fix issues
  logSection("4️⃣ ESLint - Checking and fixing code issues");
  try {
    if (shouldFix || shouldAutoFix) {
      results.eslint = runCommand("npm run lint:fix", "ESLint auto-fix", true);
    } else {
      results.eslint = runCommand("npm run lint", "ESLint check", true);
    }
  } catch (error) {
    log("⚠ ESLint check skipped", "yellow");
  }

  // Summary
  logSection("📊 Scan Summary");
  console.log("Results:");
  console.log(`  PurgeCSS:     ${results.purgecss ? "✓" : "✗"}`);
  console.log(`  unimported:   ${results.unimported ? "✓" : "✗"}`);
  console.log(`  depcheck:     ${results.depcheck ? "✓" : "✗"}`);
  console.log(`  ESLint:       ${results.eslint ? "✓" : "✗"}`);

  log("\n✨ Scan completed!", "green");
  log("\nNext steps:", "bright");
  log("  1. Review the output above for unused code");
  log("  2. Run with --fix to auto-fix ESLint issues: npm run scan:unused -- --fix");
  log("  3. Manually remove unused imports and dependencies");
  log("  4. Test your application after cleanup\n");
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { main };
