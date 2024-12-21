import { exec } from 'node:child_process'
import { promisify } from 'node:util'

import { logError, logWarning } from '../utils/consoleUtils.js'

export const execAsync = promisify(exec)

/**
 * 检查 `git` 是否可以在控制台使用
 * @returns 若可用返回 true，否则返回 false
 */
export async function isGitAvailable(): Promise<boolean> {
  try {
    const { stdout, stderr } = await execAsync('git --version')
    if (stderr) {
      logError('Error while checking Git availability:', stderr, true)
      return false
    }
    return Boolean(stdout.trim())
  }
  catch (error) {
    logError('Exception occurred while checking Git availability:', error, true)
    return false
  }
}

/**
 * 检查当前目录是否由 `git` 管理
 * @returns 若为 Git 仓库返回 true，否则返回 false
 */
export async function isGitRepository(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('git rev-parse --is-inside-work-tree')
    return stdout.trim() === 'true'
  }
  catch (error: any) {
    if (!(error.stderr && typeof error.stderr === 'string' && error.stderr.includes('not a git repository'))) {
      logError('Exception occurred while checking Git repository:', error, true)
    }

    return false
  }
}

/**
 * 获取 `git status --porcelain` 的输出
 * @returns 包含文件状态信息的字符串，去除多余空格；若出错则返回空字符串
 */
export async function getGitStatusOutput(): Promise<string> {
  const { stdout, stderr } = await execAsync('git status --porcelain')
  if (stderr) {
    logError('Git command error:', stderr, true)
    return ''
  }
  return stdout.trim()
}

/**
 * 获取指定文件的 Git 差异
 * @param filePath - 文件的路径
 * @returns 文件差异内容字符串，包含可能的 Git 警告/错误信息；若出错则返回 undefined
 */
export async function getFileDiff(filePath: string): Promise<string | undefined> {
  try {
    const { stdout, stderr } = await execAsync(`git diff ${filePath}`)
    let diff = stdout
    if (stderr) {
      diff += `\n[Git Warning/Error]:\n${stderr}`
    }
    return diff
  }
  catch (error) {
    logError(`Error while getting the diff for file ${filePath}:`, error, true)
    return undefined
  }
}

/**
 * 获取最近 n 条提交的标题
 * @param n - 获取的提交数，默认为 10
 * @returns 最近 n 条提交的标题的字符串，标题之间用换行符分隔；若出错则返回空字符串
 */
export async function getRecentCommitTitles(n: number = 10): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(`git log --pretty=format:"%s" -n ${n}`)
    if (stderr) {
      logWarning(`Git command warning/error: ${stderr}`)
    }
    return stdout.trim().split('\n').filter(title => title.length > 0).join('\n')
  }
  catch (error) {
    logError('Error while getting commit title:', error, true)
    return ''
  }
}

/**
 * 提交指定的文件
 * @param title - 提交的标题
 * @param files - 要提交的文件列表
 */
export async function commitFiles(title: string, files: string[]): Promise<void> {
  try {
    if (files.length > 0) {
      await execAsync(`git commit -m "${title}" ${files.join(' ')}`)
    }
  }
  catch (error) {
    logError('Error during commit:', error, true)
  }
}
