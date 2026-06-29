import chromium from '@sparticuz/chromium-min';
import puppeteer from 'puppeteer-core';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

/**
 * Génère un PDF à partir d'un HTML et retourne un Buffer.
 * Utilise un fichier temporaire dans /tmp pour contourner le bug
 * de setContent() avec Chromium headless sur Vercel.
 *
 * @param {string} html - HTML complet à rendre
 * @returns {Promise<Buffer|null>} Buffer du PDF, ou null en cas d'erreur
 */
export async function generatePdfBuffer(html) {
  const executablePath = await chromium.executablePath(
    'https://github.com/Sparticuz/chromium/releases/download/v123.0.1/chromium-v123.0.1-pack.tar'
  );

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: chromium.headless,
  });

  // Écrire le HTML dans /tmp pour forcer un rendu fiable via file://
  const tmpPath = join('/tmp', `valorimmo-report-${Date.now()}.html`);

  try {
    writeFileSync(tmpPath, html, 'utf8');

    const page = await browser.newPage();
    await page.goto(`file://${tmpPath}`, { waitUntil: 'networkidle0', timeout: 20000 });
    await new Promise(r => setTimeout(r, 500));

    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      printBackground: true,
    });

    console.log('[pdf-generator] Buffer size:', pdfBuffer.length);
    return Buffer.from(pdfBuffer);
  } catch (e) {
    console.error('[pdf-generator] error:', e);
    return null;
  } finally {
    await browser.close();
    try { unlinkSync(tmpPath); } catch {}
  }
}

/**
 * Génère un PDF et retourne son contenu en base64.
 *
 * @param {string} html
 * @returns {Promise<string|null>} base64 string ou null
 */
export async function generatePdfBase64(html) {
  const buffer = await generatePdfBuffer(html);
  return buffer ? buffer.toString('base64') : null;
}
