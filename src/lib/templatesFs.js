import fs from 'node:fs/promises';
import path from 'node:path';

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readText(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  // Keep content as-is but avoid accidental extra newlines at file end
  return content.replace(/\s+$/, '\n').trimEnd();
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text);
}

function inferContentTypeByFilename(filename) {
  if (filename.endsWith('.txt')) return 'text/plain';
  if (filename.endsWith('.html') || filename.endsWith('.htm')) return 'text/html';
  return undefined;
}

/**
 * Folder layout:
 * templates/<templateType>/<languageTag>/
 *   - subject.txt
 *   - content.html OR content.txt
 *   - meta.json (optional: { contentType, replyTo, sendFrom })
 */
export async function loadLocalEmailTemplates(
  templatesDir,
  { onlyTypes = null, onlyLanguages = null } = {}
) {
  const root = path.resolve(templatesDir);
  const typeEntries = await fs.readdir(root, { withFileTypes: true });

  const templates = [];

  for (const typeEntry of typeEntries) {
    if (!typeEntry.isDirectory()) continue;
    const templateType = typeEntry.name;
    if (onlyTypes && !onlyTypes.has(templateType)) continue;

    const templateTypeDir = path.join(root, templateType);
    const langEntries = await fs.readdir(templateTypeDir, { withFileTypes: true });

    for (const langEntry of langEntries) {
      if (!langEntry.isDirectory()) continue;
      const languageTag = langEntry.name;
      if (onlyLanguages && !onlyLanguages.has(languageTag)) continue;

      const templateDir = path.join(templateTypeDir, languageTag);
      const subjectPath = path.join(templateDir, 'subject.txt');
      const contentHtmlPath = path.join(templateDir, 'content.html');
      const contentTxtPath = path.join(templateDir, 'content.txt');
      const metaPath = path.join(templateDir, 'meta.json');

      if (!(await pathExists(subjectPath))) {
        throw new Error(`Missing subject.txt: ${subjectPath}`);
      }

      const hasHtml = await pathExists(contentHtmlPath);
      const hasTxt = await pathExists(contentTxtPath);
      if (!hasHtml && !hasTxt) {
        throw new Error(`Missing content.html or content.txt in: ${templateDir}`);
      }

      const contentPath = hasHtml ? contentHtmlPath : contentTxtPath;
      const subject = await readText(subjectPath);
      const content = await readText(contentPath);

      const meta = (await pathExists(metaPath)) ? await readJson(metaPath) : {};
      const inferredContentType = inferContentTypeByFilename(contentPath);

      const details = {
        subject,
        content,
        contentType: meta.contentType || inferredContentType,
        ...(meta.replyTo ? { replyTo: meta.replyTo } : {}),
        ...(meta.sendFrom ? { sendFrom: meta.sendFrom } : {}),
      };

      templates.push({
        languageTag,
        templateType,
        details,
        _source: {
          dir: templateDir,
          subjectPath,
          contentPath,
          metaPath: (await pathExists(metaPath)) ? metaPath : null,
        },
      });
    }
  }

  return templates;
}


