export type RuleOperator = "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
export interface RuleCondition { field: string; operator: RuleOperator; value: number | string }

export function compareRuleValue(actual: unknown, operator: RuleOperator, expected: unknown): boolean {
  const actualNumber = Number(actual); const expectedNumber = Number(expected);
  const numeric = Number.isFinite(actualNumber) && Number.isFinite(expectedNumber);
  const left = numeric ? actualNumber : String(actual ?? ""); const right = numeric ? expectedNumber : String(expected ?? "");
  if (operator === "gt") return left > right;
  if (operator === "gte") return left >= right;
  if (operator === "lt") return left < right;
  if (operator === "lte") return left <= right;
  if (operator === "neq") return left !== right;
  return left === right;
}

export function evaluateRuleConditions(metrics: Record<string, unknown>, conditions: RuleCondition[]): boolean {
  if (!conditions.length) return false;
  return conditions.every((condition) => Object.prototype.hasOwnProperty.call(metrics, condition.field) && compareRuleValue(metrics[condition.field], condition.operator, condition.value));
}

export function cappedBudgetIncrease(currentBudget: number, requestedPercent: number, alreadyIncreasedPercent: number, dailyCapPercent: number): number {
  const remaining = Math.max(0, dailyCapPercent - alreadyIncreasedPercent);
  const applied = Math.max(0, Math.min(requestedPercent, remaining));
  return Math.round(currentBudget * (1 + applied / 100) * 100) / 100;
}

export function isStale(latestSync: string | null | undefined, staleAfterMinutes: number, now = Date.now()): boolean {
  if (!latestSync) return true;
  return now - new Date(latestSync).getTime() > staleAfterMinutes * 60_000;
}
