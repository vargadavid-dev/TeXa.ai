#!/bin/bash
set -e

echo "1. TeXa Docker image frissítése és konténer újraindítása..."
docker build -t texa .
docker rm -f texa-app 2>/dev/null || true
docker run -d --name texa-app -p 3005:3005 --restart unless-stopped texa

echo "2. Belső Docker hálózat összekötése..."
docker network create texa-net 2>/dev/null || true
docker network connect texa-net mat10quad-app 2>/dev/null || true
docker network connect texa-net texa-app 2>/dev/null || true

# Kérjük le a texa-app belső IP-címét
TEXA_IP=$(docker inspect -f '{{with index .NetworkSettings.Networks "texa-net"}}{{.IPAddress}}{{end}}' texa-app 2>/dev/null || true)
if [ -z "$TEXA_IP" ]; then
  TEXA_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{break}}{{end}}' texa-app)
fi

echo "TeXa konténer belső IP címe: $TEXA_IP"

# Beillesztjük az IP-címet a konfigurációba
sed "s/texa-app/$TEXA_IP/g" matek-nginx.conf > /tmp/matek-nginx.conf

echo "3. Nginx beállítások másolása..."
docker cp /tmp/matek-nginx.conf mat10quad-app:/etc/nginx/conf.d/default.conf

echo "4. Nginx ellenőrzése és újratöltése..."
docker exec mat10quad-app nginx -t
docker exec mat10quad-app nginx -s reload

echo ""
echo "========================================="
echo "Sikeresen élesítve! Nyisd meg a böngésződben:"
echo "👉 https://matek.neumann-bp.edu.hu/texa/"
echo "========================================="
