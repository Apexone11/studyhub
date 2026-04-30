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
 * Walk a sheet's fork lineage (ancestors + descendants + siblings) and return
 * the set of related sheet IDs. Forks are expected to share content with their
 * source, so plagiarism comparisons must exclude the entire fork tree to avoid
 * false-positive notifications when a user makes a small edit on a fork.
 *
 * Walks ancestors via forkOf chain, then BFS-expands descendants from every
 * ancestor (which yields siblings/cousins). Cycle-safe and depth-bounded.
 *
 * @param {object} db - Prisma client
 * @param {number} sheetId
 * @returns {Promise<Set<number>>} set of sheet IDs in the same fork lineage (includes sheetId)
 */
async function getForkLineageIds(db, sheetId) {
  const lineage = new Set([sheetId])
  if (!sheetId || !Number.isFinite(sheetId)) return lineage

  try {
    /* Walk ancestor chain (target -> parent -> grandparent -> ...) */
    const MAX_ANCESTOR_DEPTH = 50
    let cursor = sheetId
    for (let i = 0; i < MAX_ANCESTOR_DEPTH; i++) {
      const node = await db.studySheet.findUnique({
        where: { id: cursor },
        select: { id: true, forkOf: true },
      })
      if (!node || !node.forkOf || lineage.has(node.forkOf)) break
      lineage.add(node.forkOf)
      cursor = node.forkOf
    }

    /* BFS-expand descendants from every node currently in lineage. This catches
     * direct children, siblings (children of an ancestor), and cousins. Caps
     * total visited at 500 to bound cost on pathological fork trees. */
    const MAX_VISITED = 500
    const queue = [...lineage]
    while (queue.length > 0 && lineage.size < MAX_VISITED) {
      const batch = queue.splice(0, Math.min(queue.length, 25))
      const children = await db.studySheet.findMany({
        where: { forkOf: { in: batch } },
        select: { id: true },
        take: MAX_VISITED,
      })
      for (const child of children) {
        if (!lineage.has(child.id)) {
          lineage.add(child.id)
          queue.push(child.id)
        }
      }
    }
  } catch (err) {
    captureError(err, { context: 'fork-lineage', sheetId })
  }

  return lineage
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
        forkOf: true,
      },
    })

    if (!targetSheet || !targetSheet.contentSimhash) {
      return []
    }

    /* Compute fork lineage so we exclude the parent, ancestors, descendants, and
     * siblings — forks are intentionally similar and should never be flagged as
     * plagiarism of each other. */
    const lineageIds = await getForkLineageIds(prisma, sheetId)
    const excludedIds = Array.from(lineageIds)

    /* Fetch all other published sheets with non-null contentSimhash */
    const allSheets = await prisma.studySheet.findMany({
      where: {
        AND: [
          { id: { notIn: excludedIds } },
          { status: 'published' },
          { NOT: [{ contentSimhash: null }] },
        ],
      },
      select: {
        id: true,
        title: true,
        userId: true,
        contentSimhash: true,
        forkOf: true,
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
        NOT: [{ contentSimhash: null }],
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
  getForkLineageIds,
}
