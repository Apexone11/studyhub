/* ═══════════════════════════════════════════════════════════════════════════
 * plagiarism.js — Enhanced plagiarism detection and content scanning
 *
 * Provides:
 *   - hammingDistance(): Calculate Hamming distance between two simhash values
 *   - findSimilarSheets(): Find sheets with similar content using simhash
 *   - runPlagiarismScan(): Full scan across all published sheets, cluster similar content
 *
 * Uses simhash fingerprints stored in StudySheet.contentSimhash for efficient
 * similarity detection. Hamming distance < threshold indicates similar content.
 *
 * Similarity = (1 - distance/64) * 100 %
 * Default threshold: 10 bits different = ~85% similar
 * ═══════════════════════════════════════════════════════════════════════════ */

const { captureError } = require('../monitoring/sentry')
const prisma = require('./prisma')

/**
 * Calculate Hamming distance between two 64-bit simhash values (hex encoded).
 * Lower distance = more similar content.
 *
 * @param {string} hash1 - First simhash as hex string (16 chars)
 * @param {string} hash2 - Second simhash as hex string (16 chars)
 * @returns {number} Hamming distance (0-64 for 64-bit simhash)
 */
function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2) return 64
  try {
    const a = BigInt('0x' + hash1)
    const b = BigInt('0x' + hash2)
    let xor = a ^ b
    let dist = 0
    while (xor > 0n) {
      dist += Number(xor & 1n)
      xor >>= 1n
    }
    return dist
  } catch (err) {
    captureError(err, { context: 'hamming-distance', hash1, hash2 })
    return 64
  }
}

/**
 * Calculate similarity percentage between two simhash values.
 *
 * @param {number} distance - Hamming distance
 * @returns {number} Similarity percentage (0-100)
 */
function calculateSimilarity(distance) {
  return Math.round((1 - distance / 64) * 10000) / 100
}

/**
 * Find sheets with similar content to a given sheet.
 * Uses simhash comparison with configurable threshold.
 *
 * @param {number} sheetId - Sheet ID to compare against
 * @param {number} [threshold=10] - Hamming distance threshold (bits different)
 * @returns {Promise<Array>} Array of similar sheets:
 *          [{ sheetId, title, userId, username, similarity, distance }]
 */
async function findSimilarSheets(sheetId, threshold = 10) {
  try {
    /* Get the target sheet's simhash */
    const targetSheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        title: true,
        userId: true,
        contentSimhash: true,
        status: true,
      },
    })

    if (!targetSheet || !targetSheet.contentSimhash) {
      return []
    }

    /* Fetch all other published sheets with non-null contentSimhash */
    const allSheets = await prisma.studySheet.findMany({
      where: {
        NOT: { id: sheetId },
        status: 'published',
        contentSimhash: { not: null },
      },
      select: {
        id: true,
        title: true,
        userId: true,
        contentSimhash: true,
        author: { select: { id: true, username: true } },
      },
    })

    /* Compare Hamming distance and filter by threshold */
    const similar = []
    for (const sheet of allSheets) {
      const distance = hammingDistance(targetSheet.contentSimhash, sheet.contentSimhash)
      if (distance <= threshold) {
        similar.push({
          sheetId: sheet.id,
          title: sheet.title,
          userId: sheet.userId,
          username: sheet.author?.username || 'Unknown',
          similarity: calculateSimilarity(distance),
          distance,
        })
      }
    }

    /* Sort by similarity descending (most similar first) */
    similar.sort((a, b) => b.similarity - a.similarity)

    return similar
  } catch (err) {
    captureError(err, { context: 'find-similar-sheets', sheetId, threshold })
    return []
  }
}

/**
 * Run a full plagiarism scan across all published sheets.
 * Groups sheets into similarity clusters based on simhash comparison.
 *
 * Uses union-find (disjoint set) algorithm to efficiently build clusters.
 *
 * @param {number} [threshold=10] - Hamming distance threshold for clustering
 * @returns {Promise<Array>} Clusters sorted by size (largest first):
 *          [{ sheets: [...], avgDistance, clusterSize }]
 */
async function runPlagiarismScan(threshold = 10) {
  try {
    /* Fetch all published sheets with non-null contentSimhash */
    const sheets = await prisma.studySheet.findMany({
      where: {
        status: 'published',
        contentSimhash: { not: null },
      },
      select: {
        id: true,
        title: true,
        userId: true,
        contentSimhash: true,
        author: { select: { id: true, username: true } },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (sheets.length === 0) {
      return []
    }

    /* Union-Find data structure for clustering */
    const parent = new Map()
    const rank = new Map()

    function find(x) {
      if (!parent.has(x)) {
        parent.set(x, x)
        rank.set(x, 0)
      }
      if (parent.get(x) !== x) {
        parent.set(x, find(parent.get(x)))
      }
      return parent.get(x)
    }

    function union(x, y) {
      const px = find(x)
      const py = find(y)
      if (px === py) return
      const rx = rank.get(px)
      const ry = rank.get(py)
      if (rx < ry) {
        parent.set(px, py)
      } else if (rx > ry) {
        parent.set(py, px)
      } else {
        parent.set(py, px)
        rank.set(px, rx + 1)
      }
    }

    /* Build clusters by comparing all pairs */
    for (let i = 0; i < sheets.length; i++) {
      for (let j = i + 1; j < sheets.length; j++) {
        const distance = hammingDistance(sheets[i].contentSimhash, sheets[j].contentSimhash)
        if (distance <= threshold) {
          union(sheets[i].id, sheets[j].id)
        }
      }
    }

    /* Group sheets by cluster root */
    const clusters = new Map()
    for (const sheet of sheets) {
      const root = find(sheet.id)
      if (!clusters.has(root)) {
        clusters.set(root, [])
      }
      clusters.get(root).push(sheet)
    }

    /* Convert to result format and calculate avg distance */
    const result = []
    for (const [, clusterSheets] of clusters) {
      if (clusterSheets.length > 1) {
        /* Calculate average pairwise distance within cluster */
        let totalDistance = 0
        let pairCount = 0
        for (let i = 0; i < clusterSheets.length; i++) {
          for (let j = i + 1; j < clusterSheets.length; j++) {
            const dist = hammingDistance(
              clusterSheets[i].contentSimhash,
              clusterSheets[j].contentSimhash,
            )
            totalDistance += dist
            pairCount += 1
          }
        }
        const avgDistance = pairCount > 0 ? totalDistance / pairCount : 0

        result.push({
          sheets: clusterSheets.map((s) => ({
            sheetId: s.id,
            title: s.title,
            userId: s.userId,
            username: s.author?.username || 'Unknown',
            createdAt: s.createdAt,
          })),
          avgDistance: Math.round(avgDistance * 100) / 100,
          clusterSize: clusterSheets.length,
        })
      }
    }

    /* Sort by cluster size (largest first) */
    result.sort((a, b) => b.clusterSize - a.clusterSize)

    return result
  } catch (err) {
    captureError(err, { context: 'plagiarism-scan', threshold })
    return []
  }
}

module.exports = {
  hammingDistance,
  calculateSimilarity,
  findSimilarSheets,
  runPlagiarismScan,
}
