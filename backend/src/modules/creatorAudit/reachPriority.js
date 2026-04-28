function computePriorityScore({
  findingSeverity,
  followerCount,
  avgViewsPerSheet,
  hoursSinceFlagged,
}) {
  const severity = Math.max(0, Number(findingSeverity) || 0)
  const followers = Math.max(0, Number(followerCount) || 0)
  const views = Math.max(0, Number(avgViewsPerSheet) || 0)
  const hours = Math.max(0, Number(hoursSinceFlagged) || 0)
  const reach = Math.log(followers + 10) * Math.log(views + 10)
  const decay = 1 / (1 + hours / 24)
  return severity * reach * decay
}

module.exports = { computePriorityScore }
