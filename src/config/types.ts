// 文件状态枚举
export enum FileState {
  M = 1, // MODIFIED
  A = 2, // ADDED
  R = 4, // RENAMED
  D = 8, // DELETED
}

export interface FileChange {
  path: string
  state: FileState
  diff?: string
}

export interface AICommit {
  title: string
  changes: string[]
}

export type ConfigData = Record<'model' | string, any>
export type Model = string
export interface ModelData {
  baseURL: string
  apiKey: string
}

export interface GeneratorValidationResult {
  valid: boolean
  duplicateFiles: string[]
  missingFiles: string[]
  invalidFiles: string[]
}
