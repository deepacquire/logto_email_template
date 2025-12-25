#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';

import { loadDotenv } from './lib/dotenv.js';
import { loadConfigFromEnv } from './lib/env.js';
import { createLogtoApiClient } from './lib/logtoAuth.js';
import { exportEmailTemplates, listEmailTemplatesSummary, syncEmailTemplates } from './lib/emailTemplatesApi.js';
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
  list       List all email templates from Logto (summary view)

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
  node src/cli.js list
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
    
    if (parsed.verbose) {
      // eslint-disable-next-line no-console
      console.log('\nExported templates:');
      for (const t of result.templates || []) {
        // eslint-disable-next-line no-console
        console.log(`  - ${t.templateType}/${t.languageTag} (ID: ${t.id || 'N/A'})`);
        // eslint-disable-next-line no-console
        console.log(`    Subject: ${t.details?.subject || '(empty)'}`);
        // eslint-disable-next-line no-console
        console.log(`    Content type: ${t.details?.contentType || 'text/html'}`);
        if (t.details?.replyTo) {
          // eslint-disable-next-line no-console
          console.log(`    Reply to: ${t.details.replyTo}`);
        }
        if (t.details?.sendFrom) {
          // eslint-disable-next-line no-console
          console.log(`    Send from: ${t.details.sendFrom}`);
        }
      }
    }
    process.exit(0);
  }

  if (parsed.command === 'list') {
    const templates = await listEmailTemplatesSummary({
      apiClient,
      emailTemplatesPath: config.emailTemplatesPath,
    });

    if (!templates.length) {
      // eslint-disable-next-line no-console
      console.log('No email templates found in Logto.');
      process.exit(0);
    }

    // Group by template type
    const byType = new Map();
    for (const t of templates) {
      if (!byType.has(t.templateType)) {
        byType.set(t.templateType, []);
      }
      byType.get(t.templateType).push(t);
    }

    // eslint-disable-next-line no-console
    console.log(`Found ${templates.length} email template(s) in Logto:\n`);

    for (const [templateType, items] of Array.from(byType.entries()).sort()) {
      // eslint-disable-next-line no-console
      console.log(`${templateType}:`);
      for (const t of items.sort((a, b) => a.languageTag.localeCompare(b.languageTag))) {
        // eslint-disable-next-line no-console
        console.log(`  ${t.languageTag.padEnd(8)} | Subject: ${t.subject || '(empty)'}`);
        // eslint-disable-next-line no-console
        console.log(`           | Content: ${t.contentType} (${t.contentLength} chars)`);
        if (t.id) {
          // eslint-disable-next-line no-console
          console.log(`           | ID: ${t.id}`);
        }
        if (t.replyTo || t.sendFrom) {
          const extras = [];
          if (t.replyTo) extras.push(`ReplyTo: ${t.replyTo}`);
          if (t.sendFrom) extras.push(`SendFrom: ${t.sendFrom}`);
          // eslint-disable-next-line no-console
          console.log(`           | ${extras.join(', ')}`);
        }
        // eslint-disable-next-line no-console
        console.log('');
      }
    }

    process.exit(0);
  }

  throw new Error(`Unknown command: ${parsed.command}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error?.stack || String(error));
  process.exit(1);
});


