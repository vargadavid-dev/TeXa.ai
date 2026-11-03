#!/bin/bash
set -e

echo "1. Belső Docker hálózat összekötése..."
docker network create texa-net 2>/dev/null || true
docker network connect texa-net mat10quad-app 2>/dev/null || true
docker network connect texa-net texa-app 2>/dev/null || true

echo "2. Nginx beállítások másolása..."
docker cp matek-nginx.conf mat10quad-app:/etc/nginx/conf.d/default.conf

echo "3. Nginx ellenőrzése és újratöltése..."
docker exec mat10quad-app nginx -t
docker exec mat10quad-app nginx -s reload

echo "Sikeresen élesítve! Nyisd meg: https://matek.neumann-bp.edu.hu/texa/"
