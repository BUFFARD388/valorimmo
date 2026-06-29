import chromium from '@sparticuz/chromium-min';
import puppeteer from 'puppeteer-core';

/**
 * Génère un PDF à partir d'un HTML et retourne un Buffer.
 * Utilisable directement depuis n'importe quelle API sans appel HTTP interne.
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
    defaultViewport: { width: 794, height: 1123 },
    executablePath,
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 });
    await new Promise(r => setTimeout(r, 800));

    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      printBackground: true,
    });

    return Buffer.from(pdfBuffer);
  } catch (e) {
    console.error('generatePdfBuffer error:', e);
    return null;
  } finally {
    await browser.close();
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
