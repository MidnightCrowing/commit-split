import process from 'node:process'

import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

import type { AICommit, FileChange, GeneratorValidationResult, Model } from '../config/types.js'
import { FileState } from '../config/types.js'
import { logError, logInfo } from '../utils/consoleUtils.js'

function getFileStateStrings(fileState: number): string {
  const stateMap: Record<FileState, string> = {
    [FileState.M]: 'MODIFIED',
    [FileState.A]: 'ADDED',
    [FileState.R]: 'RENAMED',
    [FileState.D]: 'DELETED',
  }

  return (Object.keys(FileState) as Array<keyof typeof FileState>)
    .filter(key => Number.isNaN(Number(key))) // 过滤掉数字键
    .filter(key => (fileState & FileState[key as keyof typeof FileState]) !== 0) // 确保是数字类型
    .map(key => stateMap[FileState[key as keyof typeof FileState]]) // 使用类型断言访问 stateMap
    .join(', ') // 拼接成单一字符串
}

function formatFileChanges(fileChanges: FileChange[]): string {
  const formattedChanges = fileChanges.map((change) => {
    const formattedChange: { path: string, state: string, diff?: string } = {
      path: change.path,
      state: getFileStateStrings(change.state),
    }

    if (change.diff) {
      formattedChange.diff = change.diff // 如果 diff 不为空字符串，则添加
    }

    return formattedChange
  })

  return JSON.stringify(formattedChanges, null, 2) // 转换为格式化的 JSON 字符串
}

function getAIMessages(fileChanges: FileChange[], gitHistoryTitle: string): Array<ChatCompletionMessageParam> {
  const formattedFileChanges = formatFileChanges(fileChanges)

  return [
    {
      role: 'system',
      content:
          'You are a code versioning assistant focused on processing Git diff information. '
          + 'Your task is to group Group code diffs and generate Git commit titles for each '
          + 'grouping. Please note: '
          + '1. All files in the input need to be included in the commit grouping; please do '
          + 'not duplicate, overflow, or omit any files.'
          + '2. File paths must remain the same, do not modify or simplify them.'
          + '3. If possible, please merge changes from multiple files to reduce the number of '
          + 'submissions.'
          + 'Titles should refer to the last few git titles. The output JSON must strictly '
          + 'adhere to the following format. field names and types must be '
          + 'be identical, no more or less:'
          + '{\n'
          + '  "commits": [\n'
          + '    {\n'
          + '      "title": "...",\n'
          + '      "changes": ["src/file1.py"]\n'
          + '    },\n'
          + '    {\n'
          + '      "title": "...",\n'
          + '      "changes": ["src/file2.py", "src/file3.py"]\n'
          + '    }\n'
          + '  ]\n'
          + '}\n'
          + 'Please ensure that the JSON formatting is correct and that the output does not '
          + 'contain any additional text, code or interpretation.',
    },
    {
      role: 'system',
      content: `Here are a few past git titles for reference:${gitHistoryTitle}`,
    },
    {
      role: 'user',
      content: 'Below are the changes to the code, please use these to generate the appropriate '
        + `commit grouping and title:${formattedFileChanges}`,
    },
  ]
}

// 验证单个提交的格式
function isValidSingleCommit(commit: { title: any, changes: any[] }): boolean {
  return typeof commit.title === 'string' && Array.isArray(commit.changes)
}

// 新的函数用于验证整个解析结果的格式，并包含对单个提交的验证
function validateAICommit(parsedData: any): parsedData is { commits: { title: string, changes: string[] }[] } {
  if (!Array.isArray(parsedData.commits)) {
    return false
  }

  // 使用 `every` 验证每个提交是否符合格式
  return parsedData.commits.every((commit: { title: string, changes: any[] }) => isValidSingleCommit(commit))
}

export async function getAICommits(model: Model, baseURL: string, apiKey: string, fileChanges: FileChange[], gitHistoryTitle: string): Promise<AICommit[] | undefined> {
  const client = new OpenAI({
    baseURL,
    apiKey,
  })

  try {
    const chatCompletion = await client.chat.completions.create({
      model,
      messages: getAIMessages(fileChanges, gitHistoryTitle),
    })

    if (chatCompletion.choices && chatCompletion.choices[0]?.message?.content) {
      // 清理返回结果，去除Markdown格式
      const cleanJson = chatCompletion.choices[0].message.content.replace(/```json|```/g, '').trim()

      try {
        // 解析JSON数据并确保符合AICommit接口
        const parsedData = JSON.parse(cleanJson)

        // 检查是否为有效的AICommit格式
        if (validateAICommit(parsedData)) {
          return parsedData.commits.map((commit: { title: string, changes: string[] }) => ({
            title: commit.title,
            changes: commit.changes,
          }))
        }
        else {
          logInfo()
          logError('The parsed result does not match the expected format:', parsedData, true)
        }
      }
      catch {
        logInfo()
        logError('The content returned by AI cannot be parsed as JSON:', cleanJson, true)
      }
    }
    else {
      logInfo()
      logError('The content returned by AI is empty or invalid:', chatCompletion, true)
    }
  }
  catch (error) {
    logInfo()
    logError('Request failed:', error, true)
  }
  process.exit(1)
}

export function validateAIOutput(parsedJson: { changes: string[] }[], fileChanges: FileChange[]): GeneratorValidationResult {
  const allFilePaths = fileChanges.map(fileChange => fileChange.path)
  const aiFilePaths = parsedJson.flatMap(commit => commit.changes)

  const result: GeneratorValidationResult = {
    valid: true,
    duplicateFiles: [],
    missingFiles: [],
    invalidFiles: [],
  }

  // 1. 验证文件是否重复
  const duplicateFiles = aiFilePaths.filter((file, index) => aiFilePaths.indexOf(file) !== index)
  if (duplicateFiles.length > 0) {
    result.duplicateFiles = [...new Set(duplicateFiles)]
  }

  // 2. 验证是否缺失文件
  const missingFiles = allFilePaths.filter(file => !aiFilePaths.includes(file))
  if (missingFiles.length > 0) {
    result.missingFiles = missingFiles
  }

  // 3. 验证是否存在非列表中的文件
  const invalidFiles = aiFilePaths.filter(file => !allFilePaths.includes(file))
  if (invalidFiles.length > 0) {
    result.invalidFiles = [...new Set(invalidFiles)]
  }

  result.valid = !duplicateFiles.length && !missingFiles.length && !invalidFiles.length

  return result
}
