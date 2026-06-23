import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve, join } from 'path'
import fs from 'fs'

/** GitHub Pages 项目页 base；未设置时与改动前一致，均为 / */
const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [
    vue(),
    // GitHub Pages 无服务端路由：404 回退到 index.html（History 模式）
    {
      name: 'gh-pages-spa-fallback',
      closeBundle() {
        if (base === '/') return
        const outDir = resolve(__dirname, 'dist')
        const index = join(outDir, 'index.html')
        const fallback = join(outDir, '404.html')
        if (fs.existsSync(index)) {
          fs.copyFileSync(index, fallback)
        }
      }
    }
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // 与仓库根目录下 images/ 一致，例如 images/home-wallpaper.png
      '@images': resolve(__dirname, 'images')
    }
  },
  server: {
    port: 3000,
    proxy: {}
  }
})
