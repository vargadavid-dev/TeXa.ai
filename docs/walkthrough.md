# AI LaTeX Szerkesztő – Walkthrough

Egy helyileg futó, teljes értékű Overleaf-szerű LaTeX szerkesztőalkalmazást készítettünk el, amely közvetlenül integrálódik a Google Gemini API-val és a gépeden található TeX Live 2024 (pdflatex) disztribúcióval.

Az alkalmazás kifejezetten középiskolai **Matematika** és **Fizika** tananyagok, összefoglalók, feladatsorok és prezentációk gyors, kódolásmentes generálására és szerkesztésére lett tervezve.

---

## 🚀 Főbb Funkciók és Képességek

### 1. ✏️ Monaco LaTeX Szerkesztő és Fordító
- **Monaco Editor:** Ugyanaz a szerkesztőmotor, mint a VS Code-ban. LaTeX szintaxiskiemeléssel, automatikus zárójel-párosítással, és beépített JetBrains Mono betűtípussal.
- **Valós idejű PDF fordítás:** Mentéskor (`⌘S` vagy `Ctrl+S`) vagy a felső panelben található **"PDF Fordítás"** gombbal másodpercek alatt lefordítja a LaTeX kódot lokálisan a `pdflatex` fordítóval, és azonnal frissíti a jobb oldali interaktív PDF előnézetet.
- **Fordítási Konzol:** Az editor alatti konzol azonnal mutatja a fordító kimenetét. A hibákat pirossal, a figyelmeztetéseket sárgával emeli ki a könnyű hibakereséshez.

### 2. 🤖 Gemini és Helyi LLM (LM Studio) Asszisztens
Az AI panel a szerkesztő bal oldalán (a Projektek sidebar mellett) található. Mostantól két kiváló szolgáltató közül választhatsz a fejlécben található lenyíló menüvel:

- **🌌 Gemini (Felhő):** A Google szupergyors és nagy tudású felhős modellje. (Ingyenes, de API kulcsot igényel a `.env` fájlban).
- **💻 LM Studio (Helyi):** Teljesen offline, 100%-ban helyben futó és korlátlan modell. Nem szükséges hozzá internet, sem API kulcs, teljesen privát és ingyenes!

Az asszisztens 5 izgalmas üzemmódot kínál:
1. **Generálás:** Témakör (pl. *Pitagorasz-tétel*, *Newton törvényei*) megadása után teljesen kész, professzionális LaTeX dokumentumot állít elő. Kiválasztható a dokumentum típusa:
   - 📝 **Összefoglaló:** definíciókkal (tcolorbox-ban), tételekkel, bizonyításokkal és példákkal.
   - 📋 **Feladatsor:** feladatokkal és opcionális megoldókulccsal a végén.
   - 🖥️ **Beamer Prezentáció:** diákra strukturált bemutató.
   - 📖 **Részletes leírás:** magyarázó folyó szöveg.
2. **Átírás:** Kijelölt LaTeX kódrészlet átdolgozása egyéni utasítás alapján (pl. *"bővítsd ki bizonyításokkal"*, *"javítsd a stílust"*).
3. **TikZ Generátor:** Természetes nyelvű leírásból (pl. *"rajzolj egy derékszögű háromszöget koordináta-rendszerben jelölésekkel"*) közvetlenül beilleszthető TikZ ábrakódot készít.
4. **Feladatsor Készítő:** Megadhatod a feladatok darabszámát, a nehézséget (könnyű, közepes, nehéz), és kérhetsz hozzá részletes megoldókulcsot is.
5. **Beamer Prezentációvá Alakítás:** Egyetlen kattintással diavázlattá konvertálja a jelenlegi összefoglalódat.

### 3. 📎 Forrás Dokumentumok Csatolása (AI Kontextus)
A Generálás és Feladatsor módok alatt fájlokat is csatolhatsz a Gemini-nek kontextusként:
- **PDF és DOCX:** Tankönyvekből, meglévő Word dokumentumokból kinyeri a szöveget, és ez alapján generálja az új anyagot.
- **Képek (JPG/PNG):** Gemini Vision-ön keresztül akár egy táblai vázlat fotójából vagy kézzel írt jegyzetből is képes LaTeX forrást készíteni!
- **TXT / MD / TEX:** Meglévő jegyzetek beolvasása.

### 4. 📁 Projekt Kezelő (Matek és Fizika)
- A bal oldali sidebar automatikusan rendszerezi a projekteket a két tantárgy kategóriájába (**Matematika** és **Fizika**).
- Mentéskor automatikusan létrejön a `.tex` fájl a `/Users/vargadavid/Documents/Projektek/Latex/projektek` mappában.
- A korábbi dokumentumok egyetlen kattintással visszatölthetők a sidebarról.

### 5. ⚡ SyncTeX Kétirányú Szinkronizáció (Kód ↔ PDF)
- **Kódból PDF-be (Forward Search):**
  - Tartsd lenyomva a `Ctrl` (vagy Mac-en `⌘ Cmd`) billentyűt és kattints a Monaco szerkesztőben bármelyik sorra, VAGY nyomd le az `Alt+S` kombinációt, VAGY kattints a fejlécben található **"Ugrás a PDF-re"** gombra!
  - A PDF előnézet azonnal a megfelelő oldalra és bekezdésre ugrik, és egy feltűnő, pulzáló kiemelő kerettel megjelöli a célzott területet.
- **PDF-ből Kódba (Inverse Search):**
  - **Kattints duplán bárhová a PDF-en egy bekezdésre!**
  - A szerkesztő azonnal a megfelelő LaTeX forrássorra görget, odaállítja a kurzort, és egy elegáns kék fénysávval kiemeli az adott sort.

### 6. 🌲 Dokumentum Szerkezeti Fa (Outline / Mini-TOC)
- A szerkesztő fejlécében található **"Vázlat"** gomb megnyomásával egy intelligens tartalomjegyzék panel nyílik meg.
- Valós időben kinyeri és faszerkezetben megjeleníti a dokumentum elemeit:
  - Fejezetek: `\part`, `\chapter`, `\section`, `\subsection`, `\subsubsection`
  - Prezentáció diák: `\frametitle`, `\begin{frame}`
  - Matematikai/fizikai elemek: definíciók, tételek, feladatok, bizonyítások, `tcolorbox` dobozok, TikZ diagramok.
- **Valós idejű kereső:** Név vagy típus szerinti azonnali szűrés.
### 7. 🪄 Fordítási Hibák Javítása AI-val (Fix with AI)
- Ha a `pdflatex` fordítás szintaxishibával leáll (pl. elírt parancs, hiányzó zárójel, lezáratlan környezet, hiányzó `$` math mode):
  - A rendszer azonnal kinyitja az alsó **Fordítási Konzol** panelt.
  - A konzol tetején és fejlécében megjelenik a pulzáló **„Hiba javítása AI-val”** gomb és hiba-banner.
### 8. 📐 Egyéni Preambulumok és Mester-Sablonok Kezelése
- A felső eszköztáron található **„Preambulumok”** gomb megnyitja a dedikált preambulum és sablonkezelő ablakot:
  - **Beépített Mester-Preambulumok:** Matematika (kék definíciók, zöld tételek, TikZ), Fizika (siunitx mértékegységek, áramkörök, törvénydobozok), Gyakorló feladatsor és Beamer diavetítés.
  - **Saját sablon létrehozása:** Név, tantárgy és LaTeX csomagok megadásával tetszőleges saját fejléc rögzíthető.
  - **⚡ 1-Kattintásos beolvasás:** A „Jelenlegi kód beolvasása” gomb azonnal kinyeri a most szerkesztett dokumentumod preambulumát, így egyetlen kattintással elmentheted saját sablonként a jövőre nézve!
  - **AI Generálás rögzített preambulummal:** Az AI panel Generálás fülén a *„Preambulum stílus”* legördülőből kiválaszthatod bármelyik saját vagy mester preambulumodat. Ilyenkor a Gemini garantáltan ezt a fejlécet használja, nem generál felesleges vagy ütköző csomagokat, és a stílus 100%-ban egységes marad!
  - **Új sablon indítása:** Az „Új sablon” menüben a saját elmentett preambulumok is automatikusan megjelennek választható kezdősablonként.

---




## 🛠️ Hogyan tudod futtatni az alkalmazást?

Az alkalmazás futtatásához két rendkívül kényelmes lehetőséged is van macOS-en:

### 1. Gemini API Kulcs Beállítása (Kötelező lépés)
Nyisd meg a `/Users/vargadavid/Documents/Projektek/Latex/.env` fájlt, és írd be a Gemini API kulcsodat:
```env
GEMINI_API_KEY=a_te_api_kulcsod
PORT=3001
```

### 2. Alkalmazás indítása a Dock-ból (Javasolt!)
A projekt főmappájában találsz egy **`AI LaTeX Szerkesztő`** nevű macOS alkalmazást (`AI LaTeX Szerkesztő.app`), amihez egy szép, egyedi neon lila ∑ app ikont is készítettünk!

- 💻 **Dock-ba helyezés:** Egyszerűen húzd rá az `AI LaTeX Szerkesztő` ikont a macOS Dock sávodra!
- 🚀 **Indítás:** Csak kattints rá a Dock-ban az ikonra! Ez automatikusan:
  1. Megnyit egy tiszta terminálablakot és elindítja a szervert.
  2. 3 másodperc múlva automatikusan megnyitja a böngésződet a szerkesztőfelülettel.

### 3. Indítás parancsfájlból
Ha a Finderből szeretnéd indítani:
- Kattints duplán a főmappában lévő **`inditas.command`** parancsfájlra!

### 4. Manuális indítás terminálból
```bash
cd /Users/vargadavid/Documents/Projektek/Latex
npm start
```

---

## 📋 Fejlesztési Terv & Roadmap
A részletes, fázisokra bontott fejlesztési roadmap megtalálható a [fejlesztesi_terv.md](file:///Users/vargadavid/Documents/Projektek/Latex/docs/fejlesztesi_terv.md) dokumentumban.

