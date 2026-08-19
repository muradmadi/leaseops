/**
 * `zValidator` with a readable failure message.
 *
 * Hono's default rejection body is the raw `ZodError` — `{ success: false,
 * error: { issues: [...] } }` — which carries no `message` field. The web
 * client reads `message` then `error` (`lib/api.ts`), so a failed validation
 * surfaced in the UI as the string "[object Object]": a form that refused to
 * save and would not say why. A 685-character `occupation` against a 300
 * character cap looked identical to the server being down.
 *
 * Every route imports `zValidator` from here rather than from the package, so a
 * new route cannot reintroduce the silent version. The shape it returns matches
 * every other error in the API: `{ message, statusCode }`.
 */
import { zValidator as honoZValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodError, ZodSchema } from 'zod';

/**
 * One line naming the field and what is wrong with it.
 *
 * The field path rather than a UI label: the API does not know what a screen
 * calls a box, and `occupation: String must contain at most 300 character(s)`
 * is enough for a person to find it. Capped at three issues because a wall of
 * them is no more actionable than one.
 */
function describeIssues(error: ZodError): string {
  const issues = error.issues.slice(0, 3).map((issue) => {
    const field = issue.path.join('.');
    return field ? `${field}: ${issue.message}` : issue.message;
  });
  const rest = error.issues.length - issues.length;
  return issues.join('; ') + (rest > 0 ? ` (and ${rest} more)` : '');
}

export function zValidator<T extends ZodSchema, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T
) {
  return honoZValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json({ message: describeIssues(result.error), statusCode: 400 }, 400);
    }
  });
}
