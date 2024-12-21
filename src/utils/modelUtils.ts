import { modelConfig } from '../config/config.js'
import { logInfo, logWarning } from './consoleUtils.js'

function maskApiKey(key: string) {
  if (!key) {
    return 'No API Key'
  }
  const visibleLength = 4 // 可见字符的数量
  return key.length > visibleLength
    ? `${key.slice(0, visibleLength)}${'*'.repeat(key.length - visibleLength)}`
    : '*'.repeat(key.length) // 如果长度小于等于4，直接全掩盖
}

export function outputModelList() {
  const configs = modelConfig.getModelList()
  if (Object.keys(configs).length === 0) {
    logWarning('No model configurations found.')
    return
  }
  logInfo('Model list:')
  for (const [name, config] of Object.entries(configs)) {
    logInfo(`- ${name}:`)
    logInfo(`  Base-URL: ${config.baseURL}`)
    logInfo(`  API-Key: ${maskApiKey(config.apiKey)}`)
  }
}
