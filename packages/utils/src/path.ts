import path from 'node:path'

/** Checks that a path resolves to a lexical descendant of a directory. */
export function isPathInsideDirectory(directory: string, filePath: string): boolean {
  const relativePath = path.relative(path.resolve(directory), path.resolve(filePath))

  return (
    !filePath.includes('\0') &&
    relativePath !== '' &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  )
}
