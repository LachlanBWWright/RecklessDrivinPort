import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ReactiveFormsModule } from '@angular/forms';
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
import { MatButtonToggleModule } from '@angular/material/button-toggle';

import { App } from './app';
import { SiteToolbarComponent } from './layout/site-toolbar/site-toolbar.component';
import { GamePanelComponent } from './game/game-panel/game-panel.component';
import { EditorToolbarComponent } from './editor/toolbar/editor-toolbar.component';
import { EditorPropertiesSectionComponent } from './editor/sections/properties/editor-properties-section.component';
import { EditorObjectGroupsSectionComponent } from './editor/sections/object-groups/editor-object-groups-section.component';
import { EditorObjectTypesSectionComponent } from './editor/sections/object-types/editor-object-types-section.component';
import { EditorObjectsSectionComponent } from './editor/sections/objects/editor-objects-section.component';
import { EditorSpritesSectionComponent } from './editor/sections/sprites/editor-sprites-section.component';
import { EditorTilesSectionComponent } from './editor/sections/tiles/editor-tiles-section.component';
import { EditorAudioSectionComponent } from './editor/sections/audio/editor-audio-section.component';
import { EditorScreensSectionComponent } from './editor/sections/screens/editor-screens-section.component';
import { EditorStringsSectionComponent } from './editor/sections/strings/editor-strings-section.component';
import { EditorCanvasComponent } from './editor/editor-canvas.component';
import { MarksEditorComponent } from './editor/marks-editor.component';
import { ObjectInspectorComponent } from './editor/object-inspector.component';
import { ObjectListComponent } from './editor/object-list.component';
import { PropertiesTabComponent } from './editor/properties-tab.component';
import { SpriteEditorComponent } from './editor/sprite-editor.component';
import { MarkingPopupComponent } from './editor/canvas-toolbar/marking-popup.component';
import { CanvasInfoPopupComponent } from './editor/canvas-toolbar/canvas-info-popup.component';

const MATERIAL_MODULES = [
  MatButtonModule,
  MatIconModule,
  MatTooltipModule,
  MatInputModule,
  MatFormFieldModule,
  MatSelectModule,
  MatCardModule,
  MatToolbarModule,
  MatTabsModule,
  MatDividerModule,
  MatChipsModule,
  MatSliderModule,
  MatTableModule,
  MatBadgeModule,
  MatProgressSpinnerModule,
  MatProgressBarModule,
  MatMenuModule,
  MatSnackBarModule,
  MatDialogModule,
  MatCheckboxModule,
  MatRadioModule,
  MatExpansionModule,
  MatListModule,
  MatSidenavModule,
  MatGridListModule,
  MatButtonToggleModule,
];

@NgModule({
  declarations: [
    App,
    SiteToolbarComponent,
    GamePanelComponent,
    EditorToolbarComponent,
    EditorPropertiesSectionComponent,
    EditorObjectGroupsSectionComponent,
    EditorObjectTypesSectionComponent,
    EditorObjectsSectionComponent,
    EditorSpritesSectionComponent,
    EditorTilesSectionComponent,
    EditorAudioSectionComponent,
    EditorScreensSectionComponent,
    EditorStringsSectionComponent,
    EditorCanvasComponent,
    MarksEditorComponent,
    ObjectInspectorComponent,
    ObjectListComponent,
    PropertiesTabComponent,
    SpriteEditorComponent,
    MarkingPopupComponent,
    CanvasInfoPopupComponent,
  ],
  imports: [
    BrowserModule,
    CommonModule,
    BrowserAnimationsModule,
    ReactiveFormsModule,
    ...MATERIAL_MODULES,
  ],
  providers: [provideBrowserGlobalErrorListeners()],
  bootstrap: [App],
})
export class AppModule {}
