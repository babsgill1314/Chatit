import { EventEmitter } from 'events';

export interface OutgoingMessageJob {
  id: string;
  tenantId: string;
  targetJid: string;
  payload: any;
  priority?: 'high' | 'normal' | 'low';
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  resolve?: (value: any) => void;
  reject?: (reason?: any) => void;
}

export interface QueueMetrics {
  pendingCount: number;
  isProcessing: boolean;
  totalSent: number;
  totalFailed: number;
  lastSentAt: string | null;
  lastDelayMs: number;
}

/**
 * Production Outgoing Message Queue & Anti-Ban Rate Limiter.
 * Strictly spaces outgoing messages by 2 to 5 seconds per tenant socket
 * to prevent WhatsApp rate-limit bans and unexpected socket dropouts.
 */
export class WhatsAppMessageQueue extends EventEmitter {
  private queues = new Map<string, OutgoingMessageJob[]>();
  private activeWorkers = new Set<string>();
  private totalSentByTenant = new Map<string, number>();
  private totalFailedByTenant = new Map<string, number>();
  private lastSentAtByTenant = new Map<string, string>();
  private lastDelayByTenant = new Map<string, number>();

  // Worker execution dispatcher provided by the WhatsApp microservice
  private dispatcher: ((tenantId: string, targetJid: string, payload: any) => Promise<any>) | null = null;

  public setDispatcher(dispatcher: (tenantId: string, targetJid: string, payload: any) => Promise<any>): void {
    this.dispatcher = dispatcher;
  }

  public enqueue(
    tenantId: string, 
    targetJid: string, 
    payload: any, 
    options?: { priority?: 'high' | 'normal' | 'low'; maxAttempts?: number }
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const cleanTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const job: OutgoingMessageJob = {
        id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        tenantId: cleanTenant,
        targetJid,
        payload,
        priority: options?.priority || 'normal',
        attempts: 0,
        maxAttempts: options?.maxAttempts || 3,
        createdAt: Date.now(),
        resolve,
        reject
      };

      if (!this.queues.has(cleanTenant)) {
        this.queues.set(cleanTenant, []);
      }

      const queue = this.queues.get(cleanTenant)!;
      if (job.priority === 'high') {
        // High priority receipts insert right after any actively working item
        queue.unshift(job);
      } else {
        queue.push(job);
      }

      this.processQueue(cleanTenant);
    });
  }

  private async processQueue(tenantId: string): Promise<void> {
    if (this.activeWorkers.has(tenantId)) {
      return; // Already actively processing this tenant's queue with rate-limit pacing
    }

    const queue = this.queues.get(tenantId);
    if (!queue || queue.length === 0) {
      return;
    }

    this.activeWorkers.add(tenantId);

    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) break;

      // Anti-Ban & Anti-Disconnect Invariant:
      // Random delay between 2,000ms and 5,000ms (2 to 5 seconds)
      const delayMs = Math.floor(2000 + Math.random() * 3000);
      this.lastDelayByTenant.set(tenantId, delayMs);

      await new Promise(r => setTimeout(r, delayMs));

      try {
        if (!this.dispatcher) {
          throw new Error('Message dispatcher not configured');
        }

        job.attempts++;
        const result = await this.dispatcher(job.tenantId, job.targetJid, job.payload);
        
        const currentSent = (this.totalSentByTenant.get(tenantId) || 0) + 1;
        this.totalSentByTenant.set(tenantId, currentSent);
        this.lastSentAtByTenant.set(tenantId, new Date().toISOString());

        if (job.resolve) job.resolve(result);
        this.emit('message_sent', { tenantId, jobId: job.id, targetJid: job.targetJid });
      } catch (err: any) {
        console.error(`[MessageQueue:${tenantId}] Failed sending message (attempt ${job.attempts}/${job.maxAttempts}):`, err?.message || err);
        
        if (job.attempts < job.maxAttempts) {
          // Re-queue with exponential backoff delay
          console.log(`[MessageQueue:${tenantId}] Retrying job ${job.id} in next queue cycle...`);
          queue.unshift(job);
          await new Promise(r => setTimeout(r, 1500));
        } else {
          const currentFailed = (this.totalFailedByTenant.get(tenantId) || 0) + 1;
          this.totalFailedByTenant.set(tenantId, currentFailed);
          if (job.reject) job.reject(err);
          this.emit('message_failed', { tenantId, jobId: job.id, error: err });
        }
      }
    }

    this.activeWorkers.delete(tenantId);
    this.emit('queue_drained', { tenantId });
  }

  public getMetrics(tenantId: string): QueueMetrics {
    const cleanTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const queue = this.queues.get(cleanTenant) || [];
    return {
      pendingCount: queue.length,
      isProcessing: this.activeWorkers.has(cleanTenant),
      totalSent: this.totalSentByTenant.get(cleanTenant) || 0,
      totalFailed: this.totalFailedByTenant.get(cleanTenant) || 0,
      lastSentAt: this.lastSentAtByTenant.get(cleanTenant) || null,
      lastDelayMs: this.lastDelayByTenant.get(cleanTenant) || 0
    };
  }

  public clearQueue(tenantId: string): void {
    const cleanTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const queue = this.queues.get(cleanTenant);
    if (queue) {
      while (queue.length > 0) {
        const job = queue.shift();
        if (job?.reject) job.reject(new Error('Queue purged by administrator'));
      }
    }
  }
}

export const messageQueue = new WhatsAppMessageQueue();

/**
 * Compatibility adapter for Section 1 target payload implementation
 * Supports: await messageRateQueue.add('dispatch-outbound', { jid: customerJid, payload });
 */
export const messageRateQueue = {
  add: async (_jobName: string, data: { jid: string; payload: any; tenantId?: string }) => {
    const tenant = data.tenantId || 'store_aura_main';
    return messageQueue.enqueue(tenant, data.jid, data.payload, { priority: 'normal' });
  }
};

