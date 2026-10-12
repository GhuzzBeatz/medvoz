// Downloads the latest MedVoz installer from GitHub Releases and verifies it against latest.yml.
const crypto = require('crypto')
const fs = require('fs')
const https = require('https')
const path = require('path')

const RELEASE_DOWNLOAD_PREFIX = /^https:\/\/github\.com\/GhuzzBeatz\/medvoz\/releases\/download\//i

function isNewerVersion(latest, installed) {
  const left = String(latest || '').replace(/^v/i, '').split('.').map(Number)
  const right = String(installed || '').replace(/^v/i, '').split('.').map(Number)
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const diff = (left[index] || 0) - (right[index] || 0)
    if (diff) return diff > 0
  }
  return false
}

function downloadToFile(urlValue, dest, { userAgent, onProgress = () => {} }, redirectsLeft = 6) {
  return new Promise((resolve, reject) => {
    let url
    try {
      url = new URL(urlValue)
    } catch (error) {
      reject(new Error('Endereco de download invalido.'))
      return
    }
    if (url.protocol !== 'https:') {
      reject(new Error('Download inseguro bloqueado.'))
      return
    }
    const req = https.get(url, { headers: { 'user-agent': userAgent, accept: 'application/octet-stream' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume()
        if (!redirectsLeft) {
          reject(new Error('Redirecionamentos demais no download.'))
          return
        }
        resolve(downloadToFile(new URL(res.headers.location, url).href, dest, { userAgent, onProgress }, redirectsLeft - 1))
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`Falha no download (HTTP ${res.statusCode}).`))
        return
      }
      const total = Number(res.headers['content-length'] || 0)
      const hash = crypto.createHash('sha512')
      const file = fs.createWriteStream(dest)
      let received = 0
      res.on('data', (chunk) => {
        received += chunk.length
        hash.update(chunk)
        onProgress(received, total)
      })
      res.on('error', reject)
      file.on('error', reject)
      file.on('finish', () => file.close(() => resolve({ size: received, sha512: hash.digest('base64') })))
      res.pipe(file)
    })
    req.on('error', reject)
    req.setTimeout(60000, () => req.destroy(new Error('Tempo limite no download. Verifique a internet.')))
  })
}

function createUpdateService({ appId, getVersion, releaseEndpoint, requestJson, tempDir }) {
  const userAgent = `${appId}-${getVersion()}`

  async function downloadLatest(onProgress = () => {}) {
    const release = await requestJson(releaseEndpoint)
    const version = String(release?.tag_name || '').replace(/^v/i, '')
    if (!version) return { ok: false, message: release?.message || 'Nao foi possivel consultar a versao mais recente.' }
    if (!isNewerVersion(version, getVersion())) return { ok: false, upToDate: true, message: 'Voce ja esta na versao mais recente.' }

    const assets = Array.isArray(release.assets) ? release.assets : []
    const installer = assets.find((asset) => /\.exe$/i.test(asset.name || ''))
    const manifest = assets.find((asset) => asset.name === 'latest.yml')
    if (!installer || !RELEASE_DOWNLOAD_PREFIX.test(installer.browser_download_url || '')) {
      return { ok: false, message: 'Instalador da nova versao nao encontrado.' }
    }

    const dir = path.join(tempDir, `${appId}-update`)
    fs.mkdirSync(dir, { recursive: true })
    let expectedSha512 = null
    if (manifest && RELEASE_DOWNLOAD_PREFIX.test(manifest.browser_download_url || '')) {
      const manifestPath = path.join(dir, 'latest.yml')
      await downloadToFile(manifest.browser_download_url, manifestPath, { userAgent })
      expectedSha512 = fs.readFileSync(manifestPath, 'utf8').match(/^\s*sha512:\s*(\S+)/m)?.[1] || null
    }

    const dest = path.join(dir, `MedVoz-Setup-${version}.exe`)
    let lastSent = 0
    const download = await downloadToFile(installer.browser_download_url, dest, {
      userAgent,
      onProgress: (received, total) => {
        const now = Date.now()
        if (now - lastSent < 200 && received !== total) return
        lastSent = now
        onProgress({ received, total: total || installer.size || 0, version })
      }
    })
    if (installer.size && download.size !== installer.size) {
      fs.rmSync(dest, { force: true })
      return { ok: false, message: 'Download incompleto. Tente novamente.' }
    }
    if (expectedSha512 && download.sha512 !== expectedSha512) {
      fs.rmSync(dest, { force: true })
      return { ok: false, message: 'O arquivo baixado nao confere com a versao publicada. Tente novamente.' }
    }
    return { ok: true, version, path: dest, verified: Boolean(expectedSha512) }
  }

  return { downloadLatest }
}

module.exports = { createUpdateService, isNewerVersion }
