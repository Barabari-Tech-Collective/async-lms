module.exports = {
  apps: [
    {
      name: 'orchestrator',
      script: 'index.js',
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
    },
    {
      name: 'worker-1',
      script: 'worker.js',
      env: {
        NODE_ENV: 'development',
        WORKER_PORT: 4001,
        WORKER_ID: 'local-worker-1',
        WORKER_URL: 'http://localhost:4001',
        WORKER_CAPACITY: 30,
        MAX_WORKSPACES: 30,
        ORCHESTRATOR_URL: 'http://localhost:3001'
      },
    },
    {
      name: 'meet-worker',
      script: 'meet-worker.js',
      env: {
        NODE_ENV: 'development',
      },
    }
  ],
};
