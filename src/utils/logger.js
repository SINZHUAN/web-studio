/**
 * logger.js - 网页版日志控制器
 * 移植自 miniprogram/utils_utl/logger.js，适配网页环境
 */

const ENABLE_LOGS = import.meta.env.DEV

const noop = () => {}

export function applyGlobalConsole() {
  if (!ENABLE_LOGS) {
    window._originalConsole = {
      log: console.log,
      warn: console.warn,
      info: console.info
    }
    console.log = noop
    console.warn = noop
    console.info = noop
  }
}

export function restoreConsole() {
  if (window._originalConsole) {
    console.log = window._originalConsole.log
    console.warn = window._originalConsole.warn
    console.info = window._originalConsole.info
  }
}

export default { applyGlobalConsole, restoreConsole }
