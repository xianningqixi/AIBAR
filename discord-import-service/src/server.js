import path from 'node:path';

import { loadOrCreateServiceToken, serviceTokenPath } from './auth.js';
import { loadConfig } from './config.js';
import { createHttpServer } from './http.js';
import { DiscordImportService, T1Scheduler } from './service.js';
import { JsonStateStore } from './store.js';

const config = loadConfig();
config.token = await loadOrCreateServiceToken(config.dataDirectory);
const store = new JsonStateStore(path.join(config.dataDirectory, 'state.json'));
const service = new DiscordImportService({ store, config });
await service.initialize();

const scheduler = new T1Scheduler(service);
const server = createHttpServer(service, config);
server.once('error', (error) => {
    scheduler.close();
    const hint = error.code === 'EADDRINUSE' ? '（端口被占用，检查是否已有实例在运行）' : '';
    console.error(`AIBAR Discord import service failed to listen on ${config.host}:${config.port}${hint}:`, error.message);
    process.exitCode = 1;
});
server.listen(config.port, config.host, () => {
    scheduler.start();
    console.log(`AIBAR Discord import service listening on http://${config.host}:${config.port}`);
    console.log(`Service token file: ${serviceTokenPath(config.dataDirectory)}`);
    console.log(`Next T+1 job: ${service.nextRunAt().toISOString()}`);
});

function shutdown(signal) {
    scheduler.close();
    server.close((error) => {
        if (error) {
            console.error(`Failed to stop after ${signal}:`, error);
            process.exitCode = 1;
        }
    });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
