export function isHttpError(error: unknown): error is Error & { httpStatus: number } {
  return error instanceof Error && 'httpStatus' in error;
}

export function isNetworkError(error: unknown): error is Error & { networkError: true } {
  return error instanceof Error && 'networkError' in error;
}

export function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallbackMessage;
}
