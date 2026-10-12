const form = document.getElementById('licenseForm')
const keyInput = document.getElementById('licenseKey')
const phoneInput = document.getElementById('licensePhone')
const message = document.getElementById('licenseMessage')
const appVersion = document.getElementById('appVersion')
const supportButton = document.getElementById('supportButton')

window.ghzApp.getConfig().then((config) => {
  if (config?.version) appVersion.textContent = `Versao ${config.version}`
}).catch(() => {
  appVersion.textContent = 'Versao indisponivel'
})

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const button = form.querySelector('button')
  button.disabled = true
  message.textContent = 'Validando licenca...'
  message.className = 'message'

  const result = await window.ghzApp.activateLicense({
    license_key: keyInput.value,
    phone: phoneInput.value
  })
  if (!result?.ok) {
    message.textContent = result?.message || 'Licenca invalida.'
    message.className = 'message error'
    button.disabled = false
  }
})

document.getElementById('minimizeButton').addEventListener('click', () => window.ghzApp.minimize())
document.getElementById('closeButton').addEventListener('click', () => window.ghzApp.close())
supportButton.addEventListener('click', () => window.ghzApp.openSupport())
