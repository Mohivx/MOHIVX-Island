const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const WindowsNotificationService = require('../electron/services/windowsNotifications.cjs');

test('WindowsNotificationService deduplicates notifications and filters duplicates in memory', async () => {
  const received = [];
  const service = new WindowsNotificationService({
    qaMode: false, now: () => Date.parse("2026-10-21T12:02:00Z"),
    onNotification: (n) => received.push(n),
    getSettings: () => ({ windowsNotificationsEnabled: true }),
    execFile: (file, args, opts, cb) => {
      // Mock powershell execution returning notifications
      const stdout = JSON.stringify({
        success: true,
        allowed: true,
        accessStatus: 'Allowed',
        notifications: [
          { id: 101, app: 'Slack', title: 'New message', body: 'Hello there', createdAt: '2026-10-21T12:00:00Z' },
          { id: 102, app: 'Calendar', title: 'Meeting', body: 'Team sync', createdAt: '2026-10-21T12:01:00Z' }
        ]
      });
      cb(null, stdout);
    }
  });

  // First poll initializes seen IDs so historical notifications are not replayed
  await service.poll();
  assert.equal(received.length, 0, 'Initial poll should establish baseline without emitting old notifications');
  assert.equal(service.initialized, true);
  assert.equal(service.seenIds.has('101'), true);
  assert.equal(service.seenIds.has('102'), true);

  // Second poll with an existing and a new notification
  service.exec = (file, args, opts, cb) => {
    const stdout = JSON.stringify({
      success: true,
      allowed: true,
      accessStatus: 'Allowed',
      notifications: [
        { id: 101, app: 'Slack', title: 'New message', body: 'Hello there', createdAt: '2026-10-21T12:00:00Z' },
        { id: 103, app: 'Discord', title: 'Ping', body: 'Deployment complete', createdAt: '2026-10-21T12:05:00Z' }
      ]
    });
    cb(null, stdout);
  };

  await service.poll();
  assert.equal(received.length, 1, 'Only the new notification should be emitted');
  assert.equal(received[0].id, 'win-103');
  assert.equal(received[0].app, 'Discord');
  assert.equal(received[0].title, 'Ping');
  assert.equal(received[0].body, 'Deployment complete');

  // Third poll with the same set should emit nothing more
  await service.poll();
  assert.equal(received.length, 1, 'Duplicate notifications must be gated');
});

test('WindowsNotificationService honors windowsNotificationsEnabled gating', async () => {
  let executed = false;
  const service = new WindowsNotificationService({
    qaMode: false,
    onNotification: () => {},
    getSettings: () => ({ windowsNotificationsEnabled: false }),
    execFile: (file, args, opts, cb) => {
      executed = true;
      cb(null, JSON.stringify({ success: true, allowed: true, notifications: [] }));
    }
  });

  await service.poll();
  assert.equal(executed, false, 'Poll should be skipped when windowsNotificationsEnabled is false');
});

test('WindowsNotificationService handles permission denial gracefully', async () => {
  const received = [];
  const service = new WindowsNotificationService({
    qaMode: false,
    onNotification: (n) => received.push(n),
    getSettings: () => ({ windowsNotificationsEnabled: true }),
    execFile: (file, args, opts, cb) => {
      cb(null, JSON.stringify({ success: true, allowed: false, accessStatus: 'Denied', notifications: [] }));
    }
  });

  await service.poll();
  assert.equal(service.lastAccessStatus, 'Denied');
  assert.equal(received.length, 0);
});
