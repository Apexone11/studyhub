// Lightweight Web Vitals reporter using PerformanceObserver
export function reportWebVitals(onReport) {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
    return
  }

  // LCP
  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries()
      const lastEntry = entries[entries.length - 1]
      onReport({
        name: 'LCP',
        value: lastEntry.startTime,
        rating:
          lastEntry.startTime < 2500
            ? 'good'
            : lastEntry.startTime < 4000
              ? 'needs-improvement'
              : 'poor',
      })
    })
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true })
  } catch {
    /* unsupported */
  }

  // INP
  try {
    const inpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.interactionId) {
          onReport({
            name: 'INP',
            value: entry.duration,
            rating:
              entry.duration < 200 ? 'good' : entry.duration < 500 ? 'needs-improvement' : 'poor',
          })
        }
      }
    })
    inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 16 })
  } catch {
    /* unsupported */
  }

  // CLS
  try {
    let clsValue = 0
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) clsValue += entry.value
      }
      onReport({
        name: 'CLS',
        value: clsValue,
        rating: clsValue < 0.1 ? 'good' : clsValue < 0.25 ? 'needs-improvement' : 'poor',
      })
    })
    clsObserver.observe({ type: 'layout-shift', buffered: true })
  } catch {
    /* unsupported */
  }
}
