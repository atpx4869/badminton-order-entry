const SHIP_FREIGHT_PROVINCES = ['新疆', '西藏', '青海', '海南']

export const DEFAULT_RULE_TEXT = {
  shuttlecock: 'vt,tv,天斧,古红,藏青,70,100zz',
  bag: '拍包',
  grip: '手胶,胶带,缠把',
  anchors: 'vt,tv,天斧,古红,藏青,70,100zz,拍包,手胶',
}

export const DEFAULT_FREIGHT_RULE_TEXT = {
  nonFreeRegions: SHIP_FREIGHT_PROVINCES.join(','),
  freightAmount: 18,
  defaultShipFrom: '湖南',
}

export const ISSUE_CODES = {
  EMPTY_BLOCK: 'EMPTY_BLOCK',
  MISSING_NAME_AND_PHONE: 'MISSING_NAME_AND_PHONE',
  MISSING_ADDRESS: 'MISSING_ADDRESS',
  MISSING_PRODUCT: 'MISSING_PRODUCT',
  ADDRESS_SUSPECT: 'ADDRESS_SUSPECT',
  ADDRESS_TOO_SHORT: 'ADDRESS_TOO_SHORT',
  ADDRESS_CONTAINS_PRODUCT: 'ADDRESS_CONTAINS_PRODUCT',
  INVALID_PHONE: 'INVALID_PHONE',
  MISSING_PHONE: 'MISSING_PHONE',
}

const ADDRESS_ISSUE_SET = new Set([
  ISSUE_CODES.MISSING_ADDRESS,
  ISSUE_CODES.ADDRESS_SUSPECT,
  ISSUE_CODES.ADDRESS_TOO_SHORT,
  ISSUE_CODES.ADDRESS_CONTAINS_PRODUCT,
])

function parseKeywordText(text) {
  return String(text ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildRuleConfig(ruleText = DEFAULT_RULE_TEXT) {
  const shuttlecockKeywords = parseKeywordText(ruleText.shuttlecock)
  const bagKeywords = parseKeywordText(ruleText.bag)
  const gripKeywords = parseKeywordText(ruleText.grip)
  const anchors = parseKeywordText(ruleText.anchors)
  const productAnchors = Array.from(new Set([...anchors, ...shuttlecockKeywords, ...bagKeywords, ...gripKeywords]))
  return {
    shuttlecockKeywords,
    bagKeywords,
    gripKeywords,
    productAnchors,
  }
}

function getNonFreeRegions(freightRuleText = DEFAULT_FREIGHT_RULE_TEXT) {
  return String(freightRuleText.nonFreeRegions ?? '')
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatDateParts(date = new Date()) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return { yyyy, mm, dd, hh, mi, ss }
}

export function formatDateTime(date = new Date()) {
  const { yyyy, mm, dd, hh, mi, ss } = formatDateParts(date)
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

export function normalizeText(text) {
  return String(text ?? '')
    .replace(/\r/g, '')
    .replace(/[\u00A0\u2002-\u200B]/g, ' ')
    .replace(/[【〔［]/g, '[')
    .replace(/[】〕］]/g, ']')
}

function createIssue(code, message) {
  return { code, message }
}

function appendIssue(target, issue) {
  if (!target.some((item) => item.code === issue.code)) {
    target.push(issue)
  }
}

function normalizeAddressLite(address) {
  return normalizeText(address).replace(/[，,]/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractAgentFromHeader(line) {
  const clean = normalizeText(line).replace(/：/g, ':').trim()
  const trimmed = clean.endsWith(':') ? clean.slice(0, -1).trim() : clean
  const proxyMatch = trimmed.match(/代理\s*([^\)\]]+)/)
  if (proxyMatch) {
    const raw = proxyMatch[1] ?? ''
    return `代理${raw.replace(/^[:：\-\s]+/, '').trim()}`
  }
  const dashProxy = trimmed.match(/-\s*(代理[^\)\]]+)/)
  if (dashProxy) {
    return (dashProxy[1] ?? '').trim()
  }
  if (/\d{11}/.test(trimmed)) {
    return ''
  }
  return trimmed
}

function extractVirtualNo(text) {
  const trimmed = String(text ?? '').trim()
  const match = trimmed.match(/^(.*)\[(\d+)\]\s*$/)
  if (!match) {
    return { cleanText: trimmed, virtualNo: '' }
  }
  return {
    cleanText: (match[1] ?? '').trim(),
    virtualNo: (match[2] ?? '').trim(),
  }
}

function stripName(raw) {
  const value = normalizeText(raw).replace(/^(收货人|姓名)\s*[:：]?/, '').trim()
  const extracted = extractVirtualNo(value)
  const cleanText = extracted.cleanText.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim()
  return extracted.virtualNo ? `${cleanText}[${extracted.virtualNo}]` : cleanText
}

function appendVirtualNoSuffix(text, virtualNo) {
  const clean = String(text ?? '').trim().replace(/\[(\d+)\]\s*$/, '').trim()
  if (!clean) {
    return ''
  }
  return virtualNo ? `${clean}[${virtualNo}]` : clean
}

function stripShipFromSuffixInProductDesc(desc) {
  const trimmed = String(desc ?? '').trim()
  if (!trimmed) {
    return ''
  }
  return trimmed.replace(/\s*[（(][^)）]+[)）]\s*$/, '').trim()
}

export function normalizeProductDescText(desc) {
  const withoutShipFrom = stripShipFromSuffixInProductDesc(desc)
  return withoutShipFrom.replace(/^（+/g, '').replace(/）+$/g, '').replace(/^\(+|\)+$/g, '').trim()
}

function getDefaultShipFrom(freightRuleText = DEFAULT_FREIGHT_RULE_TEXT) {
  const fallback = DEFAULT_FREIGHT_RULE_TEXT.defaultShipFrom
  const current = String(freightRuleText.defaultShipFrom ?? '').trim()
  return current || fallback
}

export function computeFreight(address, freightRuleText = DEFAULT_FREIGHT_RULE_TEXT) {
  const amount = Number(freightRuleText.freightAmount || 0)
  const normalizedAddress = normalizeText(address)
  const nonFreeRegions = getNonFreeRegions(freightRuleText)
  return nonFreeRegions.some((region) => normalizedAddress.includes(region)) ? amount : 0
}

function validateAddressSmart(address, ruleConfig, context) {
  const normalizedAddress = normalizeAddressLite(address)
  const issues = []

  if (!normalizedAddress) {
    issues.push(createIssue(ISSUE_CODES.MISSING_ADDRESS, '地址为空，无法生成可用订单'))
    return {
      normalizedAddress,
      issues,
      level: 'failed',
    }
  }

  if (normalizedAddress.length < 8) {
    appendIssue(issues, createIssue(ISSUE_CODES.ADDRESS_TOO_SHORT, '地址长度偏短，请确认是否完整'))
  }

  const hasAddressStructure = /(省|市|区|县|镇|乡|街道|大道|路|号|村|室|栋|单元)/.test(normalizedAddress)
  if (!hasAddressStructure) {
    appendIssue(issues, createIssue(ISSUE_CODES.ADDRESS_SUSPECT, '地址缺少常见结构特征，请人工确认'))
  }

  const productKeywords = [...ruleConfig.productAnchors, '羽毛球', '拍包', '手胶', '胶带', '缠把']
    .map((keyword) => keyword.trim())
    .filter(Boolean)

  const normalizedAddressLower = normalizedAddress.toLowerCase()
  const normalizedProductDesc = String(context?.productDesc ?? '').trim()
  const ignoreAddressContainsProduct = context?.ignoreAddressContainsProduct === true

  const addressContainsProduct =
    !ignoreAddressContainsProduct &&
    (productKeywords.some((keyword) => normalizedAddressLower.includes(keyword.toLowerCase())) ||
      (!!normalizedProductDesc && normalizedAddress.includes(normalizedProductDesc)))

  if (addressContainsProduct) {
    appendIssue(issues, createIssue(ISSUE_CODES.ADDRESS_CONTAINS_PRODUCT, '地址中疑似混入商品信息，请核对拆分结果'))
  }

  if (issues.length > 0) {
    return {
      normalizedAddress,
      issues,
      level: 'warning',
    }
  }

  return {
    normalizedAddress,
    issues,
    level: 'success',
  }
}

function isValidProductAnchorStart(text, index) {
  const prev = text[index - 1] ?? ''
  const next = text[index + 2] ?? ''
  if (/\d/.test(prev) || /\d/.test(next)) {
    return false
  }
  if (next === '号') {
    return false
  }
  return true
}

function splitAddressAndProduct(line, ruleConfig) {
  const trimmed = String(line ?? '').trim()
  if (!trimmed) {
    return { address: '', product: '' }
  }

  const lower = trimmed.toLowerCase()
  const anchors = ruleConfig.productAnchors
    .map((anchor) => anchor.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)

  let splitIndex = -1
  for (const anchor of anchors) {
    const target = anchor.toLowerCase()
    let start = 0
    while (start < lower.length) {
      const idx = lower.indexOf(target, start)
      if (idx < 0) {
        break
      }
      if (target === '70' && !isValidProductAnchorStart(trimmed, idx)) {
        start = idx + 1
        continue
      }
      splitIndex = idx
      break
    }
    if (splitIndex >= 0) {
      break
    }
  }

  if (splitIndex <= 0) {
    return { address: trimmed, product: '' }
  }

  return {
    address: trimmed.slice(0, splitIndex).trim(),
    product: trimmed.slice(splitIndex).trim(),
  }
}

function normalizeProductDesc(desc) {
  const plusNormalized = String(desc ?? '')
    .replace(/[➕＋﹢]/g, '+')
    .replace(/\s*\+\s*/g, '+')
    .replace(/\s+/g, '')
  return plusNormalized.replace(/(\))(?!\+)/g, '$1+')
}

function splitItems(productDesc) {
  const cleaned = normalizeProductDesc(productDesc)
  if (!cleaned) {
    return []
  }

  return cleaned
    .split('+')
    .flatMap((segment) => {
      const normalizedSegment = segment
        .replace(/(?<=[黑白蓝红紫绿粉金银黄])(?=(?:vt|tv))/gi, '+')
        .replace(/(?<=[黑白蓝红紫绿粉金银黄])(?=70)/g, '+')
      return normalizedSegment
        .split('+')
        .map((item) => item.trim())
        .filter(Boolean)
    })
}

function chineseNumberToInt(text) {
  const map = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  }
  return map[text] ?? 1
}

function parseItemQty(item) {
  const plain = String(item ?? '').replace(/[（(][^)）]*[)）]/g, '')

  if (/单只|单个|一支|一副|一拍/.test(plain)) {
    return 1
  }

  if (/^(?:vt|tv)2(?!\d)/i.test(plain)) {
    return 2
  }

  const numWithUnit = plain.match(/(\d+)\s*(只|个|件|副|拍|支|套|把)/)
  if (numWithUnit) {
    return Number(numWithUnit[1])
  }

  const zhWithUnit = plain.match(/(一|二|两|三|四|五|六|七|八|九|十)\s*(只|个|件|副|拍|支|套|把)/)
  if (zhWithUnit) {
    return chineseNumberToInt(zhWithUnit[1] ?? '一')
  }

  const colorTailQtyMatch = plain.match(/(?:黑|白|蓝|红|紫|绿|粉|金|银|黄)\s*(\d+)\s*$/)
  if (colorTailQtyMatch) {
    return Number(colorTailQtyMatch[1])
  }

  return 1
}

function classifyItem(item, ruleConfig) {
  const noBracket = String(item ?? '').replace(/[（(][^)）]*[)）]/g, '')
  if (ruleConfig.bagKeywords.some((key) => noBracket.includes(key))) {
    return 'bag'
  }
  if (ruleConfig.gripKeywords.some((key) => noBracket.includes(key))) {
    return 'grip'
  }
  return 'racket'
}

function getCounts(productDesc, ruleConfig) {
  const items = splitItems(productDesc)
  let productQty = 0
  let shuttlecockQty = 0
  let bagQty = 0
  let gripQty = 0

  for (const item of items) {
    const qty = parseItemQty(item)
    const kind = classifyItem(item, ruleConfig)
    if (kind === 'racket') {
      productQty += qty
    } else if (kind === 'bag') {
      bagQty += qty
    } else if (kind === 'grip') {
      gripQty += qty
    }
  }

  if (productQty >= 2) {
    shuttlecockQty = 1
  }

  if (!items.length) {
    productQty = 0
  }

  return { productQty, shuttlecockQty, bagQty, gripQty }
}

function buildRowId(index) {
  return `${Date.now()}-${index}-${Math.random().toString(16).slice(2, 8)}`
}

function ensureRowsSerialNo(list) {
  return list.map((row, index) => ({
    ...row,
    serialNo: index + 1,
  }))
}

function escapeRegExp(input) {
  return String(input ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseBlock(block, index, context) {
  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) {
    return {
      kind: 'failed',
      blockIndex: index,
      raw: block,
      issues: [createIssue(ISSUE_CODES.EMPTY_BLOCK, '段落为空，无法解析')],
    }
  }

  let agent = ''
  let cursor = 0
  const firstLineRaw = lines[0] ?? ''

  if (/[：:]/.test(firstLineRaw) && !/^(收货人|手机号码|地址信息)\s*[:：]/.test(firstLineRaw)) {
    agent = extractAgentFromHeader(firstLineRaw)
    cursor = 1
  }

  const content = lines.slice(cursor)
  if (!content.length) {
    return {
      kind: 'failed',
      blockIndex: index,
      raw: block,
      issues: [createIssue(ISSUE_CODES.EMPTY_BLOCK, '段落缺少有效内容')],
    }
  }

  let name = ''
  let phone = ''
  let address = ''
  let virtualNo = ''
  let productDesc = ''

  const receiverLine = content.find((line) => /^收货人\s*[:：]/.test(line))
  if (receiverLine) {
    name = stripName(receiverLine.replace(/^收货人\s*[:：]/, '').trim())
    const phoneLine = content.find((line) => /^手机号码\s*[:：]/.test(line))
    const addressLine = content.find((line) => /^地址信息\s*[:：]/.test(line))
    phone = phoneLine ? phoneLine.replace(/^手机号码\s*[:：]/, '').trim() : ''
    address = addressLine ? addressLine.replace(/^地址信息\s*[:：]/, '').trim() : ''
    const descLines = content.filter(
      (line) => !/^收货人\s*[:：]/.test(line) && !/^手机号码\s*[:：]/.test(line) && !/^地址信息\s*[:：]/.test(line),
    )
    productDesc = descLines.join(' ').trim()
  } else {
    const firstLine = content[0] ?? ''
    const firstPhoneMatch = firstLine.match(/(1\d{10})/)
    if (firstPhoneMatch) {
      phone = firstPhoneMatch[1] ?? ''
      name = stripName(firstLine.replace(phone, ''))
      address = (content[1] ?? '').trim()
      productDesc = content.slice(2).join(' ').trim()
    } else {
      name = stripName(firstLine)
      const phoneLine = content.find((line, lineIndex) => lineIndex > 0 && /(1\d{10})/.test(line)) ?? ''
      const phoneMatch = phoneLine.match(/(1\d{10})/)
      phone = phoneMatch ? (phoneMatch[1] ?? '') : ''

      const phoneIndex = phoneLine ? content.indexOf(phoneLine) : 0
      const rest = content.slice(Math.max(phoneIndex + 1, 1))
      const addrCandidate = rest[0] ?? ''
      const split = splitAddressAndProduct(addrCandidate, context.ruleConfig)
      address = split.address
      productDesc = split.product || rest.slice(1).join(' ').trim()
    }
  }

  const issues = []

  if (!phone && !name) {
    return {
      kind: 'failed',
      blockIndex: index,
      raw: block,
      issues: [createIssue(ISSUE_CODES.MISSING_NAME_AND_PHONE, '姓名和手机号均缺失，无法识别订单主体')],
    }
  }

  if (!phone) {
    appendIssue(issues, createIssue(ISSUE_CODES.MISSING_PHONE, '手机号缺失，请人工补充'))
  } else if (!/^1\d{10}$/.test(phone)) {
    appendIssue(issues, createIssue(ISSUE_CODES.INVALID_PHONE, '手机号格式异常，请人工核对'))
  }

  if (!productDesc) {
    const lastLine = content[content.length - 1] ?? ''
    const anchors = context.ruleConfig.productAnchors.map(escapeRegExp).filter(Boolean)
    const anchorRegex = anchors.length ? new RegExp(`(?:${anchors.join('|')})`, 'i') : null
    if (anchorRegex && lastLine !== address && anchorRegex.test(lastLine)) {
      productDesc = lastLine
    }
  }

  const nameParsed = extractVirtualNo(name)
  name = nameParsed.cleanText

  const addressParsed = extractVirtualNo(address)
  address = addressParsed.cleanText
  virtualNo = addressParsed.virtualNo || nameParsed.virtualNo

  if (!productDesc) {
    appendIssue(issues, createIssue(ISSUE_CODES.MISSING_PRODUCT, '商品描述缺失，请人工补充'))
  }

  const addressValidation = validateAddressSmart(address, context.ruleConfig, { productDesc })
  address = addressValidation.normalizedAddress
  addressValidation.issues.forEach((issue) => appendIssue(issues, issue))

  if (addressValidation.level === 'failed') {
    return {
      kind: 'failed',
      blockIndex: index,
      raw: block,
      issues,
    }
  }

  const shipFrom = getDefaultShipFrom(context.freightRuleText)
  const normalizedProductDesc = normalizeProductDescText(productDesc)
  const freight = computeFreight(address, context.freightRuleText)
  const counts = getCounts(normalizedProductDesc, context.ruleConfig)

  const row = {
    id: buildRowId(index),
    serialNo: 0,
    name: appendVirtualNoSuffix(name, virtualNo),
    phone,
    address: appendVirtualNoSuffix(address, virtualNo),
    virtualNo,
    productDesc: normalizedProductDesc,
    productQty: counts.productQty,
    shuttlecockQty: counts.shuttlecockQty,
    bagQty: counts.bagQty,
    gripQty: counts.gripQty,
    agent,
    shipFrom,
    freight,
    trackingNo: '',
    importedAt: formatDateTime(),
    parseStatus: issues.length ? 'warning' : 'success',
    parseIssues: issues,
  }

  if (issues.length) {
    return { kind: 'warning', row, issues }
  }

  return { kind: 'success', row, issues: [] }
}

export function formatProductDescForDisplay(row) {
  const raw = normalizeProductDescText(String(row?.productDesc ?? '').trim())
  if (!raw) {
    return ''
  }
  return `（${raw}）`
}

export function getIssueText(issues) {
  return Array.isArray(issues) ? issues.map((issue) => issue.message).filter(Boolean).join('；') : ''
}

export function getIssueCodes(issues) {
  return Array.isArray(issues) ? issues.map((issue) => issue.code).filter(Boolean).join(', ') : ''
}

export function collectImportableRows(report, includeWarningRows = true) {
  return includeWarningRows ? [...report.successRows, ...report.warningRows] : [...report.successRows]
}

export function summarizeParseReport(report) {
  return `总段落 ${report.totalBlocks}，成功 ${report.successCount}，待确认 ${report.warningCount}，失败 ${report.failedCount}`
}

export function parseInputText(text, options = {}) {
  const ruleText = options.ruleText ?? DEFAULT_RULE_TEXT
  const freightRuleText = options.freightRuleText ?? DEFAULT_FREIGHT_RULE_TEXT
  const ruleConfig = buildRuleConfig(ruleText)
  const normalized = normalizeText(text)
  const blocks = normalized
    .split(/\n\s*\n+/)
    .map((item) => item.trim())
    .filter(Boolean)

  const successRows = []
  const warningRows = []
  const failedRows = []

  blocks.forEach((block, index) => {
    const result = parseBlock(block, index + 1, { ruleConfig, freightRuleText })
    if (result.kind === 'success') {
      successRows.push(result.row)
      return
    }
    if (result.kind === 'warning') {
      warningRows.push(result.row)
      return
    }
    failedRows.push({
      blockIndex: result.blockIndex,
      raw: result.raw,
      issues: result.issues,
    })
  })

  return {
    successRows: ensureRowsSerialNo(successRows),
    warningRows: ensureRowsSerialNo(warningRows),
    failedRows,
    totalBlocks: blocks.length,
    successCount: successRows.length,
    warningCount: warningRows.length,
    failedCount: failedRows.length,
    hasWarnings: warningRows.length > 0,
    hasFailures: failedRows.length > 0,
    includeWarningRowsDefault: true,
  }
}

export function rebuildAddressIssues(row, options = {}) {
  const ruleConfig = buildRuleConfig(options.ruleText ?? DEFAULT_RULE_TEXT)
  const nextIssues = Array.isArray(row?.parseIssues)
    ? row.parseIssues.filter((issue) => !ADDRESS_ISSUE_SET.has(issue.code))
    : []
  const validation = validateAddressSmart(row?.address ?? '', ruleConfig, {
    productDesc: row?.productDesc ?? '',
  })
  validation.issues.forEach((issue) => appendIssue(nextIssues, issue))
  return {
    normalizedAddress: validation.normalizedAddress,
    parseIssues: nextIssues,
    parseStatus: nextIssues.length ? 'warning' : 'success',
  }
}

