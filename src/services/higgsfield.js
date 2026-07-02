const fetch = require('node-fetch');
const fs = require('fs');

/*
 * Basiert auf der OFFIZIELLEN Doku "Generate Videos from Images"
 * (docs.higgsfield.ai/docs/guides/video).
 *
 * Base URL: https://platform.higgsfield.ai
 * Auth-Header: "Authorization: Key {api_key}:{api_key_secret}"
 * Ablauf: POST /{model_id} mit { image_url, prompt, duration }
 *         -> Antwort mit request_id
 *         -> GET /requests/{request_id}/status pollen bis status "completed"
 *         -> Video-URL aus der Antwort lesen
 *
 * Bestaetigte Modelle (aus "Available Models"):
 *   - higgsfield-ai/dop/preview                  (High-quality image animation)
 *   - bytedance/seedance/v1/pro/image-to-video   (Professional-grade)
 *   - kling-video/v2.1/pro/image-to-video        (Advanced cinematic animations)
 *
 * Bestaetigte Parameter (aus "Basic Video Generation"): image_url, prompt, duration.
 * (aspect_ratio/resolution/motion_strength stehen NICHT in der Doku und werden ignoriert.)
 */

const HIGGSFIELD_BASE_URL = 'https://platform.higgsfield.ai';

// Bestaetigt durch die echten API-Fehlermeldungen:
// - dop erlaubt Endungen lite/standard/turbo (NICHT "preview")
// - kling funktioniert, erlaubt aber nur Dauer 5 oder 10
// - bytedance/seedance war "Model not found" -> entfernt
// Jeder Eintrag definiert sein Modell UND welche Dauern es erlaubt.
const MODEL_POOL = [
  { id: 'higgsfield-ai/dop/standard', durations: [3, 5, 10, 15] },
  { id: 'higgsfield-ai/dop/turbo', durations: [3, 5, 10, 15] },
  { id: 'kling-video/v2.1/pro/image-to-video', durations: [5, 10] },
];

function pickModelAndDuration() {
  // Falls ein festes Modell per Env-Variable gesetzt ist, dieses nehmen (mit sicherer Dauer 5).
  if (process.env.HIGGSFIELD_MODEL_ID) {
    return { modelId: process.env.HIGGSFIELD_MODEL_ID, duration: 5 };
  }
  const choice = MODEL_POOL[Math.floor(Math.random() * MODEL_POOL.length)];
  const duration = choice.durations[Math.floor(Math.random() * choice.durations.length)];
  return { modelId: choice.id, duration };
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
      // Video-URL kann je nach Modell an leicht unterschiedlicher Stelle stehen -
      // wir pruefen die wahrscheinlichsten Felder ab.
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

/**
 * Kompletter Ablauf. Waehlt (falls kein festes Modell gesetzt ist) zufaellig
 * Modell + Laenge, damit die Reels sich unterscheiden.
 */
async function generateVideo(imageUrl, prompt, destPath) {
  const { modelId, duration } = pickModelAndDuration();

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
