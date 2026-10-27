const { defineConfig } = require('@playwright/test')
module.exports = defineConfig({ testDir: './tests', timeout: 120000, workers: 1, reporter: 'list' })
