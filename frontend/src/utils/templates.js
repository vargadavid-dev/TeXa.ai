export const EMPTY_DOCUMENT_CONTENT = `\\documentclass[a4paper,12pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[magyar]{babel}
\\usepackage{amsmath, amssymb}
\\usepackage{geometry}
\\geometry{margin=2.5cm}

\\begin{document}



\\end{document}`

export const RAW_EMPTY_CONTENT = ''

export const TEMPLATES = [
  {
    id: 'empty',
    name: 'Üres dokumentum',
    desc: 'Tiszta, minimális LaTeX vázlat feliratok és mintaszöveg nélkül',
    content: EMPTY_DOCUMENT_CONTENT
  },
  {
    id: 'raw_empty',
    name: 'Teljesen üres lap (0 karakter)',
    desc: 'Üres szerkesztőfelület saját vagy vágólapról beillesztett kódhoz',
    content: RAW_EMPTY_CONTENT
  },
  {
    id: 'blank',
    name: 'Alap sablon cikkhez',
    desc: 'Cikk struktúra bevezetővel és minta kiemeléssel',
    content: `\\documentclass[a4paper,12pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[magyar]{babel}
\\usepackage{amsmath, amssymb, amsthm}
\\usepackage{geometry}
\\usepackage{xcolor}
\\usepackage{tcolorbox}
\\tcbuselibrary{theorems,skins}
\\geometry{margin=2.5cm}

\\title{Új dokumentum}
\\author{}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Bevezető}
Ide kerül a tartalom...

\\end{document}`
  },
  {
    id: 'microlearning',
    name: 'Interaktív mikrotananyag (Microlearning)',
    desc: 'Aprózott elméleti blokkok + azonnali ellenőrző feladatok (A/B/C/D, I/H, többlépcsős)',
    content: `\\documentclass[a4paper,12pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[magyar]{babel}
\\usepackage{amsmath, amssymb, amsthm}
\\usepackage{geometry}
\\usepackage{xcolor}
\\usepackage{tcolorbox}
\\tcbuselibrary{theorems,skins,breakable}
\\usepackage{tikz}
\\usepackage{enumitem}
\\usepackage{hyperref}
\\geometry{margin=2.5cm}

% Egyedi stílusú dobozok a mikrotananyag módszertanhoz
\\newtcolorbox{definiciodoboz}[1][]{colback=blue!5!white,colframe=blue!75!black,fonttitle=\\bfseries,title=Definíció: #1}
\\newtcolorbox{teteldoboz}[1][]{colback=green!8!white,colframe=green!75!black,fonttitle=\\bfseries,title=Tétel / Szabály: #1}
\\newtcolorbox{feladatdoboz}[1][]{colback=orange!5!white,colframe=orange!85!black,fonttitle=\\bfseries,title=Ellenőrző feladat: #1}
\\newtcolorbox{megoldasdoboz}[1][]{colback=gray!5!white,colframe=gray!60!black,fonttitle=\\bfseries,title=Megoldás és magyarázat: #1}

\\title{Témakör -- Mikrotananyag}
\\author{TeXa AI}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{1. Mikro-egység: Alapfogalom bemutatása}

\\begin{definiciodoboz}[Fogalom meghatározása]
Itt szerepel a témakör legkisebb, önállóan megérthető egysége, szabálya vagy definíciója. Egyszerre mindig csak egy új gondolatot vezetünk be.
\\end{definiciodoboz}

% Azonnali visszacsatolás: Elmélet 1 -> Feladat 1
\\begin{feladatdoboz}[1. Megértést ellenőrző kérdés (Feleletválasztós)]
Melyik állítás írja le helyesen a fenti fogalmat?
\\begin{enumerate}[label=(\\Alph*)]
    \\item Első válaszlehetőség
    \\item Második válaszlehetőség (Helyes megoldás)
    \\item Harmadik válaszlehetőség
    \\item Negyedik válaszlehetőség
\\end{enumerate}
\\end{feladatdoboz}

\\begin{megoldasdoboz}[Megoldás az 1. kérdéshez]
\\textbf{Helyes válasz: (B)} \\\\
\\textit{Indoklás:} A definíció alapján ez az állítás tükrözi a pontos összefüggést.
\\end{megoldasdoboz}

\\section{2. Mikro-egység: Szabály és összefüggés}

\\begin{teteldoboz}[Alapvető tétel / képlet]
A következő logikus lépésként bemutatott alaptétel vagy számítási képlet:
\\[
    f(x) = a \\cdot x + b
\\]
ahol $a$ a meredekség és $b$ a tengelymetszet.
\\end{teteldoboz}

% Azonnali visszacsatolás: Elmélet 2 -> Feladat 2
\\begin{feladatdoboz}[2. Megértést ellenőrző feladat (Igaz/Hamis és Többlépcsős vezetés)]
\\textbf{A) Igaz vagy Hamis?}
\\begin{itemize}
    \\item Ha $a > 0$, akkor a függvény szigorúan monoton növekvő. (I / H)
\\end{itemize}

\\medskip
\\textbf{B) Többlépcsős feladatvezetés:}
\\begin{enumerate}[label=\\alph*)]
    \\item Számítsd ki a függvényértéket $x = 3$ esetén, ha $a = 2$ és $b = 4$!
    \\item Határozd meg, melyik pontban metszi az $y$-tengelyt!
\\end{enumerate}
\\end{feladatdoboz}

\\begin{megoldasdoboz}[Megoldás a 2. feladathoz]
\\textbf{A) Igaz}, mert pozitív meredekség esetén az argumentum növekedésével a függvényérték is nő. \\\\
\\textbf{B) Lépésről lépésre:}
\\begin{enumerate}[label=\\alph*)]
    \\item $f(3) = 2 \\cdot 3 + 4 = 6 + 4 = 10$.
    \\item $x = 0$ helyettesítéssel $f(0) = 4$, tehát a metszéspont $(0, 4)$.
\\end{enumerate}
\\end{megoldasdoboz}

\\end{document}`
  },
  {
    id: 'osszefoglalo',
    name: 'Összefoglaló tananyag',
    desc: 'Definíciók, tételek, bizonyítások tcolorbox-ban',
    content: `\\documentclass[a4paper,12pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[magyar]{babel}
\\usepackage{amsmath, amssymb, amsthm}
\\usepackage{geometry}
\\usepackage{xcolor}
\\usepackage{tcolorbox}
\\usepackage{tikz}
\\usepackage{hyperref}
\\geometry{margin=2.5cm}

\\title{Témaköri Összefoglaló}
\\author{TeXa AI}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Elméleti áttekintés}

\\begin{tcolorbox}[colback=blue!5!white,colframe=blue!75!black,title=Definíció]
Ide jön a pontos matematikai vagy fizikai definíció szövege...
\\end{tcolorbox}

\\begin{tcolorbox}[colback=green!5!white,colframe=green!75!black,title=Tétel]
Ide jön a tétel pontos megfogalmazása és feltételrendszere...
\\end{tcolorbox}

\\begin{proof}
A tétel formális vagy szemléletes levezetése és bizonyítása...
\\end{proof}

\\section{Kidolgozott mintapéldák}

\\subsection{1. Mintafeladat}
A feladat pontos szövege és a megadott adatok...

\\medskip
\\textbf{Megoldás lépésről lépésre:}
\\[
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
\\]

\\section{Önálló gyakorló feladatok}
\\begin{enumerate}
    \\item Első gyakorló feladat...
    \\item Második gyakorló feladat...
\\end{enumerate}

\\end{document}`
  },
  {
    id: 'feladatsor',
    name: 'Gyakorló feladatsor',
    desc: 'Különböző nehézségű feladatok + megoldókulcs',
    content: `\\documentclass[a4paper,12pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[magyar]{babel}
\\usepackage{amsmath, amssymb, amsthm}
\\usepackage{geometry}
\\usepackage{xcolor}
\\usepackage{tcolorbox}

\\geometry{margin=2cm}

\\title{Gyakorló Feladatsor}
\\author{TeXa AI}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Feladatsor}

\\begin{enumerate}
    \\item \\textbf{[K1 – Alapfeladat - 2 pont]} Első feladat szövege...
    \\item \\textbf{[K2 – Közepes feladat - 4 pont]} Második feladat szövege...
    \\begin{enumerate}
        \\item Részfeladat a)
        \\item Részfeladat b)
    \\end{enumerate}
    \\item \\textbf{[K3 – Nehezebb feladat - 6 pont]} Összetett gondolkodtató feladat...
\\end{enumerate}

\\newpage
\\section{Részletes Megoldókulcs}
\\begin{enumerate}
    \\item \\textbf{1. feladat megoldása:} ...
    \\item \\textbf{2. feladat megoldása:} ...
    \\item \\textbf{3. feladat megoldása:} ...
\\end{enumerate}

\\end{document}`
  },
  {
    id: 'beamer',
    name: 'Beamer előadás',
    desc: 'Diák, címdiák, tételek és képletek',
    content: `\\documentclass{beamer}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[magyar]{babel}
\\usepackage{amsmath, amssymb}

\\usetheme{Madrid}
\\usecolortheme{default}

\\title{Témakör Bemutatása}
\\subtitle{Oktatási prezentáció}
\\author{TeXa AI}
\\date{\\today}

\\begin{document}

\\frame{\\titlepage}

\\begin{frame}
\\frametitle{Tartalomjegyzék}
\\tableofcontents
\\end{frame}

\\section{Bevezetés}
\\begin{frame}
\\frametitle{Alapfogalmak és motiváció}
\\begin{itemize}
    \\item Első kiemelt szempont...
    \\item Második lényeges összefüggés...
    \\item Alapegyenlet szemléltetése:
    \\[
        E = mc^2
    \\]
\\end{itemize}
\\end{frame}

\\section{Összegzés}
\\begin{frame}
\\frametitle{Főbb tanulságok}
\\begin{block}{Kulcsgondolat}
A lényegi megállapítás összefoglalása egy kiemelt beamer blokkban.
\\end{block}
\\end{frame}

\\end{document}`
  }
]
