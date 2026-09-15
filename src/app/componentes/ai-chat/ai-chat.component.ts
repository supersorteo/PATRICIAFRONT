import { Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiApiService } from '../../services/api/ai-api.service';

interface ChatMessage {
  role: 'user' | 'patry';
  text: string;
}

@Component({
  selector: 'app-ai-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-chat.component.html',
  styleUrls: ['./ai-chat.component.scss']
})
export class AiChatComponent {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  isOpen = false;
  question = '';
  isLoading = false;
  messages: ChatMessage[] = [
    { role: 'patry', text: '¡Hola! Soy Patry 🤖 ¿En qué te puedo ayudar con el sistema Exellssior?' }
  ];

  constructor(private aiService: AiApiService) {}

  toggleChat(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      setTimeout(() => this.scrollToBottom(), 100);
    }
  }

  sendMessage(): void {
    const trimmed = this.question.trim();
    if (!trimmed || this.isLoading) return;

    this.messages.push({ role: 'user', text: trimmed });
    this.question = '';
    this.isLoading = true;
    this.scrollToBottom();

    this.aiService.ask(trimmed).subscribe({
      next: (res) => {
        this.messages.push({ role: 'patry', text: res.answer });
        this.isLoading = false;
        this.scrollToBottom();
      },
      error: () => {
        this.messages.push({
          role: 'patry',
          text: 'No pude conectarme en este momento. Intentá de nuevo en unos segundos.'
        });
        this.isLoading = false;
        this.scrollToBottom();
      }
    });
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesContainer) {
        const el = this.messagesContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    }, 50);
  }
}
