// src/hooks/useDebounce.ts
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Configuramos el temporizador
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Si el valor cambia (el usuario sigue escribiendo), limpiamos el temporizador anterior
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}