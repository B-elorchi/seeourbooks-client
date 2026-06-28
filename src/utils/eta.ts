export function calculateJobETA(
  stepsRequested: string[],
  stepsCompleted: string[],
  numChapters: number
): number {
  if (stepsRequested.length === 0) return 0
  
  let estimatedSeconds = 0

  const pending = stepsRequested.filter(s => !stepsCompleted.includes(s))
  if (pending.length === 0) return 0

  // Base heuristics (in seconds)
  for (const step of pending) {
    switch (step) {
      case 'extract':
        estimatedSeconds += 10
        break
      case 'summarize':
        // roughly 20s base + 5s per chapter (high concurrency)
        estimatedSeconds += 20 + (numChapters * 5)
        break
      case 'translate':
      case 'translate_chapters':
        // roughly 10s base + 3s per chapter
        estimatedSeconds += 10 + (numChapters * 3)
        break
      case 'review':
        estimatedSeconds += 15
        break
      case 'cover':
        estimatedSeconds += 15
        break
      case 'mindmap':
        estimatedSeconds += 20 + (numChapters * 8)
        break
      case 'audio_full':
        estimatedSeconds += 40 + (numChapters * 5)
        break
      case 'audio_chapters':
        estimatedSeconds += 20 + (numChapters * 10)
        break
      case 'epub':
        estimatedSeconds += 5
        break
      default:
        estimatedSeconds += 10
    }
  }

  return estimatedSeconds
}

export function formatETA(seconds: number): string {
  if (seconds <= 0) return ''
  if (seconds < 60) return `~ ${Math.ceil(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.ceil(seconds % 60)
  return `~ ${mins}m ${secs}s`
}
