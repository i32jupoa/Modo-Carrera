/**
 * Utilidades de rendimiento y optimizacion
 * Asegura que el sistema de transferencias mantenga un rendimiento optimo
 */

// ============================================================================
// MONITOREO DE RENDIMIENTO
// ============================================================================

/**
 * Mide el tiempo de ejecucion de una funcion
 * @param fn - Funcion a medir
 * @param label - Etiqueta para identificar la medicion
 * @returns Resultado de la funcion con tiempo de ejecucion
 */
export function measurePerformance<T>(
  fn: () => T,
  label: string
): { result: T; duration: number } {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  const duration = end - start;
  
  console.log(`[Performance] ${label}: ${duration.toFixed(2)}ms`);
  
  if (duration > 100) {
    console.warn(`[Performance] ${label} took ${duration.toFixed(2)}ms - consider optimization`);
  }
  
  return { result, duration };
}

/**
 * Mide el tiempo de ejecucion de una funcion asincrona
 * @param fn - Funcion asincrona a medir
 * @param label - Etiqueta para identificar la medicion
 * @returns Resultado de la funcion con tiempo de ejecucion
 */
export async function measureAsyncPerformance<T>(
  fn: () => Promise<T>,
  label: string
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  const duration = end - start;
  
  console.log(`[Performance] ${label}: ${duration.toFixed(2)}ms`);
  
  if (duration > 500) {
    console.warn(`[Performance] ${label} took ${duration.toFixed(2)}ms - consider optimization`);
  }
  
  return { result, duration };
}

// ============================================================================
// OPTIMIZACIONES DE COLECCIONES
// ============================================================================

/**
 * Crea un indice para busquedas rapidas
 * @param items - Items a indexar
 * @param keyFn - Funcion para extraer la clave
 * @returns Mapa de clave a items
 */
export function createIndex<T, K>(
  items: T[],
  keyFn: (item: T) => K
): Map<K, T[]> {
  const index = new Map<K, T[]>();
  
  for (const item of items) {
    const key = keyFn(item);
    if (!index.has(key)) {
      index.set(key, []);
    }
    index.get(key)!.push(item);
  }
  
  return index;
}

/**
 * Filtra un array usando un indice para evitar O(n^2)
 * @param items - Items a filtrar
 * @param index - Indice precalculado
 * @param key - Clave a buscar
 * @returns Items filtrados
 */
export function filterByIndex<T, K>(
  items: T[],
  index: Map<K, T[]>,
  key: K
): T[] {
  return index.get(key) || [];
}

/**
 * Procesa items en lotes para evitar bloquear el hilo principal
 * @param items - Items a procesar
 * @param processor - Funcion de procesamiento
 * @param batchSize - Tamano del lote
 * @returns Resultados procesados
 */
export async function processInBatches<T, R>(
  items: T[],
  processor: (item: T) => R,
  batchSize: number = 50
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = batch.map(processor);
    results.push(...batchResults);
    
    // Permitir que el hilo principal respire
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  return results;
}

/**
 * Desduplica un array usando Set para O(n) en lugar de O(n^2)
 * @param items - Items a desduplicar
 * @returns Items desduplicados
 */
export function deduplicate<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

/**
 * Interseccion de dos arrays usando Set para O(n) en lugar de O(n^2)
 * @param arr1 - Primer array
 * @param arr2 - Segundo array
 * @returns Interseccion
 */
export function intersection<T>(arr1: T[], arr2: T[]): T[] {
  const set2 = new Set(arr2);
  return arr1.filter(item => set2.has(item));
}

/**
 * Diferencia de dos arrays usando Set para O(n) en lugar de O(n^2)
 * @param arr1 - Primer array
 * @param arr2 - Segundo array
 * @returns Diferencia (items en arr1 que no estan en arr2)
 */
export function difference<T>(arr1: T[], arr2: T[]): T[] {
  const set2 = new Set(arr2);
  return arr1.filter(item => !set2.has(item));
}

// ============================================================================
// CACHE INTELIGENTE
// ============================================================================

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  hits: number;
}

/**
 * Cache con TTL y estadisticas
 */
export class SmartCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private ttl: number;
  private maxSize: number;
  
  constructor(ttl: number = 60000, maxSize: number = 1000) {
    this.ttl = ttl;
    this.maxSize = maxSize;
  }
  
  /**
   * Obtiene un valor del cache
   * @param key - Clave
   * @returns Valor o null
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Verificar TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    entry.hits++;
    return entry.value;
  }
  
  /**
   * Establece un valor en el cache
   * @param key - Clave
   * @param value - Valor
   */
  set(key: string, value: T): void {
    // Evitar overflow del cache
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      hits: 0,
    });
  }
  
  /**
   * Elimina la entrada menos usada recientemente
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Infinity;
    let lruHits = Infinity;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.hits < lruHits || (entry.hits === lruHits && entry.timestamp < lruTime)) {
        lruKey = key;
        lruTime = entry.timestamp;
        lruHits = entry.hits;
      }
    }
    
    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }
  
  /**
   * Limpia el cache
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Obtiene estadisticas del cache
   * @returns Estadisticas
   */
  getStats(): { size: number; hits: number; hitRate: number } {
    let totalHits = 0;
    for (const entry of this.cache.values()) {
      totalHits += entry.hits;
    }
    
    return {
      size: this.cache.size,
      hits: totalHits,
      hitRate: this.cache.size > 0 ? totalHits / this.cache.size : 0,
    };
  }
}

// ============================================================================
// THROTTLING Y DEBOUNCING
// ============================================================================

/**
 * Crea una funcion throttled
 * @param fn - Funcion a throttlear
 * @param delay - Retraso en ms
 * @returns Funcion throttled
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: NodeJS.Timeout | null = null;
  
  return function(this: any, ...args: Parameters<T>) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    
    if (timeSinceLastCall >= delay) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCall = now;
      fn.apply(this, args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        fn.apply(this, args);
      }, delay - timeSinceLastCall);
    }
  };
}

/**
 * Crea una funcion debounced
 * @param fn - Funcion a debouncear
 * @param delay - Retraso en ms
 * @returns Funcion debounced
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return function(this: any, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn.apply(this, args);
    }, delay);
  };
}

// ============================================================================
// UTILIDADES DE OPTIMIZACION
// ============================================================================

/**
 * Verifica si una operacion es O(n^2)
 * @param n - Tamano de entrada
 * @param operations - Numero de operaciones
 * @returns Si es O(n^2)
 * @returns Si es O(n²)
 */
export function isQuadratic(n: number, operations: number): boolean {
  const expectedLinear = n;
  const expectedQuadratic = n * n;
  
  // Si las operaciones están cerca de n², es cuadrático
  return Math.abs(operations - expectedQuadratic) < Math.abs(operations - expectedLinear);
}

/**
 * Estima la complejidad de una operación
 * @param sizes - Array de tamaños de entrada
 * @param times - Array de tiempos correspondientes
 * @returns Complejidad estimada ('O(1)', 'O(n)', 'O(n²)', 'O(n log n)')
 */
export function estimateComplexity(
  sizes: number[],
  times: number[]
): 'O(1)' | 'O(n)' | 'O(n²)' | 'O(n log n)' {
  if (sizes.length < 2) return 'O(1)';
  
  const ratios = times.map((t, i) => {
    if (i === 0) return 0;
    const sizeRatio = sizes[i] / sizes[i - 1];
    const timeRatio = t / times[i - 1];
    return timeRatio / sizeRatio;
  });
  
  const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  
  if (avgRatio < 1.5) return 'O(1)';
  if (avgRatio < 2.5) return 'O(n)';
  if (avgRatio < 4) return 'O(n log n)';
  return 'O(n²)';
}

/**
 * Memoiza una función con un caché simple
 * @param fn - Función a memoizar
 * @returns Función memoizada
 */
export function memoize<T extends (...args: any[]) => any>(fn: T): T {
  const cache = new Map<string, ReturnType<T>>();
  
  return function(this: any, ...args: Parameters<T>): ReturnType<T> {
    const key = JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    
    const result = fn.apply(this, args);
    cache.set(key, result);
    
    return result;
  } as T;
}

/**
 * Memoiza una función con límite de caché
 * @param fn - Función a memoizar
 * @param maxSize - Tamaño máximo del caché
 * @returns Función memoizada
 */
export function memoizeWithLimit<T extends (...args: any[]) => any>(
  fn: T,
  maxSize: number = 100
): T {
  const cache = new Map<string, ReturnType<T>>();
  
  return function(this: any, ...args: Parameters<T>): ReturnType<T> {
    const key = JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    
    if (cache.size >= maxSize) {
      const firstKey = cache.keys().next().value;
      if (firstKey) {
        cache.delete(firstKey);
      }
    }
    
    const result = fn.apply(this, args);
    cache.set(key, result);
    
    return result;
  } as T;
}
