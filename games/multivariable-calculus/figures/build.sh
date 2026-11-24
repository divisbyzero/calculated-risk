#!/bin/sh
# Rebuild the game's PNG figures from these TikZ sources (needs MacTeX).
# Run from anywhere:  sh games/multivariable-calculus/figures/build.sh
cd "$(dirname "$0")" || exit 1
for f in *.tex; do
  n="${f%.tex}"
  pdflatex -interaction=nonstopmode -halt-on-error "$f" >/dev/null || { echo "LaTeX failed: $f"; exit 1; }
  gs -q -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pngalpha -r600 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -o "../$n.png" "$n.pdf"
  rm -f "$n.aux" "$n.log" "$n.pdf"
  echo "made $n.png"
done
