/**
 * canvas.js - Canvas 工具函数
 * 移植自 resume_enhance_pag.js 的长图导出相关辅助函数
 */

/**
 * 将文字按宽度换行，返回行数组
 * 对应小程序 _wrapTextToLines
 */
export function wrapTextToLines(ctx, text, maxWidth) {
  if (!text) return ['']
  const chars = text.split('')
  const lines = []
  let current = ''
  for (const ch of chars) {
    const testLine = current + ch
    if (ctx.measureText(testLine).width > maxWidth && current) {
      lines.push(current)
      current = ch
    } else {
      current = testLine
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

/**
 * 计算文本换行后的行数
 */
export function countWrappedLines(ctx, text, maxWidth) {
  return wrapTextToLines(ctx, text, maxWidth).length
}

/**
 * 在 canvas 上绘制自动换行文本，返回绘制后的 y 坐标
 */
export function drawWrapped(ctx, text, x, y, maxWidth, lineHeight) {
  const lines = wrapTextToLines(ctx, text, maxWidth)
  lines.forEach((line, i) => {
    ctx.fillText(line, x, y + i * lineHeight)
  })
  return y + lines.length * lineHeight
}

/**
 * 绘制圆角矩形路径
 */
export function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

/**
 * 根据评分等级返回颜色配置
 * 对应小程序 _getReportColors
 */
export function getReportColors(scoreLevel) {
  const colorMap = {
    'A+': { primary: '#16a34a', light: '#dcfce7', text: '#15803d' },
    'A':  { primary: '#16a34a', light: '#dcfce7', text: '#15803d' },
    'A-': { primary: '#d97706', light: '#fef3c7', text: '#b45309' },
    'B+': { primary: '#d97706', light: '#fef3c7', text: '#b45309' },
    'B':  { primary: '#d97706', light: '#fef3c7', text: '#b45309' },
    'B-': { primary: '#dc2626', light: '#fee2e2', text: '#b91c1c' },
    'C':  { primary: '#dc2626', light: '#fee2e2', text: '#b91c1c' },
  }
  return colorMap[scoreLevel] || { primary: '#666', light: '#f5f5f5', text: '#444' }
}

/**
 * 将 canvas 内容导出为图片并触发下载
 * 对应小程序 wx.canvasToTempFilePath + wx.saveImageToPhotosAlbum
 */
export function exportCanvasAsImage(canvas, filename = 'report.png') {
  const dataURL = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = dataURL
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/**
 * 将 canvas 内容在新标签页预览
 * 对应小程序 wx.previewImage
 */
export function previewCanvasImage(canvas) {
  const dataURL = canvas.toDataURL('image/png')
  window.open(dataURL, '_blank')
}
