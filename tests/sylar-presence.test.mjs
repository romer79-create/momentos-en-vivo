import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresenceReminder, PRESENCE_TIMING } from '../web/sylar/sylar-presence.mjs';

function scenario() {
  let now = 0, sequence = 0;
  const timers = new Map();
  const state = { allowed: true, visible: false, displays: 0, clearSpace: true };
  const reminder = createPresenceReminder({
    canShow: () => state.allowed,
    show: () => { if (!state.clearSpace) return false; state.visible = true; state.displays++; return true; },
    hide: () => { state.visible = false; },
    schedule: (fn, delay) => { const id = ++sequence; timers.set(id, { at: now + delay, fn }); return id; },
    cancel: id => timers.delete(id),
  });
  function advance(ms) {
    const until = now + ms;
    for (let count = 0; count < 1000; count++) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > until) break;
      timers.delete(next[0]); now = next[1].at; next[1].fn();
    }
    now = until;
  }
  return { state, reminder, advance, timers };
}

test('waits 45 seconds, shows for 7, and spaces subsequent reminders by 3 minutes', () => {
  const s = scenario(); s.reminder.touch();
  s.advance(44999); assert.equal(s.state.visible, false);
  s.advance(1); assert.equal(s.state.visible, true);
  s.advance(6999); assert.equal(s.state.visible, true);
  s.advance(1); assert.equal(s.state.visible, false);
  s.advance(179999); assert.equal(s.state.displays, 1);
  s.advance(1); assert.equal(s.state.displays, 2);
  assert.deepEqual(PRESENCE_TIMING, { initialDelay:45000, repeatDelay:180000, duration:7000 });
});
test('interaction postpones the first reminder instead of opening anything', () => {
  const s = scenario(); s.reminder.touch(); s.advance(30000); s.reminder.touch();
  s.advance(44999); assert.equal(s.state.displays, 0);
  s.advance(1); assert.equal(s.state.displays, 1);
});
test('opening chat or typing dismisses an existing hint and suspends timers', () => {
  const s = scenario(); s.reminder.touch(); s.advance(45000);
  s.state.allowed = false; s.reminder.touch();
  assert.equal(s.state.visible, false); assert.equal(s.timers.size, 0);
  s.advance(600000); assert.equal(s.state.displays, 1);
  s.state.allowed = true; s.reminder.touch(); s.advance(179999);
  assert.equal(s.state.displays, 1); s.advance(1); assert.equal(s.state.displays, 2);
});
test('rechecks eligibility at the deadline', () => {
  const s = scenario(); s.reminder.touch(); s.state.allowed = false;
  s.advance(45000); assert.equal(s.state.displays, 0); assert.equal(s.timers.size, 0);
});
test('skips a placement that would cover controls and retries later', () => {
  const s = scenario(); s.state.clearSpace = false; s.reminder.touch();
  s.advance(45000); assert.equal(s.state.displays, 0);
  s.state.clearSpace = true; s.advance(45000); assert.equal(s.state.displays, 1);
});
test('keyboard focus can hold the hint without its expiry stealing focus', () => {
  const s = scenario(); s.reminder.touch(); s.advance(45000); s.reminder.hold();
  s.advance(600000); assert.equal(s.state.visible, true); assert.equal(s.state.displays, 1);
  s.reminder.touch(); assert.equal(s.state.visible, false); assert.equal(s.timers.size, 1);
});
test('cleanup and repeated activity leave no duplicate timers', () => {
  const s = scenario(); for (let i = 0; i < 100; i++) s.reminder.touch();
  assert.equal(s.timers.size, 1); s.reminder.destroy(); s.reminder.touch();
  assert.equal(s.timers.size, 0); s.advance(900000); assert.equal(s.state.displays, 0);
});
