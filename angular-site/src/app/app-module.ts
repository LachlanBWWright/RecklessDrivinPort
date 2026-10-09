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
import { SiteToolbarEditorActionsComponent } from './layout/site-toolbar/site-toolbar-editor-actions.component';
import { SiteToolbarDialogsComponent } from './layout/site-toolbar/site-toolbar-dialogs.component';
import { SiteToolbarMergeDialogComponent } from './layout/site-toolbar/site-toolbar-merge-dialog.component';
import { SiteToolbarPreviewDialogComponent } from './layout/site-toolbar/site-toolbar-preview-dialog.component';
import { SiteToolbarDownloadDialogComponent } from './layout/site-toolbar/site-toolbar-download-dialog.component';
import { SiteToolbarLevelSelectorComponent } from './layout/site-toolbar/site-toolbar-level-selector.component';
import { SiteToolbarMergeOptionsComponent } from './layout/site-toolbar/site-toolbar-merge-options.component';
import { SiteToolbarMergeLevelsComponent } from './layout/site-toolbar/site-toolbar-merge-levels.component';
import { GamePanelComponent } from './game/game-panel/game-panel.component';
import { GameCustomisationsComponent } from './game/game-panel/game-customisations.component';
import { GameCustomOptionsSelectComponent } from './game/game-panel/game-custom-options-select.component';
import { EditorToolbarComponent } from './editor/toolbar/editor-toolbar.component';
import { EditorToolbarActionsComponent } from './editor/toolbar/editor-toolbar-actions.component';
import { EditorToolbarLevelButtonsComponent } from './editor/toolbar/editor-toolbar-level-buttons.component';
import { EditorSidebarComponent } from './editor/editor-sidebar.component';
import { EditorSidebarScrollComponent } from './editor/editor-sidebar-scroll.component';
import { EditorPropertiesSectionComponent } from './editor/sections/properties/editor-properties-section.component';
import { EditorObjectGroupsSectionComponent } from './editor/sections/object-groups/editor-object-groups-section.component';
import { EditorObjectGroupEntryComponent } from './editor/sections/object-groups/editor-object-group-entry.component';
import { EditorObjectGroupEntryDirectionComponent } from './editor/sections/object-groups/editor-object-group-entry-direction.component';
import { EditorObjectGroupSlotComponent } from './editor/sections/objects/editor-object-group-slot.component';
import { EditorObjectGroupSlotDetailComponent } from './editor/sections/objects/editor-object-group-slot-detail.component';
import { EditorObjectGroupSlotHeaderComponent } from './editor/sections/objects/editor-object-group-slot-header.component';
import { EditorObjectGroupSlotPreviewComponent } from './editor/sections/objects/editor-object-group-slot-preview.component';
import { EditorObjectGroupSlotGroupComponent } from './editor/sections/objects/editor-object-group-slot-group.component';
import { EditorObjectGroupEntriesComponent } from './editor/sections/objects/editor-object-group-entries.component';
import { EditorObjectGroupTypeSelectComponent } from './editor/sections/object-groups/editor-object-group-type-select.component';
import { EditorObjectGroupsBodyComponent } from './editor/sections/object-groups/editor-object-groups-body.component';
import { EditorObjectTypesSectionComponent } from './editor/sections/object-types/editor-object-types-section.component';
import { EditorObjectTypeDetailComponent } from './editor/sections/object-types/editor-object-type-detail.component';
import { EditorObjectTypesListComponent } from './editor/sections/object-types/editor-object-types-list.component';
import { EditorObjectTypeEmptyComponent } from './editor/sections/object-types/editor-object-type-empty.component';
import { EditorObjectTypeScriptingComponent } from './editor/sections/object-types/editor-object-type-scripting.component';
import { EditorObjectTypeScriptDiagnosticsComponent } from './editor/sections/object-types/editor-object-type-script-diagnostics.component';
import { EditorScriptHooksComponent } from './editor/sections/object-types/editor-script-hooks.component';
import { EditorScriptIssuesComponent } from './editor/sections/object-types/editor-script-issues.component';
import { EditorReferenceCustomOptionComponent } from './editor/sections/object-types/editor-reference-custom-option.component';
import { EditorObjectTypeReferencesComponent } from './editor/sections/object-types/editor-object-type-references.component';
import { EditorObjectTypeCoreFieldsComponent } from './editor/sections/object-types/editor-object-type-core-fields.component';
import { EditorObjectTypePreviewComponent } from './editor/sections/object-types/editor-object-type-preview.component';
import { EditorObjectTypeFrameSelectComponent } from './editor/sections/object-types/editor-object-type-frame-select.component';
import { EditorObjectsSectionComponent } from './editor/sections/objects/editor-objects-section.component';
import { EditorObjectsCanvasPanelComponent } from './editor/sections/objects/editor-objects-canvas-panel.component';
import { EditorObjectsGroupsPanelComponent } from './editor/sections/objects/editor-objects-groups-panel.component';
import { EditorObjectsSidebarComponent } from './editor/sections/objects/editor-objects-sidebar.component';
import { EditorSpritesSectionComponent } from './editor/sections/sprites/editor-sprites-section.component';
import { EditorSpriteSidebarComponent } from './editor/sections/sprites/editor-sprite-sidebar.component';
import { EditorScreenSidebarComponent } from './editor/sections/screens/editor-screen-sidebar.component';
import { EditorSpriteSelectionPanelComponent } from './editor/sections/sprites/editor-sprite-selection-panel.component';
import { EditorScreenSelectionPanelComponent } from './editor/sections/screens/editor-screen-selection-panel.component';
import { EditorTilesSectionComponent } from './editor/sections/tiles/editor-tiles-section.component';
import { EditorTilesSidebarComponent } from './editor/sections/tiles/editor-tiles-sidebar.component';
import { EditorRoadInfoRowComponent } from './editor/sections/tiles/editor-road-info-row.component';
import { EditorTileRowComponent } from './editor/sections/tiles/editor-tile-row.component';
import { EditorTilesSidebarListsComponent } from './editor/sections/tiles/editor-tiles-sidebar-lists.component';
import { EditorTilesDetailPanelComponent } from './editor/sections/tiles/editor-tiles-detail-panel.component';
import { EditorTextureSelectComponent } from './editor/sections/tiles/editor-texture-select.component';
import { EditorRoadTextureEditorComponent } from './editor/sections/tiles/editor-road-texture-editor.component';
import { EditorRoadSkidSoundComponent } from './editor/sections/tiles/editor-road-skid-sound.component';
import { EditorAudioSectionComponent } from './editor/sections/audio/editor-audio-section.component';
import { EditorAudioSidebarComponent } from './editor/sections/audio/editor-audio-sidebar.component';
import { EditorAudioDetailComponent } from './editor/sections/audio/editor-audio-detail.component';
import { EditorScreensSectionComponent } from './editor/sections/screens/editor-screens-section.component';
import { EditorScreenListItemComponent } from './editor/sections/screens/editor-screen-list-item.component';
import { EditorSpriteListItemComponent } from './editor/sections/sprites/editor-sprite-list-item.component';
import { EditorSpriteDetailsComponent } from './editor/sections/sprites/editor-sprite-details.component';
import { EditorScreenDetailsComponent } from './editor/sections/screens/editor-screen-details.component';
import { EditorStringsSectionComponent } from './editor/sections/strings/editor-strings-section.component';
import { EditorStringsBodyComponent } from './editor/sections/strings/editor-strings-body.component';
import { EditorCanvasComponent } from './editor/editor-canvas.component';
import { EditorCanvasToolbarComponent } from './editor/editor-canvas-toolbar.component';
import { EditorCanvasObjectTypeSelectComponent } from './editor/editor-canvas-object-type-select.component';
import { EditorCanvasRoadControlsComponent } from './editor/editor-canvas-road-controls.component';
import { EditorCanvasRoadInfoControlComponent } from './editor/editor-canvas-road-info-control.component';
import { EditorResourceStatusCardsComponent } from './editor/editor-resource-status-cards.component';
import { EditorRoadOptionPreviewComponent } from './editor/editor-road-option-preview.component';
import { EditorCanvasTimeControlComponent } from './editor/editor-canvas-time-control.component';
import { MarksEditorComponent } from './editor/marks-editor.component';
import { ObjectInspectorComponent } from './editor/object-inspector.component';
import { ObjectTypeSelectorComponent } from './editor/object-type-selector.component';
import { ObjectListComponent } from './editor/object-list.component';
import { PropertiesTabComponent } from './editor/properties-tab.component';
import { PropertiesScriptSelectComponent } from './editor/properties-script-select.component';
import { PropertiesGroupSpritePreviewComponent } from './editor/properties-group-sprite-preview.component';
import { ObjectTypePreviewComponent } from './editor/object-type-preview.component';
import { ObjectTypeDimensionBadgeComponent } from './editor/object-type-dimension-badge.component';
import { EditorTileThumbnailComponent } from './editor/editor-tile-thumbnail.component';
import { EditorObjectEntryThumbnailComponent } from './editor/editor-object-entry-thumbnail.component';
import { PropertiesObjectGroupSelectorComponent } from './editor/properties-object-group-selector.component';
import { LevelScriptingPanelComponent } from './editor/level-scripting-panel.component';
import { RoadInfoFormComponent } from './editor/road-info-form.component';
import { RoadInfoFieldComponent } from './editor/road-info-field.component';
import { RoadInfoSelectorComponent } from './editor/road-info-selector.component';
import { RoadInfoSelectControlComponent } from './editor/road-info-select-control.component';
import { RoadInfoSelectTriggerComponent } from './editor/road-info-select-trigger.component';
import { RoadInfoOptionContentComponent } from './editor/road-info-option-content.component';
import { SpriteEditorComponent } from './editor/sprite-editor.component';
import { SpriteToolButtonsComponent } from './editor/sprite-tool-buttons.component';
import { SpritePaletteSwatchesComponent } from './editor/sprite-palette-swatches.component';
import { SpriteZoomControlsComponent } from './editor/sprite-zoom-controls.component';
import { SpriteHistoryButtonsComponent } from './editor/sprite-history-buttons.component';
import { MarkingPopupComponent } from './editor/canvas-toolbar/marking-popup.component';
import { CanvasInfoPopupComponent } from './editor/canvas-toolbar/canvas-info-popup.component';
import { ImagePreviewComponent } from './editor/image-preview/image-preview.component';
import { EditorSoundOptionComponent } from './editor/editor-sound-option.component';
import { EditorAudioEntryComponent } from './editor/editor-audio-entry.component';
import { EditorObjectListRowComponent } from './editor/editor-object-list-row.component';
import { EditorObjectTypeOptionComponent } from './editor/editor-object-type-option.component';
import { EditorInspectorPreviewComponent } from './editor/editor-inspector-preview.component';
import { SpriteCanvasComponent } from './editor/sprite-canvas.component';
import { EditorCanvasTypeOptionComponent } from './editor/editor-canvas-type-option.component';
import { SpriteBrushControlsComponent } from './editor/sprite-brush-controls.component';
import { EditorDirectionIndicatorComponent } from './editor/editor-direction-indicator.component';
import { PropertiesLevelScriptFieldComponent } from './editor/properties-level-script-field.component';
import { EditorObjectGroupEntriesListComponent } from './editor/sections/object-groups/editor-object-group-entries-list.component';
import { PropertiesSlotLabelComponent } from './editor/properties-slot-label.component';
import { SpriteActionButtonsComponent } from './editor/sprite-action-buttons.component';
import { EditorObjectGroupListItemComponent } from './editor/sections/object-groups/editor-object-group-list-item.component';
import { EditorInfoButtonComponent } from './editor/editor-info-button.component';
import { EditorDetailCardComponent } from './editor/editor-detail-card.component';

export const MATERIAL_MODULES = [
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

export const APP_DECLARATIONS = [
  App,
  SiteToolbarComponent,
  SiteToolbarEditorActionsComponent,
  SiteToolbarDialogsComponent,
  SiteToolbarMergeDialogComponent,
  SiteToolbarPreviewDialogComponent,
  SiteToolbarDownloadDialogComponent,
  SiteToolbarLevelSelectorComponent,
  SiteToolbarMergeOptionsComponent,
  SiteToolbarMergeLevelsComponent,
  GamePanelComponent,
  GameCustomisationsComponent,
  GameCustomOptionsSelectComponent,
  EditorToolbarComponent,
  EditorToolbarActionsComponent,
  EditorToolbarLevelButtonsComponent,
  EditorSidebarComponent,
  EditorSidebarScrollComponent,
  EditorPropertiesSectionComponent,
  EditorObjectGroupsSectionComponent,
  EditorObjectGroupEntryComponent,
  EditorObjectGroupEntryDirectionComponent,
  EditorObjectGroupSlotComponent,
  EditorObjectGroupSlotDetailComponent,
  EditorObjectGroupSlotHeaderComponent,
  EditorObjectGroupSlotPreviewComponent,
  EditorObjectGroupSlotGroupComponent,
  EditorObjectGroupEntriesComponent,
  EditorObjectGroupTypeSelectComponent,
  EditorObjectGroupsBodyComponent,
  EditorObjectTypesSectionComponent,
  EditorObjectTypeDetailComponent,
  EditorObjectTypesListComponent,
  EditorObjectTypeEmptyComponent,
  EditorObjectTypeScriptingComponent,
  EditorObjectTypeScriptDiagnosticsComponent,
  EditorScriptHooksComponent,
  EditorScriptIssuesComponent,
  EditorReferenceCustomOptionComponent,
  EditorObjectTypeReferencesComponent,
  EditorObjectTypeCoreFieldsComponent,
  EditorObjectTypePreviewComponent,
  EditorObjectTypeFrameSelectComponent,
  EditorDetailCardComponent,
  EditorObjectsSectionComponent,
  EditorObjectsCanvasPanelComponent,
  EditorObjectsGroupsPanelComponent,
  EditorObjectsSidebarComponent,
  EditorSpritesSectionComponent,
  EditorSpriteSidebarComponent,
  EditorScreenSidebarComponent,
  EditorSpriteSelectionPanelComponent,
  EditorScreenSelectionPanelComponent,
  EditorTilesSectionComponent,
  EditorTilesSidebarComponent,
  EditorRoadInfoRowComponent,
  EditorTileRowComponent,
  EditorTilesSidebarListsComponent,
  EditorTilesDetailPanelComponent,
  EditorTextureSelectComponent,
  EditorRoadTextureEditorComponent,
  EditorRoadSkidSoundComponent,
  EditorAudioSectionComponent,
  EditorAudioSidebarComponent,
  EditorAudioDetailComponent,
  EditorScreensSectionComponent,
  EditorScreenListItemComponent,
  EditorSpriteListItemComponent,
  EditorSpriteDetailsComponent,
  EditorScreenDetailsComponent,
  EditorStringsSectionComponent,
  EditorStringsBodyComponent,
  EditorCanvasComponent,
  EditorCanvasToolbarComponent,
  EditorCanvasObjectTypeSelectComponent,
  EditorCanvasRoadControlsComponent,
  EditorCanvasRoadInfoControlComponent,
  EditorResourceStatusCardsComponent,
  EditorRoadOptionPreviewComponent,
  EditorCanvasTimeControlComponent,
  MarksEditorComponent,
  ObjectInspectorComponent,
  ObjectTypeSelectorComponent,
  ObjectListComponent,
  PropertiesTabComponent,
  PropertiesScriptSelectComponent,
  PropertiesGroupSpritePreviewComponent,
  ObjectTypePreviewComponent,
  ObjectTypeDimensionBadgeComponent,
  EditorTileThumbnailComponent,
  EditorObjectEntryThumbnailComponent,
  PropertiesObjectGroupSelectorComponent,
  LevelScriptingPanelComponent,
  RoadInfoFormComponent,
  RoadInfoFieldComponent,
  RoadInfoSelectorComponent,
  RoadInfoSelectControlComponent,
  RoadInfoSelectTriggerComponent,
  RoadInfoOptionContentComponent,
  SpriteEditorComponent,
  SpriteToolButtonsComponent,
  SpritePaletteSwatchesComponent,
  SpriteZoomControlsComponent,
  SpriteHistoryButtonsComponent,
  MarkingPopupComponent,
  CanvasInfoPopupComponent,
  ImagePreviewComponent,
  EditorSoundOptionComponent,
  EditorAudioEntryComponent,
  EditorObjectListRowComponent,
  EditorObjectTypeOptionComponent,
  EditorInspectorPreviewComponent,
  SpriteCanvasComponent,
  EditorCanvasTypeOptionComponent,
  SpriteBrushControlsComponent,
  EditorDirectionIndicatorComponent,
  PropertiesLevelScriptFieldComponent,
  EditorObjectGroupEntriesListComponent,
  PropertiesSlotLabelComponent,
  SpriteActionButtonsComponent,
  EditorObjectGroupListItemComponent,
  EditorInfoButtonComponent,
];

@NgModule({
  declarations: APP_DECLARATIONS,
  imports: [
    BrowserModule,
    CommonModule,
    BrowserAnimationsModule,
    ReactiveFormsModule,
    ...MATERIAL_MODULES,
  ],
  exports: [SiteToolbarComponent, GamePanelComponent, ...MATERIAL_MODULES],
  providers: [provideBrowserGlobalErrorListeners()],
  bootstrap: [App],
})
export class AppModule {}
