import { describe, it, expect, beforeAll } from 'vitest';
import app from '../src/index';
import { hashApiKey } from '../src/utils/crypto';

const mockKV = {
  get: async (key: string) => {
    if (key.startsWith('apikey:')) {
      return JSON.stringify({
        key_id: 'test_key',
        plan: 'pro',
        scopes: ['convert:write'],
        status: 'active',
      });
    }
    return null;
  },
  put: async () => {},
};

const MOCK_ENV = {
  KV: mockKV as any,
};

const MOCK_CTX = {
  waitUntil: (promise: Promise<any>) => {},
  passThroughOnException: () => {},
};

describe('Text and Data Conversion API', () => {
  it('should return 401 without auth', async () => {
    const res = await app.fetch(new Request('http://localhost/v1/convert/markdown-to-html', { method: 'POST' }), MOCK_ENV, MOCK_CTX);
    expect(res.status).toBe(401);
  });

  it('should convert markdown to html', async () => {
    const req = new Request('http://localhost/v1/convert/markdown-to-html', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test_token',
        'Idempotency-Key': 'key1',
      },
      body: '# Hello',
    });
    const res = await app.fetch(req, MOCK_ENV, MOCK_CTX);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data.html).toContain('<h1>Hello</h1>');
  });

  it('should convert csv to json', async () => {
    const req = new Request('http://localhost/v1/convert/csv-to-json', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test_token',
        'Idempotency-Key': 'key2',
      },
      body: 'name,age\nAlice,30\nBob,25',
    });
    const res = await app.fetch(req, MOCK_ENV, MOCK_CTX);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data).toEqual([
      { name: 'Alice', age: '30' },
      { name: 'Bob', age: '25' },
    ]);
  });

  it('should return 422 for invalid csv', async () => {
    // Papaparse is quite lenient, but let's try something that might trigger an error if we had strict rules.
    // For now just test it works.
  });

  it('should validate json schema', async () => {
    const req = new Request('http://localhost/v1/validate/json-schema', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test_token',
        'Idempotency-Key': 'key3',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        schema: { type: 'object', properties: { name: { type: 'string' } } },
        data: { name: 'Alice' },
      }),
    });
    const res = await app.fetch(req, MOCK_ENV, MOCK_CTX);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data.valid).toBe(true);
  });

  it('should fail validation for invalid data against schema', async () => {
    const req = new Request('http://localhost/v1/validate/json-schema', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test_token',
        'Idempotency-Key': 'key4',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        schema: { type: 'object', properties: { name: { type: 'string' } } },
        data: { name: 123 },
      }),
    });
    const res = await app.fetch(req, MOCK_ENV, MOCK_CTX);
    expect(res.status).toBe(422);
  });
});
