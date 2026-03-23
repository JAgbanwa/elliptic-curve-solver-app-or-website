#!/bin/zsh
cd /Users/jamalmac/elliptic-curve-solver-app-or-website
python3 -m py_compile app.py && echo "app.py OK" || echo "app.py SYNTAX ERROR"
node --input-type=module < static/js/main.js 2>&1 | head -3
echo "JS check done"
