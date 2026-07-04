const fetch = require('node-fetch');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

/**
 * Fragt Claude (mit Web-Suche) nach aktuellen viralen Short-Form-Trends im
 * weiblichen Creator-Bereich und liefert daraus eine Liste strukturierter
 * "Reel-Rezepte" (Stil, Sound-Art, Hook-Idee, Schnitttempo). Diese werden
 * regelmaessig (manuell per Button oder spaeter per Cron-Job) neu abgerufen,
 * damit der Content aktuell bleibt - siehe trend_recipes Tabelle.
 *
 * Wichtig: Ersetzt die fruehere generateReelConcept()-Funktion, die einen
 * Higgsfield-Image-to-Video-Prompt erzeugt hat. Diese wird nicht mehr
 * gebraucht, weil die Videoerzeugung jetzt manuell per Face-Swap in
 * Higgsfields Web-Oberflaeche passiert (siehe reels.js).
 *
 * @returns {Promise<Array<{styleName: string, description: string, audioSuggestion: string, hookSuggestion: string, cutPace: string}>>}
 */
async function refreshTrendRecipes() {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY ist nicht gesetzt. Bitte in .env eintragen.');
  }

  const systemPrompt = `Du recherchierst fuer eine Social-Media-Agentur aktuelle virale
Short-Form-Content-Trends (Instagram Reels / TikTok) speziell in der weiblichen
Content-Creator-Szene. Die Agentur nutzt einen manuellen Face-Swap-Workflow: ein
Mitarbeiter setzt das Gesicht einer Creatorin auf ein bereits vorhandenes,
dynamisches Bewegungs-Video (Tanzen, Laufen, GRWM, Transitions etc.).

Deine Aufgabe: Recherchiere per Websuche die AKTUELL (diese Woche/diesen Monat)
angesagten Formate und liefere 5 klar UNTERSCHIEDLICHE Reel-Rezepte, die sich in
Stil, Tempo und Bewegungsart unterscheiden (z.B. nicht alle "ruhig", nicht alle
"GRWM") - Abwechslung ist fuer den Auftraggeber ausdruecklich Pflicht.

Wichtige Regeln:
- Nicht sexuell/explizit, plattformkonform fuer Instagram/TikTok.
- Jedes Rezept muss zu einem GEFILMTEN Bewegungs-Video passen (also eine
  Bewegungsart beschreiben, die man tatsaechlich als Vorlage aufnehmen/lizenzieren
  kann), nicht zu einer KI-generierten Kamerafahrt auf einem Standbild.
- Antworte NUR mit einem JSON-Array, keine Erklaerung davor oder danach, kein
  Markdown-Codeblock. Format pro Eintrag:
  {"styleName": "...", "description": "...", "audioSuggestion": "...", "hookSuggestion": "...", "cutPace": "..."}
  - styleName: kurzer Name (z.B. "Street-Style Walk", "Fast Transition GRWM")
  - description: 1-2 Saetze, welche Bewegung/Aesthetik das Bewegungs-Video zeigen soll
  - audioSuggestion: welche Art von Sound/Audio-Trend gerade dazu passt (Art, nicht ein
    bestimmter urheberrechtlich geschuetzter Songtitel)
  - hookSuggestion: kurze Idee fuer den Text-Hook/erste Sekunde, um Aufmerksamkeit zu wecken
  - cutPace: Schnitttempo, z.B. "sehr schnell, unter 1s pro Szene" oder "ruhig, wenige Schnitte"`;

  const userPrompt = `Recherchiere jetzt per Websuche aktuelle virale Instagram/TikTok
Short-Form-Trends fuer weibliche Content-Creator (Stand: heute) und liefere die 5
Reel-Rezepte als reines JSON-Array gemaess der Vorgaben oben.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Claude API Fehler: ${response.status} ${text}`);
  }

  const data = await response.json();
  const combinedText = data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  const start = combinedText.indexOf('[');
  const end = combinedText.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Konnte keine Trend-Rezepte aus der Claude-Antwort lesen: ' + combinedText.slice(0, 500));
  }

  const recipes = JSON.parse(combinedText.slice(start, end + 1));
  if (!Array.isArray(recipes) || recipes.length === 0) {
    throw new Error('Claude hat keine gueltige Rezept-Liste geliefert.');
  }
  return recipes;
}

module.exports = { refreshTrendRecipes };
