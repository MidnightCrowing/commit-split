import * as gitCommands from '../src/commit/gitCommands.ts'
import { parseGitStatusOutput } from '../src/commit/gitStatusParser.ts'
import { FileState } from '../src/config/types.ts'

jest.mock('../src/commit/gitCommands.ts', () => ({
  getFileDiff: jest.fn(() => 'diff content'),
}))

describe('gitStatusParser', () => {
  it('should parse modified, added, renamed, and deleted files correctly', async () => {
    const statusOutput = `
M  file1.txt
A  file2.txt
R  file3.txt -> file5.txt
D  file4.txt
    `.trim()

    const result = await parseGitStatusOutput(statusOutput)

    expect(result).toHaveLength(4)

    expect(result[0]).toEqual({
      path: 'file1.txt',
      state: FileState.M,
      diff: 'diff content',
    })

    expect(result[1]).toEqual({
      path: 'file2.txt',
      state: FileState.A,
      diff: 'diff content',
    })

    expect(result[2]).toEqual({
      path: 'file5.txt',
      state: FileState.R,
      diff: 'diff content',
    })

    expect(result[3]).toEqual({
      path: 'file4.txt',
      state: FileState.D,
      diff: undefined,
    })
  })

  it('should handle empty status output gracefully', async () => {
    const statusOutput = ` `.trim() // 空输出

    const result = await parseGitStatusOutput(statusOutput)

    expect(result).toHaveLength(0)
  })

  it('should parse files with only modification status correctly', async () => {
    const statusOutput = `
M  file1.txt
M  file2.txt
    `.trim()

    const result = await parseGitStatusOutput(statusOutput)

    expect(result).toHaveLength(2)

    expect(result[0]).toEqual({
      path: 'file1.txt',
      state: FileState.M,
      diff: 'diff content',
    })

    expect(result[1]).toEqual({
      path: 'file2.txt',
      state: FileState.M,
      diff: 'diff content',
    })
  })

  it('should handle unknown file states gracefully', async () => {
    const statusOutput = `X  invalid-file.txt`.trim()

    const consoleErrorMock = jest.spyOn(console, 'error').mockImplementation(() => {})

    const result = await parseGitStatusOutput(statusOutput)

    expect(result).toHaveLength(0)
    expect(consoleErrorMock).toHaveBeenCalledWith('无法解析 Git 状态行: X  invalid-file.txt')

    consoleErrorMock.mockRestore()
  })

  it('should handle files with no diff content properly', async () => {
    jest.spyOn(gitCommands, 'getFileDiff').mockResolvedValue(undefined)

    const statusOutput = `
M  file1.txt
D  file2.txt
    `.trim()

    const result = await parseGitStatusOutput(statusOutput)

    expect(result).toHaveLength(2)

    expect(result[0]).toEqual({
      path: 'file1.txt',
      state: FileState.M,
    })

    expect(result[1]).toEqual({
      path: 'file2.txt',
      state: FileState.D,
    })

    // 恢复 getFileDiff 模拟
    jest.restoreAllMocks()
  })

  it('should handle renamed files without diff content', async () => {
    jest.spyOn(gitCommands, 'getFileDiff').mockResolvedValue(undefined)

    const statusOutput = `R  file3.txt -> file5.txt`

    const result = await parseGitStatusOutput(statusOutput)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      path: 'file5.txt',
      state: FileState.R,
    })

    jest.restoreAllMocks()
  })
})
