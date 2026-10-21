import { Injectable, signal, computed } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class NetworkService {
  private readonly _isOnline = signal<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  readonly isOnline = computed(() => this._isOnline());
  readonly isOffline = computed(() => !this._isOnline());

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.updateOnlineStatus(true));
      window.addEventListener('offline', () => this.updateOnlineStatus(false));
    }
  }

  private updateOnlineStatus(online: boolean) {
    this._isOnline.set(online);
  }
}
