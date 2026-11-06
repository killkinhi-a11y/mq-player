/**
 * Generic validator for the shared contract format in `shared/contracts/*.contract.json`.
 *
 * The same format is implemented on Android by
 * `android/app/src/main/kotlin/com/mq1/player/data/contracts/ContractValidator.kt`;
 * both sides are driven by the shared fixtures in `shared/test-fixtures/*.cases.json`,
 * so an error code produced here must be produced there too.
 *
 * Error / warning codes are `<field>:<rule>` (e.g. `id:required`, `duration:min`),
 * `$:type` when the payload itself is not an object.
 */

export type FieldType = "string" | "number" | "integer" | "boolean" | "object" | "array";

export interface FieldSpec {
  type: FieldType;
  required?: boolean;
  nullable?: boolean;
  enum?: readonly (string | number)[];
  minLength?: number;
  min?: number;
  max?: number;
  default?: unknown;
}

export interface IdRule {
  source: string;
  pattern: string;
  severity?: "error" | "warning";
}

export interface Contract {
  contract: string;
  version: number;
  additionalFields?: "allow" | "forbid";
  fields: Record<string, FieldSpec>;
  idRules?: IdRule[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function typeMatches(type: FieldType, v: unknown): boolean {
  switch (type) {
    case "string":
      return typeof v === "string";
    case "number":
      return typeof v === "number" && Number.isFinite(v);
    case "integer":
      return typeof v === "number" && Number.isInteger(v);
    case "boolean":
      return typeof v === "boolean";
    case "object":
      return isPlainObject(v);
    case "array":
      return Array.isArray(v);
  }
}

export function validateAgainst(contract: Contract, payload: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isPlainObject(payload)) {
    return { valid: false, errors: ["$:type"], warnings };
  }
  for (const [name, spec] of Object.entries(contract.fields)) {
    if (!(name in payload) || payload[name] === undefined) {
      if (spec.required) errors.push(`${name}:required`);
      continue;
    }
    const v = payload[name];
    if (v === null) {
      if (!spec.nullable) errors.push(`${name}:type`);
      continue;
    }
    if (!typeMatches(spec.type, v)) {
      errors.push(`${name}:type`);
      continue;
    }
    if (spec.enum && !spec.enum.includes(v as string | number)) errors.push(`${name}:enum`);
    if (spec.minLength !== undefined && typeof v === "string" && v.length < spec.minLength) {
      errors.push(`${name}:minLength`);
    }
    if (typeof v === "number") {
      if (spec.min !== undefined && v < spec.min) errors.push(`${name}:min`);
      if (spec.max !== undefined && v > spec.max) errors.push(`${name}:max`);
    }
  }
  if (contract.additionalFields === "forbid") {
    for (const key of Object.keys(payload)) {
      if (!(key in contract.fields)) errors.push(`${key}:unknown`);
    }
  }
  const id = payload.id;
  const source = payload.source;
  // Id-shape rules only run when id and source are otherwise valid.
  const idOk = !errors.some((e) => e.startsWith("id:") || e.startsWith("source:"));
  if (idOk && typeof id === "string" && typeof source === "string") {
    for (const rule of contract.idRules ?? []) {
      if (rule.source !== source) continue;
      if (!new RegExp(rule.pattern).test(id)) {
        (rule.severity === "error" ? errors : warnings).push("id:pattern");
      }
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

/** Fills contract defaults for missing (or undefined) fields; keeps unknown fields. */
export function applyDefaults<T extends Record<string, unknown>>(contract: Contract, payload: T): T {
  const out: Record<string, unknown> = { ...payload };
  for (const [name, spec] of Object.entries(contract.fields)) {
    if (out[name] === undefined && spec.default !== undefined) out[name] = spec.default;
  }
  return out as T;
}
