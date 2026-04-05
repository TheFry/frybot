# ESLint Setup: What It Is, Why It Matters, and What We Found

This document explains the linting configuration added to this project, the reasoning behind each rule, and a detailed walkthrough of every violation found in the original code. It's meant to be a learning resource.

---

## What is a Linter?

A **linter** is a static analysis tool — it reads your code without executing it and flags patterns that are:

- **Objectively wrong** (e.g., comparing with `==` when you almost certainly meant `===`)
- **Potentially buggy** (e.g., a variable you declared but never used)
- **Inconsistent** (e.g., mixing single and double quotes throughout the codebase)

Think of it as a very pedantic code reviewer that never gets tired and applies the same rules everywhere. The benefit isn't just catching individual bugs — it's forcing a level of consistency and discipline that makes the entire codebase easier to read and reason about, especially when you come back to it months later.

---

## ESLint vs. TypeScript

You might wonder: doesn't TypeScript already catch errors? Yes and no. TypeScript catches **type errors** — using a `string` where a `number` is expected, calling a method that doesn't exist on a type, etc. ESLint catches **code quality and style issues** at a level above type correctness. They are complementary tools.

---

## The Config Format: "Flat Config"

ESLint has had two config formats in its history:

### Legacy format (deprecated as of ESLint v9)
Files named `.eslintrc.json`, `.eslintrc.js`, `.eslintrc.cjs`, etc. This project already had a `.eslintrc.cjs` — but the required packages (`@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`) were never installed, so it didn't actually work.

### Flat config (current standard since ESLint v9)
A single file named `eslint.config.mjs` (or `.js`/`.cjs`). It's a JavaScript module that exports an array of config objects. We migrated to this format.

The `.mjs` extension explicitly marks the file as an ES module (meaning it uses `import`/`export` syntax), regardless of what the project's `package.json` says. This is important because ESLint v9 loads the config as a module.

---

## Our Config: `eslint.config.mjs`

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { files: ['src/**/*.ts', 'test/**/*.ts'] },
  { ignores: ['built/**', 'node_modules/**', ...] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  { rules: { ... } },

  // Special override for logger.ts
  { files: ['src/helpers/logger.ts'], rules: { 'no-console': 'off' } },
);
```

### `tseslint.config()`

This is a helper from the `typescript-eslint` package. It:
- Accepts an array of config objects
- Attaches the TypeScript parser to every config object automatically (so you don't have to repeat `parser: '@typescript-eslint/parser'` everywhere)
- Merges them in order (later configs win on conflicts)

### `js.configs.recommended`

This is ESLint's own built-in set of ~50 rules covering things like detecting unreachable code, forbidding `eval()`, requiring `===`, etc. These are language-level best practices, not TypeScript-specific.

### `...tseslint.configs.recommended`

This is `typescript-eslint`'s recommended rule set, spread into the config array. It adds TypeScript-specific rules like:
- `@typescript-eslint/no-unused-vars` — flag dead variables and imports
- `@typescript-eslint/no-explicit-any` — warn on `any` type usage
- `@typescript-eslint/no-unused-expressions` — flag expressions whose result is never used

The spread (`...`) is needed because `tseslint.configs.recommended` is itself an array of multiple config objects.

### Rule overrides

Config objects are applied in order. Our custom `{ rules: {...} }` object comes after the recommended sets, so our rules override the defaults where they conflict. The `files` field in the last object (`['src/helpers/logger.ts']`) scopes it to just that one file.

---

## Rules: What Each One Does and Why

### `eqeqeq: ['error', 'always']`

**The issue:** JavaScript has two equality operators:
- `==` (loose equality) — performs type coercion before comparing
- `===` (strict equality) — requires both value AND type to match

Type coercion produces surprising results:

```js
0 == ''      // true  ← because '' coerces to 0
0 == false   // true  ← because false coerces to 0
null == undefined  // true
null == 0    // false ← inconsistent coercion rules
```

The rule is simple: **always use `===`**. If you actually want to check for both `null` and `undefined` together, `x == null` is the one accepted exception, but that's an unusual case.

**Found in this codebase:**
- `src/helpers/common.ts` — `timeConverter()` used `==` in 3 places to compare string lengths
- `src/helpers/playlist.ts` — `missing.length == 0`
- `src/voice_bot/VoiceBot.ts` — `currentState == AudioPlayerStatus.Paused` / `...Playing`
- `src/cmd_processor/commands/clip.ts` — `button.customId == 'next'` / `== 'select'`

These are technically safe (comparing same types) but the habit of using `==` is dangerous because it will silently misbehave in a mixed-type context.

---

### `semi: ['error', 'always']`

**The issue:** JavaScript has **Automatic Semicolon Insertion (ASI)** — the runtime inserts semicolons on your behalf in most cases. So missing semicolons usually work fine. But "usually" is the problem. ASI has edge cases that cause real bugs:

```js
// This looks like two statements but ASI reads it as one:
const a = 1
[1, 2, 3].forEach(...)
// Parsed as: const a = 1[1, 2, 3].forEach(...) — a TypeError
```

The rule: always write your own semicolons. Don't rely on ASI.

**Found in this codebase:** ~15 missing semicolons across multiple files. The auto-fixer (`npm run lint:fix`) handled all of them automatically.

---

### `quotes: ['error', 'single', { avoidEscape: true }]`

**The issue:** Pure consistency. JavaScript allows both single (`'`) and double (`"`) quotes for strings. This codebase was using both interchangeably — most files used single quotes, but imports in `redis.ts`, `logger.ts`, `list.ts`, `interactions.ts` used double quotes, and strings like `"Content-Type"` and `"application/json"` in `youtube.ts` used double quotes.

The `avoidEscape: true` option means you can use double quotes if the string itself contains a single quote (e.g., `"it's fine"` instead of `'it\'s fine'`). Otherwise, always use single.

**Found in this codebase:** ~20 double-quote violations. All auto-fixed.

---

### `no-unneeded-ternary: 'error'`

**The issue:** A ternary like `x ? true : false` is redundant — `x` already evaluates to a truthy/falsy value, and assigning `true`/`false` explicitly adds no information (the result is always a boolean regardless). Just write the expression directly.

```js
// Bad
const DEBUG = process.env['DEBUG'] === '1' ? true : false;

// Good
const DEBUG = process.env['DEBUG'] === '1';
```

Similarly, `x ? false : true` is just `!x`, and `a === b ? true : false` is just `a === b`.

**Found in this codebase:**
- `src/cmd_processor/commands/play.ts` — `=== '1' ? true : false`
- `src/cmd_processor/commands/clip.ts` — `=== '1' ? true : false`
- `src/helpers/youtube.ts` — `data.nextPageToken ? true : false` (changed to `Boolean(data.nextPageToken)`)

All auto-fixed.

---

### `no-console: 'warn'`

**The issue:** This project has a logging abstraction (`logConsole`, `logDiscord`, `logBoth` in `src/helpers/logger.ts`) that adds timestamps, log level filtering, and optional forwarding to Discord. Calling `console.log()` directly bypasses all of this — no timestamp, no level filtering, messages only go to stdout/stderr.

This is a **warning** (not an error) because there are legitimate uses of `console.*` in some contexts (like the logger itself). We mark it `warn` so callers get reminded to use the project's logger, but the build isn't blocked.

`src/helpers/logger.ts` itself is exempt from this rule via a file-level override — it's the logger, it has to call `console`.

---

### `@typescript-eslint/no-unused-vars`

**The issue:** Variables that are declared but never read are dead code. They:
- Confuse readers ("why is this here? is it used somewhere I'm not seeing?")
- Suggest incomplete refactors (you changed a function signature but forgot to clean up the callers)
- Add noise to diffs

The `argsIgnorePattern: '^_'` option lets you intentionally ignore a parameter by naming it `_foo`. This is the standard convention for "I need this position in the signature but don't use it."

**Found in this codebase:**
- `catch(err)` in multiple places where `err` was caught but the catch block didn't use it (typically just returning `null` or a default value). These were changed to optional catch binding: `catch { ... }` — valid JavaScript/TypeScript syntax that omits the error variable entirely when you don't need it.

---

### `@typescript-eslint/no-explicit-any: 'warn'`

**The issue:** TypeScript's whole value proposition is that it knows what type every value is. Writing `any` opts out of that — a variable typed as `any` can be used as anything with no type checking. It defeats the purpose of using TypeScript.

This is set to `warn` (not error) because there are occasionally legitimate reasons to use `any` (interop with untyped libraries, temporary scaffolding, intentional escape hatches). But each usage should be deliberate and ideally accompanied by a comment.

**Found in this codebase:** One instance in `src/helpers/common.ts` — the `DiscordClient` class extension already had an `eslint-disable` comment:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class DiscordClient extends Client { commands: any; }
```

This is acceptable — the `discord.js` `Client` class doesn't have a typed `commands` collection, and typing it precisely would require significant effort. The disable comment documents that this is an intentional compromise.

---

## Violations That Required Manual Fixes

Most violations (quotes, semicolons, ternaries) were fixed automatically by running `npm run lint:fix`. But some required human judgment:

### `no-unused-expressions` in `src/helpers/common.ts`

**Original code:**
```ts
export function checkVars(): void {
  process.env['DC_TOKEN'] || usage('DC_TOKEN');
  process.env['DC_CLIENT'] || usage('DC_CLIENT');
  // ...
}
```

**Why ESLint complained:** `process.env['DC_TOKEN'] || usage('DC_TOKEN')` is an expression statement — you're writing an expression (the `||`) but not assigning its result to anything. ESLint's `no-unused-expressions` rule flags this because from a pure syntax standpoint, the result of the expression is discarded.

**What it was doing:** This is a "short-circuit" pattern — `||` only evaluates the right side if the left side is falsy. So `process.env['DC_TOKEN'] || usage('...')` means "call `usage()` only if the env var is not set." It works, but it reads as if `process.env['DC_TOKEN']` is being used as a value when it isn't.

**Fix:** Express the intent clearly:
```ts
export function checkVars(): void {
  if (!process.env['DC_TOKEN']) usage('DC_TOKEN');
  if (!process.env['DC_CLIENT']) usage('DC_CLIENT');
  // ...
}
```

This is equivalent behavior but explicitly says "if this condition is true, do this."

---

### Optional catch binding: `catch(err)` → `catch`

In many places, the code had:
```ts
} catch(err) {
  return null;  // or some default value, never using err
}
```

TypeScript (and modern JavaScript) supports **optional catch binding** — if you don't need the error object, you can just write `catch { }` without declaring a variable. This is cleaner than naming a variable you'll never use:

```ts
} catch {
  return null;
}
```

Affected files: `clip.ts` (2 catch blocks), `play.ts`, `message_queue.ts`, `voice_bot/main.ts`.

---

### `no-useless-assignment` in `src/cmd_processor/commands/play.ts`

**Original code:**
```ts
let choice = null;
try {
  choice = await message.awaitMessageComponent(...);
} catch(err) {
  interaction.editReply(...);
  return [null, null];  // <-- always returns here
}
const btn = choice.component as ButtonComponent;
```

**Why ESLint complained:** The initial `= null` assignment is useless. The variable is immediately overwritten in the try block. The only way to reach the code after the try/catch is if the assignment succeeded — the catch block always returns. So `choice` is never read with the value `null`.

**Fix:**
```ts
let choice;
try {
  choice = await message.awaitMessageComponent(...);
} catch {
  interaction.editReply(...);
  return [null, null];
}
```

TypeScript's control flow analysis understands that if we reach the line after the try/catch, `choice` must have been assigned (because the catch block always returns). So this compiles cleanly without needing the `null` initializer.

---

## A Real Bug Found (Not Caught by ESLint)

While reading the code, one actual logic bug was found. ESLint doesn't catch this — it's semantically valid code, just logically wrong. It's documented here because it's instructive.

**Location:** `src/voice_bot/VoiceBot.ts`, constructor, line 83

**Original code:**
```ts
this.isConnected = options.isConnected || true;
```

**The problem:** The intent is "use `options.isConnected` if provided, otherwise default to `true`." But `||` doesn't default on "not provided" — it defaults on **falsy values**. `false` is falsy. So:

```js
false || true  // evaluates to true
```

This means even if you explicitly pass `isConnected: false`, the field will be set to `true`. The option is essentially ignored.

**The fix:**
```ts
this.isConnected = options.isConnected ?? true;
```

The `??` operator (**nullish coalescing**) only uses the right side when the left side is `null` or `undefined` — not when it's `false`. This is the correct way to "default a value when it wasn't provided."

This bug is noted but **not fixed in this PR** — the scope here is strictly linting setup, not behavior changes. Fix separately after reviewing whether any code actually passes `isConnected: false` intentionally.

---

## Packages Installed

| Package | Role |
|---|---|
| `eslint` (v10) | The core linting engine |
| `@eslint/js` | Provides `js.configs.recommended` — ESLint's built-in rule set |
| `typescript-eslint` (v8) | Unified package: TypeScript parser + plugin + config helpers |

> **Note:** The older approach used two separate packages: `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin`. These are now consolidated into the single `typescript-eslint` package with a simpler config API.

---

## Axios Security Note

As part of this work, the axios dependency was **explicitly pinned** from `"^1.3.4"` (semver range) to `"1.14.0"` (exact version) in `package.json`.

**Why:** On March 31, 2026, a North Korean threat actor (Sapphire Sleet / UNC1069) compromised the npm account of an axios maintainer and published two backdoored versions: `1.14.1` and `0.30.4`. These versions install a cross-platform remote access trojan (RAT) silently via a `postinstall` hook — **no code execution required, just `npm install`.**

`1.14.0` is the latest clean version. Pinning to an exact version (no `^`) ensures `npm install` never silently upgrades to a compromised version.

---

## How to Use Linting Day-to-Day

```bash
# Check for violations (no changes made)
npm run lint

# Auto-fix everything fixable (quotes, semicolons, ternaries, etc.)
npm run lint:fix
```

**When to run it:**
- Before committing — or configure your editor to show lint violations inline (VS Code + ESLint extension does this automatically once `eslint.config.mjs` is present)
- After a large refactor to catch anything that slipped through

**When `--fix` isn't enough:**
The auto-fixer handles purely mechanical transformations (quote style, missing semicolons). Issues that require judgment — like the `no-useless-assignment` or `no-unused-expressions` cases above — need a human to decide what the correct behavior should be.

---

## Files Excluded from Linting

| Path | Reason |
|---|---|
| `src/chat_bot/**` | WIP / not yet implemented |
| `src/helpers/stream-examples.ts` | Reference-only, not imported anywhere |
| `scripts/**` | Utility scripts, not part of the application |
| `built/**` | Compiled output from `tsc` |
| `coverage/**` | Test coverage reports |

Sources:
- [Mitigating the Axios npm supply chain compromise](https://www.microsoft.com/en-us/security/blog/2026/04/01/mitigating-the-axios-npm-supply-chain-compromise/)
- [Inside the Axios supply chain compromise - Elastic Security Labs](https://www.elastic.co/security-labs/axios-one-rat-to-rule-them-all)
- [Axios Supply Chain Attack - Huntress](https://www.huntress.com/blog/supply-chain-compromise-axios-npm-package)
- [Axios Supply Chain Attack Pushes Cross-Platform RAT - The Hacker News](https://thehackernews.com/2026/03/axios-supply-chain-attack-pushes-cross.html)
