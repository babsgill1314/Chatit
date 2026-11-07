import type { WASocket, AnyMessageContent, MiscMessageGenerationOptions } from '@whiskeysockets/baileys';

export interface OutboundMessageTask {
  id: string;
  userId: string;
  toJid: string;
  content: AnyMessageContent;
  options?: MiscMessageGenerationOptions;
  isConversational?: boolean;
  enqueuedAt: number;
  resolve: (value: { success: boolean; messageId: string; timestamp: string; antiBanDelayMs: number }) => void;
  reject: (reason: any) => void;
}

export interface UserQueueMetrics {
  pendingCount: number;
  isProcessing: boolean;
  totalSent: number;
  totalFailed: number;
  lastSentAt: string | null;
  lastDelayMs: number;
}

class UserQueueManager {
  private queue: OutboundMessageTask[] = [];
  private isProcessing = false;
  private totalSent = 0;
  private totalFailed = 0;
  private lastSentAt: string | null = null;
  private lastDelayMs = 0;

  constructor(
    private readonly userId: string,
    private readonly getSocket: (userId: string) => WASocket | undefined
  ) {}

  /**
   * Enqueue a message into this user's sequential array queue.
   */
  public enqueue(
    toJid: string,
    content: AnyMessageContent,
    options?: MiscMessageGenerationOptions,
    isConversational = true
  ): Promise<{ success: boolean; messageId: string; timestamp: string; antiBanDelayMs: number }> {
    return new Promise((resolve, reject) => {
      const task: OutboundMessageTask = {
        id: `antiban_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId: this.userId,
        toJid,
        content,
        options,
        isConversational,
        enqueuedAt: Date.now(),
        resolve,
        reject
      };

      this.queue.push(task);
      console.log(`[AntiBanQueue:${this.userId}] Enqueued message for ${toJid} (Queue length: ${this.queue.length})`);

      // Trigger the sequential processor loop if not already running
      if (!this.isProcessing) {
        this.processNext();
      }
    });
  }

  /**
   * Sequential loop: Processes outbound messages one-by-one with simulated human delay.
   */
  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const task = this.queue.shift()!;
    const sock = this.getSocket(this.userId);

    if (!sock) {
      const error = new Error(`Cannot process message for user ${this.userId}: WhatsApp socket is not connected.`);
      console.error(`[AntiBanQueue:${this.userId}] Socket missing, rejecting task ${task.id}`);
      task.reject(error);
      this.totalFailed++;
      // Check next
      setImmediate(() => this.processNext());
      return;
    }

    try {
      // 1. Simulate human presence: mark "composing" (typing...)
      try {
        await sock.sendPresenceUpdate('composing', task.toJid);
      } catch (presenceErr) {
        // Presence failure should not abort the message
      }

      // Natural typing simulation delay based on text length (fast for conversational replies)
      const textLength = typeof task.content === 'object' && 'text' in task.content ? (task.content.text?.length || 10) : 10;
      const simulatedTypingMs = task.isConversational
        ? Math.min(800, Math.max(250, Math.round(textLength * 8)))
        : Math.min(2500, Math.max(800, textLength * 25));

      await new Promise(r => setTimeout(r, simulatedTypingMs));

      // 2. Dispatch actual message through the Baileys socket
      console.log(`[AntiBanQueue:${this.userId}] Dispatching message ${task.id} to ${task.toJid}...`);
      const sentResult = await sock.sendMessage(task.toJid, task.content, task.options);

      // Stop typing presence
      try {
        await sock.sendPresenceUpdate('paused', task.toJid);
      } catch {}

      const messageId = sentResult?.key?.id || task.id;
      const timestamp = new Date().toISOString();
      this.totalSent++;
      this.lastSentAt = timestamp;

      // 3. ANTI-BAN RANDOMIZED PAUSE:
      // Conversational responses get responsive 500ms-1200ms pause; bulk blasts get 3000ms-7000ms
      const mandatoryDelayMs = task.isConversational
        ? Math.floor(Math.random() * (1200 - 500 + 1)) + 500
        : Math.floor(Math.random() * (7000 - 3000 + 1)) + 3000;

      this.lastDelayMs = mandatoryDelayMs;
      console.log(`[AntiBanQueue:${this.userId}] Message sent successfully (${messageId}). Enforcing ${mandatoryDelayMs}ms anti-ban delay...`);

      // Resolve task promise to caller
      task.resolve({
        success: true,
        messageId,
        timestamp,
        antiBanDelayMs: mandatoryDelayMs
      });

      // Enforce pause BEFORE taking the next item from the queue
      await new Promise(r => setTimeout(r, mandatoryDelayMs));

    } catch (err: any) {
      console.error(`[AntiBanQueue:${this.userId}] Message dispatch failed for ${task.id}:`, err);
      this.totalFailed++;
      task.reject(err);

      // Brief recovery delay after an error before trying next item
      await new Promise(r => setTimeout(r, 1000));
    } finally {
      // Continue sequential loop for remaining queued messages
      this.processNext();
    }
  }

  public getMetrics(): UserQueueMetrics {
    return {
      pendingCount: this.queue.length,
      isProcessing: this.isProcessing,
      totalSent: this.totalSent,
      totalFailed: this.totalFailed,
      lastSentAt: this.lastSentAt,
      lastDelayMs: this.lastDelayMs
    };
  }

  public clearQueue(): void {
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        task.reject(new Error('Queue cleared by user or disconnect.'));
      }
    }
    this.isProcessing = false;
  }
}

/**
 * Multi-Tenant Anti-Ban Queue Controller
 */
export class AntiBanQueueController {
  private userQueues = new Map<string, UserQueueManager>();

  constructor(private readonly getSocket: (userId: string) => WASocket | undefined) {}

  private getOrCreateQueue(userId: string): UserQueueManager {
    let q = this.userQueues.get(userId);
    if (!q) {
      q = new UserQueueManager(userId, this.getSocket);
      this.userQueues.set(userId, q);
    }
    return q;
  }

  public enqueueMessage(
    userId: string,
    toJid: string,
    content: AnyMessageContent,
    options?: MiscMessageGenerationOptions,
    isConversational = true
  ): Promise<{ success: boolean; messageId: string; timestamp: string; antiBanDelayMs: number }> {
    const queue = this.getOrCreateQueue(userId);
    return queue.enqueue(toJid, content, options, isConversational);
  }

  public getQueueMetrics(userId: string): UserQueueMetrics {
    const queue = this.userQueues.get(userId);
    if (!queue) {
      return {
        pendingCount: 0,
        isProcessing: false,
        totalSent: 0,
        totalFailed: 0,
        lastSentAt: null,
        lastDelayMs: 0
      };
    }
    return queue.getMetrics();
  }

  public clearUserQueue(userId: string): void {
    const queue = this.userQueues.get(userId);
    if (queue) {
      queue.clearQueue();
    }
  }
}
