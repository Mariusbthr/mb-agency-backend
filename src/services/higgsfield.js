const fs = require('fs');
const fetch = require('node-fetch');

/*
 * Nutzt das offizielle Higgsfield-SDK fuer Node.js (@higgsfield/client).
 * Quelle: https://github.com/higgsfield-ai/higgsfield-js
 *
 * WICHTIG ZUM CREDENTIALS-FORMAT:
 * Higgsfield nutzt teils ein KEY_ID:KEY_SECRET Format, nicht nur einen einzelnen Schluessel.
 * Schau in deinem cloud.higgsfield.ai/api-keys Bereich nach, ob dir beim Erstellen
 * ZWEI Werte angezeigt wurden (eine ID und ein Secret). Falls ja, trage beide
 * durch einen Doppelpunkt getrennt in HIGGSFIELD_CREDENTIALS ein:
 *   HIGGSFIELD_CREDENTIALS=deine-key-id:dein-key-secret
 * Falls dir nur EIN einzelner Wert angezeigt wurde, trage ihn einfach direkt ein
 * (ohne Doppelpunkt).
 *
 * WICHTIG ZUM MODELL-NAMEN:
 * Der exakte Modell-Bezeichner fuer "Bild zu Video" muss noch anhand der
 * Higgsfield-Doku bestaetigt werden (Seite "Generate Videos from Images" in
 * deinem Higgsfield-Doku-Bereich). Ich habe hier den wahrscheinlichsten Wert
 * eingetragen, bitte einmal gegenchecken und ggf. in HIGGSFIELD_MODEL anpassen.
 */

const HIGGSFIELD_MODEL = process.env.HIGGSFIELD_MODEL || 'dop/image-to-video';

let higgsfieldClientPromise = null;
async function getClient() {
  if (!higgsfieldClientPromise) {
    higgsfieldClientPromise = (async () => {
      const { createHiggsfieldClient } = await import('@higgsfield/client/v2');
      const credentials = process.env.HIGGSFIELD_CREDENTIALS;
      if (!credentials) {
        throw new Error('HIGGSFIELD_CREDENTIALS ist nicht gesetzt. Bitte in .env eintragen.');
      }
      return createHiggsfieldClient({ credentials });
    })();
  }
  return higgsfieldClientPromise;
}

/**
 * Kompletter Ablauf: oeffentliche Bild-URL + Prompt -> fertiges Video wird lokal gespeichert.
 * @param {string} imageUrl - oeffentlich erreichbare URL des Quellbilds (siehe /files Route in index.js)
 * @param {string} prompt - von Claude generierter Reel-Prompt
 * @param {string} destPath - lokaler Zielpfad, wohin das fertige Video gespeichert wird
 */
async function generateVideo(imageUrl, prompt, destPath) {
  const client = await getClient();

  const jobSet = await client.subscribe(HIGGSFIELD_MODEL, {
    input: {
      image_url: imageUrl,
      prompt,
      // TODO: je nach Higgsfield-Doku ggf. noch aspect_ratio: '9:16' fuer Reels ergaenzen
    },
    withPolling: true, // wartet automatisch, bis das Video fertig ist
  });

  if (!jobSet.isCompleted) {
    throw new Error('Higgsfield-Generierung war nicht erfolgreich (Job nicht abgeschlossen).');
  }

  // TODO: Feldname pruefen - je nach SDK-Version kann das Ergebnis-Objekt
  // anders benannt sein (z.B. jobSet.jobs[0].results?.video?.url)
  const videoUrl = jobSet.jobs?.[0]?.results?.raw?.url || jobSet.jobs?.[0]?.results?.video?.url;
  if (!videoUrl) {
    throw new Error('Konnte keine Video-URL aus der Higgsfield-Antwort lesen. Bitte Antwortstruktur pruefen.');
  }

  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error(`Video-Download fehlgeschlagen: ${response.status}`);
  const buffer = await response.buffer();
  fs.writeFileSync(destPath, buffer);

  return destPath;
}

module.exports = { generateVideo };
