#!/bin/bash
docker cp matek-nginx.conf mat10quad-app:/etc/nginx/conf.d/default.conf
docker exec mat10quad-app nginx -s reload
echo "Sikeresen összekötve! Nyisd meg: https://matek.neumann-bp.edu.hu/texa/"
