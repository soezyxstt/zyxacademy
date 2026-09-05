export function skipFlashcardInSession<T>(queue: readonly T[], currentIndex: number): T[] {
  if (queue.length - currentIndex <= 1) return [...queue];
  return [...queue.slice(0, currentIndex), ...queue.slice(currentIndex + 1), queue[currentIndex]!];
}

export function appendFlashcardRetry<T>(queue: readonly T[], item: T): T[] {
  return [...queue, item];
}
