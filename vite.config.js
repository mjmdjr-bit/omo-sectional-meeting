import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // ★GitHub Pages(プロジェクトPages)用のベースパス
  // リポジトリ名に合わせて必ず設定すること
  base: '/omo-sectional-meeting/',

  // (任意) ローカルで LAN 端末から開きたい場合
  server: { host: true }
})
