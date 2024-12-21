import chalk from 'chalk'

const color = {
  red: '#FF4D4F',
  green: '#41A971',
  yellow: '#FFDD57',
  // blue: '#1890FF',
  // purple: '#7265e6',
  darkGray: '#4A4840',
}

export const green = chalk.hex(color.green)
export const BgGreen = chalk.bgHex(color.green)
export const yellow = chalk.hex(color.yellow)
export const red = chalk.hex(color.red)

export function warningBlock(message: string = ''): string {
  return `${chalk.bgHex(color.darkGray)(' ') + chalk.bgHex(color.yellow).black(` WARNING `)} ${chalk.hex(color.yellow)(message)}`
}

export function errorBlock(message: string = ''): string {
  return `${chalk.bgHex(color.darkGray)(' ') + chalk.bgHex(color.red).black(` ERROR `)} ${chalk.hex(color.red)(message)}`
}

export function logInfo(message: string = '') {
  console.log(message)
}

export function logSuccess(message: string) {
  console.log(green(message))
}

export function logWarning(message: string, warning: any = '', useBlock: boolean = false) {
  if (useBlock) {
    console.warn(`${warningBlock(message)}`, warning)
  }
  else {
    console.warn(`${yellow(message)}`, warning)
  }
}

export function logError(message: string, error: any = '', useBlock: boolean = false) {
  if (useBlock) {
    console.error(`${errorBlock(message)}`, error)
  }
  else {
    console.warn(`${red(message)}`, error)
  }
}
