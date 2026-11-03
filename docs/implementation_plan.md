# AI LaTeX Szerkesztő – Helyi Overleaf-szerű Alkalmazás

Egy teljes értékű, lokálisan futó LaTeX szerkesztő, amely Gemini AI segítségével professzionális iskolai PDF anyagokat generál. Split-view szerkesztő (kód + PDF előnézet), dokumentum csatolás, TikZ diagram generálás, és több dokumentumtípus-sablon.

---

## Tech Stack

| Réteg | Technológia | Szerep |
|-------|-------------|--------|
| **Frontend** | Vite + React | UI keretrendszer |
| **Szerkesztő** | Monaco Editor | LaTeX szintaxiskiemelés |
| **PDF nézet** | PDF.js (react-pdf) | Inline PDF előnézet |
| **Backend** | Node.js + Express | API, fájlkezelés |
| **LaTeX** | pdflatex + latexmk (TeX Live 2024) | PDF fordítás |
| **AI** | Google Gemini API | Tartalom generálás |
| **Fájl parse** | pdf-parse, mammoth | PDF/DOCX olvasás |
| **Stílus** | Vanilla CSS | Egyedi, prémium UI |

---

## Főbb Funkciók

### ✏️ Szerkesztő
- Monaco Editor LaTeX szintaxiskiemeléssel
- Split-view: bal oldal kód, jobb oldal PDF előnézet
- Auto-fordítás mentéskor (Ctrl+S) vagy manuálisan
- Fordítási hibák megjelenítése panelben
- Zoom a PDF nézeten

### 🤖 AI Asszisztens (Gemini)
| Funkció | Leírás |
|---------|--------|
| **Téma → Dokumentum** | Megadott témából teljes LaTeX anyag generálása |
| **Fejezet átírás** | Kijelölt szöveg/fejezet AI-val való átdolgozása |
| **TikZ diagram** | Természetes leírásból TikZ kód generálása |
| **Feladatsor** | Feladatok + megoldókulcs generálása adott témához |
| **Összefoglaló → Beamer** | Meglévő anyagból prezentáció LaTeX kód |
| **Csatolt doc alapján** | Feltöltött fájl tartalma alapján generálás |

### 📄 Dokumentumtípus Sablonok
- 📝 **Összefoglaló** – definíciók, tételek, példák
- 📋 **Feladatsor** – feladatok (opcionális megoldókulccsal)
- 📊 **Beamer Prezentáció** – diák, strukturált bemutató
- 📖 **Részletes leírás** – folyó szöveg, magyarázatok

### 📎 Dokumentum Csatolás (AI kontextus)
Támogatott formátumok:
- `PDF` – tankönyv, meglévő anyag szövegének kinyerése
- `DOCX` – Word dokumentumok
- `Kép` (JPG/PNG) – Gemini Vision API-n keresztül (táblai vázlat, kézírás)
- `TXT / Markdown` – egyszerű szöveges vázlat
- `.tex` – meglévő LaTeX anyag átdolgozáshoz

### 📁 Projekt Kezelő
- Sidebar: projektek listája (tantárgy szerint csoportosítva)
- Új projekt / fájl létrehozás
- Fájlok átnevezése, törlése
- Legutóbbi dokumentumok

---

## Fájlstruktúra

```
/Users/vargadavid/Documents/Projektek/Latex/
├── backend/
│   ├── server.js              # Express szerver belépési pont
│   ├── routes/
│   │   ├── compile.js         # pdflatex fordítás endpoint
│   │   ├── ai.js              # Gemini API hívások
│   │   └── files.js           # Fájlkezelés, projektek
│   ├── templates/             # LaTeX sablonok
│   │   ├── osszefoglalo.tex
│   │   ├── feladatsor.tex
│   │   ├── beamer.tex
│   │   └── leiras.tex
│   ├── uploads/               # Ideiglenes feltöltések
│   └── projects/              # Felhasználó projektjei
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Sidebar/       # Projekt navigator
│   │   │   ├── Editor/        # Monaco LaTeX szerkesztő
│   │   │   ├── PdfPreview/    # PDF.js alapú előnézet
│   │   │   ├── AiPanel/       # AI asszisztens panel
│   │   │   ├── Toolbar/       # Felső eszköztár
│   │   │   └── Uploader/      # Dokumentum feltöltő
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css          # Prémium dark theme
│   ├── index.html
│   └── vite.config.js
│
├── .env                       # GEMINI_API_KEY
└── package.json               # Root workspace
```

---

## UI / UX Design

- **Dark mode** alapértelmezett (Overleaf-szerű, de modernebb)
- **3 paneles elrendezés**: Sidebar | Monaco Editor | PDF Preview
- **AI panel** – lebegő oldalpanel vagy alsó drawer
- **Prémium esztétika**: Inter font, smooth animációk, glassmorphism elemek
- **Magyar nyelvű felület** teljes egészében

### Elrendezés vázlat:
```
┌─────────┬──────────────────────┬─────────────────────┐
│         │   TOOLBAR / AI BAR   │                     │
│ SIDEBAR ├──────────────────────┤   PDF ELŐNÉZET      │
│         │                      │                     │
│ Projekt │   LaTeX SZERKESZTŐ   │  (react-pdf /       │
│ fák     │   (Monaco Editor)    │   PDF.js)           │
│         │                      │                     │
│         ├──────────────────────┤                     │
│         │  FORDÍTÁS KONZOL     │                     │
└─────────┴──────────────────────┴─────────────────────┘
```

---

## Megvalósítás Sorrendje

1. **Alap projekt struktúra** – Vite + Node.js workspace
2. **Backend: pdflatex fordítás** – POST endpoint, temp fájlkezelés
3. **Frontend: split-view szerkesztő** – Monaco + PDF nézet
4. **Projekt kezelő** – fájlfák, mentés, betöltés
5. **AI integráció** – Gemini API, prompt engineering per típus
6. **Dokumentum feltöltés** – pdf-parse, mammoth, Vision API
7. **Sablonrendszer** – 4 dokumentumtípus
8. **UI polish** – dark theme, animációk, prémium design

---

## Nyitott Kérdések

> [!IMPORTANT]
> **Gemini API kulcs:** Meg tudod adni az API kulcsodat, vagy egy `.env` fájlban tároljuk majd, és te töltöd ki manuálisan indítás előtt?

> [!IMPORTANT]  
> **Projektek helye:** Hová mentse a létrehozott `.tex` és `.pdf` fájlokat? Javaslat: `/Users/vargadavid/Documents/Projektek/Latex/projektek/` – megfelel ez?

> [!NOTE]
> **Tantárgyak:** Előre definiált tantárgy-kategóriákat rakjak be (Matematika, Fizika, Kémia, Biológia, Irodalom, Történelem, Angol), vagy ez testre szabható legyen?

---

## Ellenőrzési Terv

### Automatikus
- `pdflatex` fordítás tesztelése egy alapdokumentummal
- Gemini API hívás tesztelése (rövid prompt)
- Fájl feltöltés + parse tesztelése (PDF, DOCX)

### Manuális
- Split view ellenőrzése: szerkesztés → mentés → PDF frissítés
- AI generálás: "Pitagorasz-tétel összefoglaló" témával
- TikZ: "rajzolj egy háromszöget koordináta-rendszerben"
- Dokumentum csatolás: PDF feltöltés → AI kérdés a tartalomról
