const IDENTITY_LABELS = {
  full:       '全职',
  internship: '实习',
  student:    '在校',
}

const STATUS_LABELS = {
  pending:   '待付款',
  claimed:   '制作中',
  completed: '已完成',
}

const INTENSITY_LABELS = {
  basic:    '基础润色',
  standard: '标准润色',
  senior:   '深度润色',
}

const MODE_LABELS = {
  position: '岗位润色',
  self:     '自身润色',
}

function formatTime(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDate(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function pad(n) { return String(n).padStart(2, '0') }

function maskEmail(email) {
  if (!email) return '—'
  return email.replace(/(.{2}).+(@.+)/, '$1***$2')
}

function fileSizeLabel(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

module.exports = {
  IDENTITY_LABELS, STATUS_LABELS, INTENSITY_LABELS, MODE_LABELS,
  formatTime, formatDate, pad, maskEmail, fileSizeLabel,
}
