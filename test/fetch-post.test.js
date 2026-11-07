import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchPost } from '../src/fetch-post.js';

test('fetches the requested post, parses JSON, and calls the Node-style callback', async (t) => {
  const post = { id: 1, title: 'Test post' };
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => post,
  }));
  const callback = t.mock.fn();
  await fetchPost(1, callback);
  assert.equal(fetchMock.mock.calls[0].arguments[0], 'https://jsonplaceholder.typicode.com/posts/1');
  assert.deepEqual(callback.mock.calls[0].arguments, [null, post]);
});

test('forwards a network error to the callback exactly once', async (t) => {
  const error = new Error('Network failure');
  t.mock.method(globalThis, 'fetch', async () => { throw error; });
  const callback = t.mock.fn();
  await fetchPost(1, callback);
  assert.equal(callback.mock.callCount(), 1);
  assert.deepEqual(callback.mock.calls[0].arguments, [error]);
});

test('reports HTTP errors without attempting to parse the body', async (t) => {
  const json = t.mock.fn();
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: false, status: 503, statusText: 'Service Unavailable', json,
  }));
  const callback = t.mock.fn();
  await fetchPost(1, callback);
  assert.equal(callback.mock.callCount(), 1);
  assert.ok(callback.mock.calls[0].arguments[0] instanceof Error);
  assert.match(callback.mock.calls[0].arguments[0].message, /503/);
  assert.equal(json.mock.callCount(), 0);
});

test('forwards JSON parsing errors', async (t) => {
  const error = new SyntaxError('Invalid JSON');
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true, json: async () => { throw error; },
  }));
  const callback = t.mock.fn();
  await fetchPost(1, callback);
  assert.deepEqual(callback.mock.calls[0].arguments, [error]);
});

test('does not invoke the callback again when the callback itself throws', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({}) }));
  const error = new Error('Callback failure');
  const callback = t.mock.fn(() => { throw error; });
  await assert.rejects(fetchPost(1, callback), error);
  assert.equal(callback.mock.callCount(), 1);
});
