// Errors that routes turn into HTTP responses. Messages are safe to show to the farmer.
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new AppError(400, 'invalid_input', message);
export const unauthorized = (message = 'Please sign in.') => new AppError(401, 'unauthorized', message);
// Used for "does not exist" AND "belongs to someone else", so ids of other farmers' data never leak.
export const notFound = (what = 'Item') => new AppError(404, 'not_found', `${what} not found.`);
export const conflict = (message: string) => new AppError(409, 'conflict', message);

export function toHttp(e: unknown): { status: number; body: { error: string; message: string } } {
  if (e instanceof AppError) return { status: e.status, body: { error: e.code, message: e.message } };
  console.error(e);
  return { status: 500, body: { error: 'server_error', message: 'Something went wrong. Please try again.' } };
}
