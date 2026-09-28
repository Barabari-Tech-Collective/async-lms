// runnerService.js — Container pool for exercise code execution
//
// Instead of spawning a new `docker run --rm` container per execution (3-8s cold
// start, unbounded concurrency), this module pre-warms a fixed pool of containers
// per language.  Each run:  acquire → docker cp files in → docker exec → cleanup → release.
// Cold start cost is paid once at server startup, not per student click.
'use strict';

const { spawn } = require('child_process');

const POOL_SIZE     = parseInt(process.env.RUNNER_POOL_SIZE      || '20', 10);
const POOL_SIZE_JVM = parseInt(process.env.RUNNER_POOL_SIZE_JAVA || '5',  10);
const POOL_SIZE_SQL = parseInt(process.env.RUNNER_POOL_SIZE_SQL  || '5',  10);

// How long a caller waits for a free container before giving up. Without this
// a caller queues forever: a pool that failed to warm (missing image, docker
// socket unreachable) held every request open until the proxy 504'd at 60s,
// which is exactly how a missing `workspace-node` image presented in prod.
const ACQUIRE_TIMEOUT_MS = parseInt(process.env.RUNNER_ACQUIRE_TIMEOUT_MS || '10000', 10);
// Ceiling for any single docker CLI call (`run`, `cp`, `exec`). The daemon can
// wedge under load and leave these hanging indefinitely.
const SPAWN_TIMEOUT_MS   = parseInt(process.env.RUNNER_SPAWN_TIMEOUT_MS   || '30000', 10);

/** Runner cannot serve this request — a 503, not a 500. The caller is fine; we are not. */
class RunnerUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RunnerUnavailableError';
    this.statusCode = 503;
  }
}

const LANGUAGE_PROFILES = {
  javascript: { image: 'workspace-node',   cmd: ['node',    'index.js'],   poolSize: POOL_SIZE     },
  python:     { image: 'workspace-python', cmd: ['python3', 'main.py'],    poolSize: POOL_SIZE     },
  java:       { image: 'workspace-java',   cmd: ['sh', '-c', 'cd /workspace && javac Main.java 2>&1 && java -cp /workspace Main'], poolSize: POOL_SIZE_JVM },
  sql:        { image: 'workspace-sql',    cmd: ['sh', '-c', 'sqlite3 -column -header :memory: < /workspace/solution.sql'],        poolSize: POOL_SIZE_SQL },
};

const TEST_CMDS = {
  javascript: ['node',    '__tests__.js'],
  python:     ['python3', '__tests__.py'],
  java:       ['sh', '-c', 'cd /workspace && javac Main.java __Tests__.java 2>&1 && java -cp /workspace __Tests__'],
  // SQL test execution is not supported — exercises should use run-only mode
};

// ── Low-level helpers ─────────────────────────────────────────────────────────

function spawnAsync(cmd, args, timeoutMs = SPAWN_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let errOut = '';
    let done = false;
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });

    const settle = (fn, arg) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn(arg);
    };

    // A wedged docker daemon leaves the CLI hanging with no output and no exit.
    const timer = setTimeout(() => {
      p.kill('SIGKILL');
      settle(reject, new Error(`${cmd} ${args[0]} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    if (p.stderr) p.stderr.on('data', d => { errOut += d.toString(); });
    p.on('close', code => (code === 0
      ? settle(resolve)
      : settle(reject, new Error(`${cmd} ${args[0]} exited ${code}. Error: ${errOut.trim()}`))));
    p.on('error', err => settle(reject, err));
  });
}

// Run a command inside a container and capture all output.
// Always resolves — never rejects — so the pool finally block always runs.
function execCapture(container, command, timeoutMs) {
  return new Promise((resolve) => {
    const p = spawn('docker', ['exec', container, ...command]);
    let out = '';
    let done = false;

    const finish = (output, exitCode) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ output, exitCode });
    };

    const timer = setTimeout(() => {
      p.kill();
      finish(out + '\n[Timed out]', -1);
    }, timeoutMs);

    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { out += d; });
    p.on('close', code => finish(out, code ?? -1));
    p.on('error', err => finish(err.message, -1));
  });
}

// ── ContainerPool ─────────────────────────────────────────────────────────────

class ContainerPool {
  constructor(image, size) {
    this.image = image;
    this.size  = size;
    this.available = [];
    this.queue     = [];
    // Containers that actually started. 0 means this language cannot run at all.
    this.ready     = 0;
    this.lastError = null;
  }

  // Pre-warm all containers in parallel at startup. One container failing must
  // not take down the rest of the pool, and one pool failing must not take down
  // the other languages — so failures are collected, not thrown.
  async init() {
    if (this.size <= 0) {
      this.lastError = 'pool disabled (size 0)';
      console.warn(`[pool] ${this.image}: disabled (size 0) — exercises in this language will fail fast`);
      return;
    }

    const results = await Promise.allSettled(
      Array.from({ length: this.size }, (_, i) =>
        this._startContainer(`runner-${this.image}-${i}`)
      )
    );

    const failures = results.filter(r => r.status === 'rejected');
    this.ready = this.available.length;
    if (failures.length > 0) {
      this.lastError = String(failures[0].reason?.message || failures[0].reason).slice(0, 300);
    }

    if (this.ready === 0) {
      console.error(
        `[pool] ${this.image}: FAILED — 0/${this.size} containers started. ` +
        `Exercises in this language will return 503. Cause: ${this.lastError}`
      );
    } else if (failures.length > 0) {
      console.warn(`[pool] ${this.image}: ${this.ready}/${this.size} ready (${failures.length} failed: ${this.lastError})`);
    } else {
      console.log(`[pool] ${this.image}: ${this.ready} warm containers ready`);
    }
  }

  async _startContainer(name) {
    // Remove stale container from a previous run, if any.
    await spawnAsync('docker', ['rm', '-f', name]).catch(() => {});
    const dockerArgs = [
      'run', '-d', '--name', name,
      '--memory=256m', '--cpus=0.5',
      '--network=none'
    ];

    if (this.image === 'workspace-python') {
      dockerArgs.push('-e', 'PYTHONDONTWRITEBYTECODE=1');
    } else if (this.image === 'workspace-java') {
      dockerArgs.push('-e', '_JAVA_OPTIONS=-Xmx128m -Xms64m');
    }

    dockerArgs.push(this.image, 'sleep', 'infinity');

    await spawnAsync('docker', dockerArgs);
    await spawnAsync('docker', ['exec', name, 'mkdir', '-p', '/workspace']);
    this.available.push(name);
  }

  _acquire(timeoutMs = ACQUIRE_TIMEOUT_MS) {
    if (this.available.length > 0) return Promise.resolve(this.available.pop());

    // Nothing warm and nothing ever will be: fail immediately with the real
    // reason rather than queueing behind containers that do not exist.
    if (this.ready === 0) {
      return Promise.reject(new RunnerUnavailableError(
        `The ${this.image} runner is unavailable (${this.lastError || 'pool not initialised'}).`
      ));
    }

    // Genuinely busy — wait, but bounded, so a stuck container cannot pin the
    // caller open until the proxy times out.
    return new Promise((resolve, reject) => {
      const waiter = { resolve: null };
      const timer = setTimeout(() => {
        const i = this.queue.indexOf(waiter);
        if (i !== -1) this.queue.splice(i, 1);
        reject(new RunnerUnavailableError('The code runner is busy. Please try again in a moment.'));
      }, timeoutMs);
      waiter.resolve = (name) => { clearTimeout(timer); resolve(name); };
      this.queue.push(waiter);
    });
  }

  _release(name) {
    const next = this.queue.shift();
    if (next) next.resolve(name); else this.available.push(name);
  }

  // Copy workspaceDir files into the container, exec the command, then reset.
  // The container is returned to the pool only after the workspace is cleaned,
  // so the next caller always gets a fresh environment.
  async run(workspaceDir, command, timeoutMs) {
    const container = await this._acquire();
    let result;
    try {
      // Copy user files into container's /workspace
      await spawnAsync('docker', ['cp', `${workspaceDir}/.`, `${container}:/workspace/`]);
      result = await execCapture(container, command, timeoutMs);
    } catch (err) {
      result = { output: err.message, exitCode: -1 };
    } finally {
      // Reset workspace in background; release container only after cleanup.
      spawnAsync('docker', ['exec', container, 'sh', '-c', 'rm -rf /workspace && mkdir /workspace'])
        .catch(() => {})
        .finally(() => this._release(container));
    }
    return result;
  }
}

// ── Pool registry — one pool per language, created at server startup ──────────

const pools = {};

async function initPools() {
  // allSettled: a language whose image is missing must not abort the others.
  await Promise.allSettled(
    Object.entries(LANGUAGE_PROFILES).map(([lang, { image, poolSize }]) => {
      pools[lang] = new ContainerPool(image, poolSize);
      return pools[lang].init();
    })
  );

  const dead = Object.entries(pools).filter(([, p]) => p.ready === 0).map(([lang]) => lang);
  if (dead.length > 0) {
    console.error(`[pool] NO RUNNER CAPACITY for: ${dead.join(', ')} — see /api/v1/internal/runner/health`);
  }
}

/** Per-language pool state, for the health endpoint and for ops triage. */
function getPoolHealth() {
  const languages = {};
  for (const [lang, pool] of Object.entries(pools)) {
    languages[lang] = {
      image: pool.image,
      configured: pool.size,
      ready: pool.ready,
      available: pool.available.length,
      queued: pool.queue.length,
      error: pool.lastError,
    };
  }
  const healthy = Object.values(languages).some(l => l.ready > 0);
  return { healthy, initialised: Object.keys(pools).length > 0, languages };
}

// ── Public API ────────────────────────────────────────────────────────────────

function execute(workspaceDir, language, activeFile) {
  const pool = pools[language] ?? pools.javascript;
  if (!pool) return Promise.reject(new RunnerUnavailableError('The code runner has not been initialised.'));
  const profile = LANGUAGE_PROFILES[language] ?? LANGUAGE_PROFILES.javascript;
  
  let cmd = [...profile.cmd];
  if (activeFile) {
      if (language === 'javascript' && activeFile.endsWith('.js')) {
          cmd = ['node', activeFile];
      } else if (language === 'python' && activeFile.endsWith('.py')) {
          cmd = ['python3', activeFile];
      } else if (language === 'java' && activeFile.endsWith('.java')) {
          const className = activeFile.replace('.java', '').replace(/\//g, '.');
          cmd = ['sh', '-c', `cd /workspace && javac ${activeFile} 2>&1 && java -cp /workspace ${className}`];
      } else if (language === 'sql' && activeFile.endsWith('.sql')) {
          cmd = ['sh', '-c', `sqlite3 -column -header :memory: < /workspace/${activeFile}`];
      }
  }

  return pool.run(workspaceDir, cmd, 15000);
}

function executeTests(workspaceDir, language) {
  const cmd = TEST_CMDS[language];
  if (!cmd) return null;
  const pool = pools[language] ?? pools.javascript;
  if (!pool) return Promise.reject(new RunnerUnavailableError('The code runner has not been initialised.'));
  return pool.run(workspaceDir, cmd, 20000);
}

module.exports = {
  initPools,
  execute,
  executeTests,
  getPoolHealth,
  RunnerUnavailableError,
};
