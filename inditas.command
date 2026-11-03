#!/bin/bash
cd "$(dirname "$0")"

# Színek a terminálban
ZOLD='\033[0;32m'
LILA='\033[0;35m'
NC='\033[0m' # No Color

clear
echo -e "${LILA}==================================================${NC}"
echo -e "${LILA}       AI LaTeX SZERKESZTŐ INDÍTÁSA...            ${NC}"
echo -e "${LILA}==================================================${NC}"
echo ""
echo -e "1. A Gemini API kulcsodat közvetlenül a böngészős felületen (Beállítások) tudod megadni."
echo -e "2. A böngésző automatikusan meg fog nyílni 3 másodperc múlva..."
echo ""
echo -e "Indítás folyamatban..."
echo -e "--------------------------------------------------"

# Automatikus megnyitás 3 másodperc múlva a háttérben
(sleep 3 && open "http://localhost:5175") &

# Start concurrently (frontend + backend)
npm start
