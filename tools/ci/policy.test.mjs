import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, allowedRequest } from './policy.mjs';

test('only fixed loopback static files and explicit metadata reads', () => {
  for (const path of ['', 'dist/app.js', 'extensions/fixture-generation/varnish/main.js', 'v1/capabilities', 'v1/sessions?limit=30',
    'v1/events', 'v1/events/poll', 'admin/widgets/status']) {
    assert.equal(allowedRequest(BASE + path, 'GET'), true, path);
  }
});
test('default deny mutations, providers, runtime, discovery, remote origins', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    for (const path of ['v1/sessions', 'v1/events', 'v1/events/poll', 'admin/widgets/status']) {
      assert.equal(allowedRequest(BASE + path, method), false);
    }
  }
  for (const path of ['v1/responses', 'v1/sessions/test/runtime/compact', 'v1/sessions/test/runtime',
    'admin/widgets', 'admin/widgets/action', 'v1/events/action', 'v1/events/poll/action',
    'admin/extensions/reload', 'v1/projects', 'v1/mentions/search', 'v1/location',
    'extensions/varnish/../../../v1/responses']) {
    assert.equal(allowedRequest(BASE + path, 'GET'), false, path);
  }
  for (const url of ['https://example.com/', 'http://localhost:18080/ui/', 'http://127.0.0.1:8080/ui/',
    'http://token@127.0.0.1:18080/ui/', 'file:///etc/passwd', 'bad url']) {
    assert.equal(allowedRequest(url, 'GET'), false, url);
  }
});
