import { Component, OnInit, Optional } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { ChatComponent } from './features/chat/chat.component';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';
import { OfflineBannerComponent } from './shared/components/offline-banner/offline-banner.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ChatComponent, ToastContainerComponent, OfflineBannerComponent],
  template: `
    <app-offline-banner></app-offline-banner>
    <router-outlet />
    <app-chat></app-chat>
    <app-toast-container />
  `
})
export class AppComponent implements OnInit {
  constructor(@Optional() private swUpdate: SwUpdate) {}

  ngOnInit(): void {
    if (this.swUpdate?.isEnabled) {
      this.swUpdate.versionUpdates.subscribe(evt => {
        if (evt.type === 'VERSION_READY') {
          this.swUpdate.activateUpdate().then(() => document.location.reload());
        }
      });
    }
  }
}
