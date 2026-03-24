import { Hono } from 'hono';
import { marked } from 'marked';
import TurndownService from 'turndown';
import Papa from 'papaparse';
import yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { requestIdMiddleware } from './middlewares/requestId';
import { bodyLimitMiddleware } from './middlewares/bodyLimit';
import { authMiddleware } from './middlewares/auth';
import { rateLimitMiddleware } from './middlewares/rateLimit';
import { idempotencyMiddleware } from './middlewares/idempotency';
import { Env, Variables } from './types';

const app = new Hono<{ Bindings: Env, Variables: Variables }>();

const ajv = new Ajv();
addFormats(ajv);

app.use('*', requestIdMiddleware);
app.use('*', bodyLimitMiddleware);

app.get('/', (c) => {
  return c.json({
    ok: true,
    message: 'Text and Data Conversion API',
    version: '1.0.0',
  });
});

// Protected routes
const protectedRoutes = new Hono<{ Bindings: Env, Variables: Variables }>();
protectedRoutes.use('*', authMiddleware('convert:write'));
protectedRoutes.use('*', rateLimitMiddleware);
protectedRoutes.use('*', idempotencyMiddleware);

protectedRoutes.post('/markdown-to-html', async (c) => {
  const body = await c.req.text();
  const html = await marked.parse(body);
  return c.json({ ok: true, data: { html }, request_id: c.get('requestId') });
});

protectedRoutes.post('/html-to-markdown', async (c) => {
  const body = await c.req.text();
  const turndownService = new TurndownService();
  const markdown = turndownService.turndown(body);
  return c.json({ ok: true, data: { markdown }, request_id: c.get('requestId') });
});

protectedRoutes.post('/csv-to-json', async (c) => {
  const body = await c.req.text();
  const result = Papa.parse(body, { header: true, skipEmptyLines: true });
  if (result.errors.length > 0) {
    return c.json(
      {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid CSV', details: result.errors },
        request_id: c.get('requestId'),
      },
      422,
    );
  }
  return c.json({ ok: true, data: result.data, request_id: c.get('requestId') });
});

protectedRoutes.post('/yaml-to-json', async (c) => {
  const body = await c.req.text();
  try {
    const data = yaml.load(body);
    return c.json({ ok: true, data, request_id: c.get('requestId') });
  } catch (e: any) {
    return c.json(
      {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid YAML', details: e.message },
        request_id: c.get('requestId'),
      },
      422,
    );
  }
});

protectedRoutes.post('/validate/json-schema', async (c) => {
  const { schema, data } = await c.req.json();
  try {
    const validate = ajv.compile(schema);
    const valid = validate(data);
    if (!valid) {
      return c.json(
        {
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Schema validation failed', details: validate.errors },
          request_id: c.get('requestId'),
        },
        422,
      );
    }
    return c.json({ ok: true, data: { valid: true }, request_id: c.get('requestId') });
  } catch (e: any) {
    return c.json(
      {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid schema or data', details: e.message },
        request_id: c.get('requestId'),
      },
      422,
    );
  }
});

app.route('/v1/convert', protectedRoutes);
app.route('/v1', protectedRoutes); // For /v1/validate/json-schema

export default app;
