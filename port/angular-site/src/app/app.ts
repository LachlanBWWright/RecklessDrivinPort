import { Component, OnInit, OnDestroy, signal } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal("Reckless Drivin' – WebAssembly Port");
  statusText = signal('Loading game data…');
  progressPct = signal(0);
  overlayVisible = signal(true);

  private wasmScript: HTMLScriptElement | null = null;

  ngOnInit(): void {
    this.setupEmscriptenModule();
    this.loadWasmScript();
  }

  ngOnDestroy(): void {
    if (this.wasmScript && this.wasmScript.parentNode) {
      this.wasmScript.parentNode.removeChild(this.wasmScript);
    }
  }

  private setupEmscriptenModule(): void {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;

    // Intercept XHR progress on the .data file
    const origOpen = XMLHttpRequest.prototype.open;
    const self = this;
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string, ...rest: any[]) {
      if (url && url.indexOf('.data') !== -1) {
        this.addEventListener('progress', (e: ProgressEvent) => {
          if (e.lengthComputable) {
            self.progressPct.set(Math.round((e.loaded / e.total) * 100));
          }
        });
      }
      origOpen.apply(this, [method, url, ...rest] as any);
    } as typeof XMLHttpRequest.prototype.open;

    (window as any)['Module'] = {
      canvas,
      print: (text: string) => console.log('[WASM]', text),
      printErr: (text: string) => console.warn('[WASM ERR]', text),
      setStatus: (text: string) => {
        if (text) {
          this.statusText.set(text);
          const m = text.match(/(\d+(?:\.\d+)?)\/(\d+)/);
          if (m) {
            this.progressPct.set(Math.round((parseFloat(m[1]) / parseFloat(m[2])) * 100));
          }
        } else {
          this.statusText.set('Running');
          this.progressPct.set(100);
          this.overlayVisible.set(false);
        }
      },
      monitorRunDependencies: (left: number) => {
        if (left === 0) this.progressPct.set(100);
      },
      onRuntimeInitialized: () => {
        this.statusText.set('Running');
        this.overlayVisible.set(false);
        console.log('[Angular] WASM runtime initialized');
      },
      preRun: [],
      postRun: [],
    };
  }

  private loadWasmScript(): void {
    this.wasmScript = document.createElement('script');
    // reckless_drivin.js lives in the same directory as index.html
    this.wasmScript.src = 'reckless_drivin.js';
    this.wasmScript.async = true;
    this.wasmScript.onerror = () => {
      this.statusText.set('Error: failed to load reckless_drivin.js');
      console.error('[Angular] Failed to load WASM JS module');
    };
    document.body.appendChild(this.wasmScript);
  }

  toggleFullscreen(): void {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      canvas.requestFullscreen().catch((err) => console.warn('Fullscreen error:', err));
    }
  }
}
