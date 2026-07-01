const fetch = require('node-fetch');
const fs = require('fs');

const HIGGSFIELD_API_KEY = process.env.HIGGSFIELD_API_KEY;
const HIGGSFIELD_API_BASE_URL = process.env.HIGGSFIELD_API_BASE_URL || 'https://api.higgsfield.ai';

/*
 * WICHTIG: Dies ist ein generischer Platzhalter fuer die Higgsfield-Integration.
 * Ich hatte zum Zeitpunkt der Erstellung keinen verifizierten Zugriff auf die
 * exakte Higgsfield-API-Dokumentation (Endpunkte, Parameter-Namen, Job-Status-Werte
 * koennen sich unterscheiden). Bitte die drei Funktionen unten anhand der echten
 * Higgsfield-API-Doku (aus deinem Account-Dashboard) anpassen:
 *   1. submitJob()   -> Request-Body/Endpunkt an echte Higgsfield-Doku anpassen
 *   2. pollJobStatus() -> Status-Feldnamen anpassen (z.B. "status", "state" ...)
 *   3. Response-Feld mit der fertigen Video-URL anpassen (z.B. "video_url", "output_url")
 *
 * Die Grundstruktur (Job einreichen -> pollen -> Video-URL bekommen -> herunterladen)
 * ist bei praktisch allen Image-to-Video-APIs identisch, nur die genauen Feldnamen
 * unterscheiden sich je Anbieter.
 */

async function submitJob(imagePath, prompt) {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');

  const response = await fetch(`${HIGGSFIELD_API_BASE_URL}/v1/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${HIGGSFIELD_API_KEY}`,
    },
    body: JSON.stringify({
      image_base64: base64Image,
      prompt,
      // TODO: weitere Parameter nach echter Doku ergaenzen (z.B. duration, aspect_ratio: "9:16")
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Higgsfield submitJob Fehler: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.job_id || data.id; // TODO: Feldname pruefen
}

async function pollJobStatus(jobId, { intervalMs = 5000, timeoutMs = 5 * 60 * 1000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const response = await fetch(`${HIGGSFIELD_API_BASE_URL}/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${HIGGSFIELD_API_KEY}` },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Higgsfield pollJobStatus Fehler: ${response.status} ${text}`);
    }
    const data = await response.json();

    // TODO: Status-Werte an echte Doku anpassen
    if (data.status === 'completed' || data.status === 'done') {
      return data.video_url || data.output_url; // TODO: Feldname pruefen
    }
    if (data.status === 'failed' || data.status === 'error') {
      throw new Error(`Higgsfield Job fehlgeschlagen: ${data.error || 'unbekannter Fehler'}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Higgsfield Job hat das Zeitlimit ueberschritten.');
}

async function downloadVideo(videoUrl, destPath) {
  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error(`Video-Download fehlgeschlagen: ${response.status}`);
  const buffer = await response.buffer();
  fs.writeFileSync(destPath, buffer);
}

/**
 * Kompletter Ablauf: Bild + Prompt -> fertiges Video wird lokal gespeichert.
 */
async function generateVideo(imagePath, prompt, destPath) {
  if (!HIGGSFIELD_API_KEY) {
    throw new Error('HIGGSFIELD_API_KEY ist nicht gesetzt. Bitte in .env eintragen.');
  }
  const jobId = await submitJob(imagePath, prompt);
  const videoUrl = await pollJobStatus(jobId);
  await downloadVideo(videoUrl, destPath);
  return destPath;
}

module.exports = { generateVideo };
