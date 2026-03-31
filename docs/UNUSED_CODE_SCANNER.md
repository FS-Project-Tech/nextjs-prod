# Unused Code Scanner Guide

This guide explains how to use the automated unused code scanning tools to identify and remove unused CSS, JS imports, and dependencies.

## 📋 Overview

The scanner uses four tools:
1. **PurgeCSS** - Finds unused CSS classes
2. **unimported** - Finds unused JS/TS imports and files
3. **depcheck** - Finds unused npm dependencies
4. **ESLint** - Auto-fixes code issues

## 🚀 Quick Start

### Step 1: Install Tools

Run the setup script to install all required tools:

```bash
npm run scan:setup
```

Or install manually:

```bash
npm install --save-dev purgecss @fullhuman/postcss-purgecss unimported depcheck
```

### Step 2: Run the Scanner

Run the complete scan:

```bash
npm run scan:unused
```

To auto-fix ESLint issues:

```bash
npm run scan:unused:fix
```

## 📖 Detailed Usage

### 1. PurgeCSS - Unused CSS Scanner

Scans for unused CSS classes in your custom CSS files.

**Run individually:**
```bash
npm run scan:purgecss
```

**Configuration:** `purgecss.config.js`

**What it does:**
- Scans all JS/TS/TSX files for CSS class usage
- Identifies unused classes in `app/globals.css`
- Outputs results to `purgecss-output/` directory

**Note:** Tailwind CSS v4 handles purging automatically, but this helps identify unused custom CSS.

**Example output:**
```
✓ PurgeCSS scan completed
Rejected CSS classes:
  - .unused-class-1
  - .unused-class-2
```

### 2. unimported - Unused Imports Scanner

Finds unused files, imports, and exports.

**Run individually:**
```bash
npm run scan:unimported
```

**Configuration:** `unimported.config.js`

**What it does:**
- Scans for unused files in `app/`, `components/`, `lib/`, `hooks/`
- Identifies unused imports
- Finds unused exports
- Checks for missing dependencies

**Example output:**
```
Unused files:
  - components/OldComponent.tsx
  - lib/unused-utils.ts

Unused exports:
  - lib/utils.ts: unusedFunction

Missing dependencies:
  - some-package (used but not in package.json)
```

### 3. depcheck - Unused Dependencies Scanner

Finds unused npm packages.

**Run individually:**
```bash
npm run scan:depcheck
```

**What it does:**
- Scans `package.json` for unused dependencies
- Identifies missing dependencies (used but not installed)
- Ignores dev tools and build dependencies

**Example output:**
```
Unused dependencies:
  - old-package
  - unused-library

Missing dependencies:
  - some-package (used in code but not installed)
```

### 4. ESLint - Code Quality

Auto-fixes linting issues.

**Run individually:**
```bash
npm run lint:fix
```

**What it does:**
- Fixes auto-fixable ESLint issues
- Removes unused imports (if configured)
- Formats code according to rules

## 🔧 Configuration Files

### `purgecss.config.js`

Configures PurgeCSS scanning:

```javascript
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    // ... more paths
  ],
  css: ['./app/globals.css'],
  safelist: [
    // Classes to always keep (dynamic classes, etc.)
  ],
};
```

### `unimported.config.js`

Configures unimported scanning:

```javascript
module.exports = {
  rootDir: '.',
  scan: [
    'app/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    // ... more paths
  ],
  ignore: [
    // Files to ignore
  ],
};
```

## 📝 Step-by-Step Workflow

### Recommended Workflow:

1. **Initial Scan**
   ```bash
   npm run scan:unused
   ```

2. **Review Output**
   - Check PurgeCSS output for unused CSS classes
   - Review unimported results for unused files/imports
   - Check depcheck for unused dependencies

3. **Auto-fix ESLint Issues**
   ```bash
   npm run scan:unused:fix
   ```

4. **Manual Cleanup**
   - Remove unused CSS classes from `globals.css`
   - Delete unused component files
   - Remove unused imports from files
   - Uninstall unused dependencies: `npm uninstall <package>`

5. **Verify**
   ```bash
   npm run build
   npm run lint
   npm test
   ```

6. **Test Application**
   - Run dev server: `npm run dev`
   - Test all features
   - Verify nothing broke

## ⚠️ Important Notes

### Safelist Considerations

Some classes might appear unused but are actually used dynamically:

- **Dynamic Tailwind classes**: `bg-${color}`, `text-${size}`
- **Conditional classes**: `className={isActive ? 'active' : 'inactive'}`
- **Third-party libraries**: Swiper, Framer Motion classes
- **Next.js classes**: `__next`, route-specific classes

These are handled by the safelist in `purgecss.config.js`.

### False Positives

Some tools might report false positives:

- **unimported**: Might miss dynamic imports (`next/dynamic`)
- **depcheck**: Might miss peer dependencies or build-time dependencies
- **PurgeCSS**: Might miss classes used in API responses or external scripts

Always verify before removing!

### Next.js Specific

- API routes (`app/api/**/route.ts`) are auto-imported by Next.js
- Layout files (`layout.tsx`) are auto-imported
- Page files (`page.tsx`) are auto-imported
- These are ignored by unimported scanner

## 🎯 Best Practices

1. **Run Regularly**: Add to CI/CD pipeline or run weekly
2. **Review Carefully**: Don't auto-delete without review
3. **Test After Cleanup**: Always test after removing code
4. **Keep Safelists Updated**: Update safelists as you add dynamic classes
5. **Use Git**: Commit before cleanup, so you can revert if needed

## 🔍 Troubleshooting

### PurgeCSS not finding classes

**Problem:** Classes are being removed but are actually used.

**Solution:** Add to safelist in `purgecss.config.js`:
```javascript
safelist: {
  standard: [/^your-class-pattern/],
}
```

### unimported reporting false positives

**Problem:** Files are reported as unused but are actually used.

**Solution:** Add to ignore list in `unimported.config.js`:
```javascript
ignore: [
  '**/your-file.ts',
]
```

### depcheck missing dependencies

**Problem:** depcheck reports missing dependencies that are actually installed.

**Solution:** Check if they're peer dependencies or add to ignore list:
```bash
npx depcheck --ignores="package-name"
```

## 📊 Example Output

```
🔍 Unused Code Scanner
Scanning for unused CSS, JS imports, and dependencies...

============================================================
1️⃣ PurgeCSS - Scanning for unused CSS
============================================================

✓ PurgeCSS scan completed
Rejected CSS: 5 classes

============================================================
2️⃣ unimported - Scanning for unused imports
============================================================

✓ unimported scan completed
Unused files: 2
Unused exports: 3

============================================================
3️⃣ depcheck - Scanning for unused dependencies
============================================================

✓ depcheck scan completed
Unused dependencies: 1

============================================================
4️⃣ ESLint - Checking and fixing code issues
============================================================

✓ ESLint check completed

📊 Scan Summary
Results:
  PurgeCSS:     ✓
  unimported:   ✓
  depcheck:     ✓
  ESLint:       ✓

✨ Scan completed!
```

## 🚀 Integration with CI/CD

Add to your CI/CD pipeline:

```yaml
# GitHub Actions example
- name: Scan for unused code
  run: |
    npm run scan:setup
    npm run scan:unused
```

Or add as a pre-commit hook:

```bash
# .husky/pre-commit
npm run scan:unused
```

## 📚 Additional Resources

- [PurgeCSS Documentation](https://purgecss.com/)
- [unimported Documentation](https://github.com/smeijer/unimported)
- [depcheck Documentation](https://github.com/depcheck/depcheck)
- [ESLint Documentation](https://eslint.org/)

## 💡 Tips

1. **Start Small**: Run individual scans first to understand output
2. **Use Git Branches**: Create a branch for cleanup work
3. **Incremental Cleanup**: Don't remove everything at once
4. **Document Decisions**: Comment why certain classes/files are kept
5. **Regular Maintenance**: Run scans monthly to prevent accumulation

---

**Last Updated:** $(date)
**Maintained by:** Development Team

