function clampDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return 8000;
  const rounded = Math.round(ms);
  if (rounded < 3000) return 3000;
  if (rounded > 30000) return 30000;
  return rounded;
}

export class IslandNoticeQueue {
  constructor(onChange = () => {}, o = {}) {
    this.onChange = onChange;
    this.now = o.now || Date.now;
    this.schedule = o.setTimer || ((callback, delay) => setTimeout(callback, delay));
    this.cancel = o.clearTimer || ((timer) => clearTimeout(timer));
    this.durationMs = clampDuration(o.durationMs);

    this.pending = [];
    this.current = null;
    this.blocked = false;
    this.paused = false;

    this.timer = null;
    this.seen = new Map();

    this.generation = 0;
    this.currentStartedAt = null;
    this.elapsedVisible = 0;
    this.remainingBudget = 0;
  }

  setDuration(durationMs) {
    const newDuration = clampDuration(durationMs);
    const oldDuration = this.durationMs;
    this.durationMs = newDuration;

    if (!this.current) return;

    if (this.paused) {
      this.remainingBudget = Math.max(0, newDuration - this.elapsedVisible);
      return;
    }

    if (this.currentStartedAt !== null) {
      const delta = Math.max(0, this.now() - this.currentStartedAt);
      this.elapsedVisible += delta;
      this.remainingBudget = Math.max(0, this.remainingBudget - delta);
      this.currentStartedAt = this.now();
    }

    if (this.elapsedVisible >= newDuration) {
      this.dismiss();
    } else {
      this.remainingBudget = newDuration - this.elapsedVisible;
      this.arm();
    }
  }

  emit() {
    this.onChange(this.current);
  }

  enqueue(input) {
    if (!input || typeof input.title !== 'string' || typeof input.body !== 'string') return;
    const key = JSON.stringify([input.source, input.id, input.time, input.title, input.body]);
    if (this.seen.has(key)) return;
    this.seen.set(key, this.now());
    if (this.seen.size > 100) this.seen.delete(this.seen.keys().next().value);
    this.pending.push({ ...input, received: this.now() });
    if (this.pending.length > 20) this.pending.shift();
    this.advance();
  }

  advance() {
    if (this.current || this.blocked) return;
    while (this.pending.length) {
      const item = this.pending.shift();
      if (this.now() - item.received < 120000) {
        this.current = item;
        this.generation++;
        this.elapsedVisible = item._elapsedVisible || 0;
        this.remainingBudget = Math.max(0, this.durationMs - this.elapsedVisible);
        this.currentStartedAt = null;
        this.emit();
        this.arm();
        break;
      }
    }
  }

  arm() {
    this.generation++;
    if (this.timer !== null && this.timer !== undefined) {
      this.cancel(this.timer);
    }
    this.timer = null;

    if (this.current && !this.blocked && !this.paused) {
      if (this.remainingBudget <= 0) {
        this.dismiss();
        return;
      }
      this.currentStartedAt = this.now();
      const currentGen = this.generation;
      this.timer = this.schedule(() => {
        if (this.generation !== currentGen) return;
        this.dismiss();
      }, this.remainingBudget);
    }
  }

  dismiss() {
    if (this.timer !== null && this.timer !== undefined) {
      this.cancel(this.timer);
    }
    this.timer = null;
    this.generation++;
    this.paused = false;
    this.current = null;
    this.currentStartedAt = null;
    this.elapsedVisible = 0;
    this.remainingBudget = 0;
    this.emit();
    this.advance();
  }

  setBlocked(value) {
    if (value === this.blocked) return;
    this.blocked = value;
    if (value) {
      if (this.timer !== null && this.timer !== undefined) {
        this.cancel(this.timer);
      }
      this.timer = null;
      this.generation++;

      if (this.current && !this.paused && this.currentStartedAt !== null) {
        const delta = Math.max(0, this.now() - this.currentStartedAt);
        this.elapsedVisible += delta;
        this.remainingBudget = Math.max(0, this.remainingBudget - delta);
      }
      this.paused = false;

      if (this.current) {
        const cardToRequeue = {
          ...this.current,
          _elapsedVisible: this.elapsedVisible,
          _remainingBudget: this.remainingBudget
        };
        this.pending.unshift(cardToRequeue);
        this.current = null;
        this.currentStartedAt = null;
        this.elapsedVisible = 0;
        this.remainingBudget = 0;
        this.emit();
      }
    } else {
      this.advance();
    }
  }

  pause(value) {
    if (this.paused === value) return;
    this.paused = value;
    if (value) {
      if (this.timer !== null && this.timer !== undefined) {
        this.cancel(this.timer);
      }
      this.timer = null;
      this.generation++;
      if (this.currentStartedAt !== null) {
        const delta = Math.max(0, this.now() - this.currentStartedAt);
        this.elapsedVisible += delta;
        this.remainingBudget = Math.max(0, this.remainingBudget - delta);
        this.currentStartedAt = null;
      }
    } else {
      this.arm();
    }
  }

  clear() {
    if (this.timer !== null && this.timer !== undefined) {
      this.cancel(this.timer);
    }
    this.timer = null;
    this.generation++;
    this.paused = false;
    this.current = null;
    this.pending = [];
    this.seen.clear();
    this.currentStartedAt = null;
    this.elapsedVisible = 0;
    this.remainingBudget = 0;
    this.emit();
  }
}
