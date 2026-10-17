import assert from 'node:assert/strict'
import {execFileSync, spawnSync} from 'node:child_process'
import {appendFileSync, cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {join, resolve} from 'node:path'

const [base, head, output] = process.argv.slice(2).map((path) => resolve(path))
const nodeTypes = process.env.NODE_TYPES_VERSION
assert(nodeTypes, 'NODE_TYPES_VERSION is required')
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)

function pack(root, label) {
  const destination = join(output, label)
  mkdirSync(destination, {recursive: true})
  const workspaces = readdirSync(join(root, 'packages')).filter(
    (name) => !readJson(join(root, 'packages', name, 'package.json')).private
  )
  const packages = JSON.parse(execFileSync('npm', [
    'pack', '--json', '--ignore-scripts', '--pack-destination', destination,
    ...workspaces.map((name) => `--workspace=./packages/${name}`),
  ], {cwd: root, encoding: 'utf8'}))
  return new Map(packages.map((pkg) => {
    const tarball = join(destination, pkg.filename)
    const manifest = JSON.parse(execFileSync('tar', ['-xOf', tarball, 'package/package.json'], {encoding: 'utf8'}))
    return [pkg.name, {tarball, manifest}]
  }))
}

const before = pack(base, 'base')
const after = pack(head, 'head')
assert(before.size > 0, 'No published packages found')
assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), 'Published packages changed')
for (const [name, pkg] of before) {
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta', 'engines']) {
    assert.deepEqual(after.get(name).manifest[field], pkg.manifest[field], `${name} ${field} changed; reassess the shared consumer installation`)
  }
}

const consumer = join(output, 'consumer')
cpSync(join(head, '.github/fixtures/node-types-consumer'), consumer, {recursive: true})
const manifest = {
  ...readJson(join(consumer, 'package.json')),
  dependencies: {
    ...Object.fromEntries([...before].map(([name, pkg]) => [name, `file:${pkg.tarball}`])),
    typescript: '5.8.2',
    '@types/node': nodeTypes,
  },
  overrides: {'@types/node': nodeTypes},
}
writeJson(join(consumer, 'package.json'), manifest)
const baseLock = readJson(join(base, 'package-lock.json'))
writeJson(join(consumer, 'package-lock.json'), {
  lockfileVersion: 3,
  requires: true,
  packages: {
    ...Object.fromEntries(Object.entries(baseLock.packages).filter(
      ([path, pkg]) => path.startsWith('node_modules/') && !pkg.link
    )),
    '': manifest,
  },
})
execFileSync('npm', ['install', '--ignore-scripts', '--no-fund', '--no-audit'], {cwd: consumer, stdio: 'inherit'})
const require = createRequire(join(consumer, 'package.json'))
const environment = {
  node: process.version,
  typescript: require('typescript/package.json').version,
  nodeTypes: require('@types/node/package.json').version,
  srvx: readJson(join(consumer, 'node_modules/srvx/package.json')).version,
  base: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: base, encoding: 'utf8'}).trim(),
  head: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: head, encoding: 'utf8'}).trim(),
}
writeJson(join(output, 'environment.json'), environment)
console.log(environment)
assert.equal(environment.typescript, '5.8.2')
assert.equal(environment.nodeTypes, nodeTypes)
assert.equal(environment.srvx, baseLock.packages['node_modules/srvx'].version)
for (const [path, pkg] of Object.entries(readJson(join(consumer, 'package-lock.json')).packages)) {
  if (path.endsWith('node_modules/@types/node')) assert.equal(pkg.version, nodeTypes, path)
  if (/(?:^|\/)node_modules\/@tus\//.test(path)) {
    assert([...before.keys()].some((name) => path === `node_modules/${name}`), `Unexpected nested tus package at ${path}`)
  }
}

function run(label, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: consumer, encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024,
  })
  writeFileSync(join(output, `${label}.stdout.log`), result.stdout ?? '')
  writeFileSync(join(output, `${label}.stderr.log`), result.stderr ?? '')
  writeJson(join(output, `${label}.status.json`), {
    status: result.status, signal: result.signal, error: result.error?.message,
  })
  console.log(`${label} exited with ${result.status}`)
  process.stdout.write(result.stdout ?? '')
  process.stderr.write(result.stderr ?? '')
  return result
}

const tsc = [require.resolve('typescript/bin/tsc'), '--project', 'tsconfig.json', '--pretty', 'false']
const baseTypes = run('base-types', tsc)
const baseRuntime = run('base-runtime', ['runtime.mjs'])

// Never reinstall between checks. Preserve even nested external dependencies.
for (const [name, pkg] of after) {
  const directory = join(consumer, 'node_modules', name)
  for (const entry of readdirSync(directory)) {
    if (entry !== 'node_modules') rmSync(join(directory, entry), {recursive: true, force: true})
  }
  execFileSync('tar', ['-xzf', pkg.tarball, '-C', directory, '--strip-components=1'])
}
const headTypes = run('head-types', tsc)
const headRuntime = run('head-runtime', ['runtime.mjs'])

function diagnostics(result, label) {
  assert.ifError(result.error)
  assert.equal(result.signal, null, `${label} compiler was interrupted`)
  assert.equal(result.stderr, '', `${label} compiler wrote unexpected stderr`)
  let normalized = result.stdout
  for (const [root, replacement] of [[consumer, '<consumer>'], [base, '<base>'], [head, '<head>'], [output, '<output>']]) {
    normalized = normalized.replaceAll(`${root}/`, `${replacement}/`)
  }
  const entries = normalized.split(/(?=^(?:[^\n]+\(\d+,\d+\): )?error TS\d+: )/m).filter(Boolean)
  assert(entries.every((entry) => /^(?:[^\n]+\(\d+,\d+\): )?error TS\d+: /.test(entry)), `${label} compiler output was not diagnostics`)
  assert.equal(result.status, entries.length ? 2 : 0, `${label} compiler exited unexpectedly`)
  writeJson(join(output, `${label}-diagnostics.json`), entries)
  return entries
}

const baseline = diagnostics(baseTypes, 'base')
const proposed = diagnostics(headTypes, 'head')
const remaining = [...baseline]
const added = proposed.filter((diagnostic) => {
  const index = remaining.indexOf(diagnostic)
  if (index === -1) return true
  remaining.splice(index, 1)
  return false
})
writeJson(join(output, 'new-diagnostics.json'), added)
const summary = `Strict consumer comparison: base ${baseline.length} diagnostics, head ${proposed.length}, new or changed ${added.length}.\n${proposed.length ? 'Head is NOT a clean strict typecheck. See retained baseline and head diagnostics.' : 'Head strict typecheck is clean.'}\n`
console.log(summary)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
if (baseline.length) console.log('::warning::The exact base has strict consumer errors. This job checks for regressions and retains all diagnostics.')
assert.deepEqual(added, [], 'New or changed strict consumer diagnostics')
for (const [label, result] of [['base-runtime', baseRuntime], ['head-runtime', headRuntime]]) {
  assert.ifError(result.error)
  assert.equal(result.status, 0, `${label} failed; see retained runtime logs`)
}
