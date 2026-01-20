import process from 'node:process'

import type { FileChange } from '../config/types.js'
import { FileState } from '../config/types.js'
import { logError, logWarning, yellow } from '../utils/consoleUtils.js'
import { getFileDiff, getGitStatusOutput } from './gitCommands.js'

// 获取项目路径下的 Git 变更文件
export async function getGitFileChanges(): Promise<FileChange[]> {
  try {
    const gitStatusOutput = await getGitStatusOutput()
    return parseGitStatusOutput(gitStatusOutput)
  }
  catch (error) {
    logError('Error while getting Git status:', error, true)
    return []
  }
}

// 解析 Git 状态输出，返回 FileChange 数组
export async function parseGitStatusOutput(statusOutput: string): Promise<FileChange[]> {
  const fileChanges: FileChange[] = []
  const statusLines = statusOutput.split('\n')
  const statusRegex = /^\s*([MARDU]{1,2}|\?\?)\s{1,2}(.+)$/

  for (const line of statusLines) {
    if (line.trim() === '') {
      continue // 跳过空行
    }

    const match = line.match(statusRegex)
    if (match) {
      const [_, statusCode, filePath] = match

      if (statusCode === '??') {
        logWarning('Untracked file:', `${filePath} ${yellow('(skipping)')}`)
        continue // 跳过未追踪文件
      }
      else if (statusCode.includes('U')) {
        logWarning('Unmerged file:', `${filePath}`, true)
        logWarning('Please resolve the conflict before running the program.')
        process.exit(1) // 未合并的文件，退出进程
      }

      const trimmedFilePath = filePath.trim()
      const fullFilePath = handleRenamedFilePath(trimmedFilePath)

      const fileState = getFileState(statusCode)
      const diff = fileState !== FileState.D ? await getFileDiff(fullFilePath) : undefined
      const fileChange: FileChange = { path: trimmedFilePath, state: fileState }

      if (diff !== undefined) {
        fileChange.diff = diff
      }

      fileChanges.push(fileChange)
    }
    else {
      logError('Unable to parse Git status line:', line, true)
    }
  }

  return fileChanges
}

// 处理重命名文件的路径
function handleRenamedFilePath(filePath: string): string {
  if (filePath.includes('->')) {
    const [, newPath] = filePath.split('->')
    return newPath.trim()
  }
  return filePath
}

// 获取文件的状态值
function getFileState(statusCode: string): FileState {
  return statusCode.split('').reduce((acc, char) => {
    // 通过状态映射来获取 FileState 枚举值
    const stateValue = FileState[char as keyof typeof FileState]
    if (stateValue !== undefined) {
      acc |= stateValue
    }
    return acc
  }, 0 as FileState)
}
