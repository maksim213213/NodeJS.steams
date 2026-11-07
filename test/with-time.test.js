import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setImmediate } from 'node:timers';
import test from 'node:test';
import { WithTime } from '../src/with-time.js';

function observe(t) {
  const timer = t.mock.method(console, 'time', () => {});
  const timerEnd = t.mock.method(console, 'timeEnd', () => {});
  const emitter = new WithTime();
  const events = [];
  emitter.on('begin', () => events.push(['begin']));
  emitter.on('data', (value) => events.push(['data', value]));
  emitter.on('error', (error) => events.push(['error', error]));
  emitter.on('end', () => events.push(['end']));
  return { emitter, events, timer, timerEnd };
}

test('inherits EventEmitter, forwards arguments, and emits begin/data/end', async (t) => {
  const { emitter, events, timer, timerEnd } = observe(t);
  assert.ok(emitter instanceof EventEmitter);

  await new Promise((resolve) => {
    emitter.once('end', resolve);
    emitter.execute((a, b, callback) => {
      assert.deepEqual(events, [['begin']]);
      setImmediate(() => callback(null, a + b));
    }, 2, 3);
  });

  assert.deepEqual(events, [['begin'], ['data', 5], ['end']]);
  assert.equal(timer.mock.callCount(), 1);
  assert.deepEqual(timerEnd.mock.calls[0].arguments, timer.mock.calls[0].arguments);
});

test('callback errors emit error and always end', (t) => {
  const { emitter, events, timerEnd } = observe(t);
  const error = new Error('Network failure');
  emitter.execute((callback) => callback(error));
  assert.deepEqual(events, [['begin'], ['error', error], ['end']]);
  assert.equal(timerEnd.mock.callCount(), 1);
});

test('synchronous operation errors also emit error and end', (t) => {
  const { emitter, events } = observe(t);
  const error = new Error('Synchronous failure');
  emitter.execute(() => { throw error; });
  assert.deepEqual(events, [['begin'], ['error', error], ['end']]);
});

test('keeps falsy results and skips only undefined', (t) => {
  const { emitter, events } = observe(t);
  for (const value of [0, false, '', null, undefined]) {
    emitter.execute((callback) => callback(null, value));
  }
  assert.deepEqual(events.filter(([name]) => name === 'data'), [
    ['data', 0], ['data', false], ['data', ''], ['data', null],
  ]);
  assert.equal(events.filter(([name]) => name === 'end').length, 5);
});

test('ignores repeated callbacks and uses unique timer labels across instances', (t) => {
  const { emitter, events, timer, timerEnd } = observe(t);
  emitter.execute((callback) => {
    callback(null, 1);
    callback(new Error('Too late'));
  });
  new WithTime().execute((callback) => callback(null));
  assert.deepEqual(events, [['begin'], ['data', 1], ['end']]);
  assert.equal(timerEnd.mock.callCount(), 2);
  assert.notEqual(timer.mock.calls[0].arguments[0], timer.mock.calls[1].arguments[0]);
});

test('unhandled errors retain EventEmitter behavior but still emit end', (t) => {
  const { emitter, events } = observe(t);
  emitter.removeAllListeners('error');
  const error = new Error('Unhandled operation error');
  assert.throws(() => emitter.execute((callback) => callback(error)), error);
  assert.deepEqual(events, [['begin'], ['end']]);
});

test('a data listener exception is propagated once and end is still emitted', (t) => {
  const { emitter, events } = observe(t);
  const error = new Error('Listener failure');
  emitter.on('data', () => { throw error; });
  assert.throws(() => emitter.execute((callback) => callback(null, 1)), error);
  assert.deepEqual(events, [['begin'], ['data', 1], ['end']]);
});

test('normalizes non-Error callback failures to Error objects', (t) => {
  const { emitter, events } = observe(t);
  emitter.execute((callback) => callback('Failed'));
  assert.ok(events[1][1] instanceof Error);
  assert.equal(events[1][1].message, 'Failed');
});
