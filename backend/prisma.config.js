require('dotenv/config')

const { defineConfig, env } = require('prisma/config')

const datasource = {
  url: env('DATABASE_URL'),
}

if (process.env.SHADOW_DATABASE_URL) {
  datasource.shadowDatabaseUrl = env('SHADOW_DATABASE_URL')
}

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  datasource,
})
