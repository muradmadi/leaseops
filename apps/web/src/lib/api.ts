/**
 * Centralized API client for LeaseOps frontend.
 * Enforces structured error handling, JSON deserialization, and base API URL routing.
 */

export interface ApiErrorResponse {
  message?: string;
  error?: string;
  statusCode?: number;
}

export class ApiError extends Error {
  public statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

/**
 * Standardized fetcher wrapper for all /api calls.
 * Ensures consistent Content-Type headers and deserializes error responses into ApiError instances.
 */
export async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = endpoint.startsWith('/api') 
    ? endpoint 
    : `/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  
  const token = typeof window !== 'undefined' ? localStorage.getItem('leaseops_token') : null;

  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let errorMessage = `API Request Failed: ${response.statusText || response.status}`;
    try {
      const errorData: ApiErrorResponse = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch {
      // Fallback to text status if response is not valid JSON
    }
    throw new ApiError(errorMessage, response.status);
  }

  // Handle 204 No Content or empty bodies gracefully
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return {} as T;
  }

  return response.json() as Promise<T>;
}
