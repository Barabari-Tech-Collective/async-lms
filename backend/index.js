require('dotenv').config();

// from crashing Node 24 due to a read-only ErrorEvent.message property.
process.on('uncaughtException', (err) => {
  if (
    err &&
    err.message &&
    err.message.includes('Cannot set property message of #<ErrorEvent>')
  ) {
    console.warn('⚠️ [Neon DB] Ignored harmless WebSocket ErrorEvent bug.');
    return;
  }

  console.error('Uncaught Exception:', err);
  process.exit(1);
});

const express = require('express');
const http = require('http');
const net = require('net');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const {
  registerWorker,
  heartbeat,
  deregisterWorker,
  releaseWorkspace,
  getStatus,
} = require('./services/workerRegistry');
require('./config/pg');
const evaluationRoutes = require('./routes/evaluationRoutes');

const compression = require('compression');
const analyticsRoutes = require('./routes/analyticsRoutes');
const { logAction } = require('./utils/auditLogger');

const app = express();
app.set('trust proxy', 1);
app.use(compression());
app.use(cors());
// app.use(morgan('combined'));

// ── Secure Worker Proxy (Orchestrator -> Workers) ───────────────────────────
// IMPORTANT: This must be defined BEFORE express.json(), otherwise body-parser
// consumes the stream and causes 504 Gateway Timeouts for POST requests!
const workerProxies = new Map(); // workerIp -> proxyInstance

function getWorkerProxy(workerIp) {
  if (workerProxies.has(workerIp)) return workerProxies.get(workerIp);

  const workerPort = process.env.WORKER_PORT || 4000;
  const proxy = createProxyMiddleware({
    target: `http://${workerIp}:${workerPort}`,
    changeOrigin: true,
    ws: false, // Handle upgrades manually below instead of automatically
    pathRewrite: (path) => path.replace(new RegExp(`^/worker/${workerIp}`), ''),
    logger: console,
    onProxyReqWs: (proxyReq, req, socket) => {
      // Optional: Add custom headers here if needed
    },
  });

  workerProxies.set(workerIp, proxy);
  return proxy;
}

app.use('/worker/:ip', (req, res, next) => {
  const proxy = getWorkerProxy(req.params.ip);
  return proxy(req, res, next);
});

app.use(express.json());
// app.use(morgan('combined'));

// Request id + client IP, before anything that logs. Also sets X-Request-Id on
// the response so a user reporting a problem can quote a traceable reference.
app.use(require('./middlewares/requestContext'));

// Catch-all request audit. Runs after the response so the real status code is
// known, and skips requests a controller already audited in more detail — the
// specific CREATE/UPDATE/DELETE record carries method, path and status anyway.
//
// Successful GETs are deliberately not recorded: they are the bulk of traffic
// and carry no state change. Denied ones are, because "who tried to reach what
// they should not" is exactly the question an audit trail gets asked.
// Machine-to-machine traffic has no actor and never will. Worker heartbeats
// alone are ~2900 requests per worker per day; left in, they bury every line
// an audit trail exists to surface. Failures on these paths still get logged.
const AUDIT_SKIP_PATHS = /^\/api\/v1\/internal\//;

app.use((req, res, next) => {
  res.on('finish', () => {
    if (req._audited) return;

    const failed = res.statusCode >= 400;
    const denied = res.statusCode === 401 || res.statusCode === 403;

    // Successful GETs change nothing and are the bulk of traffic.
    if (req.method === 'GET' && !failed) return;
    // Internal plumbing is only interesting when it breaks.
    if (AUDIT_SKIP_PATHS.test(req.path) && !failed) return;

    logAction({
      req,
      action: denied ? 'ACCESS_DENIED' : failed ? 'REQUEST_FAILED' : 'REQUEST',
      entityType: 'http_request',
      entityId: null,
    });
  });
  next();
});

// Rate limiter for auth routes — 50 requests per 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
});

app.use(express.json());

const server = http.createServer(app);

app.use('/api/v1/auth', authLimiter, require('./routes/auth.routes'));
app.use('/api/v1/users', require('./routes/user.routes'));
app.use('/api/v1/students', require('./routes/student.routes'));
app.use('/api/v1/editor', require('./routes/editor.routes'));
app.use('/api/v1/onboarding', require('./routes/onboarding.routes'));
app.use('/api/v1/colleges', require('./routes/college.routes'));
app.use('/api/v1/subjects', require('./routes/subject.routes'));
app.use('/api/v1/admin', require('./routes/admin.routes'));
app.use('/api/v1/facilitator', require('./routes/facilitator.routes'));
app.use('/api/v1/assistant', require('./routes/assistant.routes'));
app.use(
  '/api/v1/college-assignments',
  require('./routes/collegeAssignment.routes'),
);
app.use('/api/v1/evaluations', evaluationRoutes);

app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/notifications', require('./routes/notification.routes'));
app.use('/api/v1/ai-curriculum', require('./routes/aiCurriculum.routes'));
app.use('/api/v1/admin/videos', require('./routes/videoRecommendation.routes'));
app.use('/api/v1/workspace', require('./routes/workspace.route'));
app.use('/content', express.static(path.join(__dirname, 'data', 'content')));
const verifyToken = require('./middlewares/verfiyToken');
app.use(
  '/uploads',
  verifyToken,
  express.static(path.join(__dirname, 'public', 'uploads')),
);

// ── Internal worker registry endpoints (no auth — internal network only) ────
app.post('/api/v1/internal/workers/register', (req, res) => {
  const { id, url, capacity, totalMemory } = req.body;
  if (!id || !url)
    return res.status(400).json({ error: 'id and url required' });
  registerWorker(id, url, capacity, totalMemory);
  res.json({ ok: true });
});

app.post('/api/v1/internal/workers/heartbeat', (req, res) => {
  const { id, freeMemory, totalMemory } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });

  const known = heartbeat(id, { freeMemory, totalMemory });
  if (!known) {
    return res.status(404).json({ error: 'Worker not registered' });
  }

  res.json({ ok: true });
});

app.post('/api/v1/internal/workers/deregister', (req, res) => {
  const { id } = req.body;
  if (id) deregisterWorker(id);
  res.json({ ok: true });
});

app.post('/api/v1/internal/workers/release', (req, res) => {
  const { userId, projectId } = req.body;
  if (userId && projectId) releaseWorkspace(userId, projectId);
  res.json({ ok: true });
});

app.get('/api/v1/internal/workers/status', (req, res) => {
  res.json(getStatus());
});

// Runner pool state. A silently-empty pool used to present as a 60s hang and
// then a 504 with nothing in the logs; this makes it a single curl.
app.get('/api/v1/internal/runner/health', (req, res) => {
  const health = require('./services/runnerService').getPoolHealth();
  res.status(health.healthy ? 200 : 503).json(health);
});

//  404 Catch-all
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found` });
});

// Global error handler — must be after all routes
app.use(require('./middlewares/errorHandler'));

const { Server } = require('socket.io');
const notificationService = require('./services/notificationService');
const { initPools } = require('./services/runnerService');

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

notificationService.setIo(io);

io.on('connection', (socket) => {
  socket.on('notification:subscribe', (userId) => {
    if (userId) socket.join(`user:${userId}`);
  });
  socket.on('disconnect', () => {});
});

// ── Handle WebSocket Upgrades for Worker Proxy ──────────────────────────────
const WORKER_WS_RE = /^\/worker\/([^/]+)\/socket\.io/;

server.on('upgrade', (req, socket, head) => {
  const match = req.url.match(WORKER_WS_RE);

  if (match) {
    const workerIp = match[1];
    const proxy = getWorkerProxy(workerIp);

    console.log(`[proxy:ws] Upgrading connection to worker ${workerIp}`);

    if (typeof proxy.upgrade === 'function') {
      proxy.upgrade(req, socket, head);
    } else {
      socket.destroy();
    }
    return; // IMPORTANT: Stop here so we don't interfere with main socket.io
  }

  // If it's NOT a worker request, we DO NOT call any proxy logic.
  // The built-in socket.io listeners will handle the upgrade automatically.
});

// ── Automated Background Jobs ───────────────────────────────────────────────
const pool = require('./config/pg');

// Runs once a day to permanently delete users in the bin > 30 days
const purgeOldDeletedUsers = async () => {
  try {
    const res = await pool.query(
      `DELETE FROM users WHERE deleted_at < NOW() - INTERVAL '30 days'`,
    );
    if (res.rowCount > 0) {
      console.log(
        `[Cron] Purged ${res.rowCount} users from recycle bin older than 30 days.`,
      );
    }
  } catch (error) {
    console.error('[Cron Error] Failed to purge recycle bin:', error);
  }
};

// Run immediately on boot
purgeOldDeletedUsers();

// Schedule to run every 24 hours
setInterval(purgeOldDeletedUsers, 24 * 60 * 60 * 1000);


const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  const ct = new Date().toLocaleTimeString();
  console.log(`Backend (Orchestrator) running on port ${PORT}`, ct);
});

initPools().catch((err) => {
  console.error(
    '[ERROR] Runner pool init threw (exercise run/test unavailable):',
    err.message,
  );
});
