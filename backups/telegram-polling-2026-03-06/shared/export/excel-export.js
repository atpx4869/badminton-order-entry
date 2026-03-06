import XLSX from 'xlsx-js-style'

import {
  collectImportableRows,
  formatProductDescForDisplay,
  formatDateTime,
  getIssueCodes,
  getIssueText,
} from '../parser/order-parser.js'

function formatDateParts(date = new Date()) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return { yyyy, mm, dd }
}

function withSerial(rows) {
  return rows.map((row, index) => ({
    ...row,
    serialNo: index + 1,
  }))
}

function buildOrderSheetRows(report) {
  const orderedRows = withSerial(collectImportableRows(report, true))
  return orderedRows.map((row) => ({
    序号: row.serialNo,
    姓名: row.name,
    联系方式: row.phone,
    收货地址: row.address,
    商品描述: formatProductDescForDisplay(row),
    商品数量: row.productQty,
    羽毛球数量: row.shuttlecockQty || '',
    拍包数量: row.bagQty || '',
    手胶数量: row.gripQty || '',
    代理人: row.agent,
    发货地: row.shipFrom,
    运费: row.freight || '',
    快递单号: row.trackingNo,
    导入时间: row.importedAt || formatDateTime(),
    解析状态: row.parseStatus === 'warning' ? '待确认' : '成功',
    问题说明: getIssueText(row.parseIssues),
  }))
}

function buildFailedSheetRows(report) {
  return report.failedRows.map((row) => ({
    段落序号: row.blockIndex,
    问题码: getIssueCodes(row.issues),
    问题说明: getIssueText(row.issues),
    原始片段: row.raw,
  }))
}

function applySheetStyle(sheet, options = {}) {
  const rangeRef = sheet['!ref']
  if (!rangeRef) {
    return
  }

  const range = XLSX.utils.decode_range(rangeRef)
  const borderStyle = {
    top: { style: 'thin', color: { rgb: 'D9D9D9' } },
    bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
    left: { style: 'thin', color: { rgb: 'D9D9D9' } },
    right: { style: 'thin', color: { rgb: 'D9D9D9' } },
  }

  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex += 1) {
      const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })
      const cell = sheet[cellAddress]
      if (!cell) {
        continue
      }
      const isHeader = rowIndex === range.s.r
      cell.s = {
        font: { bold: isHeader },
        fill: {
          fgColor: {
            rgb: isHeader ? (options.headerColor ?? 'F3F4F6') : rowIndex > 0 && options.warningRows?.has(rowIndex) ? 'FFF7CC' : 'FFFFFF',
          },
        },
        alignment: {
          vertical: 'center',
          horizontal: colIndex === 0 ? 'center' : 'left',
          wrapText: true,
        },
        border: borderStyle,
      }
    }
  }

  sheet['!rows'] = [{ hpt: 24 }, ...Array.from({ length: Math.max(range.e.r - range.s.r, 0) }, () => ({ hpt: 42 }))]
}

export function buildParseWorkbook(report, options = {}) {
  const label = options.label ?? 'telegram'
  const orderRows = buildOrderSheetRows(report)
  const failedRows = buildFailedSheetRows(report)

  const wb = XLSX.utils.book_new()

  const orderSheet = XLSX.utils.json_to_sheet(orderRows.length ? orderRows : [{ 提示: '没有可导入订单' }])
  orderSheet['!cols'] = [
    { wch: 7 },
    { wch: 12 },
    { wch: 14 },
    { wch: 36 },
    { wch: 24 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 8 },
    { wch: 16 },
    { wch: 20 },
    { wch: 10 },
    { wch: 28 },
  ]

  const warningRows = new Set()
  orderRows.forEach((row, index) => {
    if (row.解析状态 === '待确认') {
      warningRows.add(index + 1)
    }
  })
  applySheetStyle(orderSheet, { warningRows, headerColor: 'EAF2FF' })
  XLSX.utils.book_append_sheet(wb, orderSheet, '订单')

  const failedSheet = XLSX.utils.json_to_sheet(failedRows.length ? failedRows : [{ 提示: '没有识别失败记录' }])
  failedSheet['!cols'] = [{ wch: 10 }, { wch: 26 }, { wch: 36 }, { wch: 60 }]
  applySheetStyle(failedSheet, { headerColor: 'FDECEC' })
  XLSX.utils.book_append_sheet(wb, failedSheet, '识别失败')

  const { yyyy, mm, dd } = formatDateParts(new Date())
  const filename = `商单_${label}_${yyyy}-${mm}-${dd}.xlsx`
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true })

  return {
    filename,
    buffer,
    workbook: wb,
  }
}

