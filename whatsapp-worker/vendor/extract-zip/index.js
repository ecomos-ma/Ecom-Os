'use strict'

// Derived from extract-zip 2.0.1 (BSD-2-Clause). ZIP symlinks are rejected
// instead of created, closing GHSA-jmr9-qjv8-65gv for this worker's only use:
// extracting trusted Chromium-for-Testing archives during image creation.
const debug = require('debug')('extract-zip')
const { createWriteStream, promises: fs } = require('fs')
const path = require('path')
const { promisify } = require('util')
const stream = require('stream')
const yauzl = require('yauzl')
const { isOutside } = require('./path-safety.js')

const openZip = promisify(yauzl.open)
const pipeline = promisify(stream.pipeline)

class Extractor {
  constructor(zipPath, opts) {
    this.zipPath = zipPath
    this.opts = opts
  }

  async extract() {
    debug('opening', this.zipPath)
    this.zipfile = await openZip(this.zipPath, { lazyEntries: true })
    this.canceled = false

    return new Promise((resolve, reject) => {
      this.zipfile.on('error', (error) => {
        this.canceled = true
        reject(error)
      })
      this.zipfile.on('close', () => {
        if (!this.canceled) resolve()
      })
      this.zipfile.on('entry', async (entry) => {
        if (this.canceled) return
        if (entry.fileName.startsWith('__MACOSX/')) {
          this.zipfile.readEntry()
          return
        }

        try {
          await this.extractEntry(entry)
          if (this.opts.onEntry) this.opts.onEntry(entry, this.zipfile)
          this.zipfile.readEntry()
        } catch (error) {
          this.canceled = true
          this.zipfile.close()
          reject(error)
        }
      })
      this.zipfile.readEntry()
    })
  }

  async extractEntry(entry) {
    const dest = path.resolve(this.opts.dir, entry.fileName)
    if (isOutside(this.opts.dir, dest)) {
      throw new Error(`Out-of-bounds ZIP entry rejected: ${entry.fileName}`)
    }

    const mode = (entry.externalFileAttributes >> 16) & 0xffff
    const fileType = mode & 0xf000
    const isSymlink = fileType === 0xa000
    let isDir = fileType === 0x4000 || entry.fileName.endsWith('/')
    const madeBy = entry.versionMadeBy >> 8
    if (!isDir) isDir = madeBy === 0 && entry.externalFileAttributes === 16

    if (isSymlink) {
      throw new Error(`ZIP symlink rejected: ${entry.fileName}`)
    }

    const procMode = this.getExtractedMode(mode, isDir) & 0o777
    const destDir = isDir ? dest : path.dirname(dest)
    await fs.mkdir(destDir, { recursive: true, ...(isDir ? { mode: procMode } : {}) })

    const canonicalDestDir = await fs.realpath(destDir)
    if (isOutside(this.opts.dir, canonicalDestDir)) {
      throw new Error(`Out-of-bounds ZIP destination rejected: ${entry.fileName}`)
    }
    if (isDir) return

    const readStream = await promisify(this.zipfile.openReadStream.bind(this.zipfile))(entry)
    await pipeline(readStream, createWriteStream(dest, { mode: procMode, flags: 'wx' }))
  }

  getExtractedMode(entryMode, isDir) {
    if (entryMode !== 0) return entryMode
    const configured = isDir ? this.opts.defaultDirMode : this.opts.defaultFileMode
    return configured ? Number.parseInt(configured, 10) : isDir ? 0o755 : 0o644
  }
}

module.exports = async function extract(zipPath, opts) {
  if (!opts || !path.isAbsolute(opts.dir)) {
    throw new Error('Target directory is expected to be absolute')
  }
  await fs.mkdir(opts.dir, { recursive: true })
  const safeOpts = { ...opts, dir: await fs.realpath(opts.dir) }
  return new Extractor(zipPath, safeOpts).extract()
}
