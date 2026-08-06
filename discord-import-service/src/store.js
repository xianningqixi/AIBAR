import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const EMPTY_STATE = { version: 1, jobs: [] };

function clone(value) {
    return structuredClone(value);
}

export class JsonStateStore {
    #state = clone(EMPTY_STATE);
    #writes = Promise.resolve();

    constructor(filePath) {
        this.filePath = path.resolve(filePath);
    }

    async load() {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
        try {
            const parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
            if (parsed?.version !== 1 || !Array.isArray(parsed.jobs)) throw new Error('Unsupported state file');
            this.#state = parsed;
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            await this.#persist(this.#state);
        }
        return this.read();
    }

    read() {
        return clone(this.#state);
    }

    async update(mutator) {
        const operation = this.#writes.then(async () => {
            const draft = clone(this.#state);
            const result = await mutator(draft);
            await this.#persist(draft);
            this.#state = draft;
            return clone(result);
        });
        this.#writes = operation.catch(() => {});
        return operation;
    }

    async #persist(state) {
        const temporary = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
        await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        await fs.rename(temporary, this.filePath);
    }
}
