import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatSliderModule } from '@angular/material/slider';
import { MatTableModule } from '@angular/material/table';
import { MatBadgeModule } from '@angular/material/badge';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogModule } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatGridListModule } from '@angular/material/grid-list';

import { App } from './app';
import { EditorCanvasComponent } from './editor-canvas.component';
import { ObjectInspectorComponent } from './object-inspector.component';
import { ObjectListComponent } from './object-list.component';
import { SpriteEditorComponent } from './sprite-editor.component';

const MATERIAL_MODULES = [
  MatButtonModule, MatIconModule, MatTooltipModule, MatInputModule,
  MatFormFieldModule, MatSelectModule, MatCardModule, MatToolbarModule,
  MatTabsModule, MatDividerModule, MatChipsModule, MatSliderModule,
  MatTableModule, MatBadgeModule, MatProgressSpinnerModule, MatProgressBarModule,
  MatMenuModule, MatSnackBarModule, MatDialogModule, MatCheckboxModule,
  MatRadioModule, MatExpansionModule, MatListModule, MatSidenavModule,
  MatGridListModule,
];

@NgModule({
  declarations: [App, EditorCanvasComponent, ObjectInspectorComponent, ObjectListComponent, SpriteEditorComponent],
  imports: [
    BrowserModule,
    CommonModule,
    BrowserAnimationsModule,
    FormsModule,
    ReactiveFormsModule,
    ...MATERIAL_MODULES,
  ],
  providers: [provideBrowserGlobalErrorListeners()],
  bootstrap: [App],
})
export class AppModule {}
