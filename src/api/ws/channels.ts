export type ChannelName =
  | "github:activity"
  | `session:${string}`
  | `output:${string}`
  | "messages"
  | `protocol:${string}`
  | "system";

export interface WsMessage {
  type: string;
  channel: ChannelName;
  event: string;
  data: unknown;
}

export interface Subscriber {
  id: string;
  send: (msg: WsMessage) => void;
}

export class ChannelRegistry {
  private channels = new Map<string, Set<Subscriber>>();

  subscribe(channel: ChannelName, subscriber: Subscriber): void {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel)!.add(subscriber);
  }

  unsubscribe(channel: ChannelName, subscriber: Subscriber): void {
    this.channels.get(channel)?.delete(subscriber);
  }

  unsubscribeAll(subscriber: Subscriber): void {
    for (const subscribers of this.channels.values()) {
      subscribers.delete(subscriber);
    }
  }

  publish(channel: ChannelName, event: string, data: unknown): void {
    const subscribers = this.channels.get(channel);
    if (!subscribers) return;
    const msg: WsMessage = { type: "event", channel, event, data };
    for (const sub of subscribers) {
      try {
        sub.send(msg);
      } catch {
        // subscriber gone — remove it
        subscribers.delete(sub);
      }
    }
  }

  subscriberCount(channel: ChannelName): number {
    return this.channels.get(channel)?.size ?? 0;
  }
}
