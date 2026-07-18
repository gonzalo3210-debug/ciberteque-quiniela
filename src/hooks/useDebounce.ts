// src/hooks/useDebounce.ts
import { useState, useEffect, useRef, useCallback } from 'react';

// 1. Tu hook original (basado en valor). ¡Se queda intacto para no romper nada!
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

// 2. NUEVO HOOK: (Basado en funciones). Ideal para hacer peticiones asíncronas a Supabase sin re-renderizados innecesarios.
export function useDebouncedCallback(callback: (...args: any[]) => void, delay: number) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback((...args: any[]) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]);
}