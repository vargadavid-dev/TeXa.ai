/**
 * Overleaf-stílusú LaTeX Monarch Syntax Highlighter & Témák a Monaco Editorhoz
 */

export const latexLanguageConfiguration = {
  comments: {
    lineComment: '%'
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')']
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '$', close: '$' },
    { open: '`', close: "'" }
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '$', close: '$' }
  ],
  folding: {
    markers: {
      start: /^\s*\\begin\{[^}]+\}/,
      end: /^\s*\\end\{[^}]+\}/
    }
  },
  wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
}

// Közös matematikai token szabályok
const mathCommonRules = [
  // Escaped characters in math
  [/\\[%$&_#{}]/, 'constant.character.escape'],

  // Comments inside math
  [/%.*$/, 'comment'],

  // Görög betűk
  [/\\(alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|varkappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)/, 'keyword.math.greek'],

  // Matematikai operátorok és függvények
  [/\\(sum|prod|coprod|int|iint|iiint|oint|partial|nabla|sqrt|frac|dfrac|tfrac|lim|limsup|liminf|sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|exp|det|gcd|deg|dim|hom|ker|max|min|sup|inf|arg|binom|dbinom|tbinom)/, 'keyword.math.operator'],

  // Matematikai relációk, szimbólumok, nyilak
  [/\\(cdot|times|div|pm|mp|circ|bullet|oplus|otimes|odot|star|ast|leq|geq|neq|approx|equiv|sim|simeq|cong|propto|parallel|perp|in|notin|subset|subseteq|supset|supseteq|cap|cup|setminus|emptyset|forall|exists|nexists|infty|to|rightarrow|leftarrow|Rightarrow|Leftarrow|Leftrightarrow|iff|implies|mapsto|hbar|ell|vec|hat|bar|dot|ddot|tilde|left|right|overbrace|underbrace|overline|underline)/, 'keyword.math.symbol'],

  // Matematikai betűtípusok & szöveg a képletben
  [/\\(mathbf|mathit|mathrm|mathcal|mathbb|mathfrak|mathtt|text|operatorname)/, 'keyword.math.style'],

  // Egyéb matematikai parancsok
  [/\\[a-zA-Z]+/, 'keyword.math.command'],

  // Felső index, alsó index
  [/[\^_]/, 'operator.math.script'],

  // Műveleti jelek
  [/[\+\-\*\/\=\<\>\:\,\.\;]/, 'operator.math'],

  // Számok a képletekben
  [/\b\d+(\.\d+)?\b/, 'number.math'],

  // Zárójelek
  [/[{}()\[\]]/, 'delimiter.bracket'],

  // Változók és azonosítók
  [/[a-zA-Z]/, 'string.math']
]

export const latexMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.latex',

  tokenizer: {
    root: [
      // Kommentek (% jeltől a sor végéig)
      [/%.*$/, 'comment'],

      // Escaped speciális karakterek
      [/\\[%$&_#{}]/, 'constant.character.escape'],

      // Kijelölt blokkos matematika: $$ ... $$
      [/\$\$/, { token: 'delimiter.math', next: '@displaymath' }],

      // Soron belüli matematika: $ ... $
      [/\$/, { token: 'delimiter.math', next: '@inlinemath' }],

      // LaTeX display math: \[ ... \]
      [/\\\[/, { token: 'delimiter.math', next: '@displaymathbracket' }],

      // LaTeX inline math: \( ... \)
      [/\\\(/, { token: 'delimiter.math', next: '@inlinemathparen' }],

      // Matematikai környezetek kezdetének észlelése -> közvetlenül a matematikai állapotba váltunk
      [/\\begin\{(equation\*?|align\*?|gather\*?|multline\*?|flalign\*?|split|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|cases|aligned|gathered)\}/, { token: 'keyword.environment', next: '@mathenv' }],

      // Általános \begin{...} és \end{...} környezetek (Overleaf-szerű színezés: \begin és \end rózsaszín/magenta, név arany/borostyán)
      [/(\\begin|\\end)(\s*)(\{)([a-zA-Z0-9*_-]+)(\})/, [
        'keyword.environment',
        '',
        'delimiter.curly',
        'type.environment',
        'delimiter.curly'
      ]],

      // Címsorok, fejezetek, szekciók
      [/\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)/, 'keyword.section'],
      [/\\(title|author|date|maketitle|tableofcontents|listoffigures|listoftables)/, 'keyword.section'],

      // Hivatkozások, címkék, idézetek
      [/(\\(?:label|ref|eqref|pageref|cite|citep|citet|nocite|bibliography|bibliographystyle|bibitem)\*?)(\s*)(\{)([^}]+)(\})/, [
        'keyword.reference',
        '',
        'delimiter.curly',
        'string.reference',
        'delimiter.curly'
      ]],
      [/\\(label|ref|eqref|pageref|cite|citep|citet|nocite)/, 'keyword.reference'],

      // Preambulum és csomagok
      [/\\(documentclass|usepackage|RequirePackage|input|include|geometry|definecolor|colorlet|usetikzlibrary|pgfplotsset|tcbuselibrary|linespread|setlength|addtolength|pagestyle|thispagestyle|hypersetup)/, 'keyword.preamble'],
      [/\\(newcommand|renewcommand|newenvironment|renewenvironment|def)/, 'keyword.definition'],

      // Szövegformázás és stílusok
      [/\\(textbf|textit|emph|underline|textsf|texttt|textsc|textsl|sout|textcolor|color|pagecolor|large|Large|LARGE|huge|Huge|small|footnotesize|scriptsize|tiny|normalsize)/, 'keyword.style'],

      // Elrendezés, térközök, tördelés
      [/\\(centering|raggedright|raggedleft|noindent|indent|item|newpage|clearpage|vfill|hfill|vspace|hspace|smallskip|medskip|bigskip|caption|footnote|url|href)/, 'keyword.layout'],

      // Sortörés és táblázat/align oszlopválasztó
      [/\\\\/, 'keyword.newline'],
      [/&/, 'keyword.align'],

      // Opcionális argumentumok: pl. [12pt, a4paper] vagy [colback=red!5]
      [/\[[^\]]*\]/, 'variable.parameter'],

      // Általános TeX parancs: \parancsnev
      [/\\[a-zA-Z@]+/, 'keyword.command'],

      // Zárójelek
      [/[{}]/, 'delimiter.curly'],
      [/[\[\]()]/, 'delimiter.bracket'],

      // Számok
      [/\b\d+(\.\d+)?\b/, 'number']
    ],

    // Matematikai környezetek: \begin{equation} ... \end{equation}
    mathenv: [
      [/\\end\{(equation\*?|align\*?|gather\*?|multline\*?|flalign\*?|split|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|cases|aligned|gathered)\}/, { token: 'keyword.environment', next: '@pop' }],
      [/&/, 'keyword.align'],
      [/\\\\/, 'keyword.newline'],
      [/\[[^\]]*\]/, 'variable.parameter'],
      ...mathCommonRules
    ],

    // Inline math: $ ... $
    inlinemath: [
      [/\$/, { token: 'delimiter.math', next: '@pop' }],
      ...mathCommonRules
    ],

    // Display math: $$ ... $$
    displaymath: [
      [/\$\$/, { token: 'delimiter.math', next: '@pop' }],
      [/&/, 'keyword.align'],
      [/\\\\/, 'keyword.newline'],
      ...mathCommonRules
    ],

    // LaTeX display math: \[ ... \]
    displaymathbracket: [
      [/\\\]/, { token: 'delimiter.math', next: '@pop' }],
      [/&/, 'keyword.align'],
      [/\\\\/, 'keyword.newline'],
      ...mathCommonRules
    ],

    // LaTeX inline math: \( ... \)
    inlinemathparen: [
      [/\\\)/, { token: 'delimiter.math', next: '@pop' }],
      ...mathCommonRules
    ]
  }
}

// 1. Overleaf Dark Téma (Gazdag, kontrasztos, Overleaf-ihlette sötét téma a stúdióhoz)
export const overleafDarkTheme = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    // Kommentek: halvány szürke, dőlt
    { token: 'comment', foreground: '7f8c98', fontStyle: 'italic' },

    // Környezetek: \\begin / \\end Apple rózsaszín, a név narancs
    { token: 'keyword.environment', foreground: 'ff7ab2', fontStyle: 'bold' },
    { token: 'type.environment', foreground: 'ffa14f', fontStyle: 'bold' },

    // Címsorok és fejezetek: rendszerkék félkövér
    { token: 'keyword.section', foreground: '6bb6ff', fontStyle: 'bold' },

    // Hivatkozások és kulcsok
    { token: 'keyword.reference', foreground: 'ff6a6a' },
    { token: 'string.reference', foreground: 'ffd60a' },

    // Preambulum és makrók: Apple lila
    { token: 'keyword.preamble', foreground: 'da8fff', fontStyle: 'bold' },
    { token: 'keyword.definition', foreground: 'da8fff' },

    // Szövegformázás és elrendezés
    { token: 'keyword.style', foreground: '6ac4dc' },
    { token: 'keyword.layout', foreground: '64d2ff' },
    { token: 'keyword.newline', foreground: 'ff7ab2', fontStyle: 'bold' },
    { token: 'keyword.align', foreground: 'ffd60a', fontStyle: 'bold' },

    // Általános parancsok
    { token: 'keyword.command', foreground: '64a8ff' },
    { token: 'keyword', foreground: '64a8ff' },

    // Opcionális paraméterek [12pt, a4paper]
    { token: 'variable.parameter', foreground: 'ff9f0a' },

    // Matematikai képletek
    { token: 'delimiter.math', foreground: '30d158', fontStyle: 'bold' },
    { token: 'keyword.math.greek', foreground: '64d2ff', fontStyle: 'bold' },
    { token: 'keyword.math.operator', foreground: 'ffd60a', fontStyle: 'bold' },
    { token: 'keyword.math.symbol', foreground: 'da8fff' },
    { token: 'keyword.math.style', foreground: '9a9cff' },
    { token: 'keyword.math.command', foreground: '6bb6ff' },
    { token: 'operator.math.script', foreground: 'ff7ab2', fontStyle: 'bold' },
    { token: 'operator.math', foreground: '6ac4dc' },
    { token: 'number.math', foreground: 'ff9f0a' },
    { token: 'string.math', foreground: 'a6e3a1' },

    // Speciális karakterek és zárójelek
    { token: 'constant.character.escape', foreground: 'da8fff', fontStyle: 'bold' },
    { token: 'number', foreground: 'ff9f0a' },
    { token: 'delimiter.curly', foreground: 'ffd479' },
    { token: 'delimiter.bracket', foreground: 'a1a1a6' }
  ],
  colors: {
    'editor.background': '#1e1e20',
    'editor.foreground': '#f5f5f7',
    'editorCursor.foreground': '#f5f5f7',
    'editor.lineHighlightBackground': '#ffffff0d',
    'editor.lineHighlightBorder': '#00000000',
    'editorLineNumber.foreground': '#5c5c61',
    'editorLineNumber.activeForeground': '#d1d1d6',
    'editor.selectionBackground': '#0a84ff55',
    'editor.inactiveSelectionBackground': '#ffffff1a',
    'editor.selectionHighlightBackground': '#0a84ff22',
    'editorBracketMatch.background': '#0a84ff33',
    'editorBracketMatch.border': '#0a84ff88',
    'editorIndentGuide.background1': '#ffffff10',
    'editorWidget.background': '#2c2c2e',
    'editorWidget.border': '#ffffff1f',
    'editorSuggestWidget.background': '#2c2c2e',
    'editorSuggestWidget.selectedBackground': '#0a84ff66',
    'scrollbarSlider.background': '#ffffff22',
    'scrollbarSlider.hoverBackground': '#ffffff38',
    'editorGutter.background': '#1e1e20'
  }
}

// 2. Overleaf Classic Light Téma (Hagyományos, fehér hátterű Overleaf színek)
export const overleafLightTheme = {
  base: 'vs',
  inherit: true,
  rules: [
    // Kommentek klasszikus Overleaf zöldben
    { token: 'comment', foreground: '22863a', fontStyle: 'italic' },

    // Környezetek: \begin / \end vörös/magenta, név borostyán
    { token: 'keyword.environment', foreground: 'd73a49', fontStyle: 'bold' },
    { token: 'type.environment', foreground: 'b08800', fontStyle: 'bold' },

    // Címsorok: Overleaf kék félkövér
    { token: 'keyword.section', foreground: '005cc5', fontStyle: 'bold' },

    // Hivatkozások
    { token: 'keyword.reference', foreground: 'd73a49' },
    { token: 'string.reference', foreground: 'b08800' },

    // Preambulum és makrók
    { token: 'keyword.preamble', foreground: '6f42c1', fontStyle: 'bold' },
    { token: 'keyword.definition', foreground: '6f42c1' },

    // Formázás és elrendezés
    { token: 'keyword.style', foreground: '0086b3' },
    { token: 'keyword.layout', foreground: '005cc5' },
    { token: 'keyword.newline', foreground: 'd73a49', fontStyle: 'bold' },
    { token: 'keyword.align', foreground: 'b08800', fontStyle: 'bold' },

    // Általános parancsok
    { token: 'keyword.command', foreground: '005cc5' },
    { token: 'keyword', foreground: '005cc5' },

    // Opcionális paraméterek
    { token: 'variable.parameter', foreground: 'e36209' },

    // Matematikai képletek
    { token: 'delimiter.math', foreground: '008000', fontStyle: 'bold' },
    { token: 'keyword.math.greek', foreground: '005cc5', fontStyle: 'bold' },
    { token: 'keyword.math.operator', foreground: 'b08800', fontStyle: 'bold' },
    { token: 'keyword.math.symbol', foreground: '6f42c1' },
    { token: 'keyword.math.style', foreground: '6f42c1' },
    { token: 'keyword.math.command', foreground: '005cc5' },
    { token: 'operator.math.script', foreground: 'd73a49', fontStyle: 'bold' },
    { token: 'operator.math', foreground: '0086b3' },
    { token: 'number.math', foreground: 'e36209' },
    { token: 'string.math', foreground: '032f62' },

    // Speciális karakterek
    { token: 'constant.character.escape', foreground: '6f42c1', fontStyle: 'bold' },
    { token: 'number', foreground: '005cc5' },
    { token: 'delimiter.curly', foreground: 'b08800' },
    { token: 'delimiter.bracket', foreground: '586069' }
  ],
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#24292e',
    'editorCursor.foreground': '#007aff',
    'editor.lineHighlightBackground': '#f5f5f7',
    'editorLineNumber.foreground': '#aeaeb2',
    'editorLineNumber.activeForeground': '#24292e',
    'editor.selectionBackground': '#b3d7ff',
    'editor.inactiveSelectionBackground': '#e1e4e8',
    'editorBracketMatch.background': '#c8e1ff',
    'editorBracketMatch.border': '#007aff',
    'editorGutter.background': '#ffffff'
  }
}

/**
 * Regisztrálja a LaTeX nyelvet és az Overleaf témákat a Monaco példányban
 */
export function registerLatexLanguage(monaco) {
  if (!monaco) return

  // Regisztráljuk a 'latex' nyelvet, ha még nincs regisztrálva
  const languages = monaco.languages.getLanguages()
  const hasLatex = languages.some((l) => l.id === 'latex')
  if (!hasLatex) {
    monaco.languages.register({ id: 'latex' })
  }

  // Beállítjuk a Monarch tokenizálót és nyelvi beállításokat
  monaco.languages.setMonarchTokensProvider('latex', latexMonarchLanguage)
  monaco.languages.setLanguageConfiguration('latex', latexLanguageConfiguration)

  // Definiáljuk az Overleaf témákat
  monaco.editor.defineTheme('overleaf-dark', overleafDarkTheme)
  monaco.editor.defineTheme('overleaf-light', overleafLightTheme)
}
