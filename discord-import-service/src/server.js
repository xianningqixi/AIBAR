import path from 'node:path';

import { loadOrCreateServiceToken, serviceTokenPath } from './auth.js';
import { loadConfig } from './config.js';
import { createHttpServer } from './http.js';
import { DiscordImportService } from './service.js';
import { JsonStateStore } from './store.js';
import { CodexWorkerLauncher } from './worker-launcher.js';

const config = loadConfig();
config.token = await loadOrCreateServiceToken(config.dataDirectory);
const store = new JsonStateStore(path.join(config.dataDirectory, 'state.json'));
const service = new DiscordImportService({ store, config });
await service.initialize();
const workerLauncher = new CodexWorkerLauncher({
    service,
    workspaceDirectory: config.workspaceDirectory,
    aibarUrl: config.aibarUrl,
    codexCommand: config.codexCommand,
});

const server = createHttpServer(service, config, workerLauncher);
server.once('error', (error) => {
    const hint = error.code === 'EADDRINUSE' ? '（端口被占用，检查是否已有实例在运行）' : '';
    console.error(`AIBAR Discord import service failed to listen on ${config.host}:${config.port}${hint}:`, error.message);
    process.exitCode = 1;
});
server.listen(config.port, config.host, () => {
    console.log(`AIBAR Discord import service listening on http://${config.host}:${config.port}`);
    console.log(`Dashboard: http://${config.host}:${config.port}/`);
    console.log(`Service token file: ${serviceTokenPath(config.dataDirectory)}`);
    console.log('Manual mode: dashboard clicks start one-shot Codex Workers; no polling is required.');
});

function shutdown(signal) {
    workerLauncher.shutdown();
    server.close((error) => {
        if (error) {
            console.error(`Failed to stop after ${signal}:`, error);
            process.exitCode = 1;
        }
    });
    server.closeAllConnections?.();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
