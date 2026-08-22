import { LayerFactory } from '../core/layers/LayerFactory';
import { Layer } from '../core/types';

export const importAsset = (onSuccess: (layer: Layer) => void) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onerror = () => {
        console.error('File reading failed');
      };
      reader.onload = (event) => {
        const img = new Image();
        img.onload = async () => {
          const bitmap = await createImageBitmap(img);
          const newLayer = LayerFactory.createRasterLayer(file.name, bitmap);
          onSuccess(newLayer);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };
  input.click();
};

export const exportCanvas = (canvas: HTMLCanvasElement | null, format: 'png' | 'jpg' = 'png') => {
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = `v12-export.${format}`;
  if (format === 'jpg') {
    link.href = canvas.toDataURL('image/jpeg', 0.9);
  } else {
    link.href = canvas.toDataURL();
  }
  link.click();
};
