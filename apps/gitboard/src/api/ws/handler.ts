import type { ChannelName, ChannelRegistry, Subscriber, WsMessage } from "./channels.ts";

export interface WsConnection {
  id: string;
  raw: { send(data: string): void; close(): void };
  subscriptions: Set<ChannelName>;
}

export class WsHandler {
  private connections = new Map<string, WsConnection>();
  private registry: ChannelRegistry;
  private nextId = 1;

  constructor(registry: ChannelRegistry) {
    this.registry = registry;
  }

  connect(raw: WsConnection["raw"]): string {
    const id = `ws-${this.nextId++}`;
    const conn: WsConnection = { id, raw, subscriptions: new Set() };
    this.connections.set(id, conn);

    const subscriber: Subscriber = {
      id,
      send: (msg: WsMessage) => {
        try {
          raw.send(JSON.stringify(msg));
        } catch {
          this.disconnect(id);
        }
      },
    };

    // Store subscriber ref on connection for unsubscribe
    (conn as WsConnection & { subscriber: Subscriber }).subscriber = subscriber;
    return id;
  }

  subscribe(connId: string, channel: ChannelName): void {
    const conn = this.connections.get(connId) as
      | (WsConnection & { subscriber: Subscriber })
      | undefined;
    if (!conn) return;
    conn.subscriptions.add(channel);
    this.registry.subscribe(channel, conn.subscriber);
  }

  unsubscribe(connId: string, channel: ChannelName): void {
    const conn = this.connections.get(connId) as
      | (WsConnection & { subscriber: Subscriber })
      | undefined;
    if (!conn) return;
    conn.subscriptions.delete(channel);
    this.registry.unsubscribe(channel, conn.subscriber);
  }

  disconnect(connId: string): void {
    const conn = this.connections.get(connId) as
      | (WsConnection & { subscriber: Subscriber })
      | undefined;
    if (!conn) return;
    this.registry.unsubscribeAll(conn.subscriber);
    this.connections.delete(connId);
  }

  handleMessage(connId: string, raw: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (
      typeof msg !== "object" ||
      msg === null ||
      !("action" in msg) ||
      !("channel" in msg)
    ) {
      return;
    }

    const action = (msg as { action: string }).action;
    const channel = (msg as { channel: ChannelName }).channel;

    if (action === "subscribe") {
      this.subscribe(connId, channel);
    } else if (action === "unsubscribe") {
      this.unsubscribe(connId, channel);
    }
  }

  connectionCount(): number {
    return this.connections.size;
  }
}
