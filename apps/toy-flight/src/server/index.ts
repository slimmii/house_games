import { readFile } from 'node:fs/promises';
import { decodePaintSurfaces, installPaintSurfaces } from '@huis/house/shared/paint-surfaces';
import { installHouseCollisionFile } from '@huis/house/node/houseCollision';
import { existsSync, readdirSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import compression from 'compression';
import { HouseRoom } from './room.js';
import { houseModelPath } from '@huis/house/node/paths';

export type GameServerOptions = {
  port?: number;
  host?: string;
  clientDist?: string;
};

export type RunningGameServer = {
  gameServer: Server;
  port: number;
  host: string;
  close: () => Promise<void>;
};

export async function createGameServer(options: GameServerOptions = {}): Promise<RunningGameServer> {
  const requestedPort = options.port ?? 2567;
  const host = options.host ?? '0.0.0.0';
  const clientDist = resolve(options.clientDist ?? resolve(process.cwd(), 'dist/client'));
  const indexFile = resolve(clientDist, 'index.html');
  const builtPaintAsset = resolve(clientDist, 'models/paint-surfaces.meshopt.bin');
  const paintAsset = existsSync(builtPaintAsset) ? builtPaintAsset : houseModelPath('paint-surfaces.meshopt.bin');
  const paintFile = await readFile(paintAsset);
  installPaintSurfaces(await decodePaintSurfaces(paintFile.buffer.slice(paintFile.byteOffset, paintFile.byteOffset + paintFile.byteLength)));
  const builtCollision = resolve(clientDist, 'models/house-collision.meshopt.bin');
  await installHouseCollisionFile(existsSync(builtCollision) ? builtCollision : undefined);
  const transport = new WebSocketTransport({ maxPayload: 8 * 1024 });
  const gameServer = new Server({
    transport,
    greet: false,
    express: (app) => {
      app.disable('x-powered-by');
      app.use(compression({ filter: (request, response) => /\.(glb|bin)$/.test(request.path) || compression.filter(request, response) }));
      app.get('/health', (_request, response) => response.status(200).json({ ok: true }));
      if (existsSync(indexFile)) {
        // Build-time brotli 11 copies (scripts/precompress-client.mjs); the
        // compression middleware leaves already-encoded responses alone.
        const precompressed = new Set((readdirSync(clientDist, { recursive: true }) as string[])
          .filter(path => path.endsWith('.br')).map(path => join(clientDist, path.slice(0, -3))));
        app.use((request, response, next) => {
          if ((request.method !== 'GET' && request.method !== 'HEAD') || !/\bbr\b/.test(request.headers['accept-encoding'] ?? '')) return next();
          let path: string;
          try { path = join(clientDist, decodeURIComponent(request.path)); } catch { return next(); }
          if (!path.startsWith(clientDist + sep) || !precompressed.has(path)) return next();
          response.setHeader('Content-Encoding', 'br');
          response.setHeader('Vary', 'Accept-Encoding');
          response.type(extname(path));
          response.sendFile(`${path}.br`, error => { if (error) next(error); });
        });
        app.use(express.static(clientDist, { fallthrough: true }));
        app.get('*', (request, response, next) => {
          if (request.method !== 'GET' || request.path.startsWith('/matchmake/')) return next();
          return response.sendFile(indexFile);
        });
      }
    },
  });
  gameServer.define('house', HouseRoom);
  try {
    await gameServer.listen(requestedPort, host);
  } catch (error) {
    await gameServer.gracefullyShutdown(false);
    throw error;
  }

  const address = transport.server?.address();
  const port = typeof address === 'object' && address ? address.port : requestedPort;
  let closed = false;
  return {
    gameServer,
    port,
    host,
    close: async () => {
      if (closed) return;
      closed = true;
      await gameServer.gracefullyShutdown(false);
    },
  };
}

export async function startServer(options: GameServerOptions = {}): Promise<RunningGameServer> {
  const running = await createGameServer(options);
  console.log(`Little Rotors server listening on http://${running.host}:${running.port}`);
  return running;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isMainModule()) {
  const parsedPort = Number.parseInt(process.env.PORT ?? '2567', 10);
  startServer({ port: Number.isFinite(parsedPort) ? parsedPort : 2567 }).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { HouseRoom } from './room.js';
export { GameSimulation, sanitizeName } from './simulation.js';
