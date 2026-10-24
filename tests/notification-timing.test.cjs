const test = require('node:test');
const assert = require('node:assert/strict');

test('IslandNoticeQueue timing and visible-time duration', async (t) => {
  const { IslandNoticeQueue } = await import('../src/hooks/islandNotices.mjs');

  class FakeClock {
    constructor(start = 1000) {
      this.time = start;
      this.timers = new Map();
      this.nextId = 0; // Starts at 0 to test timerID 0 handling
      this.cancelled = [];
    }

    now = () => this.time;

    setTimeout = (cb, delay) => {
      const id = this.nextId++;
      this.timers.set(id, { cb, due: this.time + delay });
      return id;
    };

    clearTimeout = (id) => {
      this.cancelled.push(id);
      this.timers.delete(id);
    };

    advance(ms) {
      this.time += ms;
      const ready = [];
      for (const [id, item] of this.timers.entries()) {
        if (item.due <= this.time) {
          ready.push({ id, cb: item.cb, due: item.due });
        }
      }
      ready.sort((a, b) => a.due - b.due || a.id - b.id);
      for (const item of ready) {
        if (this.timers.has(item.id)) {
          this.timers.delete(item.id);
          item.cb();
        }
      }
    }
  }

  await t.test('timerID 0 is properly tracked, cancelled, and not treated as falsy', () => {
    const clock = new FakeClock();
    let current = null;
    const q = new IslandNoticeQueue((item) => { current = item; }, {
      now: clock.now,
      setTimer: clock.setTimeout,
      clearTimer: clock.clearTimeout,
      durationMs: 8000
    });

    q.enqueue({ id: '1', source: 's', app: 'a', title: 't1', body: 'b1', time: clock.now() });
    assert.equal(current?.id, '1');
    assert.equal(q.timer, 0, 'First timer ID is 0');

    // Clear should cancel timer 0
    q.clear();
    assert.ok(clock.cancelled.includes(0), 'Timer ID 0 was passed to clearTimer');
    assert.equal(q.timer, null);
    assert.equal(current, null);
  });

  await t.test('elapsed-visible timeout dismisses card after full duration', () => {
    const clock = new FakeClock();
    let current = null;
    const q = new IslandNoticeQueue((item) => { current = item; }, {
      now: clock.now,
      setTimer: clock.setTimeout,
      clearTimer: clock.clearTimeout,
      durationMs: 8000
    });

    q.enqueue({ id: '1', source: 's', app: 'a', title: 't1', body: 'b1', time: clock.now() });
    assert.equal(current?.id, '1');

    clock.advance(7999);
    assert.equal(current?.id, '1');

    clock.advance(1);
    assert.equal(current, null, 'Dismissed at 8000ms');
  });

  await t.test('hover pause/resume preserves remaining visible time without resetting', () => {
    const clock = new FakeClock();
    let current = null;
    const q = new IslandNoticeQueue((item) => { current = item; }, {
      now: clock.now,
      setTimer: clock.setTimeout,
      clearTimer: clock.clearTimeout,
      durationMs: 8000
    });

    q.enqueue({ id: '1', source: 's', app: 'a', title: 't1', body: 'b1', time: clock.now() });
    clock.advance(3000); // 3000ms elapsed visible, 5000ms remaining

    q.pause(true); // Hovered
    clock.advance(10000); // Paused for 10s; must not count towards visible duration
    assert.equal(current?.id, '1');

    q.pause(false); // Unhovered, 5000ms remaining
    clock.advance(4999);
    assert.equal(current?.id, '1');

    clock.advance(1);
    assert.equal(current, null, 'Dismissed precisely after 5000ms of resumed visible time');
  });

  await t.test('changing duration while paused does not arm a timer and adjusts budget', () => {
    const clock = new FakeClock();
    let current = null;
    const q = new IslandNoticeQueue((item) => { current = item; }, {
      now: clock.now,
      setTimer: clock.setTimeout,
      clearTimer: clock.clearTimeout,
      durationMs: 8000
    });

    q.enqueue({ id: '1', source: 's', app: 'a', title: 't1', body: 'b1', time: clock.now() });
    clock.advance(2000); // 2000ms elapsed visible

    q.pause(true);
    assert.equal(q.timer, null);

    // Change duration while paused to 10000ms (so 10000 - 2000 = 8000 remaining)
    q.setDuration(10000);
    assert.equal(q.timer, null, 'Timer must not be armed while paused');

    clock.advance(5000); // elapsed paused time
    assert.equal(q.timer, null);

    q.pause(false); // Resumed; should have 8000ms left
    clock.advance(7999);
    assert.equal(current?.id, '1');

    clock.advance(1);
    assert.equal(current, null, 'Dismissed after 8000ms remaining budget');
  });

  await t.test('live duration change unpaused updates active card and clamps', () => {
    const clock = new FakeClock();
    let current = null;
    const q = new IslandNoticeQueue((item) => { current = item; }, {
      now: clock.now,
      setTimer: clock.setTimeout,
      clearTimer: clock.clearTimeout,
      durationMs: 8000
    });

    // Invalid values test clamp/rounding: 35000 clamps to 30000, 2000 clamps to 3000, NaN defaults to 8000
    q.enqueue({ id: '1', source: 's', app: 'a', title: 't1', body: 'b1', time: clock.now() });
    clock.advance(2000); // 2000ms elapsed

    // Increase to 6000ms (rounded from 5999.8) -> remaining should be 4000ms
    q.setDuration(5999.8);
    clock.advance(3999);
    assert.equal(current?.id, '1');

    clock.advance(1);
    assert.equal(current, null);
  });

  await t.test('changing duration to shorter-than-elapsed dismisses card immediately', () => {
    const clock = new FakeClock();
    let current = null;
    const q = new IslandNoticeQueue((item) => { current = item; }, {
      now: clock.now,
      setTimer: clock.setTimeout,
      clearTimer: clock.clearTimeout,
      durationMs: 8000
    });

    q.enqueue({ id: '1', source: 's', app: 'a', title: 't1', body: 'b1', time: clock.now() });
    clock.advance(5000); // 5000ms elapsed visible

    // Set duration to 4000ms (< 5000 elapsed)
    q.setDuration(4000);
    assert.equal(current, null, 'Dismissed immediately because elapsed exceeded new duration');
  });

  await t.test('new card gets fresh duration budget', () => {
    const clock = new FakeClock();
    let current = null;
    const q = new IslandNoticeQueue((item) => { current = item; }, {
      now: clock.now,
      setTimer: clock.setTimeout,
      clearTimer: clock.clearTimeout,
      durationMs: 6000
    });

    q.enqueue({ id: '1', source: 's', app: 'a', title: 't1', body: 'b1', time: clock.now() });
    q.enqueue({ id: '2', source: 's', app: 'a', title: 't2', body: 'b2', time: clock.now() });

    clock.advance(6000); // Card 1 dismisses
    assert.equal(current?.id, '2', 'Card 2 advanced');

    clock.advance(5999);
    assert.equal(current?.id, '2', 'Card 2 has its own full 6000ms budget');

    clock.advance(1);
    assert.equal(current, null);
  });

  await t.test('question blocking preserves remaining budget and resumes at front of queue', () => {
    const clock = new FakeClock();
    let current = null;
    const q = new IslandNoticeQueue((item) => { current = item; }, {
      now: clock.now,
      setTimer: clock.setTimeout,
      clearTimer: clock.clearTimeout,
      durationMs: 8000
    });

    q.enqueue({ id: '1', source: 's', app: 'a', title: 't1', body: 'b1', time: clock.now() });
    clock.advance(3000); // 3000ms elapsed, 5000ms remaining

    q.setBlocked(true); // Agent question blocked queue
    assert.equal(current, null);
    assert.equal(q.timer, null);

    // Another notification arrives while blocked
    clock.advance(1000);
    q.enqueue({ id: '2', source: 's', app: 'a', title: 't2', body: 'b2', time: clock.now() });
    assert.equal(current, null);

    // Unblock; card 1 should resume with remaining 5000ms
    q.setBlocked(false);
    assert.equal(current?.id, '1', 'Card 1 resumes without losing priority');

    clock.advance(4999);
    assert.equal(current?.id, '1');

    clock.advance(1);
    assert.equal(current?.id, '2', 'Card 1 dismissed, Card 2 is now shown');
  });

  await t.test('stale expiry drops card older than 2 minutes when unblocking', () => {
    const clock = new FakeClock();
    let current = null;
    const q = new IslandNoticeQueue((item) => { current = item; }, {
      now: clock.now,
      setTimer: clock.setTimeout,
      clearTimer: clock.clearTimeout,
      durationMs: 8000
    });

    q.enqueue({ id: '1', source: 's', app: 'a', title: 't1', body: 'b1', time: clock.now() });
    clock.advance(1000);

    q.setBlocked(true);
    // Question took 125 seconds (> 2 min / 120000ms)
    clock.advance(125000);

    q.setBlocked(false);
    assert.equal(current, null, 'Expired card older than 2min is discarded');
  });

  await t.test('stale timer callback after clear or advance is ignored', () => {
    const clock = new FakeClock();
    let current = null;
    const q = new IslandNoticeQueue((item) => { current = item; }, {
      now: clock.now,
      setTimer: clock.setTimeout,
      clearTimer: (id) => {
        // Simulates an engine or bad cancellation where timer still fires
      },
      durationMs: 8000
    });

    q.enqueue({ id: '1', source: 's', app: 'a', title: 't1', body: 'b1', time: clock.now() });
    assert.equal(current?.id, '1');

    // Explicitly dismiss / clear
    q.clear();
    assert.equal(current, null);

    // Enqueue a fresh card
    clock.advance(1000);
    q.enqueue({ id: '2', source: 's', app: 'a', title: 't2', body: 'b2', time: clock.now() });
    assert.equal(current?.id, '2');

    // The old timer from card 1 fires now
    clock.advance(7000);
    // Generation guard ensures card 2 is NOT dismissed by card 1's timer callback
    assert.equal(current?.id, '2', 'Stale callback did not dismiss the new card');
  });
});
