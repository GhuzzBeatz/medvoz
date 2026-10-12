const path = require('path')
const fs = require('fs')
const os = require('os')
const { app, BrowserWindow } = require('electron')

const root = path.resolve(process.env.GHZ_APP_ROOT || '')
if (!root || !fs.existsSync(path.join(root, 'package.json'))) {
  throw new Error('Defina GHZ_APP_ROOT para o repositorio do aplicativo.')
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const mainFile = path.join(root, packageJson.main || 'main.js')
const tempData = fs.mkdtempSync(path.join(os.tmpdir(), 'ghz-license-smoke-'))

app.setAppPath(root)
app.setPath('userData', tempData)
process.chdir(root)
process.env.NEXHOTEL_DATA_DIR = path.join(tempData, 'data')
process.env.FOLHAPRO_DATA_DIR = path.join(tempData, 'data')

require(mainFile)

app.whenReady().then(() => {
  setTimeout(async () => {
    try {
      const allWindows = BrowserWindow.getAllWindows().filter((item) => !item.isDestroyed())
      const windows = allWindows.filter((item) => !decodeURIComponent(item.webContents.getURL()).replace(/\\/g, '/').endsWith('/splash.html'))
      const visibleWindows = allWindows.filter((item) => item.isVisible())
      if (windows.length !== 1) throw new Error(`Esperava uma janela funcional; encontrou ${windows.length}.`)
      if (visibleWindows.length > 1) throw new Error(`Mais de uma janela visivel: ${visibleWindows.length}.`)

      const win = windows[0]
      const firstUrl = decodeURIComponent(win.webContents.getURL()).replace(/\\/g, '/')
      if (!firstUrl.endsWith('/pages/licenca.html')) {
        throw new Error(`Conteudo abriu antes da licenca: ${firstUrl}`)
      }

      await win.webContents.executeJavaScript("window.location.replace('../index.html')")
      await new Promise((resolve) => setTimeout(resolve, 350))
      const finalUrl = decodeURIComponent(win.webContents.getURL()).replace(/\\/g, '/')
      if (!finalUrl.endsWith('/pages/licenca.html')) {
        throw new Error(`Gate permitiu navegacao sem licenca: ${finalUrl}`)
      }

      process.stdout.write(JSON.stringify({ app: packageJson.name, windows: windows.length, visibleWindows: visibleWindows.length, blocked: true }))
      app.exit(0)
    } catch (error) {
      process.stderr.write(error.stack || error.message)
      app.exit(1)
    }
  }, 1200)
})
