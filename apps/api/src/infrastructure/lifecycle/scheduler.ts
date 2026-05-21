import type { TaskResult } from '../../application/shared/scheduler';
import type { Logger } from '../logging/logger';

export type { TaskResult } from '../../application/shared/scheduler';

export interface Task {
  readonly name: string;
  readonly intervalMs: number;
  readonly run: () => Promise<TaskResult>;
}

export interface SchedulerOptions {
  readonly logger: Logger;
  readonly tasks: readonly Task[];
}

function ensureError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export class Scheduler {
  private timers: NodeJS.Timeout[] = [];
  private started = false;
  private stopped = false;

  constructor(private readonly opts: SchedulerOptions) {}

  start(): void {
    if (this.stopped) {
      throw new Error('Scheduler: cannot start after stop');
    }
    if (this.started) return;
    this.started = true;
    for (const task of this.opts.tasks) {
      const timer = setInterval(() => {
        void this.tick(task);
      }, task.intervalMs);
      this.timers.push(timer);
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.opts.logger.event('scheduler.stopped', { tasks: this.opts.tasks.length });
  }

  private async tick(task: Task): Promise<void> {
    try {
      const result = await task.run();
      if (result.status === 'skipped') {
        this.opts.logger.event(`cron.${task.name}.skipped`, { reason: result.reason });
      } else {
        this.opts.logger.event(`cron.${task.name}.completed`, result.details ?? {});
      }
    } catch (err) {
      this.opts.logger.error({
        event: `cron.${task.name}.failed`,
        err: ensureError(err),
      });
    }
  }
}
