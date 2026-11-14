import { subscribe } from '../store.js';
export class Screen extends HTMLElement {
    connectedCallback() {
        this.unsub = subscribe(() => this.render());
        this.render();
    }
    disconnectedCallback() { this.unsub?.(); }
}
//# sourceMappingURL=base.js.map