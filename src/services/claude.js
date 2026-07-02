const fetch = require('node-fetch');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

/**
 * Fragt Claude nach einem kurzen, plattformkonformen Reel-Konzept
 * (Kamerabewegung, Stimmung, Schnitttempo - KEIN Text-Overlay) basierend
 * auf einem Trend-Kontext.
 * Wichtig: Erzeugt bewusst NICHT-explizite, plattformkonforme Konzepte.
 *
 * @param {string} trendContext - kurze Beschreibung aktueller Trends (siehe reels.js fuer Default)
 * @param {string} creatorName - Name des Creators, fuer Kontext
 * @returns {Promise<string>} - fertiger Prompt-Text fuer Higgsfield
 */
async function generateReelConcept(trendContext, creatorName) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY ist nicht gesetzt. Bitte in .env eintragen.');
  }

  const systemPrompt = `Du hilfst einer Social-Media-Agentur dabei, aus einem Bild eines Creators ein
kurzes, plattformkonformes Instagram/TikTok-Reel-Konzept fuer ein Image-to-Video-Tool zu erstellen.

Wichtige Regeln:
- Kein sexueller oder stark sexualisierter Inhalt.
- KEIN Text-Overlay im Video anfordern - aktuelle KI-Video-Modelle koennen Text nicht
  zuverlaessig sauber rendern, das fuehrt zu unlesbarem/verzerrtem Text im Bild.
  Text-Overlays werden spaeter separat in der Videobearbeitung hinzugefuegt, nicht hier.
- NUR einfache, physikalisch plausible Bewegungen anfordern (z.B. Kopfdrehen, Blinzeln,
  Laecheln, Kamerafahrt, Haare/Stoff die sich bewegen) - das TEMPO dieser Bewegungen darf
  aber je nach vorgegebenem Trend-Stil stark variieren (ruhig UND zuegig/energiegeladen sind
  beide erlaubt, "physikalisch plausibel" heisst NICHT automatisch "langsam").
  KEINE komplexen Handlungen (z.B. "steht auf", "faehrt mit dem Stuhl", "geht durch den Raum")
  anfordern - das fuehrt bei aktuellen Video-Modellen zuverlaessig zu unlogischen,
  unrealistisch wirkenden Ergebnissen. Das gilt unabhaengig vom Tempo.
- Orientiere dich an den mitgegebenen aktuellen Trend-Mustern (siehe Trend-Kontext), aber
  uebersetze sie in reine Bild-Bewegung, nicht in Handlung.
- Antworte NUR mit dem fertigen Prompt-Text fuer das Image-to-Video-Tool, keine Erklaerungen,
  keine Anfuehrungszeichen drumherum.`;

  const userPrompt = `Creator: ${creatorName}
Aktuelle Trend-Muster (Juli 2026, Instagram/TikTok, weibliche Creator):
${trendContext}

Erstelle einen kurzen, praezisen englischen Prompt (max. 2-3 Saetze) fuer ein
Image-to-Video-Tool, GENAU im Tempo/Stil des obigen Trend-Musters.

WICHTIG - nutze aktiv diese Steuerung (laut Tool-Doku entscheidend fuers Ergebnis):
- Tempo-Wort einbauen je nach Trend oben: "slowly" / "smoothly" (ruhig) ODER
  "quickly" / "energetically" / "dynamically" (zuegig). Erzwinge NICHT automatisch "slowly".
- Konkrete Kamerabewegung nennen und variieren: z.B. "camera pans left", "zooms in",
  "orbits around", "quick push-in" - waehle passend zum Trend, nicht immer dieselbe.
- Eine natuerliche Bewegung der Person passend zum Tempo (kein Text-Overlay, keine
  komplexe Handlung wie aufstehen/gehen).

Antworte NUR mit dem fertigen englischen Prompt, ohne Anfuehrungszeichen, ohne Erklaerung.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Claude API Fehler: ${response.status} ${text}`);
  }

  const data = await response.json();
  const textBlock = data.content.find((block) => block.type === 'text');
  return textBlock ? textBlock.text.trim() : '';
}

module.exports = { generateReelConcept };
