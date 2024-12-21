#!/usr/bin/env node

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as process from 'node:process'
import { fileURLToPath } from 'node:url'

import { Command, program } from 'commander'
import inquirer from 'inquirer'

import { getAICommits, validateAIOutput } from './commit/commitGenerator.js'
import { commitFiles, getRecentCommitTitles, isGitAvailable, isGitRepository } from './commit/gitCommands.js'
import { getGitFileChanges } from './commit/gitStatusParser.js'
import { modelConfig } from './config/config.js'
import type { AICommit, GeneratorValidationResult, Model } from './config/types.js'
import { BgGreen, green, logError, logInfo, logSuccess, logWarning, yellow } from './utils/consoleUtils.js'
import { outputModelList } from './utils/modelUtils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const packageJsonPath = path.resolve(__dirname, '..', 'package.json')
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

/**
 * 注册 list-ai 命令：列出所有模型配置
 */
const listModelCommand = new Command('list-ai')
  .description('List all AI model configurations')
  .action(outputModelList)

/**
 * 注册 set-ai 命令：设置模型配置
 */
const setModelCommand = new Command('set-ai')
  .description('Set AI model configuration')
  .argument('<name>', 'Model name')
  .option('-u, --base_url <url>', 'Base URL of the model service')
  .option('-k, --key <apiKey>', 'API key for the model service')
  .action((name, options) => {
    const { base_url, key } = options
    if (!base_url || !key) {
      logError('Both --base_url and --key options are required.', '', true)
      process.exit(1)
    }
    modelConfig.addModel(name, base_url, key)
    logSuccess(`Model '${name}' has been added successfully.`)
  })

/**
 * 注册 delete-ai 命令：删除模型配置
 */
const deleteModelCommand = new Command('delete-ai')
  .description('Delete an AI model configuration')
  .argument('<name>', 'Model name to delete')
  .action((name) => {
    modelConfig.deleteModel(name)
    logSuccess(`Model '${name}' has been deleted successfully.`)
  })

async function checkGitEnvironment(): Promise<boolean> {
  if (!(await isGitAvailable())) {
    logError('Git is not available. Please ensure Git is installed and configured properly.', '', true)
    return false
  }

  if (!(await isGitRepository())) {
    logError(`Current directory (${process.cwd()}) is not a Git repository.`, '', true)
    return false
  }

  return true
}

async function selectModel(): Promise<{ model: Model, baseURL: string, apiKey: string }> {
  const models = modelConfig.getModelList()
  const modelNames = Object.keys(models)

  if (modelNames.length === 0) {
    logError('No AI model configurations found. Please set up at least one model.', '', true)
    process.exit(1)
  }

  let selectedModel: string
  if (modelNames.length === 1) {
    selectedModel = modelNames[0]
    logInfo(`Using model: ${green(selectedModel)}`)
  }
  else {
    const { model } = await inquirer.prompt([
      {
        type: 'list',
        name: 'model',
        message: 'Select an AI model:',
        choices: modelNames,
      },
    ])
    selectedModel = model
  }

  const { baseURL, apiKey } = models[selectedModel]
  if (!baseURL || !apiKey) {
    logError('Selected model configuration is incomplete.', '', true)
    process.exit(1)
  }

  return { model: selectedModel, baseURL, apiKey }
}

async function askToContinue(aiCommits: AICommit[], validationResult: GeneratorValidationResult): Promise<void> {
  const message = validationResult.valid
    ? 'Do you want to continue with the commit?'
    : 'Validation failed. Do you still want to continue with the commit?'
  const answer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'continue',
      message,
      default: true,
    },
  ])

  if (answer.continue) {
    logInfo('\n4. Proceeding with the commit...')
    await commitChanges(aiCommits, validationResult)

    logInfo(BgGreen('\n                                                                 '))
    logInfo(BgGreen('   [OK] Commit completed successfully!                           '))
    logInfo(BgGreen('                                                                 '))
  }
  else {
    logWarning('\nCommit has been canceled.')
  }
}

async function commitChanges(aiCommits: AICommit[], validationResult: GeneratorValidationResult): Promise<void> {
  const filesToCommit: AICommit[] = aiCommits

  if (!validationResult.valid) {
    if (validationResult.duplicateFiles.length > 0) {
      const committedFiles = new Set<string>()

      for (let i = filesToCommit.length - 1; i >= 0; i--) {
        filesToCommit[i].changes = filesToCommit[i].changes.filter((filePath) => {
          if (!validationResult.duplicateFiles.includes(filePath)) {
            return true // 保留非重复文件
          }

          if (committedFiles.has(filePath)) {
            return false // 如果已提交过，移除
          }

          committedFiles.add(filePath) // 标记为已提交
          return true
        })
      }
    }

    if (validationResult.invalidFiles.length > 0) {
      const invalidFileSet = new Set(validationResult.invalidFiles)
      for (const commit of filesToCommit) {
        commit.changes = commit.changes.filter(filePath => !invalidFileSet.has(filePath))
      }
    }
  }

  for (const commit of filesToCommit) {
    await commitFiles(commit.title, commit.changes)
  }
}

function displayCommitMessages(aiCommits: AICommit[]): void {
  logInfo(' AI-Generated Commit Messages:')
  logInfo(' --------- --------------------------------------------------')
  for (let i = 0; i < aiCommits.length; i++) {
    const commit = aiCommits[i]
    logInfo(green('  Summary   ') + commit.title)
    logInfo(green('  Files     ') + commit.changes.join(', '))

    if (i < aiCommits.length - 1) {
      logInfo()
    }
  }
  logInfo(' --------- --------------------------------------------------\n')
}

function displayValidationWarnings(validationResult: GeneratorValidationResult): void {
  logWarning('Validation failed:', '', true)
  if (validationResult.duplicateFiles.length > 0) {
    logInfo(` - ${yellow('Duplicate files')}: ${validationResult.duplicateFiles.join(', ')}`)
  }
  if (validationResult.missingFiles.length > 0) {
    logInfo(` - ${yellow('Missing files')}: ${validationResult.missingFiles.join(', ')}`)
  }
  if (validationResult.invalidFiles.length > 0) {
    logInfo(` - ${yellow('Invalid files')}: ${validationResult.invalidFiles.join(', ')}`)
  }
  logInfo()
}

async function main(projectPath: string): Promise<void> {
  // 切换到指定项目目录
  process.chdir(projectPath)

  // 检查 Git 环境
  if (!await checkGitEnvironment()) {
    return
  }

  // 获取文件变更
  const fileChanges = await getGitFileChanges()
  if (fileChanges.length === 0) {
    logSuccess('✔ No file changes detected.')
    return
  }

  // 获取最近的提交标题
  const gitHistoryTitle = await getRecentCommitTitles()

  // 选择模型
  const { model, baseURL, apiKey } = await selectModel()

  // 生成 AI 提交信息
  process.stdout.write('\n1. Generating AI commits...')
  const aiCommits = await getAICommits(model, baseURL, apiKey, fileChanges, gitHistoryTitle)
  if (!aiCommits) {
    logInfo(`\r${yellow('⚠ No commits generated by AI.')}`)
    return
  }
  else {
    logInfo(`\r1. Generating AI commits: ${green('√')}`)
  }

  // 验证 AI 输出
  process.stdout.write('\n2. Validating AI output...')
  const validationResult = validateAIOutput(aiCommits, fileChanges)
  logInfo(`\r2. Validating AI output: ${green('√')}`)

  // 输出提交信息
  logInfo('\n3. Confirming commit message:')
  displayCommitMessages(aiCommits)

  // 如果验证失败，显示警告信息
  if (!validationResult.valid) {
    displayValidationWarnings(validationResult)
  }

  // 询问用户是否继续提交
  await askToContinue(aiCommits, validationResult)
}

program
  .name('cmsplit')
  .version(pkg.version)
  .description(`${pkg.name} - ${pkg.description}`)
  .option('-p, --path <path>', 'Path to the project directory', '.')
  .addCommand(listModelCommand)
  .addCommand(setModelCommand)
  .addCommand(deleteModelCommand)
  .action(async () => {
    if (!process.argv.slice(2).length) {
      // 如果未传入任何参数，输出帮助信息
      program.outputHelp()
    }
    else {
      const options = program.opts()
      const projectPath = path.resolve(options.path)
      await main(projectPath)
    }
  })
  .parse(process.argv)
