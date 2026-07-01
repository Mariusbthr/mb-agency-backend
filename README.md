# MB Agency – Backend (Creator-Reel-Generator)

Backend fuer die Software: Bilder von Creatorn hochladen, automatisch Trend-Reels
ueber Claude (Prompt-Erstellung) + Higgsfield (Video-Generierung) erzeugen und in
Creator-Ordnern mit Zeitstempel speichern.

## Was ist schon fertig

- Login mit zwei Rollen: **OWNER** (du) und **EMPLOYEE** (Mitarbeiter)
- Creator-Ordner anlegen (nur Owner)
- Bilder in einen Creator-Ordner hochladen (Owner + Mitarbeiter)
- Reel-Generierung anstossen: Claude erstellt einen plattformkonformen Prompt,
  Higgsfield generiert daraus das Video
- Fertige Reels werden automatisch im Server gespeichert (nicht nur bei Higgsfield)
  und sind ueber die API mit Zeitstempel abrufbar/downloadbar
- SQLite-Datenbank (Datei `data.sqlite`) – kein separater Datenbankserver noetig

## Was du noch anpassen musst

Die Datei `src/services/higgsfield.js` ist ein **Platzhalter**. Ich hatte keinen
verifizierten Zugriff auf die exakte Higgsfield-API-Dokumentation. Bitte:

1. In deinem Higgsfield-Account-Dashboard die API-Dokumentation oeffnen
2. In `src/services/higgsfield.js` die drei markierten Stellen (`TODO`) anpassen:
   - Den echten Endpunkt fuer "Video generieren"
   - Die echten Feldnamen fuer Job-Status
   - Das echte Feld, das die fertige Video-URL enthaelt

Der Rest (Speichern, Ordnerstruktur, Datenbank, Login) funktioniert unabhaengig davon.

## Setup

```bash
# 1. Abhaengigkeiten installieren
npm install

# 2. .env Datei erstellen
cp .env.example .env
# dann in .env deinen ANTHROPIC_API_KEY und HIGGSFIELD_API_KEY eintragen

# 3. Server starten
npm start
```

Server laeuft danach auf `http://localhost:3000`.

## Erste Schritte (API-Nutzung)

### 1. Owner-Account anlegen (nur einmal moeglich)
```bash
curl -X POST http://localhost:3000/auth/setup-owner \
  -H "Content-Type: application/json" \
  -d '{"email":"du@mbagency.de","password":"deinPasswort","name":"Dein Name"}'
```
Antwort enthaelt einen `token` – den brauchst du fuer alle weiteren Anfragen.

### 2. Mitarbeiter anlegen (als Owner)
```bash
curl -X POST http://localhost:3000/auth/employees \
  -H "Authorization: Bearer DEIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"mitarbeiter@mbagency.de","password":"passwort123","name":"Mitarbeiter Name"}'
```

### 3. Creator-Ordner anlegen
```bash
curl -X POST http://localhost:3000/creators \
  -H "Authorization: Bearer DEIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Model 1"}'
```

### 4. Bild hochladen
```bash
curl -X POST http://localhost:3000/creators/CREATOR_ID/images \
  -H "Authorization: Bearer DEIN_TOKEN" \
  -F "image=@/pfad/zum/bild.jpg"
```

### 5. Reel generieren
```bash
curl -X POST http://localhost:3000/creators/CREATOR_ID/generate \
  -H "Authorization: Bearer DEIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"imageId":"BILD_ID","trendContext":"Aktuell trenden schnelle Jump-Cuts mit Text-Overlay-Fragen"}'
```

### 6. Reels ansehen (mit Zeitstempel)
```bash
curl http://localhost:3000/reels/CREATOR_ID \
  -H "Authorization: Bearer DEIN_TOKEN"
```

## Naechste sinnvolle Schritte

1. Higgsfield-Service an die echte API anpassen (siehe oben)
2. Frontend (Dashboard, das wir schon als Klick-Dummy gebaut haben) an diese API anbinden
3. Server hosten (z. B. auf einem VPS oder bei einem Cloud-Anbieter), damit Mitarbeiter
   von ueberall zugreifen koennen
4. Trend-Recherche automatisieren: z. B. alle 1-2 Wochen ein Skript, das aktuelle
   Trends sammelt und in `trendContext` einfliessen laesst, statt es manuell einzutragen
