FROM node:20-bookworm-slim

# Alapvető Linux eszközök, TeX Live és Ghostscript telepítése
RUN apt-get update && apt-get install -y --no-install-recommends \
    ghostscript \
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-latex-extra \
    texlive-pictures \
    texlive-lang-european \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Függőségek telepítése
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

RUN cd backend && npm install --production
RUN cd frontend && npm install

# 2. Forráskód másolása és Frontend lefordítása
COPY . .
RUN cd frontend && npm run build

# 3. Port és környezet
EXPOSE 3005

ENV PORT=3005
ENV NODE_ENV=production

# 4. Indítás
CMD ["node", "backend/server.js"]
