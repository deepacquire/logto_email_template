#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';

import { loadDotenv } from './lib/dotenv.js';
import { loadConfigFromEnv } from './lib/env.js';
import { createLogtoApiClient } from './lib/logtoAuth.js';
import { exportEmailTemplates, syncEmailTemplates } from './lib/emailTemplatesApi.js';
import { loadLocalEmailTemplates } from './lib/templatesFs.js';

function printHelp() {
  // eslint-disable-next-line no-console
  console.log(`
logto-email-templates-as-code

Usage:
  node src/cli.js <command> [options]

Commands:
  sync       Push local templates to Logto via Management API
  export     Download templates from Logto into local folders

Options:
  --env-file <path>     Load env vars from a .env file (default: .env)
  --dir <path>          Templates directory for sync (default: templates)
  --out <path>          Output directory for export (default: exported-templates)
  --only <types>        Comma-separated template types (e.g. SignIn,Register)
  --languages <langs>   Comma-separated language tags (e.g. en,zh-CN)
  --dry-run             Print plan but do not call write APIs (sync only)
  --verbose             Print verbose responses
  -h, --help            Show help

Examples:
  node src/cli.js sync --dry-run
  node src/cli.js sync --only SignIn,Register --languages en,zh-CN
  node src/cli.js export --out exported-templates
`);
}

function parseCsvSet(value) {
  if (!value) return null;
  const items = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? new Set(items) : null;
}

function parseArgs(argv) {
  const args = [...argv];
  const out = {
    command: args.shift() || '',
    envFile: '.env',
    dir: 'templates',
    outDir: 'exported-templates',
    only: null,
    languages: null,
    dryRun: false,
    verbose: false,
  };

  if (out.command === '-h' || out.command === '--help') {
    return { ...out, help: true };
  }

  while (args.length) {
    const a = args.shift();
    if (!a) break;

    if (a === '-h' || a === '--help') return { ...out, help: true };
    if (a === '--dry-run') {
      out.dryRun = true;
      continue;
    }
    if (a === '--verbose') {
      out.verbose = true;
      continue;
    }

    const next = () => {
      const v = args.shift();
      if (!v) throw new Error(`Missing value after ${a}`);
      return v;
    };

    if (a === '--env-file') out.envFile = next();
    else if (a === '--dir') out.dir = next();
    else if (a === '--out') out.outDir = next();
    else if (a === '--only') out.only = parseCsvSet(next());
    else if (a === '--languages') out.languages = parseCsvSet(next());
    else throw new Error(`Unknown argument: ${a}`);
  }

  return out;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help || !parsed.command) {
    printHelp();
    process.exit(0);
  }

  await loadDotenv({ envFile: parsed.envFile });

  const config = loadConfigFromEnv();
  const { apiClient } = await createLogtoApiClient(config);

  if (parsed.command === 'sync') {
    const templates = await loadLocalEmailTemplates(parsed.dir, {
      onlyTypes: parsed.only,
      onlyLanguages: parsed.languages,
    });

    if (!templates.length) {
      // eslint-disable-next-line no-console
      console.log(`No templates found under: ${path.resolve(parsed.dir)}`);
      process.exit(0);
    }

    const results = await syncEmailTemplates({
      apiClient,
      emailTemplatesPath: config.emailTemplatesPath,
      localTemplates: templates,
      dryRun: parsed.dryRun,
      verbose: parsed.verbose,
    });

    const created = results.filter((r) => r.action === 'create').length;
    const updated = results.filter((r) => r.action === 'update').length;
    const upserts = results.filter((r) => r.action === 'upsert').length;

    // eslint-disable-next-line no-console
    console.log(
      parsed.dryRun
        ? `[dry-run] Done. planned=${results.length} (create=${created}, update=${updated}, upsert=${upserts})`
        : `Done. processed=${results.length} (create=${created}, update=${updated}, upsert=${upserts})`
    );
    process.exit(0);
  }

  if (parsed.command === 'export') {
    const result = await exportEmailTemplates({
      apiClient,
      emailTemplatesPath: config.emailTemplatesPath,
      outDir: parsed.outDir,
    });

    // eslint-disable-next-line no-console
    console.log(`Exported ${result.count} templates to: ${result.outDir}`);
    process.exit(0);
  }

  throw new Error(`Unknown command: ${parsed.command}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error?.stack || String(error));
  process.exit(1);
});


