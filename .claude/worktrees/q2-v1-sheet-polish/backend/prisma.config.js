const path = require('node:path')
require('dotenv').config({ path: path.resolve(__dirname, '.env') })

const { defineConfig } = require('prisma/config')

const datasource = {
  url: process.env.DATABASE_URL,
}

if (process.env.SHADOW_DATABASE_URL) {
  datasource.shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL
}

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  datasource,
})
