const fetch = require('node-fetch');
const fs = require('fs');

const HIGGSFIELD_BASE_URL = 'https://platform.higgsfield.ai';

const MODEL_POOL = [
  'higgsfield-ai/dop/preview',
  'bytedance/seedance/v1/pro/image-to-video',
  'kling-video/v2.1/pro/image-to-video',
];

const DURATION_POOL = [3, 5, 10, 15];

function pickModel() {
  if (process.env.HIGGSFIELD_MODEL_ID) return process.env.HIGGSFIELD_MODEL_ID;
  return MODEL_POOL[Math.floor(Math.random() * MODEL_POOL.length)];
}

function pickDuration() {
  return DURATION_POOL[Math.floor(Math.random() * DURATION_POOL.length)];
}

function getAuthHeader() {
  const apiKey = process.env.HIGGSFIELD_API_KEY;
  const apiSecret = process.env.HIGGSFIELD_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('HIGGSFIELD_API_KEY und HIGGSFIELD_API_SECRET muessen beide gesetzt sein.');
  }
  return `Key ${apiKey}:${apiSecret}`;
}

async function submitRequest(imageUrl, prompt, modelId, duration) {
  const response = await fetch(`${HIGGSFIELD_BASE_URL}/${modelId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify({
      image_url: imageUrl,
      prompt,
      duration,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Higgsfield submitRequest Fehler (${modelId}): ${response.status} ${text}`);
  }

  const data = await response.json();
  console.log(`[Higgsfield Debug] submitRequest (${modelId}, ${duration}s) Antwort:`, JSON.stringify(data));
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
      return (
        data.video?.url ||
        data.output?.media_url?.[0] ||
        data.output?.video?.url ||
        data.results?.[0]?.url ||
        null
      );
    }
    if (data.status === 'failed' || data.status === 'nsfw') {
      throw new Error(`Higgsfield Anfrage nicht erfolgreich: Status "${data.status}"`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Higgsfield Anfrage hat das Zeitlimit ueberschritten.');
}

async function generateVideo(imageUrl, prompt, destPath) {
  const modelId = pickModel();
  const duration = pickDuration();

  const requestId = await submitRequest(imageUrl, prompt, modelId, duration);
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
