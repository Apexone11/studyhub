function apiVersion(req, res, next) {
  res.set('X-API-Version', '1.5.0')

  // Include deprecation warning only if the endpoint is deprecated
  // Currently no endpoints are deprecated, so this is empty
  const deprecatedEndpoints = []
  if (deprecatedEndpoints.includes(`${req.method} ${req.path}`)) {
    res.set('X-API-Deprecated', 'true')
  }

  next()
}

module.exports = apiVersion
