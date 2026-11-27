# Calculated Risk

*A math review game for the classroom.*

Teams choose clues from a board of categories and point values and respond in
the form of a question. Clues are written in LaTeX and typeset with MathJax.
The teacher runs the game from a **host window** that shows the correct
responses and keeps score, while a **board window** on the projector shows
only what the class should see. The same LaTeX file also compiles to printable
handouts.

It's a static website (plain HTML, CSS and JavaScript, with no server code and
no build step), so it can be hosted anywhere that serves files, such as GitHub
Pages. MathJax loads from the internet, so the computer running the game needs
a connection.

An independent, non-commercial math review game for classroom use, not
affiliated with any television program.

## The pages

| Page | What it's for |
| --- | --- |
| `index.html` | The landing page: what the app is, how it works, how to write a game, and a FAQ |
| `guide.html` | The full guide to writing a game, for teachers |
| `host.html` | Set up and run a game (the teacher's screen) |
| `board.html` | The projector screen. The host page opens it; you don't open it yourself. |

## Running it on your own computer

The pages must be served over `http://`; opening the files directly won't
work. From this folder:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8000> in a current Chrome, Edge, Firefox or
Safari (15.4 or newer). The server is only reachable from this computer.

## Putting it online

Publish this folder with GitHub Pages (Settings → Pages → deploy from the
`main` branch), or any static host. Everything in `games/` is then public,
including the responses, so keep private games on your own computer and load
them with **Your own game** on the host page. Loaded files never leave the
browser.

## Running a game

1. Set your computer to **extend** its display onto the projector, not mirror
   it (on a Mac: System Settings → Displays; on Windows: Windows + P →
   Extend).
2. Open the host page and choose a game: one of the built-in games, or your
   own file dropped on **Your own game**.
3. Name the players or teams. There are three to start (Leonhard Euler, Emmy
   Noether and Srinivasa Ramanujan); rename them, remove them, or click
   **Add team**.
4. Choose what the board shows after a correct answer: the answer and the
   worked solution (the default; the solution only if the clue has one), just
   the answer, or nothing.
5. Click **Open board window**, drag that window onto the projector, then
   click inside it (or press **F**) to go full screen. The top bar says
   **Board connected** when the two windows are talking.
6. Click **Start game**.

During the game:

- Click a value on your board to show that clue on the projector. If the clue
  is marked `write` or `say`, the board shows a **WRITE IT** or **SAY IT**
  banner.
- Mark each team that answers **Correct** or **Incorrect**. The app adds or
  subtracts the value. A team can only be marked once per clue.
- **Show answer screen** shows the answer at any time, for example when nobody
  gets the clue. **Show the clue again** switches back.
- **Return to board** closes the clue. **Cancel: put this clue back** undoes
  opening a clue by mistake, before anyone is marked.
- To revisit a clue that's already been played, click its gray square. The
  board shows it marked "REVIEW", and no scoring happens.
- **Double Down** squares are marked "DD" on your screen only. When one is
  picked, the board shows DOUBLE DOWN; choose the team and enter the wager
  (up to the team's score or the board's top value, whichever is larger).
  **Peek at the clue and response** lets you read it first.
- The score panel shows each team's score, with **Adjust** to set one by hand,
  and lets you change what the board shows after a correct answer.
- **Undo** reverses the last action. **End game** returns to the setup screen.
- **Fermat's Last Round**: the board shows the category, and you enter each
  team's wager (up to its score). Then show the clue, mark each team, and
  click **Show final scores**. Optionally, music can play in a small YouTube
  player on your screen while teams work. It's off by default; to turn it on,
  set `FINAL_MUSIC` in `js/config.js` to a video you have the right to play in
  class.
- The game saves itself in the browser as you go. If the host page is closed
  or reloaded, it offers **Resume game**.

## Writing a game

A game is one LaTeX file. [`guide.html`](guide.html) walks teachers through
it; this section is the summary. The easiest start is **Download the
template** on the landing page or the guide, or the **Starter Game template**
link on the host page. It gives a `.zip` with `template.tex`,
`calculatedrisk.sty` and two example pictures in one folder, ready to edit in
any LaTeX editor or Overleaf. `template.tex` is the **Starter Game** on the
host page: a complete game in which each clue shows one feature, with a
comment saying which.

```latex
\documentclass{article}
\usepackage{calculatedrisk}              % options choose the PDF (see Printing)
\gametitle{Calculus I Review}
\newcommand{\dd}[1]{\frac{d}{d#1}}       % macros work inside math

\begin{document}

\begin{category}{Derivatives}
  \begin{clue}[say]
    It is the derivative of $x^3.$
  \response
    What is $3x^2$?
  \solution                              % optional worked solution
    By the power rule, $\dd{x} x^n = n x^{n-1}.$
  \end{clue}

  \begin{clue}[doubledown, write]
    ...
  \response
    ...
  \end{clue}
  % ... 5 clues per category
\end{category}

% ... as many categories as you like

\begin{final}{Series}
  It is the value of $\sum_{n=1}^\infty \frac{1}{n^2}.$
\response
  What is $\pi^2/6$?
\end{final}

\end{document}
```

- **Board size:** any number of categories, with 5 clues each. The board
  resizes to fit. Clues are worth
  100–500 **by position**, so you can reorder them by moving blocks around.
- **Options on a clue**, combined with commas:
  - `doubledown` makes it a Double Down.
  - `write` or `say` tells players whether they must write their response
    before ringing in (a long expression) or can just say it ("What is 6?").
    A clue with neither shows no banner.
- **Fermat's Last Round** comes after the categories. Every team writes its
  response, so it needs no `write` option. It's optional; the app reminds you
  if it's missing.
- **Solutions:** `\solution` is optional. Use it for worked steps (`align*`
  works well). It appears on your host screen and, depending on the setting,
  on the board's answer screen.
- **Math** works in `$...$`, `\(...\)`, `\[...\]`, `$$...$$` and environments
  like `align*`. Your `\newcommand` and `\DeclareMathOperator` macros work
  inside math. Long equations shrink to fit the board.
- **Text** can use `\textbf`, `\emph`, `\textit`, `\texttt`, `\underline`,
  `\textcolor` with named colors, `itemize`, `enumerate`, `center`, `\\`,
  `\$`, quotes, dashes and accents. Anything else is reported when you load
  the file.
- **Pictures:** use `\includegraphics{rose.png}` anywhere in a clue, response
  or solution, and keep the image in the same folder as the game. On the
  board, the text goes on the left and the picture on the right. The
  `width=`/`height=` options only affect the PDF. Use PNG or JPG: both work in
  the game and in the PDF (browsers can't show PDF images, and pdflatex can't
  use SVG). A name without an extension (`rose`) finds `rose.png` or
  `rose.jpg`. To make a PNG from a TikZ drawing, compile it with
  `\documentclass[border=4pt]{standalone}` and convert it:
  `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pngalpha -r600 -o rose.png rose.pdf`
  (`gs` comes with MacTeX).
- **Your own macro package:** a game can `\usepackage{mymacros}`. Put
  `mymacros.sty` in the game's folder, and the app reads its macros too.
- MathJax doesn't support `@{...}` in array column specs. Use `align*`, or
  write `\begin{array}{rcl} u & = & x \end{array}` instead of
  `\begin{array}{r@{=}l} u & x \end{array}`.

**Loading it:** on the host page, drop the `.tex` file on **Your own game**
or click the tile to choose it. If the game has pictures (or its own `.sty`),
zip its folder first (in Finder, right-click → **Compress**; in Windows,
right-click → **Send to → Compressed (zipped) folder**) and load the `.zip`.
From Overleaf, use **Menu → Download → Source**. The app finds the game file
and pictures inside and ignores everything else, such as PDFs, TikZ sources
and `calculatedrisk.sty`. Selecting the `.tex` file and its pictures together
also works. The app lists any problems with line numbers, and **Preview every
clue and response** shows everything rendered. A game with many large
pictures may be too big for the browser to save for **Resume**.

## Printing

Compile the game file with LaTeX as usual (pdflatex, xelatex or Overleaf).
`calculatedrisk.sty` must be in the same folder as the game (a downloaded game
already has it). By default the PDF shows an overview of the board, then the
clues, responses and worked solutions: the one to proofread while you write.
To change what it contains, add any of these options, separated by commas, as
in `\usepackage[clues, noboard]{calculatedrisk}`:

| Option | What it does |
| --- | --- |
| `clues` | Shows the clues only, e.g. a study sheet for students |
| `answers` | Shows the clues and responses |
| `writesay` | Shows each clue's `[write]` or `[say]` mark under its value. Handy while writing; leave it off for copies you give students. |
| `noboard` | Leaves out the board overview |

The web game ignores these options, and the PDFs never mention the Double
Down. Each clue stays on one page with its response; Fermat's Last Round
follows the last category on the same page when it fits, and a long worked
solution may continue onto the next page.

## Built-in games

The games on the host page live in `games/`, one folder each, and share one
master copy of `calculatedrisk.sty`:

```text
games/
  index.json                      the list shown on the host page
  calculatedrisk.sty              shared by every game
  calculus1/
    calculus1.tex                 Sample Game: Single Variable Calculus
  multivariable-calculus/
    multivariable-calculus.tex    Sample Game: Multivariable Calculus
    ant-cube.png, ...             its pictures
    figures/                      TikZ sources for the pictures, and build.sh
  calculus2/
    calculus2.tex                 Sample Game: Limits and Integrals
  template/
    template.tex                  the Starter Game, also the downloadable template
    shaded-area.png, right-triangle.png
    figures/                      TikZ sources for the pictures, and build.sh
```

To add one, put its folder in `games/` and add an entry to
[`games/index.json`](games/index.json) with the path (like
`my-game/my-game.tex`), a title and a one-line description. Keep the title
the same as the game's `\gametitle`. The entries appear on the host page in
the order they're listed. Built-in games load the shared style with
`\usepackage{../calculatedrisk}`; pdflatex warns that the package "provides
calculatedrisk", which is harmless. To rebuild a game's pictures after
editing a TikZ source, run its `figures/build.sh`.

**Download** under each game gives a `.zip` of its folder: the `.tex` file,
the pictures it uses, and a copy of `calculatedrisk.sty`, with the line
changed to `\usepackage{calculatedrisk}` so the folder compiles on its own. To
turn a downloaded game back into a built-in one, put its folder in `games/`,
delete its `calculatedrisk.sty`, and change the line back to
`\usepackage{../calculatedrisk}`.

## Settings

`js/config.js` holds the settings you might want to change:

- `BOARD`: the number of categories and clues, and the value step. Set
  `enforceStandardSize` to `false` to allow boards of any size.
- `FINAL_MUSIC`: an optional YouTube video played during Fermat's Last Round
  (off by default), and whether it starts on its own. Leave `youtubeId: ''`
  to keep it off.
- `MATHJAX_MACROS`: on-screen versions of macros that MathJax can't run from
  their LaTeX definitions.

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `guide.html`, `css/landing.css`, `js/landing.js` | Landing page and the guide to writing a game |
| `host.html`, `css/host.css`, `js/host.js` | Host window: setup, game flow, scoring, undo |
| `board.html`, `css/board.css`, `js/board.js` | Projector window: display only |
| `css/shared.css` | Styles for clue content, used by both windows |
| `js/texparser.js` | Reads `.tex` game files and reports problems |
| `js/files.js`, `js/zip.js` | Finding a game's pictures; reading and writing `.zip` files |
| `js/config.js` | Board size, the Fermat's Last Round music, and MathJax macros |
| `js/sync.js` | Connects the two windows (BroadcastChannel) |
| `js/math.js`, `js/mathjax-config.js` | MathJax setup, typesetting, and fitting wide equations |
| `js/util.js` | Small shared helpers (escaping text, formatting scores) |
| `img/favicon.svg` | Site icon |
| `games/` | Built-in games, the shared `calculatedrisk.sty`, and the template |

## License

[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). You may share and adapt this work for non-commercial purposes, with attribution. See [LICENSE](LICENSE).
