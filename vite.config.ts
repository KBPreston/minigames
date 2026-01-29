import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

// Get git info at build time
function getGitInfo() {
  try {
    const commitCount = execSync('git rev-list --count HEAD').toString().trim()
    const commitHash = execSync('git rev-parse --short HEAD').toString().trim()
    return { commitCount, commitHash }
  } catch {
    return { commitCount: '0', commitHash: 'dev' }
  }
}

const gitInfo = getGitInfo()

export default defineConfig({
  plugins: [react()],
  base: '/minigames/',
  server: {
    port: 3000,
  },
  define: {
    __APP_VERSION__: JSON.stringify(`1.${gitInfo.commitCount}`),
    __COMMIT_HASH__: JSON.stringify(gitInfo.commitHash),
  },
})
