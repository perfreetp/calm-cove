import { subscribe } from '../store.js';

export abstract class Screen extends HTMLElement {
  private unsub?: () => void;
  connectedCallback(): void {
    this.unsub = subscribe(() => this.render());
    this.render();
  }
  disconnectedCallback(): void { this.unsub?.(); }
  abstract render(): void;
}
