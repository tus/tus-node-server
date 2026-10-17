import assert from 'node:assert/strict'
import {execFileSync, spawnSync} from 'node:child_process'
import {mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {join, resolve} from 'node:path'

const [base, head, output] = process.argv.slice(2).map((path) => resolve(path))
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
    const directory = join(destination, pkg.name)
    const tarball = join(destination, pkg.filename)
    mkdirSync(directory, {recursive: true})
    execFileSync('tar', ['-xzf', tarball, '-C', directory, '--strip-components=1'])
    return [pkg.name, {...pkg, directory, tarball}]
  }))
}

const before = pack(base, 'base')
const after = pack(head, 'head')
assert(before.size > 0, 'No published packages found')
assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), 'Published packages changed')

const consumer = join(output, 'consumer')
mkdirSync(consumer, {recursive: true})
const consumerManifest = {
  private: true,
  type: 'module',
  dependencies: {
    ...Object.fromEntries([...before].map(([name, pkg]) => [name, `file:${pkg.tarball}`])),
    typescript: '5.8.2',
    '@types/node': '20.19.0',
  },
  overrides: {'@types/node': '20.19.0'},
}
writeJson(join(consumer, 'package.json'), consumerManifest)
const baseLock = readJson(join(base, 'package-lock.json'))
writeJson(join(consumer, 'package-lock.json'), {
  lockfileVersion: 3,
  requires: true,
  packages: {
    ...Object.fromEntries(Object.entries(baseLock.packages).filter(
      ([path, pkg]) => path.startsWith('node_modules/') && !pkg.link
    )),
    '': consumerManifest,
  },
})
execFileSync('npm', ['install', '--ignore-scripts', '--no-fund', '--no-audit'], {
  cwd: consumer, stdio: 'inherit',
})

const require = createRequire(join(consumer, 'package.json'))
const ts = require('typescript')
assert.equal(ts.version, '5.8.2')
assert.equal(require('@types/node/package.json').version, '20.19.0')
const printer = ts.createPrinter({newLine: ts.NewLineKind.LineFeed})

function normalized(pkg, path) {
  const source = ts.createSourceFile(path, readFileSync(join(pkg.directory, path), 'utf8'), ts.ScriptTarget.Latest)
  assert.equal(source.parseDiagnostics.length, 0, `${pkg.name}/${path} must parse with TypeScript 5.8`)
  return printer.printFile(source)
}

const imports = [...before.keys()].map((name, index) => `import * as entry${index} from '${name}'`)
const uses = [...before.keys()].map((name, index) => `console.log('${name}', Object.keys(entry${index}).sort())`)
const entrypoints = `${[...imports, ...uses].join('\n')}\n`
writeFileSync(join(consumer, 'entrypoints.ts'), entrypoints)
writeFileSync(join(consumer, 'entrypoints.mjs'), entrypoints)
writeJson(join(consumer, 'tsconfig.json'), {
  compilerOptions: {
    target: 'ES2022',
    lib: ['ES2022'],
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    strict: true,
    skipLibCheck: false,
    types: ['node'],
    noEmit: true,
  },
  files: ['entrypoints.ts'],
})

function capture(label, args) {
  const result = spawnSync(process.execPath, args, {cwd: consumer, encoding: 'utf8'})
  const log = `${result.stdout ?? ''}${result.stderr ?? ''}`
  writeFileSync(join(output, `${label}.log`), log)
  process.stdout.write(log)
  if (result.error) process.stderr.write(`${result.error}\n`)
  return {...result, log}
}

const tsc = require.resolve('typescript/bin/tsc')
const typeArgs = [tsc, '--project', 'tsconfig.json', '--pretty', 'false']
const baseTypes = capture('base-types', typeArgs)
const baseRuntime = capture('base-runtime', ['entrypoints.mjs'])

for (const [name, pkg] of after) {
  const directory = join(consumer, 'node_modules', name)
  rmSync(directory, {recursive: true, force: true})
  mkdirSync(directory, {recursive: true})
  execFileSync('tar', ['-xzf', pkg.tarball, '-C', directory, '--strip-components=1'])
}
const headTypes = capture('head-types', typeArgs)
const headRuntime = capture('head-runtime', ['entrypoints.mjs'])

const failures = []
function verify(label, check) {
  try {
    check()
  } catch (error) {
    failures.push(label)
    console.error(`${label}: ${error.message}`)
  }
}

function checkExit(label, result, status) {
  assert.ifError(result.error)
  assert.equal(result.signal, null, `${label} terminated by a signal`)
  assert.equal(result.status, status, `${label} failed. See ${label}.log`)
}

const knownSrvxDiagnostics = [
  [4, 22, "TS2307: Cannot find module 'aws-lambda' or its corresponding type declarations."],
  [5, 38, "TS2307: Cannot find module 'cloudflare:workers' or its corresponding type declarations."],
  [7, 22, "TS2307: Cannot find module 'bun' or its corresponding type declarations."],
  [8, 21, "TS2307: Cannot find module '@cloudflare/workers-types' or its corresponding type declarations."],
  [137, 10, "TS2503: Cannot find namespace 'Deno'."],
  [185, 14, "TS2503: Cannot find namespace 'Deno'."],
  [229, 11, "TS2503: Cannot find namespace 'Deno'."],
  [229, 33, "TS2503: Cannot find namespace 'Deno'."],
  [249, 12, "TS2304: Cannot find name 'FetchEvent'."],
  [298, 51, "TS2503: Cannot find namespace 'Deno'."],
  [298, 73, "TS2503: Cannot find namespace 'Deno'."],
].map(([line, column, message]) => `node_modules/srvx/dist/types.d.mts(${line},${column}): error ${message}`).sort()

const diagnostics = (result) => result.log.split(/\r?\n/).filter((line) => line.length > 0).sort()
const baseDiagnostics = diagnostics(baseTypes)
const headDiagnostics = diagnostics(headTypes)
verify('baseline types', () => {
  checkExit('base-types', baseTypes, baseDiagnostics.length > 0 ? 2 : 0)
  if (baseDiagnostics.length > 0) {
    assert.deepEqual(baseDiagnostics, knownSrvxDiagnostics, 'Unexpected baseline diagnostics')
    const warning = 'Baseline compilation is not clean: 11 known srvx missing-platform diagnostics. Head must match exactly.'
    writeFileSync(join(output, 'baseline-warning.log'), `${warning}\n`)
    console.warn(`::warning::${warning}`)
  }
})
verify('head types', () => {
  checkExit('head-types', headTypes, headDiagnostics.length > 0 ? 2 : 0)
  assert.deepEqual(headDiagnostics, baseDiagnostics, 'Consumer diagnostics changed. See base-types.log and head-types.log')
})
verify('base runtime', () => checkExit('base-runtime', baseRuntime, 0))
verify('head runtime', () => checkExit('head-runtime', headRuntime, 0))
verify('runtime exports', () => assert.equal(headRuntime.stdout, baseRuntime.stdout, 'Runtime exports changed'))

const differences = []
for (const [name, oldPackage] of before) {
  verify(`${name} artifacts`, () => {
    const newPackage = after.get(name)
    const oldManifest = readJson(join(oldPackage.directory, 'package.json'))
    const newManifest = readJson(join(newPackage.directory, 'package.json'))
    assert.deepEqual(newManifest, oldManifest, `${name} published manifest changed`)
    assert.equal(oldManifest.exports, './dist/index.js', `${name} needs entrypoint coverage`)
    const paths = oldPackage.files.map(({path}) => path).sort()
    assert.deepEqual(newPackage.files.map(({path}) => path).sort(), paths, `${name} packed files changed`)
    assert(paths.includes('dist/index.js') && paths.includes('dist/index.d.ts'), `${name} missing entrypoint output`)
    for (const path of paths.filter((path) => path.endsWith('.js') || path.endsWith('.d.ts'))) {
      if (normalized(oldPackage, path) !== normalized(newPackage, path)) {
        differences.push(`${name}/${path}`)
      }
    }
  })
}
writeFileSync(join(output, 'artifact-differences.log'), `${differences.join('\n')}\n`)

verify('emitted artifacts', () => assert.deepEqual(
  differences, [], 'Emitted JS or declarations changed; inspect artifact-differences.log before judging consumer impact'
))
writeJson(join(output, 'verification-failures.log'), failures)
assert.deepEqual(failures, [], 'Compatibility checks failed')
console.log(`Compared published artifacts and runtime exports for all ${before.size} package entrypoints`)
console.log(baseDiagnostics.length > 0
  ? 'Strict compilation remains non-clean with only the unchanged known srvx diagnostics.'
  : 'Both package versions passed strict consumer compilation.')
