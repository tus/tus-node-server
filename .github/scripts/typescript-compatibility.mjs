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
// Reuse the base's external resolutions, without its workspace links or toolchain contract.
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

const differences = []
for (const [name, oldPackage] of before) {
  const newPackage = after.get(name)
  const oldManifest = readJson(join(oldPackage.directory, 'package.json'))
  const newManifest = readJson(join(newPackage.directory, 'package.json'))
  assert.deepEqual(newManifest, oldManifest, `${name} published manifest changed`)
  // All current packages have one root export. Fail if coverage needs extending.
  assert.equal(oldManifest.exports, './dist/index.js', `${name} needs entrypoint coverage`)
  const paths = oldPackage.files.map(({path}) => path).sort()
  assert.deepEqual(newPackage.files.map(({path}) => path).sort(), paths, `${name} packed files changed`)
  assert(paths.includes('dist/index.js') && paths.includes('dist/index.d.ts'), `${name} missing entrypoint output`)
  for (const path of paths.filter((path) => path.endsWith('.js') || path.endsWith('.d.ts'))) {
    if (normalized(oldPackage, path) !== normalized(newPackage, path)) {
      differences.push(`${name}/${path}`)
    }
  }
}
writeFileSync(join(output, 'artifact-differences.log'), `${differences.join('\n')}\n`)

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

function check(label, args) {
  const result = spawnSync(process.execPath, args, {cwd: consumer, encoding: 'utf8'})
  const log = `${result.stdout ?? ''}${result.stderr ?? ''}`
  writeFileSync(join(output, `${label}.log`), log)
  process.stdout.write(log)
  assert.ifError(result.error)
  assert.equal(result.status, 0, `${label} failed. See ${label}.log`)
  return result.stdout
}

const tsc = require.resolve('typescript/bin/tsc')
check('base-types', [tsc, '--project', 'tsconfig.json'])
const baseExports = check('base-runtime', ['entrypoints.mjs'])

// Replace only our packed packages so both compilers face identical consumer dependencies.
for (const [name, pkg] of after) {
  const directory = join(consumer, 'node_modules', name)
  rmSync(directory, {recursive: true, force: true})
  mkdirSync(directory, {recursive: true})
  execFileSync('tar', ['-xzf', pkg.tarball, '-C', directory, '--strip-components=1'])
}
check('head-types', [tsc, '--project', 'tsconfig.json'])
assert.equal(check('head-runtime', ['entrypoints.mjs']), baseExports, 'Runtime exports changed')
assert.deepEqual(differences, [], 'Emitted JS or declarations changed beyond printer normalization')
console.log(`Compared published artifacts and consumed all ${before.size} package entrypoints`)
