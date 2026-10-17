import assert from 'node:assert/strict'
import {execFileSync, spawnSync} from 'node:child_process'
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Run this validation in CI only')

const fixture = mkdtempSync(join(tmpdir(), 'tus-changesets-'))
const env = {
  ...process.env,
  npm_config_ignore_scripts: 'true',
  npm_config_audit: 'false',
  npm_config_fund: 'false',
}
const run = (command, args) => execFileSync(command, args, {cwd: fixture, env, stdio: 'inherit'})
const readJson = (path) => JSON.parse(readFileSync(join(fixture, path), 'utf8'))
const patch = (version) => version.replace(/\d+$/, (value) => String(Number(value) + 1))

try {
  const archive = execFileSync('git', ['archive', 'HEAD'], {maxBuffer: 50 * 1024 * 1024})
  execFileSync('tar', ['-x', '-C', fixture], {input: archive})
  const packageDirs = readdirSync(join(fixture, 'packages')).map((name) => `packages/${name}`)
  const before = new Map(packageDirs.map((dir) => [dir, readJson(`${dir}/package.json`)]))
  const privateBefore = readJson('test/package.json')
  const configBefore = readFileSync(join(fixture, '.changeset/config.json'), 'utf8')

  for (const name of readdirSync(join(fixture, '.changeset'))) {
    if (name !== 'config.json') rmSync(join(fixture, '.changeset', name), {recursive: true})
  }
  writeFileSync(
    join(fixture, '.changeset/ci-validation.md'),
    '---\n"@tus/utils": patch\n"@tus/server": patch\n---\n\nCI release validation.\n'
  )
  run('git', ['init', '--initial-branch=changesets-validation'])
  run('git', ['config', 'user.name', 'Changesets validation'])
  run('git', ['config', 'user.email', 'changesets-validation@example.invalid'])
  run('git', ['add', '.'])
  run('git', ['-c', 'commit.gpgsign=false', 'commit', '-m', 'Fixture before versioning'])
  run('npm', ['ci', '--ignore-scripts'])
  const releaseWorkflow = readFileSync(join(fixture, '.github/workflows/release.yml'), 'utf8')
  for (const input of [
    'version-script: npm run version',
    'publish-script: npm run release:local',
    'commit-message: "[ci] release"',
    'pr-title: "[ci] release"',
    'push-with-git-cli: true',
  ]) {
    assert.ok(releaseWorkflow.includes(`          ${input}\n`), `Release workflow retains ${input}`)
  }
  assert.doesNotMatch(releaseWorkflow, /^          (version|publish|commit|title):/m)
  assert.equal(readJson('package.json').scripts['release:local'], 'npm run build && changeset publish')
  run('npm', ['run', 'version'])

  const lock = readJson('package-lock.json')
  const utilsVersion = patch(before.get('packages/utils').version)
  for (const [dir, original] of before) {
    const expected = structuredClone(original)
    if (dir === 'packages/utils' || dir === 'packages/server') {
      expected.version = patch(original.version)
      if (dir === 'packages/server') expected.dependencies['@tus/utils'] = `^${utilsVersion}`
      const changelog = readFileSync(join(fixture, dir, 'CHANGELOG.md'), 'utf8')
      assert.ok(changelog.includes(`## ${expected.version}\n`), `${dir} has a version heading`)
      assert.ok(changelog.includes('CI release validation.'), `${dir} has the changeset text`)
    }
    assert.deepEqual(readJson(`${dir}/package.json`), expected, `${dir} preserves its contract`)
    assert.equal(lock.packages[dir].version, expected.version, `${dir} lockfile version`)
    assert.deepEqual(lock.packages[dir].dependencies, expected.dependencies, `${dir} lockfile dependencies`)
  }
  assert.equal(readJson('test/package.json').version, privateBefore.version)
  assert.ok(!existsSync(join(fixture, 'test/CHANGELOG.md')), 'Private test package has no changelog')
  assert.equal(readFileSync(join(fixture, '.changeset/config.json'), 'utf8'), configBefore)
  assert.ok(!existsSync(join(fixture, '.changeset/ci-validation.md')), 'Changeset was consumed')

  const emptyVersion = spawnSync('npm', ['run', 'version'], {cwd: fixture, env, stdio: 'inherit'})
  assert.equal(emptyVersion.status, 1, 'CLI 3 reports that there is nothing left to version')

  const output = join(fixture, 'tags.ndjson')
  env.CHANGESETS_OUTPUT = output
  run('npm', ['exec', '--', 'changeset', 'git-tag'])
  const tags = execFileSync('git', ['tag', '--list'], {cwd: fixture, encoding: 'utf8'}).trim().split('\n')
  const expectedTags = packageDirs.map((dir) => {
    const pkg = readJson(`${dir}/package.json`)
    return `${pkg.name}@${pkg.version}`
  }).sort()
  assert.deepEqual(tags.sort(), expectedTags, 'Only public workspace packages are tagged')
  const events = readFileSync(output, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.deepEqual(
    events.sort((a, b) => a.tag.localeCompare(b.tag)),
    packageDirs.map((dir) => {
      const pkg = readJson(`${dir}/package.json`)
      return {type: 'git-tag', tag: `${pkg.name}@${pkg.version}`, packageName: pkg.name}
    }).sort((a, b) => a.tag.localeCompare(b.tag)),
    'CLI emits the CHANGESETS_OUTPUT events consumed by action v2'
  )
} finally {
  rmSync(fixture, {recursive: true, force: true})
}
