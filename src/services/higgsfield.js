const fetch = require('node-fetch');
const fs = require('fs');

const HIGGSFIELD_BASE_URL = 'https://platform.higgsfield.ai';
const HIGGSFIELD_MODEL_ID = process.env.HIGGSFIELD_MODEL_ID || 'higgsfield-ai/dop/standard';

function getAuthHeader() {
  const apiKey = process.env.HIGGSFIELD_API_KEY;
  const apiSecret = process.env.HIGGSFIELD_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('HIGGSFIELD_API_KEY und HIGGSFIELD_API_SECRET muessen beide in .env gesetzt sein.');
  }
  return `Key ${apiKey}:${apiSecret}`;
}

async function submitRequest(imageUrl, prompt) {
  const response = await fetch(`${HIGGSFIELD_BASE_URL}/${HIGGSFIELD_MODEL_ID}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify({
      prompt,
      image_url: imageUrl,
      aspect_ratio: '9:16',
      resolution: '720p',
      motion_strength: 0.9,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Higgsfield submitRequest Fehler: ${response.status} ${text}`);
  }

  const data = await response.json();
  console.log('[Higgsfield Debug] submitRequest Antwort:', JSON.stringify(data));
  return data.request_id;
}

async function pollStatus(requestId, { intervalMs = 5000, timeoutMs = 12 * 60 * 1000 } = {}) {
  const start = Date.now();
  let pollCount = 0;
  while (Date.now() - start < timeoutMs) {
    const response = await fetch(`${HIGGSFIELD_BASE_URL}/requests/${requestId}/status`, {
      headers: { Authorization: getAuthHeader() },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Higgsfield pollStatus Fehler: ${response.status} ${text}`);
    }
    const data = await response.json();

    pollCount++;
    if (pollCount === 1 || pollCount % 12 === 0) {
      console.log(`[Higgsfield Debug] Poll #${pollCount} fuer ${requestId}:`, JSON.stringify(data));
    }

    if (data.status === 'completed') {
      return data.video?.url;
    }
    if (data.status === 'failed' || data.status === 'nsfw') {
      throw new Error(`Higgsfield Anfrage nicht erfolgreich: Status "${data.status}"`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Higgsfield Anfrage hat das Zeitlimit ueberschritten.');
}

async function generateVideo(imageUrl, prompt, destPath) {
  const requestId = await submitRequest(imageUrl, prompt);
  const videoUrl = await pollStatus(requestId);
  if (!videoUrl) {
    throw new Error('Konnte keine Video-URL aus der Higgsfield-Antwort lesen.');
  }

  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error(`Video-Download fehlgeschlagen: ${response.status}`);
  const buffer = await response.buffer();
  fs.writeFileSync(destPath, buffer);

  return destPath;
}

module.exports = { generateVideo };
