const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const repoRoot = path.resolve(__dirname, '..')
const diagnosticsDir = path.join(repoRoot, 'beta-diagnostics')

function npmCommand() {
  return 'npm'
}

function quoteWindowsArg(text) {
  // If no whitespace or double quotes, return as-is
  if (!/[\s"]/u.test(text)) {
    return text
  }

  // Escape backslashes and double quotes according to Windows/CRT rules
  let result = '"'
  let backslashCount = 0

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (ch === '\\') {
      backslashCount += 1
    } else if (ch === '"') {
      // Escape all backslashes before a quote, then the quote itself
      result += '\\'.repeat(backslashCount * 2 + 1)
      result += '"'
      backslashCount = 0
    } else {
      if (backslashCount > 0) {
        result += '\\'.repeat(backslashCount)
        backslashCount = 0
      }
      result += ch
    }
  }

  // Escape trailing backslashes before the closing quote
  if (backslashCount > 0) {
    result += '\\'.repeat(backslashCount * 2)
  }

  result += '"'
  return result
}

function runCommand(command, args, extraEnv = {}) {
  const baseOptions = {
    cwd: repoRoot,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
  }

  let result
  if (process.platform === 'win32') {
    const cmd = [command, ...args]
      .map((part) => {
        const text = String(part)
        return quoteWindowsArg(text)
      })
      .join(' ')
    result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', cmd], baseOptions)
  } else {
    result = spawnSync(command, args, baseOptions)
  }

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)

  if (result.error) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status ?? 1}. ` +
      `${(result.stderr || '').trim()}`
    )
  }
}

function captureBackendLogs(outputPath) {
  const result = spawnSync('docker', ['compose', 'logs', 'backend', '--no-color', '--tail', '500'], {
    cwd: repoRoot,
    env: process.env,
    encoding: 'utf8',
  })

  if (result.status === 0) {
    fs.writeFileSync(outputPath, result.stdout || '', 'utf8')
    return
  }

  const fallback = [
    '[warning] Could not capture docker backend logs.',
    `exitCode: ${result.status ?? 'unknown'}`,
    result.stderr || '',
  ].join('\n')
  fs.writeFileSync(outputPath, `${fallback}\n`, 'utf8')
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw)
}

function includesTypeError(value) {
  return /t is not a function/i.test(String(value || ''))
}

function collectFailures(networkData, consoleData, backendLog) {
  const failures = []

  if (!networkData?.feed) {
    failures.push('Feed network capture did not include a /api/feed response.')
  } else if (networkData.feed.status >= 400) {
    failures.push(`/api/feed returned HTTP ${networkData.feed.status}.`)
  }

  if (Array.isArray(networkData?.errors) && networkData.errors.length > 0) {
    failures.push(`Network capture errors: ${networkData.errors.join(' | ')}`)
  }

  const combinedNetwork = JSON.stringify(networkData)
  const combinedConsole = JSON.stringify(consoleData)
  if (includesTypeError(combinedNetwork)) {
    failures.push('Detected "t is not a function" in /api/feed network payload.')
  }
  if (includesTypeError(combinedConsole)) {
    failures.push('Detected "t is not a function" in frontend console trace.')
  }
  if (includesTypeError(backendLog)) {
    failures.push('Detected "t is not a function" in backend logs.')
  }
  if (/\[warning\] Could not capture docker backend logs\./i.test(backendLog)) {
    failures.push('Backend stack logs were not captured. Ensure `npm run beta:up` is running.')
  }

  if (Array.isArray(consoleData?.pageErrors) && consoleData.pageErrors.length > 0) {
    failures.push(`Frontend page errors captured: ${consoleData.pageErrors.length}.`)
  }

  return failures
}

function main() {
  fs.mkdirSync(diagnosticsDir, { recursive: true })

  const networkPath = path.join(diagnosticsDir, 'feed-network.json')
  const consolePath = path.join(diagnosticsDir, 'frontend-console.json')
  const backendLogPath = path.join(diagnosticsDir, 'backend-stack.log')

  runCommand(npmCommand(), ['--prefix', 'backend', 'run', 'capture:feed-network'], {
    BETA_DIAG_OUTPUT: networkPath,
  })

  const networkData = readJson(networkPath)
  const sessionCookie = String(networkData?.login?.cookie || '')

  runCommand(npmCommand(), ['--prefix', 'frontend/studyhub-app', 'run', 'capture:feed-console'], {
    BETA_CONSOLE_OUTPUT: consolePath,
    BETA_DIAG_SESSION_COOKIE: sessionCookie,
  })

  captureBackendLogs(backendLogPath)

  const consoleData = readJson(consolePath)
  const backendLog = fs.readFileSync(backendLogPath, 'utf8')

  const failures = collectFailures(networkData, consoleData, backendLog)
  if (failures.length > 0) {
    console.error('\n[blocker] Feed diagnostics failed:')
    for (const failure of failures) {
      console.error(`- ${failure}`)
    }
    console.error(`\nArtifacts saved to: ${diagnosticsDir}`)
    process.exit(2)
  }

  console.log('Feed diagnostics passed.')
  console.log(`Artifacts saved to: ${diagnosticsDir}`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
