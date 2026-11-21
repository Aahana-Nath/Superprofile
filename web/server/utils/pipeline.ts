import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { H3Event } from 'h3'

/** Runs run_pipeline.py with a JSON request on stdin and returns its JSON reply. */
export async function runPipeline<T = any>(event: H3Event, payload: Record<string, unknown>): Promise<T> {
  const config = useRuntimeConfig(event)
  const root = config.pipelineDir || resolve(process.cwd(), '..')
  const python = config.pythonBin || resolve(root, '.venv/bin/python')
  if (!existsSync(python)) {
    throw createError({ statusCode: 500, statusMessage: `Python not found at ${python}. Create the .venv first.` })
  }

  return await new Promise<T>((resolvePromise, reject) => {
    const child = spawn(python, ['-W', 'ignore', 'run_pipeline.py'], { cwd: root })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(createError({ statusCode: 504, statusMessage: 'This is taking too long. Please try again.' }))
    }, Number(config.pipelineTimeoutMs))

    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(createError({ statusCode: 500, statusMessage: `Could not start Python: ${e.message}` }))
    })
    child.on('close', () => {
      clearTimeout(timer)
      try {
        resolvePromise(JSON.parse(out))
      } catch {
        console.error('[pipeline] bad output:', out.slice(0, 500), err.slice(-1000))
        reject(createError({ statusCode: 500, statusMessage: 'Something went wrong on our side. Please try again.' }))
      }
    })
    child.stdin.end(JSON.stringify(payload))
  })
}

export const LANGUAGES = ['english', 'hinglish', 'hindi']

export const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function requireObject(v: unknown, what: string): Record<string, any> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw createError({ statusCode: 400, statusMessage: `Missing ${what}.` })
  }
  return v as Record<string, any>
}
