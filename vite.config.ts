import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

function releaseAssets(): Plugin {
  const publicRoot = new URL('./public/', import.meta.url)
  const assetPath = /^objects\/[a-z0-9_-]+\/[a-f0-9]{64}\/[A-Za-z0-9_-]+\.(json|webp)$/

  return {
    name: 'published-market-release',
    apply: 'build',
    generateBundle() {
      const seen = new Set<string>()
      const emit = (fileName: string, source: Buffer) =>
        this.emitFile({ type: 'asset', fileName, source })

      function visit(value: unknown): void {
        if (Array.isArray(value)) {
          value.forEach(visit)
          return
        }
        if (value === null || typeof value !== 'object') return
        const record = value as Record<string, unknown>
        if (!('path' in record && 'sha256' in record && 'bytes' in record)) {
          Object.values(record).forEach(visit)
          return
        }

        const { path, sha256, bytes } = record
        if (typeof path !== 'string' || !assetPath.test(path)) throw new Error('Invalid release asset path')
        const fileName = 'data/' + path
        if (seen.has(fileName)) return
        const source = readFileSync(new URL(fileName, publicRoot))
        if (source.length !== bytes || createHash('sha256').update(source).digest('hex') !== sha256 ||
            path.split('/')[2] !== sha256) {
          throw new Error('Release asset integrity check failed: ' + path)
        }

        seen.add(fileName)
        emit(fileName, source)
        if (path.endsWith('.json')) visit(JSON.parse(source.toString('utf8')))
      }

      const manifest = readFileSync(new URL('data/manifest.json', publicRoot))
      visit(JSON.parse(manifest.toString('utf8')))
      emit('data/manifest.json', manifest)
      for (const name of ['hero-brand', 'tour-financials', 'tour-monthly', 'tour-sectors', 'tour-ai-insights', 'tour-forecast']) {
        const fileName = 'home/' + name + '.webp'
        const file = new URL(fileName, publicRoot)
        if (existsSync(file)) emit(fileName, readFileSync(file))
      }
      emit('favicon.svg', readFileSync(new URL('favicon.svg', publicRoot)))
    },
  }
}

export default defineConfig({
  base: './',
  build: {
    copyPublicDir: false,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/recharts/')) return 'vendor-charts'
          if (id.includes('/node_modules/lucide-react/')) return 'vendor-icons'
        },
      },
    },
  },
  plugins: [react(), releaseAssets()],
})
