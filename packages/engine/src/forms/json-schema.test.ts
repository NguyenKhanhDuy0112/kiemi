import { describe, expect, it } from 'vitest';
import { formSpecsFromSchema } from './json-schema';

describe('formSpecsFromSchema [R-02]', () => {
  it('reads a JSON Schema object', () => {
    const [form] = formSpecsFromSchema({
      title: 'Đăng ký',
      type: 'object',
      required: ['email', 'age'],
      properties: {
        email: { type: 'string', format: 'email', maxLength: 100 },
        age: { type: 'integer', minimum: 18, maximum: 99 },
        role: { type: 'string', enum: ['admin', 'user'] },
        code: { type: 'string', pattern: '^[A-Z]{3}$', minLength: 3 },
      },
    });
    expect(form?.name).toBe('Đăng ký');
    const by = Object.fromEntries((form?.fields ?? []).map((f) => [f.key, f]));
    expect(by.email).toMatchObject({ type: 'email', required: true, maxLength: 100 });
    expect(by.age).toMatchObject({ type: 'number', required: true, min: 18, max: 99 });
    expect(by.role).toMatchObject({
      type: 'dropdown',
      options: ['admin', 'user'],
      required: false,
    });
    expect(by.code).toMatchObject({ pattern: '^[A-Z]{3}$', minLength: 3 });
  });

  it('reads request bodies of an OpenAPI document, following $ref', () => {
    const forms = formSpecsFromSchema({
      openapi: '3.0.0',
      paths: {
        '/users': {
          post: {
            summary: 'Tạo user',
            requestBody: {
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/User' } },
              },
            },
          },
          get: {},
        },
      },
      components: {
        schemas: {
          User: {
            type: 'object',
            required: ['name'],
            properties: { name: { type: 'string', minLength: 2 } },
          },
        },
      },
    });
    expect(forms).toHaveLength(1);
    expect(forms[0]?.name).toBe('Tạo user');
    expect(forms[0]?.fields[0]).toMatchObject({ key: 'name', required: true, minLength: 2 });
  });

  it('returns nothing for input that is not a schema', () => {
    expect(formSpecsFromSchema('x')).toEqual([]);
    expect(formSpecsFromSchema({ type: 'string' })).toEqual([]);
  });
});
