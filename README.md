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
  subtracts the value. A team can only be marked once per clue, and a correct
  answer shows the response on the board.
- **Show response on board** reveals the response if nobody gets it.
- **Return to board** closes the clue. **Cancel** puts a clue back if you
  opened it by mistake.
- **Daily Double** squares are marked "DD" on your screen only. Choose the team
  and enter the wager (up to the team's score or the board's top value,
  whichever is larger).
- **Final Jeopardy**: the board shows the category, you enter each team's wager
  (up to its score), then show the clue and mark each team.
- **Undo** reverses the last action. **Adjust** next to a score sets it by hand.
- The game saves itself in the browser as you go. If the host page is reloaded,
  you'll be offered **Resume**.

## Writing a game

Copy [`latex/template.tex`](latex/template.tex) and fill it in:

```latex
\documentclass{article}
\usepackage{jeopardy}
\gametitle{Calculus I Review}
\newcommand{\dd}[1]{\frac{d}{d#1}}   % macros work inside math

\begin{document}

\begin{category}{Derivatives}
  \begin{clue}
    $\dd{x}\left(x^3\right)$
  \response
    $3x^2$
  \end{clue}

  \begin{clue}[dailydouble]
    ...
  \response
    ...
  \end{clue}
  % ... 5 clues per category
\end{category}

% ... 5 categories

\begin{final}{Series}
  Does $\sum_{n=1}^\infty \frac{1}{n^2}$ converge?
\response
  Yes, to $\pi^2/6$.
\end{final}

\end{document}
```

- The board is 5 categories × 5 clues. Clues are worth 100–500 **by
  position**, so you can reorder them by moving blocks around.
- Math works in `$...$`, `\(...\)`, `\[...\]`, `$$...$$` and environments
  like `align*`. Your `\newcommand` and `\DeclareMathOperator` macros work
  inside math.
- Text can use `\textbf`, `\emph`, `\textit`, `\texttt`, `itemize`,
  `enumerate`, `center`, `\\`, `\$`, quotes, dashes and accents. Anything else
  is reported when you load the file.
- When you load a file, the app lists problems with line numbers, and
  **Preview every clue and response** shows everything rendered.

**Printable answer key:** with [`latex/jeopardy.sty`](latex/jeopardy.sty) in the
same folder as your game, `pdflatex mygame.tex` produces a PDF listing every
clue and response.

**Built-in games:** put a `.tex` file in `games/` and add it to
[`games/index.json`](games/index.json).

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `js/host.js` | Host window: setup, game flow, scoring, undo |
| `board.html`, `js/board.js` | Projector window: display only |
| `js/texparser.js` | Reads `.tex` game files and reports errors |
| `js/config.js` | Board size and values (5×5 is enforced here; set `enforceStandardSize` to `false` to allow other sizes) |
| `js/sync.js` | Connects the two windows (BroadcastChannel) |
| `js/math.js`, `js/mathjax-config.js` | MathJax setup and typesetting |
| `latex/` | `jeopardy.sty` and a blank template |
| `games/` | Built-in games and their list |
