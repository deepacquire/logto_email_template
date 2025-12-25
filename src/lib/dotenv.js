import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Minimal `.env` loader (dependency-free).
 * - Supports comments (#...), blank lines
 * - Supports KEY=VALUE, optional single/double quotes
 * - Does not expand variables
 */
export async function loadDotenv({
  envFile = '.env',
  cwd = process.cwd(),
  override = false,
} = {}) {
  const filePath = path.isAbsolute(envFile) ? envFile : path.join(cwd, envFile);

  let content = '';
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return { loaded: false, filePath };
    }
    throw error;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Common escape for multiline content in double-quoted env values
    value = value.replace(/\\n/g, '\n');

    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return { loaded: true, filePath };
}


