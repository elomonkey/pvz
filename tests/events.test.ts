import test from 'node:test';
import assert from 'node:assert/strict';

import { EventBus } from '../src/core/eventBus.ts';

interface TestEvents {
  value: number;
  label: string;
}

test('event bus: доставляет события и отписывается', () => {
  const bus = new EventBus<TestEvents>();
  const values: number[] = [];
  const off = bus.on('value', (value) => values.push(value));

  bus.emit('value', 1);
  bus.emit('label', 'игнорируется');
  bus.emit('value', 2);
  assert.deepEqual(values, [1, 2]);
  assert.equal(bus.listenerCount('value'), 1);

  off();
  bus.emit('value', 3);
  assert.deepEqual(values, [1, 2]);
  assert.equal(bus.listenerCount('value'), 0);
});

test('event bus: once срабатывает один раз', () => {
  const bus = new EventBus<TestEvents>();
  let calls = 0;
  bus.once('value', () => {
    calls += 1;
  });

  bus.emit('value', 1);
  bus.emit('value', 2);
  assert.equal(calls, 1);
  assert.equal(bus.listenerCount('value'), 0);
});

test('event bus: clear и отписка во время emit', () => {
  const bus = new EventBus<TestEvents>();
  let calls = 0;
  const off = bus.on('value', () => {
    calls += 1;
    off();
  });
  const other = bus.on('value', () => {
    calls += 1;
  });

  bus.emit('value', 1);
  bus.emit('value', 2);
  assert.equal(calls, 3);
  assert.equal(bus.listenerCount('value'), 1);

  bus.clear();
  assert.equal(bus.listenerCount('value'), 0);
  other();
});
