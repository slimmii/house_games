import { Room, ServerError, matchMaker, type Client } from '@colyseus/core';
import { MAX_PILOTS, ROOM_NAME_MIN, SNAPSHOT_RATE, TICK_RATE, sanitizeRoomName, type SnapshotUpdate } from '../shared/protocol.js';
import { parseGameMode } from '../shared/hideSeek.js';
import { GameSimulation } from './simulation.js';

type JoinOptions = { name?: unknown };

export class HouseRoom extends Room {
  public simulation = new GameSimulation();
  private readonly readyClients = new Set<string>();
  private accumulator = 0;
  private snapshotAccumulator = 0;
  private lastBroadcastPaintId = 0;

  async onCreate(options: { mode?: unknown; roomName?: unknown } = {}): Promise<void> {
    const customName = sanitizeRoomName(options.roomName);
    if (customName) {
      if (customName.length < ROOM_NAME_MIN) throw new ServerError(400, `Room names need at least ${ROOM_NAME_MIN} letters or digits.`);
      if (await matchMaker.driver.findOne({ roomId: customName })) throw new ServerError(409, `The room name "${customName}" is already taken.`);
      this.roomId = customName;
    }
    const mode = parseGameMode(options.mode);
    this.simulation = new GameSimulation(Math.random, mode);
    await this.setMetadata({ mode });
    this.maxClients = MAX_PILOTS;
    this.maxMessagesPerSecond = 180;
    this.autoDispose = true;
    await this.setPrivate(true);

    this.onMessage('ready', (client) => {
      const wasEmpty = this.readyClients.size === 0;
      this.readyClients.add(client.sessionId);
      client.send('snapshot', this.simulation.snapshot());
      // With no prior recipients, the full ready snapshot establishes the baseline.
      if (wasEmpty) this.lastBroadcastPaintId = this.simulation.paints.at(-1)?.id ?? 0;
    });
    this.onMessage('input', (client, message: unknown) => {
      this.simulation.setInput(client.sessionId, message);
    });
    this.onMessage('inputs', (client, messages: unknown) => {
      if (!Array.isArray(messages) || messages.length > 16) return;
      for (const message of messages) this.simulation.setInput(client.sessionId, message);
    });
    this.onMessage('toggleDoor', (client, message: unknown) => {
      if (this.readyClients.has(client.sessionId) && this.simulation.toggleDoor(client.sessionId, message)) {
        client.send('doorInteraction', this.simulation.lastInteractedDoor(client.sessionId));
      }
    });
    this.onMessage('houseLoaded', (client) => this.simulation.markLoaded(client.sessionId));
    this.onMessage('startRound', () => { this.simulation.startRound(); });
    this.onMessage('hidden', (client, message: unknown) => {
      this.simulation.setHidden(client.sessionId, (message as { hidden?: unknown } | null)?.hidden);
    });
    this.onMessage('giveUp', (client) => { this.simulation.giveUp(client.sessionId); });
    this.onMessage('ping', (client, message: unknown) => {
      client.send('pong', message);
    });

    const fixedStep = 1 / TICK_RATE;
    const snapshotStep = 1 / SNAPSHOT_RATE;
    this.setSimulationInterval((deltaMilliseconds) => {
      this.accumulator = Math.min(this.accumulator + deltaMilliseconds / 1000, 0.25);
      while (this.accumulator >= fixedStep) {
        this.simulation.update(fixedStep);
        this.accumulator -= fixedStep;
        this.snapshotAccumulator += fixedStep;
      }
      if (this.snapshotAccumulator >= snapshotStep) {
        this.snapshotAccumulator %= snapshotStep;
        if (this.readyClients.size > 0) {
          const newestPaintId = this.simulation.paints.at(-1)?.id ?? 0;
          const update: SnapshotUpdate = this.simulation.snapshot(false);
          if (newestPaintId !== this.lastBroadcastPaintId) {
            update.paintAdds = this.simulation.paints.filter((paint) => paint.id > this.lastBroadcastPaintId);
            this.lastBroadcastPaintId = newestPaintId;
          }
          const unreadyClients = this.clients.filter((client) => !this.readyClients.has(client.sessionId));
          this.broadcast('snapshot', update, { except: unreadyClients });
        }
      }
    }, 1000 / TICK_RATE);
    // Disable schema patches after the simulation interval exists. In Colyseus,
    // doing this first installs a separate clock-only interval that races the sim.
    this.patchRate = null;
  }

  onJoin(client: Client, options: JoinOptions = {}): void {
    this.simulation.addPlayer(client.sessionId, options.name);
  }

  onLeave(client: Client): void {
    this.readyClients.delete(client.sessionId);
    this.simulation.removePlayer(client.sessionId);
  }

  onDispose(): void {
    this.readyClients.clear();
  }
}
