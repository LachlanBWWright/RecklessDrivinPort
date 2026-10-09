export interface EmscriptenModuleInterface {
  canvas: HTMLCanvasElement;
  locateFile?: (path: string, scriptDirectory?: string) => string;
  print: (text: string) => void;
  printErr: (text: string) => void;
  setStatus: (status: string) => void;
  monitorRunDependencies: (left: number) => void;
  onRuntimeInitialized: () => void;
  preRun: (() => void)[];
  postRun: (() => void)[];
  _set_wasm_master_volume?: (vol: number) => void;
  _rd_set_editor_launch_options?: (
    enabled: number,
    autoStart: number,
    levelID: number,
    hasStartY: number,
    startY: number,
    hasObjectGroupStartY: number,
    objectGroupStartY: number,
    forcedAddOns: number,
    disabledBonusRollMask: number,
  ) => void;
  _rd_start_editor_test_drive?: () => void;
  _rd_set_runtime_paused?: (paused: number) => void;
  _rd_set_touch_key?: (element: number, pressed: number) => void;
  _rd_set_touch_controls_active?: (active: number) => void;
  pauseMainLoop?: () => void;
  resumeMainLoop?: () => void;
  callMain?: (args: string[]) => void;
  _main?: (argc: number, argv: number) => void;
  addRunDependency?: (id: string) => void;
  removeRunDependency?: (id: string) => void;
}

declare global {
  interface Window {
    Module?: EmscriptenModuleInterface;
  }
}
