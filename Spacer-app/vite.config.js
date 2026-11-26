import { defineConfig, loadEnv } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

const REQUIRED_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // .env is not in git: a Vercel build without these variables would ship a
  // blank app (the Supabase client can't start), so stop the deploy instead
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const missing = REQUIRED_ENV.filter((name) => !env[name])
  if (process.env.VERCEL && missing.length > 0) {
    throw new Error(`Missing ${missing.join(', ')}: set them in Vercel → Project Settings → Environment Variables`)
  }

  return {
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] })
    ],
    // Which deploy an error came from in Sentry: the commit Vercel built
    define: {
      'import.meta.env.VITE_APP_RELEASE': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA || ''),
    },
  }
})
