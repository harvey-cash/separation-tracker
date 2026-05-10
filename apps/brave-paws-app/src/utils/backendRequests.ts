export type BackendRequestErrorKind = 'unreachable' | 'invalid-response' | 'request-failed';

export class BackendRequestError extends Error {
  kind: BackendRequestErrorKind;
  status: number | null;

  constructor(message: string, options: { kind: BackendRequestErrorKind; status?: number | null }) {
    super(message);
    this.name = 'BackendRequestError';
    this.kind = options.kind;
    this.status = options.status ?? null;
  }
}

const HTML_PREFIX_PATTERN = /^\s*(<!doctype html|<html\b)/i;

function isJsonContentType(contentType: string | null): boolean {
  return Boolean(contentType && /(^|;)\s*application\/json\b/i.test(contentType));
}

function isHtmlLikeResponse(response: Response, bodyText: string): boolean {
  const contentType = response.headers.get('content-type');
  return /text\/html/i.test(contentType || '') || HTML_PREFIX_PATTERN.test(bodyText);
}

function buildBackendFailureError(response: Response, bodyText: string): BackendRequestError {
  if (response.status === 401 || response.status === 403) {
    return new BackendRequestError('This feature is unavailable right now.', {
      kind: 'request-failed',
      status: response.status,
    });
  }

  if (
    response.status === 404
    || response.status === 405
    || response.status >= 500
    || isHtmlLikeResponse(response, bodyText)
  ) {
    return new BackendRequestError('QUANTUM is not reachable right now.', {
      kind: 'unreachable',
      status: response.status,
    });
  }

  return new BackendRequestError('This feature is unavailable right now.', {
    kind: 'request-failed',
    status: response.status,
  });
}

export function isBackendRequestError(error: unknown): error is BackendRequestError {
  return error instanceof BackendRequestError;
}

export function isBackendUnavailableError(error: unknown): boolean {
  return isBackendRequestError(error) && error.kind === 'unreachable';
}

export async function parseBackendJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type');

  if (!response.ok) {
    const bodyText = await response.text();
    throw buildBackendFailureError(response, bodyText);
  }

  if (!isJsonContentType(contentType)) {
    const bodyText = await response.text();
    throw new BackendRequestError(
      isHtmlLikeResponse(response, bodyText)
        ? 'QUANTUM is not reachable right now.'
        : 'Unexpected response from QUANTUM.',
      {
        kind: isHtmlLikeResponse(response, bodyText) ? 'unreachable' : 'invalid-response',
        status: response.status,
      },
    );
  }

  return response.json() as Promise<T>;
}
