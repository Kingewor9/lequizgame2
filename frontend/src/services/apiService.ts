import axios, { AxiosInstance, AxiosError } from 'axios';
import { ApiResponse } from '../types';
//ApiErrorResponse removed from imports as it is not used in this file

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    // Add response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        console.error('API Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.get<ApiResponse<T>>(endpoint);
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

  async post<T>(endpoint: string, data: any): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.post<ApiResponse<T>>(endpoint, data);
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

  async put<T>(endpoint: string, data: any): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.put<ApiResponse<T>>(endpoint, data);
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

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.delete<ApiResponse<T>>(endpoint);
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

  async patch<T>(endpoint: string, data: any): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.patch<ApiResponse<T>>(endpoint, data);
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
