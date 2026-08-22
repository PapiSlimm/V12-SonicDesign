import { useEffect } from 'react';
import { useStore } from '../store/index';
import { Layer } from '../core/types';

export const useProceduralAnimation = () => {
  const { layers, setLayers, currentTime, isPlaying } = useStore();

  useEffect(() => {
    if (!isPlaying) return;

    const updatedLayers = layers.map(layer => {
      if (!layer.proceduralSettings) return layer;

      const { type, noise, lSystem, particles } = layer.proceduralSettings;
      const newTransform = { ...layer.transform };
      let hasChanges = false;

      if (type === 'noise' && noise) {
        const t = currentTime * noise.speed;
        // Simple pseudo-random noise using sine waves
        const noiseX = Math.sin(t) * noise.amplitude;
        const noiseY = Math.cos(t * 1.2) * noise.amplitude;
        const noiseR = Math.sin(t * 0.8) * (noise.amplitude / 10);

        newTransform.x += noiseX;
        newTransform.y += noiseY;
        newTransform.rotation += noiseR;
        hasChanges = true;
      }

      // L-Systems and Particles would be more complex, 
      // for now we'll just implement basic noise.

      return hasChanges ? { ...layer, transform: newTransform } : layer;
    });

    // We don't want to update the store every frame for procedural animation 
    // in the same way as keyframes because it's additive.
    // In a real app, this would be handled in the rendering loop.
    // For this demo, we'll skip direct store updates here to avoid conflicts with useAnimationEngine.
  }, [currentTime, isPlaying]);
};
