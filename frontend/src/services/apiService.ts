import axios, { AxiosInstance, AxiosError } from 'axios';
import { ApiResponse } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

interface RetryConfig {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
}

class ApiService {
  private client: AxiosInstance;
  private retryConfig: Required<RetryConfig> = {
    maxRetries: 5,
    initialDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
  };

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    // Attach JWT token to every request
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Log response errors
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        console.error('API Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private getBackoffDelay(attempt: number): number {
    const exponentialDelay = Math.min(
      this.retryConfig.initialDelay * Math.pow(2, attempt),
      this.retryConfig.maxDelay
    );
    // Add jitter (±20%)
    const jitter = exponentialDelay * 0.2 * (Math.random() - 0.5);
    return exponentialDelay + jitter;
  }

  /**
   * Check if error is retryable (network errors, timeouts, 5xx errors)
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false;

    // Timeout or network errors
    if (error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return true;
    }

    // No response (network error)
    if (!error.response) {
      return true;
    }

    // Server errors (5xx)
    const status = error.response?.status;
    return status >= 500;
  }

  /**
   * Execute request with retry logic
   */
  private async executeWithRetry<T>(
    request: () => Promise<any>,
    onRetry?: (attempt: number, delay: number) => void
  ): Promise<any> {
    let lastError = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await request();
      } catch (error) {
        lastError = error;

        // Check if error is retryable
        if (!this.isRetryableError(error) || attempt === this.retryConfig.maxRetries) {
          throw error;
        }

        // Calculate delay and notify caller
        const delay = this.getBackoffDelay(attempt);
        onRetry?.(attempt + 1, delay);

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  async get<T>(endpoint: string, onRetry?: (attempt: number, delay: number) => void): Promise<ApiResponse<T>> {
    try {
      const response = await this.executeWithRetry(
        () => this.client.get<ApiResponse<T>>(endpoint),
        onRetry
      );
      return response.data;
    } catch (error) {
      const err = error as AxiosError;
      return {
        success: false,
        error: err.message || 'An error occurred',
        message: (err.response?.data as any)?.message,
      };
    }
  }

  async post<T>(endpoint: string, data: any, onRetry?: (attempt: number, delay: number) => void): Promise<ApiResponse<T>> {
    try {
      const response = await this.executeWithRetry(
        () => this.client.post<ApiResponse<T>>(endpoint, data),
        onRetry
      );
      return response.data;
    } catch (error) {
      const err = error as AxiosError;
      return {
        success: false,
        error: err.message || 'An error occurred',
        message: (err.response?.data as any)?.message,
      };
    }
  }

  async put<T>(endpoint: string, data: any, onRetry?: (attempt: number, delay: number) => void): Promise<ApiResponse<T>> {
    try {
      const response = await this.executeWithRetry(
        () => this.client.put<ApiResponse<T>>(endpoint, data),
        onRetry
      );
      return response.data;
    } catch (error) {
      const err = error as AxiosError;
      return {
        success: false,
        error: err.message || 'An error occurred',
        message: (err.response?.data as any)?.message,
      };
    }
  }

  async delete<T>(endpoint: string, onRetry?: (attempt: number, delay: number) => void): Promise<ApiResponse<T>> {
    try {
      const response = await this.executeWithRetry(
        () => this.client.delete<ApiResponse<T>>(endpoint),
        onRetry
      );
      return response.data;
    } catch (error) {
      const err = error as AxiosError;
      return {
        success: false,
        error: err.message || 'An error occurred',
        message: (err.response?.data as any)?.message,
      };
    }
  }

  async patch<T>(endpoint: string, data: any, onRetry?: (attempt: number, delay: number) => void): Promise<ApiResponse<T>> {
    try {
      const response = await this.executeWithRetry(
        () => this.client.patch<ApiResponse<T>>(endpoint, data),
        onRetry
      );
      return response.data;
    } catch (error) {
      const err = error as AxiosError;
      return {
        success: false,
        error: err.message || 'An error occurred',
        message: (err.response?.data as any)?.message,
      };
    }
  }
}

export const apiService = new ApiService();