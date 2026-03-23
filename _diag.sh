#!/bin/zsh
cd /Users/jamalmac/elliptic-curve-solver-app-or-website

echo "=== Python version ==="
python3 --version

echo "=== Port 5001 status ==="
lsof -ti :5001 && echo "Port 5001 IN USE" || echo "Port 5001 free"

echo "=== Syntax check ==="
python3 -m py_compile app.py && echo "app.py OK" || echo "app.py SYNTAX ERROR"

echo "=== Import check ==="
python3 -c "import flask, sympy, numpy; print('imports OK')" 2>&1

echo "=== Missing packages ==="
python3 -m pip check 2>&1 | head -20

echo "=== App startup (5s) ==="
timeout 5 python3 app.py 2>&1 || echo "Exit code: $?"
