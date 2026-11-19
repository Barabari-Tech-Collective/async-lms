// workerRegistry.js
// Runs on the API server. Tracks live worker nodes and routes
// workspace sessions to the least-loaded available worker.
//
// Workers register on startup and send heartbeats every 30 s.
// Assignments are in-memory — if the API server restarts, workers
// re-register and clients re-call /editor/start for a fresh assignment.

const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    return Math.min(times * 50, 2000);
  },
});

redis.on('error', (err) => console.error('[registry:redis] Connection error:', err.message || err.code || 'Connection refused (check if Redis is running)'));

const workers     = new Map(); // workerId → { url, capacity, allocatedMemory, totalMemory, activeCount, lastSeen }
const assignments = new Map(); // `${userId}:${projectId}` → { workerId, memoryCost }

// --- Startup Recovery (Synchronous blocking isn't needed, it will populate in the background) ---
(async function recoverState() {
  try {
    const recoveredWorkers = await redis.hgetall('registry:workers');
    for (const [id, dataStr] of Object.entries(recoveredWorkers)) {
      const data = JSON.parse(dataStr);
      // Only recover if they haven't timed out (e.g. if orchestrator was down for 5 mins, workers are dead)
      if (Date.now() - data.lastSeen < 120_000) {
        workers.set(id, data);
        console.log(`[registry:recover] Restored worker ${id}`);
      } else {
        await redis.hdel('registry:workers', id);
      }
    }

    const recoveredAssignments = await redis.hgetall('registry:assignments');
    for (const [key, dataStr] of Object.entries(recoveredAssignments)) {
      const data = JSON.parse(dataStr);
      // Only restore assignment if the worker survived
      if (workers.has(data.workerId)) {
        assignments.set(key, data);
        console.log(`[registry:recover] Restored assignment ${key}`);
      } else {
        await redis.hdel('registry:assignments', key);
      }
    }
  } catch (err) {
    console.error('[registry:recover] Failed to recover state from Redis:', err.message);
  }
})();

// Memory costs in MB per language profile
const PROFILE_MEMORY_COSTS = {
  mern: 256,
  javascript: 128,
  python: 128,
  java: 256,
  sql: 128,
  default: 128,
};

// ---------- Worker lifecycle ----------

function registerWorker(id, url, capacity = 20, totalMemory = 2048) {
  const existing = workers.get(id);
  const workerData = {
    url,
    capacity,
    totalMemory: totalMemory || 2048,
    allocatedMemory: existing?.allocatedMemory ?? 0,
    activeCount: existing?.activeCount ?? 0,
    lastSeen: Date.now(),
  };
  workers.set(id, workerData);
  
  // Background Sync (Fire and forget)
  redis.hset('registry:workers', id, JSON.stringify(workerData)).catch(err => 
    console.error(`[registry:redis] Failed to save worker ${id}:`, err.message)
  );
  
  console.log(`[registry] Worker registered: ${id} @ ${url} (RAM: ${totalMemory}MB)`);
}

function heartbeat(id, stats = {}) {
  const w = workers.get(id);
  if (w) {
    w.lastSeen = Date.now();
    
    // Background Sync (Fire and forget)
    redis.hset('registry:workers', id, JSON.stringify(w)).catch(() => {});
    
    // We intentionally ignore OS freeMemory and totalMemory for load balancing
    // to prevent spikes. Heartbeat is only for liveness tracking.
    return true;
  }
  return false;
}

function deregisterWorker(id) {
  workers.delete(id);
  redis.hdel('registry:workers', id).catch(() => {});
  console.log(`[registry] Worker deregistered: ${id}`);
}

// ---------- Workspace assignment ----------

/**
 * Assign a workspace to the least-loaded worker.
 * Re-uses an existing assignment if the worker is still alive.
 * Returns the worker URL, or null if no workers are registered
 * (caller falls back to local/self-hosted mode).
 */
function assignWorker(userId, projectId, profileName) {
  const key = `${userId}:${projectId}`;

  // Reuse existing assignment if that worker is still alive
  const existing = assignments.get(key);
  if (existing && workers.has(existing.workerId)) {
    return workers.get(existing.workerId).url;
  }

  if (workers.size === 0) return null; // local mode

  const memoryCost = PROFILE_MEMORY_COSTS[profileName] || PROFILE_MEMORY_COSTS.default;

  let bestId = null;
  let bestLoad = Infinity;
  
  // Track the absolute least loaded worker for queue overflow
  let overflowId = null;
  let overflowLoad = Infinity;

  for (const [id, w] of workers.entries()) {
    // Pure Deterministic Load Calculation
    // Total memory minus safety buffer (e.g., 512MB for the OS and Docker Daemon)
    const availableMemory = Math.max(0, w.totalMemory - 512); 
    const memoryLoad = w.allocatedMemory / availableMemory;
    
    // We still consider capacity as a secondary ceiling just in case (e.g. CPU constraints)
    const capacityLoad = w.activeCount / w.capacity;
    
    // Use the higher of the two loads to determine if the server is full
    const load = Math.max(memoryLoad, capacityLoad);

    // Track for overflow queueing
    if (load < overflowLoad) {
      overflowLoad = load;
      overflowId = id;
    }

    // If the server physically doesn't have enough estimated memory for this specific profile, OR it's full, skip it.
    if (w.allocatedMemory + memoryCost > availableMemory || w.activeCount >= w.capacity) {
      continue;
    }
    
    if (load < bestLoad) {
      bestLoad = load;
      bestId = id;
    }
  }

  // If all workers are full, assign to the absolute least-loaded worker 
  // so the user gets put into its local queue gracefully.
  if (!bestId) {
    if (!overflowId) return null;
    bestId = overflowId;
  }

  const w = workers.get(bestId);
  w.activeCount++;
  w.allocatedMemory += memoryCost;
  
  const assignmentData = { workerId: bestId, memoryCost };
  assignments.set(key, assignmentData);
  
  // Background Sync (Fire and forget)
  redis.hset('registry:workers', bestId, JSON.stringify(w)).catch(() => {});
  redis.hset('registry:assignments', key, JSON.stringify(assignmentData)).catch(() => {});
  
  console.log(`[registry] Assigned ${key} (${memoryCost}MB) → ${bestId} (${w.allocatedMemory}MB/${w.totalMemory}MB RAM, ${w.activeCount}/${w.capacity} Slots)`);
  return w.url;
}

function getWorkerForWorkspace(userId, projectId) {
  const existing = assignments.get(`${userId}:${projectId}`);
  if (!existing) return null;
  return workers.get(existing.workerId)?.url ?? null;
}

/**
 * Decrement the active count for a workspace's assigned worker.
 * Called when a container is stopped (TTL cleanup or explicit stop).
 */
function releaseWorkspace(userId, projectId) {
  const key = `${userId}:${projectId}`;
  const existing = assignments.get(key);
  if (existing) {
    const w = workers.get(existing.workerId);
    if (w) {
      w.activeCount = Math.max(0, w.activeCount - 1);
      w.allocatedMemory = Math.max(0, w.allocatedMemory - existing.memoryCost);
      // Background Sync
      redis.hset('registry:workers', existing.workerId, JSON.stringify(w)).catch(() => {});
    }
    assignments.delete(key);
    
    // Background Sync
    redis.hdel('registry:assignments', key).catch(() => {});
    
    console.log(`[registry] Released ${key} (${existing.memoryCost}MB) from ${existing.workerId}`);
  }
}

// ---------- Diagnostics ----------

function getStatus() {
  return {
    workers: Object.fromEntries(
      [...workers.entries()].map(([id, w]) => [
        id,
        { url: w.url, active: w.activeCount, capacity: w.capacity },
      ])
    ),
    totalAssignments: assignments.size,
  };
}

// ---------- Stale worker cleanup ----------
// Remove workers that haven't sent a heartbeat in 2 minutes.
setInterval(() => {
  const now = Date.now();
  for (const [id, w] of workers.entries()) {
    if (now - w.lastSeen > 120_000) {
      console.log(`[registry] Worker ${id} timed out — removing`);
      workers.delete(id);
      redis.hdel('registry:workers', id).catch(() => {});
    }
  }
}, 30_000).unref();

module.exports = {
  registerWorker,
  heartbeat,
  deregisterWorker,
  assignWorker,
  getWorkerForWorkspace,
  releaseWorkspace,
  getStatus,
};
