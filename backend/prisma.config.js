require('dotenv/config')

const { defineConfig, env } = require('prisma/config')

const ACCELERATE_URL_PATTERN = /^prisma(\+postgres)?:\/\//i
const databaseUrl = process.env.DATABASE_URL || ''
const shouldUseDirectCliUrl = ACCELERATE_URL_PATTERN.test(databaseUrl)
const datasource = {
  url: shouldUseDirectCliUrl ? env('DIRECT_DATABASE_URL') : env('DATABASE_URL'),
}

if (process.env.SHADOW_DATABASE_URL) {
  datasource.shadowDatabaseUrl = env('SHADOW_DATABASE_URL')
}

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  datasource,
})
