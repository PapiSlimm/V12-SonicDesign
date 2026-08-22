export type Tool = 'move' | 'brush' | 'eraser' | 'marquee' | 'lasso' | 'clone-stamp' | 'healing-brush' | 'hand' | 'zoom' | 'crop' | 'chroma-key' | 'text-animator' | 'motion-path' | 'pen' | 'gradient' | 'color-picker' | 'text' | 'eyedropper';

export interface ColorPoint {
  x: number; // Input 0-255
  y: number; // Output 0-255
}

export interface CurvesAdjustment {
  rgb: ColorPoint[];   // Master curve
  red: ColorPoint[];   // Red channel
  green: ColorPoint[]; // Green channel
  blue: ColorPoint[];  // Blue channel
}

export interface Keyframe {
  time: number; // in seconds
  value: number | string | object;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bezier' | 'snap' | 'bounce';
  bezierPoints?: { cp1: { x: number, y: number }, cp2: { x: number, y: number } };
}

export interface AnimationProperty {
  keyframes: Keyframe[];
  currentValue: number | string | object;
}

export interface ChromaKeySettings {
  enabled: boolean;
  targetColor: string; // Hex color
  similarity: number; // 0-100
  smoothness: number; // 0-100
  spillSuppression: number; // 0-100
  edgeFeather: number; // 0-100
}

export interface MotionPath {
  id: string;
  points: { x: number, y: number }[];
  closed: boolean;
}

export interface Adjustments {
  brightness: number; // 0 to 200
  contrast: number;   // 0 to 200
  saturation: number; // 0 to 200
  hue: number;        // -180 to 180
  opacity: number;    // 0 to 1
  curves?: CurvesAdjustment;
  chromaKey?: ChromaKeySettings;
  lut?: string; // URL to a .CUBE file
}

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';

export interface Transform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  skewX?: number;
  skewY?: number;
}

export interface ClonerSettings {
  count: number;
  mode: 'linear' | 'grid' | 'radial';
  offset: Transform;
  randomness: Transform;
  step: number; // For radial or grid spacing
}

export interface ShapeSettings {
  type: 'rectangle' | 'circle' | 'polygon';
  fill: string;
  stroke: string;
  strokeWidth: number;
  sides?: number;
}

export interface BezierPoint {
  x: number;
  y: number;
  handleIn?: { x: number; y: number };
  handleOut?: { x: number; y: number };
}

export interface VectorPathSettings {
  points: BezierPoint[];
  closed: boolean;
  stroke: string;
  strokeWidth: number;
  fill: string;
  fillEnabled: boolean;
  strokeEnabled: boolean;
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
  dashArray?: number[];
  dashOffset?: number;
  pathProgress?: number; // 0 to 1 progress for stroke animation
}

export interface ParticleSystemSettings {
  enabled: boolean;
  preset: 'sparks' | 'smoke' | 'light' | 'fireflies' | 'magic' | 'snow';
  count: number;
  speed: number;
  life: number;
  size: number;
  color: string;
  secondaryColor?: string;
  gravity: number;
  spread: number;
  blendMode?: string;
  turbulence?: number;
  emitterX?: number;
  emitterY?: number;
  rate?: number;
}

export interface ProceduralSettings {
  type: 'noise' | 'lsystem' | 'particles' | null;
  noise?: { enabled: boolean; frequency: number; amplitude: number; speed: number };
  lSystem?: { enabled: boolean; axiom: string; rules: Record<string, string>; iterations: number };
  particles?: ParticleSystemSettings;
}

export interface LayerStyleEffect {
  enabled: boolean;
  color: string;
  opacity: number;
  distance: number;
  size: number;
  angle?: number;
}

export interface LayerStyles {
  dropShadow?: LayerStyleEffect;
  innerShadow?: LayerStyleEffect;
  outerGlow?: LayerStyleEffect;
  stroke?: {
    enabled: boolean;
    color: string;
    width: number;
    opacity: number;
  };
  bevelEmboss?: {
    enabled: boolean;
    color: string;
    opacity: number;
    distance: number;
    size: number;
  };
}

export interface MotionBlurSettings {
  enabled: boolean;
  intensity: number; // 0 to 100
  shutterAngle?: number;
}

export interface AudioSettings {
  src: string;
  volume: number;
  muted: boolean;
  duration: number;
  peaks?: number[];
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  adjustments: Adjustments;
  bitmap: ImageBitmap | null;
  type: 'raster' | 'adjustment' | 'text' | '3d-text' | 'vector' | 'group' | 'cloner' | 'shape' | 'audio';
  transform: Transform;
  children?: string[];
  parentId?: string;
  colorTag?: string; // Hex color tag or preset label color (e.g. #ef4444, #f59e0b)
  maskId?: string;
  isMask?: boolean;
  motionPathId?: string;
  motionPathProgress?: number;
  animations?: Record<string, AnimationProperty>;
  proceduralSettings?: ProceduralSettings;
  clonerSettings?: ClonerSettings;
  shapeSettings?: ShapeSettings;
  vectorSettings?: VectorPathSettings;
  layerStyles?: LayerStyles;
  audioSettings?: AudioSettings;
  motionBlurSettings?: MotionBlurSettings;
  calculatedMotionBlur?: { blurPx: number; dx: number; dy: number; speed: number; blurX?: number; blurY?: number };
  content?: string;
  fontSettings?: {
    family?: string;
    size: number;
    weight?: string;
    tracking?: number;
    leading?: number;
    depth?: number;
    bevel?: number;
    bevelSegments?: number;
    color?: string;
    variableSettings?: Record<string, number>;
  };
  textAnimatorSettings?: {
    text: string;
    animationType: 'wave' | 'bounce' | 'reveal' | 'glitch';
    range: { start: number; end: number };
    offset: number;
    smoothness: number;
    speed: number;
  };
}

export interface ThemeSettings {
  mode: 'light' | 'dark';
  accentColor: string;
  uiFont: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  layers: Layer[];
}

export interface Asset {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio' | '3d';
  url: string;
  folderId?: string;
}

export interface AssetFolder {
  id: string;
  name: string;
  parentId?: string;
}

export interface AppState {
  layers: Layer[];
  motionPaths: MotionPath[];
  selectedLayerId: string | null;
  selectedLayerIds: string[];
  selectedTool: Tool;
  zoom: number;
  pan: { x: number; y: number };
  brushSize: number;
  brushOpacity: number;
  brushColor: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackSpeed: number;
  history: Layer[][];
  historyIndex: number;
  theme: ThemeSettings;
  templates: ProjectTemplate[];
  assets: Asset[];
  assetFolders: AssetFolder[];
  selection: {
    type: 'marquee' | 'lasso' | null;
    points: { x: number; y: number }[];
    active: boolean;
    feather: number;
    style: 'normal' | 'fixed-ratio' | 'fixed-size';
    aspectRatio: number;
    fixedWidth: number;
    fixedHeight: number;
  };
  gradientOptions: {
    angle: number;
    type: 'linear' | 'radial' | 'conic';
    colors: string[];
  };
}
