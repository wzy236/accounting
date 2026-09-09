import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: '记账本',
        short_name: '记账本',
        description: '个人记账网站：收支记录、自定义分类、饼图统计、银行 PDF 对账单导入',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#f5f7fb',
        theme_color: '#3d5a80',
        lang: 'zh-CN',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Vite 给静态资源加了内容哈希，文件名一变 Workbox 就会自动生成新的 precache
        // manifest 并触发更新（配合 autoUpdate），不需要像旧版手写 sw.js 那样操心缓存版本号。
        // Supabase 请求单独走 NetworkFirst：在线永远拿最新数据，离线时才退回缓存。
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'accounting-api',
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
    }),
  ],
})
