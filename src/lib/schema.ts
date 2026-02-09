import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import * as fs from "node:fs";

export interface SchemaValidationError {
  message: string;
  path?: string;
}

export interface SchemaValidator {
  validate: (schema: object, data: unknown) => SchemaValidationError[];
  validateFile: (schemaPath: string, data: unknown) => SchemaValidationError[];
}

function formatErrors(errors: ErrorObject[] | null | undefined): SchemaValidationError[] {
  if (!errors) return [];
  return errors.map((err) => ({
    message: err.message ?? "schema validation error",
    path: err.instancePath || err.schemaPath,
  }));
}

export const createSchemaValidator = (): SchemaValidator => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const cache = new Map<string, ValidateFunction>();

  const validate = (schema: object, data: unknown): SchemaValidationError[] => {
    const key = JSON.stringify(schema);
    let fn = cache.get(key);
    if (!fn) {
      fn = ajv.compile(schema);
      cache.set(key, fn);
    }
    const ok = fn(data);
    return ok ? [] : formatErrors(fn.errors);
  };

  const validateFile = (schemaPath: string, data: unknown): SchemaValidationError[] => {
    const raw = fs.readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(raw) as object;
    return validate(schema, data);
  };

  return { validate, validateFile };
};
