const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const compileRouter = require('./routes/compile');
const aiRouter = require('./routes/ai');
const filesRouter = require('./routes/files');
const preamblesRouter = require('./routes/preambles');
const customDocTypesRouter = require('./routes/customDocTypes');
const examTemplatesRouter = require('./routes/examTemplates');
const configRouter = require('./routes/config');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ha a kérés /texa alútvonalon érkezik (pl. matek.neumann-bp.edu.hu/texa), levágjuk a prefixet
app.use((req, res, next) => {
  if (req.url.startsWith('/texa/')) {
    req.url = req.url.slice(5);
  } else if (req.url === '/texa') {
    req.url = '/';
  }
  next();
});

app.use('/api/compile', compileRouter);
app.use('/api/ai', aiRouter);
app.use('/api/files', filesRouter);
app.use('/api/preambles', preamblesRouter);
app.use('/api/custom-doc-types', customDocTypesRouter);
app.use('/api/exam-templates', examTemplatesRouter);
app.use('/api/config', configRouter);

// Éles módban közvetlenül kiszolgáljuk a lefordított frontendet
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

app.get('/api/health', (req, res) => {
  const customKey = req.headers['x-gemini-api-key'];
  res.json({
    status: 'ok',
    gemini: !!customKey,
    hasCustomKey: !!customKey,
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    pdflatex: '/Library/TeX/texbin/pdflatex'
  });
});

process.on('uncaughtException', (err) => {
  console.error('[Backend Uncaught Exception]:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Backend Unhandled Rejection]:', reason);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AI LaTeX Backend: http://localhost:${PORT}`);
  console.log(`🔒 AI Mód: BYOK (Kliensoldali egyéni Gemini API kulcsok)`);
});

// A helyi gondolkodó (reasoning) modellek (pl. gemma-4) rendkívül hosszú ideig (akár 3-5 percig) is elemezhetnek.
// Megnöveljük a Node.js Express szerver timeout-ját 10 percre (600,000 ms), hogy a backend ne szakítsa meg a kapcsolatot.
server.timeout = 600000;
server.headersTimeout = 600000;
server.keepAliveTimeout = 600000;
