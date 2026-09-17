import { Layer, Transform, Adjustments } from '../types';
import { uid } from './layerUtils';

export class LayerFactory {
  static createDefaultAdjustments(): Adjustments {
    return {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      hue: 0,
      opacity: 1,
      curves: {
        rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        red: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }]
      },
      chromaKey: {
        enabled: false,
        targetColor: '#00ff00',
        similarity: 30,
        smoothness: 10,
        spillSuppression: 20,
        edgeFeather: 0
      }
    };
  }

  static createDefaultTransform(x = 0, y = 0): Transform {
    return { x, y, scaleX: 1, scaleY: 1, rotation: 0 };
  }

  static createRasterLayer(name: string, bitmap: ImageBitmap | null = null): Layer {
    return {
      id: uid('layer-raster'),
      name,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      adjustments: this.createDefaultAdjustments(),
      bitmap,
      type: 'raster',
      transform: this.createDefaultTransform()
    };
  }

  static createAdjustmentLayer(name: string): Layer {
    return {
      id: uid('layer-adj'),
      name,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      adjustments: this.createDefaultAdjustments(),
      bitmap: null,
      type: 'adjustment',
      transform: this.createDefaultTransform()
    };
  }

  static createTextLayer(name: string, is3D = false, x = 200, y = 200): Layer {
    return {
      id: uid('layer-text'),
      name,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      adjustments: this.createDefaultAdjustments(),
      bitmap: null,
      type: is3D ? '3d-text' : 'text',
      transform: this.createDefaultTransform(x, y),
      content: is3D ? 'V12 3D' : 'V12SonicDesign',
      fontSettings: {
        family: 'Inter',
        size: is3D ? 96 : 48,
        weight: 'bold',
        color: is3D ? '#3b82f6' : '#ffffff',
        tracking: 0,
        leading: 1.2,
        depth: is3D ? 12 : 0,
        bevel: is3D ? 2 : 0
      }
    };
  }

  static createShapeLayer(name: string, type: 'rectangle' | 'circle' | 'polygon'): Layer {
    return {
      id: uid('layer-shape'),
      name,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      adjustments: this.createDefaultAdjustments(),
      bitmap: null,
      type: 'shape',
      transform: this.createDefaultTransform(100, 100),
      shapeSettings: {
        type,
        fill: '#3b82f6',
        stroke: '#000000',
        strokeWidth: 2
      }
    };
  }

  static createGroupLayer(name: string, children: string[] = []): Layer {
    return {
      id: uid('layer-group'),
      name,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      adjustments: this.createDefaultAdjustments(),
      bitmap: null,
      type: 'group',
      children,
      transform: this.createDefaultTransform()
    };
  }
}
