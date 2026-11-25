# Classroom Jeopardy

A Jeopardy game for math classes. Clues are written in LaTeX and rendered with
MathJax. The professor runs the game from a **host window** that shows the
correct responses and keeps score, while a separate **board window** on the
projector shows only what the class should see.

It's a static website: plain HTML, CSS and JavaScript with no server code and
no build step. The only outside dependency is MathJax, which loads from a CDN,
so the computer needs internet access.

## Running it

The pages must be served over `http://`; opening `index.html` as a file won't
work. From this folder:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8000> in Safari (15.4 or newer), Chrome, Edge or
Firefox. The server is only reachable from this computer.

To host it online, publish this folder with GitHub Pages (Settings → Pages →
deploy from the `main` branch). Note that anything in `games/` is then public,
including the responses, so keep private games on your own computer and load
them with **Load a .tex file**.

## Running a game

1. Set your display to **extend** onto the projector (System Settings →
   Displays; turn mirroring off).
2. Open the app, choose a game or load your own `.tex` file, and name the teams.
3. Click **Open board window**, drag that window onto the projector, then click
   inside it (or press **F**) to go full screen. The host's top bar shows
   "Board window: connected" when the two windows are talking.
4. Click **Start game**.

During the game:

- Click a value on your board to show that clue on the projector.
- Mark each team that answers **Correct** or **Incorrect**. The app adds or
  subtracts the value. A team can only be marked once per clue.
- After a correct answer, the board can show one of three things. Choose
  under **After a correct answer, the board shows** on the setup screen, or
  in the score panel during the game. The app remembers your choice.
  - **Nothing**: go straight back to the board.
  - **The answer**: the answer screen shows the correct response only.
  - **The answer + worked solution** (the default): the response, plus the
    worked solution if the clue has one.
- **Show answer screen** shows it at any time, for example when nobody gets
  the clue. It includes the worked solution unless you chose **The answer**. **Show the clue again** switches back.
- **Return to board** closes the clue. **Cancel** puts a clue back if you
  opened it by mistake.
- To revisit a clue that's already been played (say, a student has a
  question), click its gray square. The board shows it marked "REVIEW". You
  can switch to the answer screen, and no scoring happens.
- **Daily Double** squares are marked "DD" on your screen only. Choose the team
  and enter the wager (up to the team's score or the board's top value,
  whichever is larger).
- **Final Jeopardy**: the board shows the category, you enter each team's wager
  (up to its score), then show the clue and mark each team.
- **Undo** reverses the last action. **Adjust** next to a score sets it by hand.
- The game saves itself in the browser as you go. If the host page is reloaded,
  you'll be offered **Resume**.

## Writing a game

Each game has its own folder inside `games/`, holding the `.tex` file and
its pictures. The shared [`jeopardy.sty`](games/jeopardy.sty) sits one level
up, in `games/` itself:

```
games/
  index.json                      the list of built-in games
  jeopardy.sty                    shared by every game
  template/template.tex
  multivariable-calculus/
    multivariable-calculus.tex
    rose.png
```

To start a game, copy the [`template`](games/template/template.tex) folder,
rename the folder and the file, and fill it in.

**Downloads:** the **template** link and **Download** under each built-in
game on the setup screen give a `.zip` of one folder: the `.tex` file, the
pictures it uses, and a copy of `jeopardy.sty`. The download changes
`\usepackage{../jeopardy}` to `\usepackage{jeopardy}`, so the folder
compiles on its own, with no folder above it. The app accepts either line,
and ignores any `jeopardy.sty` you load, so the same `.zip` can be loaded
back as is. To make a downloaded game a built-in one, put its folder in
`games/`, delete its `jeopardy.sty` (so the master copy is used), and change
the line back to `\usepackage{../jeopardy}`. Each game loads the shared
style with `\usepackage{../jeopardy}`. pdflatex then warns that you asked
for `../jeopardy` but the package provides `jeopardy`; that's harmless.

```latex
\documentclass{article}
\usepackage[solutions]{../jeopardy}  % or questions, or answers (see below)
\gametitle{Calculus I Review}
\newcommand{\dd}[1]{\frac{d}{d#1}}   % macros work inside math

\begin{document}

\begin{category}{Derivatives}
  \begin{clue}
    $\dd{x}\left(x^3\right)$
  \response
    $3x^2$
  \solution                           % optional worked solution
    By the power rule, $\dd{x} x^n = n x^{n-1}$, so the derivative is $3x^2$.
  \end{clue}

  \begin{clue}[dailydouble]
    ...
  \response
    ...
  \end{clue}
  % ... 5 clues per category
\end{category}

% ... 5 or 6 categories

\begin{final}{Series}
  Does $\sum_{n=1}^\infty \frac{1}{n^2}$ converge?
\response
  Yes, to $\pi^2/6$.
\end{final}

\end{document}
```

- **Write it or say it** (optional): mark a clue `\begin{clue}[write]` when
  players must write their response before ringing in (a long expression),
  or `\begin{clue}[say]` when they can just say it (like "What is 6?"). The
  board shows a large ✍️ WRITE IT or 🗣️ SAY IT banner on the clue
  screen, and your screen shows it too. Combine options with commas, as in
  `\begin{clue}[dailydouble, write]`. A clue with neither shows no banner,
  which suits Final Jeopardy, where every team writes anyway. The PDFs
  show it only with the `writesay` option (see below).
- **Pictures:** use `\includegraphics{rose.png}` anywhere in a clue,
  response or solution, and put the image file in the game's folder. On the
  board, a screen with a picture shows the text on the left and the picture
  on the right, scaled to fill its half. The `width=`/`height=` options only
  affect the PDF. Use **PNG** or JPG: browsers can't show PDF images, and
  pdflatex can't use SVG. A name without an extension (`rose`) finds
  `rose.png`.
  To load your own game with pictures, zip the game's folder (in Finder,
  right-click it and choose **Compress**; in Windows, **Send to >
  Compressed (zipped) folder**) and choose the `.zip` file. The page finds
  the game's `.tex` file and its pictures inside, and uses any `.sty` macro
  package you put in the folder. Other files in the folder, such as the PDFs
  or TikZ sources for figures, are ignored. You can also select the `.tex`
  file **and** its images together in the file dialog (⌘-click or
  Ctrl-click); then images are matched by file name. A game with many large images may be too big for
  the browser to save for **Resume**, so keep picture-heavy games as
  built-in games.
  To make a PNG from a TikZ drawing, compile it with
  `\documentclass[border=4pt]{standalone}` and convert it at 300 dpi:
  `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pngalpha -r300 -o rose.png rose.pdf`
  (`gs` comes with MacTeX).
- `\solution` is optional. Use it for worked steps (`align*` works well). It
  appears on the answer screen and on your host screen.
- MathJax doesn't support `@{...}` in array column specs and silently drops
  it. Write `\begin{array}{rcl} u & = & x \end{array}` instead of
  `\begin{array}{r@{=}l} u & x \end{array}`.
- The board has 5 or 6 categories with 5 clues each. Clues are worth 100–500 **by
  position**, so you can reorder them by moving blocks around.
- Math works in `$...$`, `\(...\)`, `\[...\]`, `$$...$$` and environments
  like `align*`. Your `\newcommand` and `\DeclareMathOperator` macros work
  inside math.
- Text can use `\textbf`, `\emph`, `\textit`, `\texttt`, `itemize`,
  `enumerate`, `center`, `\\`, `\$`, quotes, dashes and accents. Anything else
  is reported when you load the file.
- When you load a file, the app lists problems with line numbers, and
  **Preview every clue and response** shows everything rendered.

**Macros:** define them in the game's preamble with `\newcommand` or
`\DeclareMathOperator`; they work in the app and in the PDF. A game can also
`\usepackage{...}` a style file of your own, in its folder or in `games/`; the
app reads its macros too.

**Printing:** compile the game file with LaTeX as usual (pdflatex, xelatex
or Overleaf all work). The option on `\usepackage[...]{jeopardy}` at the top
of the file chooses the PDF (on Overleaf, upload `jeopardy.sty` one folder
above the game, as in `games/`):

| Option | The PDF contains |
| --- | --- |
| `questions` | The clues only, e.g. a study sheet for students |
| `answers` | The clues and responses, after an overview of the board |
| `solutions` (default) | The clues, responses and worked solutions, after an overview of the board. This is the one to proofread while you write a game. |

Add any of these after it, separated by commas, as in
`\usepackage[solutions, writesay, noboard]{../jeopardy}`:

| Option | What it does |
| --- | --- |
| `writesay` | Shows each clue's `[write]` or `[say]` mark as a small WRITE or SAY under its value. Handy while writing and editing; leave it off for copies you give students. |
| `board` | Always shows the board overview, even with `questions` |
| `noboard` | Never shows the board overview |

To make another version, change the options and compile again. The web game
ignores these options, and the PDFs never mention the Daily Double.

**Built-in games:** put the game's folder in `games/` and add its path
(like `my-game/my-game.tex`) to [`games/index.json`](games/index.json).

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `js/host.js` | Host window: setup, game flow, scoring, undo |
| `board.html`, `js/board.js` | Projector window: display only |
| `js/texparser.js` | Reads `.tex` game files and reports errors |
| `js/config.js` | Board size and values (5 or 6 categories of 5 clues; set `enforceStandardSize` to `false` to allow other sizes) |
| `js/sync.js` | Connects the two windows (BroadcastChannel) |
| `js/math.js`, `js/mathjax-config.js` | MathJax setup and typesetting |
| `games/` | One folder per built-in game (its `.tex` file and pictures), plus the list `index.json`, the shared `jeopardy.sty`, and the `template` folder |
