import { Layer, MotionPath } from '../types';

export interface RenderOptions {
  width: number;
  height: number;
  zoom: number;
  pan: { x: number; y: number };
  currentTime: number;
  selectedLayerId: string | null;
}

export class RenderEngine {
  private ctx: CanvasRenderingContext2D | null = null;
  private offscreen: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D | null;

  constructor() {
    this.offscreen = document.createElement('canvas');
    this.offscreen.width = 1920;
    this.offscreen.height = 1080;
    this.offscreenCtx = this.offscreen.getContext('2d');
  }

  public setContext(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  public render(layers: Layer[], options: RenderOptions) {
    if (!this.ctx) return;

    this.ctx.save();
    this.ctx.clearRect(0, 0, options.width, options.height);
    
    // Apply pan and zoom
    this.ctx.translate(options.pan.x, options.pan.y);
    this.ctx.scale(options.zoom, options.zoom);

    // Filter visible layers and sort by z-index (implicitly by order in array for now)
    const visibleLayers = layers.filter(l => l.visible);

    for (const layer of visibleLayers) {
      this.renderLayer(layer, options);
    }

    this.ctx.restore();
  }

  private renderLayer(layer: Layer, options: RenderOptions) {
    if (!this.ctx) return;

    this.ctx.save();
    
    // Non-destructive animations would be calculated here
    // For now, assume layer.transform already reflects current frame if animated via state
    const transform = layer.transform;
    this.ctx.translate(transform.x, transform.y);
    this.ctx.rotate((transform.rotation * Math.PI) / 180);
    this.ctx.scale(transform.scaleX, transform.scaleY);
    this.ctx.globalAlpha = layer.opacity;
    this.ctx.globalCompositeOperation = (layer.blendMode as GlobalCompositeOperation) || 'source-over';

    // Different rendering based on type
    switch (layer.type) {
      case 'raster':
        if (layer.bitmap) {
          this.ctx.drawImage(layer.bitmap, 0, 0);
        }
        break;
      case 'text':
      case '3d-text':
        this.renderText(layer);
        break;
      case 'shape':
        this.renderShape(layer);
        break;
    }

    this.ctx.restore();
  }

  private renderText(layer: Layer) {
    if (!this.ctx || !layer.fontSettings) return;
    const fs = layer.fontSettings;
    this.ctx.font = `${fs.weight} ${fs.size}px ${fs.family}`;
    this.ctx.fillStyle = fs.color;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    
    if (layer.type === '3d-text') {
      const depth = fs.depth || 10;
      for (let i = 0; i < depth; i++) {
        this.ctx.fillStyle = i === depth - 1 ? fs.color : '#000000';
        this.ctx.fillText(layer.content || '', i, -i);
      }
    } else {
      this.ctx.fillText(layer.content || '', 0, 0);
    }
  }

  private renderShape(layer: Layer) {
    if (!this.ctx || !layer.shapeSettings) return;
    const ss = layer.shapeSettings;
    this.ctx.fillStyle = ss.fill;
    this.ctx.strokeStyle = ss.stroke;
    this.ctx.lineWidth = ss.strokeWidth;

    if (ss.type === 'rectangle') {
      this.ctx.fillRect(0, 0, 200, 200);
      if (ss.strokeWidth > 0) this.ctx.strokeRect(0, 0, 200, 200);
    } else if (ss.type === 'circle') {
      this.ctx.beginPath();
      this.ctx.arc(100, 100, 100, 0, Math.PI * 2);
      this.ctx.fill();
      if (ss.strokeWidth > 0) this.ctx.stroke();
    }
  }
}

export const renderEngine = new RenderEngine();
