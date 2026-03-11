import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';

import { App } from './app';
import { EditorCanvasComponent } from './editor-canvas.component';
import { ObjectInspectorComponent } from './object-inspector.component';
import { ObjectListComponent } from './object-list.component';

@NgModule({
  declarations: [App, EditorCanvasComponent, ObjectInspectorComponent, ObjectListComponent],
  imports: [BrowserModule, CommonModule],
  providers: [provideBrowserGlobalErrorListeners()],
  bootstrap: [App],
})
export class AppModule {}
