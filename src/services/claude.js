const fetch = require('node-fetch');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

/**
 * Fragt Claude nach einem kurzen, plattformkonformen Reel-Konzept
 * (Hook, Schnitt-Idee, Text-Overlay) basierend auf einem Trend-Kontext.
 * Wichtig: Erzeugt bewusst NICHT-explizite, plattformkonforme Konzepte.
 *
 * @param {string} trendContext - kurze Beschreibung aktueller Trends (manuell gepflegt oder recherchiert)
 * @param {string} creatorName - Name des Creators, fuer Kontext
 * @returns {Promise<string>} - fertiger Prompt-Text fuer Higgsfield
 */
async function generateReelConcept(trendContext, creatorName) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY ist nicht gesetzt. Bitte in .env eintragen.');
  }

  const systemPrompt = `Du hilfst einer Social-Media-Agentur dabei, aus einem Bild eines Creators ein
kurzes, plattformkonformes Instagram/TikTok-Reel-Konzept zu erstellen.
Regeln:
- Kein sexueller oder stark sexualisierter Inhalt.
- Fokus auf Trends, Ästhetik, Hooks, Schnitttempo, Text-Overlays.
- Antworte NUR mit dem fertigen Prompt-Text fuer ein Image-to-Video-Tool, keine Erklaerungen.`;

  const userPrompt = `Creator: ${creatorName}
Aktueller Trend-Kontext: ${trendContext}

Erstelle einen kurzen, praezisen Prompt (max. 4-5 Saetze) fuer ein Image-to-Video-Tool,
der aus dem Bild ein trendiges, virales Reel macht. Beschreibe Kamerabewegung, Stimmung,
Schnitttempo und eine Idee fuer Text-Overlay.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 400,
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
