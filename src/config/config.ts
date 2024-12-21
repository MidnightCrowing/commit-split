import * as fs from 'node:fs'
import os from 'node:os'
import * as path from 'node:path'

import { logError, logInfo, logWarning } from '../utils/consoleUtils.js'
import type { ConfigData, Model, ModelData } from './types.js'

class Config {
  private readonly configFilePath: string
  private configData: ConfigData

  constructor() {
    this.configFilePath = path.join(os.homedir(), '.cmsplit')
    this.configData = this.readConfigFile() || {}
  }

  // 读取配置文件内容并返回数据
  private readConfigFile(): Record<string, any> | null {
    if (!fs.existsSync(this.configFilePath)) {
      return null
    }
    try {
      const fileContent = fs.readFileSync(this.configFilePath, 'utf-8')
      return JSON.parse(fileContent)
    }
    catch (error) {
      logError('Reading the configuration file:', error, true)
      return null
    }
  }

  // 保存配置数据到文件
  private saveConfigFile(): void {
    fs.writeFileSync(this.configFilePath, JSON.stringify(this.configData, null, 2), 'utf-8')
  }

  // 删除配置文件
  public deleteConfigFile(): void {
    if (fs.existsSync(this.configFilePath)) {
      fs.unlinkSync(this.configFilePath)
      logInfo('Configuration file deleted.')
    }
    else {
      logWarning('Configuration file does not exist.')
    }
  }

  // 获取当前配置数据
  public getConfig(): ConfigData {
    return this.configData
  }

  // 更新配置数据
  public updateConfig(newConfig: ConfigData): void {
    this.configData = newConfig
    this.saveConfigFile()
  }

  // 添加新的配置项
  public addConfig(key: string, value: any): void {
    this.configData[key] = value
    this.saveConfigFile()
  }

  // 删除指定的配置项
  public deleteConfig(key: string): void {
    if (this.configData[key]) {
      delete this.configData[key]
      this.saveConfigFile()
    }
    else {
      logWarning(`Configuration for "${key}" not found.`)
    }
  }
}

class ModelConfig {
  private config: Config

  constructor(config: Config) {
    this.config = config
  }

  // 获取模型配置列表
  public getModelList(): Record<Model, ModelData> {
    const config = this.config.getConfig()
    return config.model || {}
  }

  // 添加模型配置
  public addModel(name: Model, baseURL: string, apiKey: string): void {
    const config = this.config.getConfig()
    if (!config.model) {
      config.model = {}
    }
    config.model[name] = { baseURL, apiKey }
    this.config.updateConfig(config)
  }

  // 删除指定的模型配置
  public deleteModel(name: Model): void {
    const config = this.config.getConfig()
    if (config.model && config.model[name]) {
      delete config.model[name]
      this.config.updateConfig(config)
    }
    else {
      logWarning(`Model configuration for "${name}" not found.`)
    }
  }

  // 获取指定模型配置
  public getModel(name: Model): ModelData {
    const config = this.config.getConfig()
    return config.model ? config.model[name] : null
  }
}

export const config = new Config()
export const modelConfig = new ModelConfig(config)
