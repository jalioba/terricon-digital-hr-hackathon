import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface ChatRequest {
  message: string;
  api_key?: string;
  lang?: string;
  provider?: string;
}

export interface ChatResponse {
  reply: string;
  source_doc?: string;
  source_section?: string;
  source_url?: string;
  confidence: number;
  can_escalate: boolean;
  provider: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  sourceDoc?: string;
  sourceSection?: string;
  provider?: string;
  isActionWarning?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AiService {
  private api = inject(ApiService);
  private readonly GEMINI_KEY_STORAGE = 'janamen_gemini_key';

  sendMessage(message: string, apiKey?: string, lang: string = 'ru'): Observable<ChatResponse> {
    const payload: ChatRequest = {
      message,
      api_key: apiKey || this.getStoredApiKey(),
      lang
    };
    return this.api.post<ChatResponse>('/ai/chat', payload);
  }

  getStoredApiKey(): string {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(this.GEMINI_KEY_STORAGE) || '';
    }
    return '';
  }

  setStoredApiKey(key: string): void {
    if (typeof localStorage !== 'undefined') {
      const cleanKey = key.trim();
      if (cleanKey) {
        localStorage.setItem(this.GEMINI_KEY_STORAGE, cleanKey);
      } else {
        localStorage.removeItem(this.GEMINI_KEY_STORAGE);
      }
    }
  }

  clearStoredApiKey(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.GEMINI_KEY_STORAGE);
    }
  }

  hasStoredApiKey(): boolean {
    return !!this.getStoredApiKey();
  }
}
