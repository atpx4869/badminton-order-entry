<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import type { TableColumnsType } from 'ant-design-vue'

type ParseStatus = 'success' | 'warning' | 'failed'

type ParseIssueCode =
  | 'EMPTY_BLOCK'
  | 'MISSING_NAME_AND_PHONE'
  | 'MISSING_ADDRESS'
  | 'MISSING_PRODUCT'
  | 'ADDRESS_SUSPECT'
  | 'ADDRESS_TOO_SHORT'
  | 'ADDRESS_CONTAINS_PRODUCT'
  | 'INVALID_PHONE'
  | 'MISSING_PHONE'

type ParseIssue = {
  code: ParseIssueCode
  message: string
}

type OrderRow = {
  id: string
  serialNo?: number
  name: string
  phone: string
  address: string
  virtualNo: string
  productDesc: string
  productQty: number
  shuttlecockQty: number
  bagQty: number
  gripQty: number
  agent: string
  shipFrom: string
  freight: number
  trackingNo: string
  importedAt: string
  parseStatus?: 'success' | 'warning'
  parseIssues?: ParseIssue[]
}

type ParseFailedRow = {
  blockIndex: number
  raw: string
  issues: ParseIssue[]
}

type ParseBlockResult =
  | { kind: 'success'; row: OrderRow; issues: ParseIssue[] }
  | { kind: 'warning'; row: OrderRow; issues: ParseIssue[] }
  | { kind: 'failed'; blockIndex: number; raw: string; issues: ParseIssue[] }

type ParseReport = {
  successRows: OrderRow[]
  warningRows: OrderRow[]
  failedRows: ParseFailedRow[]
  totalBlocks: number
  successCount: number
  warningCount: number
  failedCount: number
}

type RuleConfigText = {
  shuttlecock: string
  bag: string
  grip: string
  anchors: string
}

type FreightRuleConfigText = {
  nonFreeRegions: string
  freightAmount: number
  defaultShipFrom: string
}

type AiAssistConfigText = {
  enabled: boolean
  fallbackOnWarning: boolean
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
}

type BatchTarget = 'agent' | 'shipFrom' | 'trackingNo' | 'freight'
type EditableField =
  | 'name'
  | 'phone'
  | 'address'
  | 'productDesc'
  | 'agent'
  | 'shipFrom'
  | 'productQty'
  | 'shuttlecockQty'
  | 'bagQty'
  | 'gripQty'
  | 'freight'
  | 'trackingNo'
type ImportMode = 'append' | 'replace'

type ParseOptions = {
  importMode: ImportMode
  includeWarningRows: boolean
  sourceText?: string
}

type AddressValidationResult = {
  normalizedAddress: string
  issues: ParseIssue[]
  level: ParseStatus
}

const SHIP_FREIGHT_PROVINCES = ['新疆', '西藏', '青海', '海南']
const STORAGE_KEY = 'badminton-order-rows-v1'
const RULES_STORAGE_KEY = 'badminton-parser-rules-v1'
const FREIGHT_RULES_STORAGE_KEY = 'badminton-freight-rules-v1'
const AI_ASSIST_STORAGE_KEY = 'badminton-ai-assist-config-v1'
const ACCESS_UNLOCK_SESSION_KEY = 'badminton-access-unlocked-session-v1'
const ACCESS_PASSWORD_HASH = 'b946cdd96273b51d4e3b928d1e6cbff9b78bdfd81e8282b6ed19de978f66d021'

const DEFAULT_RULE_TEXT: RuleConfigText = {
  shuttlecock: 'vt,tv,天斧,古红,藏青,70,100zz',
  bag: '拍包',
  grip: '手胶,胶带,缠把',
  anchors: 'vt,tv,天斧,古红,藏青,70,100zz,拍包,手胶',
}

const DEFAULT_FREIGHT_RULE_TEXT: FreightRuleConfigText = {
  nonFreeRegions: SHIP_FREIGHT_PROVINCES.join(','),
  freightAmount: 18,
  defaultShipFrom: '湖南',
}

const DEFAULT_AI_ASSIST_CONFIG: AiAssistConfigText = {
  enabled: false,
  fallbackOnWarning: true,
  baseUrl: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  model: 'gpt-4o-mini',
  timeoutMs: 15000,
}

const inputText = ref('')
const importFiles = ref<File[]>([])
const rows = ref<OrderRow[]>([])
const selectedRowKeys = ref<string[]>([])
const importModalOpen = ref(false)
const settingsModalOpen = ref(false)
const accessGranted = ref(sessionStorage.getItem(ACCESS_UNLOCK_SESSION_KEY) === '1')
const accessPasswordInput = ref('')
const accessChecking = ref(false)
const serialMode = ref<'view' | 'origin'>('view')
const exportSortByOriginSerial = ref(true)
const importMode = ref<ImportMode>('append')
const includeWarningRows = ref(true)
const lastParseReport = ref<ParseReport | null>(null)
const batchTarget = ref<BatchTarget | ''>('')
const batchValue = ref('')
const batchNumberValue = ref<number | null>(null)
const ruleText = ref<RuleConfigText>({ ...DEFAULT_RULE_TEXT })

const batchTargetOptions = [
  { label: '代理人', value: 'agent' },
  { label: '发货地', value: 'shipFrom' },
  { label: '快递单号', value: 'trackingNo' },
  { label: '运费', value: 'freight' },
]

const freightRuleText = ref<FreightRuleConfigText>({ ...DEFAULT_FREIGHT_RULE_TEXT })
const aiAssistConfig = ref<AiAssistConfigText>({ ...DEFAULT_AI_ASSIST_CONFIG })
const addressEditSnapshot = ref<Record<string, string>>({})
const editingCell = ref<{ rowId: string; field: EditableField } | null>(null)

let xlsxModulePromise: Promise<typeof import('xlsx-js-style')> | null = null

function loadXlsx() {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import('xlsx-js-style')
  }
  return xlsxModulePromise
}

async function sha256Hex(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('')
}

async function unlockApp() {
  const password = accessPasswordInput.value
  if (!password) {
    message.warning('请输入访问密码')
    return
  }

  accessChecking.value = true
  try {
    const hash = await sha256Hex(password)
    if (hash === ACCESS_PASSWORD_HASH) {
      accessGranted.value = true
      sessionStorage.setItem(ACCESS_UNLOCK_SESSION_KEY, '1')
      accessPasswordInput.value = ''
      message.success('验证通过')
      return
    }
    message.error('密码错误')
  } catch {
    message.error('当前环境不支持密码校验')
  } finally {
    accessChecking.value = false
  }
}

function handleAccessPasswordEnter() {
  void unlockApp()
}

function getNextSerialNo(list: OrderRow[]): number {
  const maxSerial = list.reduce((max, row) => {
    const value = Number(row.serialNo ?? 0)
    return Number.isFinite(value) && value > max ? value : max
  }, 0)
  return maxSerial + 1
}

function normalizeSerialNo(list: OrderRow[]): OrderRow[] {
  const seen = new Set<number>()
  let fallback = 1
  return list.map((row) => {
    const shipFrom = row.shipFrom?.trim() ? row.shipFrom : getDefaultShipFrom()
    const freight = row.shipFrom?.trim() ? row.freight : computeFreight(shipFrom)

    const value = Number(row.serialNo)
    if (Number.isInteger(value) && value > 0 && !seen.has(value)) {
      seen.add(value)
      return {
        ...row,
        shipFrom,
        freight,
      }
    }
    while (seen.has(fallback)) {
      fallback += 1
    }
    const next = fallback
    seen.add(next)
    fallback += 1
    return {
      ...row,
      shipFrom,
      freight,
      serialNo: next,
    }
  })
}

function ensureRowsSerialNo(list: OrderRow[]): OrderRow[] {
  return normalizeSerialNo(list)
}

function getRowDisplaySerial(row: OrderRow, index: number): number {
  if (serialMode.value === 'origin' && Number.isInteger(Number(row.serialNo)) && Number(row.serialNo) > 0) {
    return Number(row.serialNo)
  }
  return index + 1
}

function getExportSerial(row: OrderRow, index: number): number {
  if (serialMode.value === 'origin' && Number.isInteger(Number(row.serialNo)) && Number(row.serialNo) > 0) {
    return Number(row.serialNo)
  }
  return index + 1
}

function getExportRows(data: OrderRow[]): OrderRow[] {
  if (!exportSortByOriginSerial.value) {
    return data
  }
  return [...data].sort((a, b) => {
    const av = Number(a.serialNo)
    const bv = Number(b.serialNo)
    const hasA = Number.isInteger(av) && av > 0
    const hasB = Number.isInteger(bv) && bv > 0
    if (hasA && hasB) {
      return av - bv
    }
    if (hasA) {
      return -1
    }
    if (hasB) {
      return 1
    }
    return 0
  })
}

const isBatchNumberTarget = computed(() => batchTarget.value === 'freight')

function parseKeywordText(text: string): string[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const nonFreeRegions = computed(() => {
  return freightRuleText.value.nonFreeRegions
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean)
})

const ruleConfig = computed(() => {
  const shuttlecockKeywords = parseKeywordText(ruleText.value.shuttlecock)
  const bagKeywords = parseKeywordText(ruleText.value.bag)
  const gripKeywords = parseKeywordText(ruleText.value.grip)
  const anchors = parseKeywordText(ruleText.value.anchors)
  const productAnchors = Array.from(new Set([...anchors, ...shuttlecockKeywords, ...bagKeywords, ...gripKeywords]))
  return {
    shuttlecockKeywords,
    bagKeywords,
    gripKeywords,
    productAnchors,
  }
})

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const DEFAULT_FALLBACK_ANCHORS = ['vt', 'tv', '天斧', '古红', '藏青', '70']

const anchorPattern = computed(() => {
  const anchors = ruleConfig.value.productAnchors.map(escapeRegExp).filter(Boolean)
  if (!anchors.length) {
    return DEFAULT_FALLBACK_ANCHORS.map(escapeRegExp).join('|')
  }
  return anchors.join('|')
})

const anchorKeywordRegex = computed(() => new RegExp(`(?:${anchorPattern.value})`, 'i'))
const ADDRESS_ISSUE_SET = new Set<ParseIssueCode>([
  'MISSING_ADDRESS',
  'ADDRESS_SUSPECT',
  'ADDRESS_TOO_SHORT',
  'ADDRESS_CONTAINS_PRODUCT',
])

function isParseIssueCode(code: unknown): code is ParseIssueCode {
  return [
    'EMPTY_BLOCK',
    'MISSING_NAME_AND_PHONE',
    'MISSING_ADDRESS',
    'MISSING_PRODUCT',
    'ADDRESS_SUSPECT',
    'ADDRESS_TOO_SHORT',
    'ADDRESS_CONTAINS_PRODUCT',
    'INVALID_PHONE',
    'MISSING_PHONE',
  ].includes(String(code))
}

function normalizeAddressLite(address: string): string {
  return normalizeText(address).replace(/[，,]/g, ' ').replace(/\s+/g, ' ').trim()
}

function createIssue(code: ParseIssueCode, messageText: string): ParseIssue {
  return { code, message: messageText }
}

function appendIssue(target: ParseIssue[], issue: ParseIssue) {
  if (!target.some((item) => item.code === issue.code)) {
    target.push(issue)
  }
}

function validateAddressSmart(
  address: string,
  context?: { productDesc?: string; ignoreAddressContainsProduct?: boolean },
): AddressValidationResult {
  const normalizedAddress = normalizeAddressLite(address)
  const issues: ParseIssue[] = []

  if (!normalizedAddress) {
    issues.push(createIssue('MISSING_ADDRESS', '地址为空，无法生成可用订单'))
    return {
      normalizedAddress,
      issues,
      level: 'failed',
    }
  }

  if (normalizedAddress.length < 8) {
    appendIssue(issues, createIssue('ADDRESS_TOO_SHORT', '地址长度偏短，请确认是否完整'))
  }

  const hasAddressStructure = /(省|市|区|县|镇|乡|街道|大道|路|号|村|室|栋|单元)/.test(normalizedAddress)
  if (!hasAddressStructure) {
    appendIssue(issues, createIssue('ADDRESS_SUSPECT', '地址缺少常见结构特征，请人工确认'))
  }

  const productKeywords = [
    ...ruleConfig.value.productAnchors,
    '羽毛球',
    '拍包',
    '手胶',
    '胶带',
    '缠把',
  ]
    .map((keyword) => keyword.trim())
    .filter(Boolean)

  const normalizedAddressLower = normalizedAddress.toLowerCase()
  const normalizedProductDesc = context?.productDesc?.trim() ?? ''
  const ignoreAddressContainsProduct = context?.ignoreAddressContainsProduct === true

  const addressContainsProduct =
    !ignoreAddressContainsProduct &&
    (productKeywords.some((keyword) => normalizedAddressLower.includes(keyword.toLowerCase())) ||
      (!!normalizedProductDesc && normalizedAddress.includes(normalizedProductDesc)))

  if (addressContainsProduct) {
    appendIssue(issues, createIssue('ADDRESS_CONTAINS_PRODUCT', '地址中混入疑似商品信息，请核对拆分结果'))
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

function loadRowsFromStorage(): OrderRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter((item): item is OrderRow => {
        return Boolean(item) && typeof item === 'object' && 'id' in item && 'name' in item
      })
      .map((item) => {
        const parseStatus = item.parseStatus === 'warning' ? 'warning' : item.parseStatus === 'success' ? 'success' : undefined
        const parseIssues = Array.isArray(item.parseIssues)
          ? item.parseIssues.filter((issue): issue is ParseIssue => {
              return Boolean(issue) && typeof issue === 'object' && isParseIssueCode((issue as ParseIssue).code)
            })
          : undefined
        const serialNoRaw = typeof item.serialNo === 'number' ? item.serialNo : Number(item.serialNo)
        const serialNo = Number.isInteger(serialNoRaw) && serialNoRaw > 0 ? serialNoRaw : undefined
        const addressParsed = extractVirtualNoFromAddress(typeof item.address === 'string' ? item.address : '')
        const nameParsed = extractVirtualNoFromName(typeof item.name === 'string' ? item.name : '')
        const virtualNoRaw = typeof item.virtualNo === 'string' ? item.virtualNo.trim() : ''
        const virtualNo = addressParsed.virtualNo || nameParsed.virtualNo || virtualNoRaw
        const cleanName = nameParsed.cleanName || String(item.name ?? '').trim()
        const cleanAddress = addressParsed.cleanAddress || String(item.address ?? '').trim()
        const cleanProductDesc = normalizeProductDescText(typeof item.productDesc === 'string' ? item.productDesc : '')
          const fallbackShipFrom =
          typeof item.shipFrom === 'string' && item.shipFrom.trim() ? item.shipFrom.trim() : getDefaultShipFrom()
        const fallbackFreight =
          typeof item.freight === 'number' && Number.isFinite(item.freight) ? item.freight : computeFreight(fallbackShipFrom)
        return {
          ...item,
          serialNo,
          name: appendVirtualNoSuffix(cleanName, virtualNo),
          address: appendVirtualNoSuffix(cleanAddress, virtualNo),
          virtualNo,
          productDesc: cleanProductDesc,
          shipFrom: fallbackShipFrom,
          freight: fallbackFreight,
          parseStatus,
          parseIssues,
        }
      })
  } catch {
    return []
  }
}

function loadRulesFromStorage(): RuleConfigText {
  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY)
    if (!raw) {
      return { ...DEFAULT_RULE_TEXT }
    }
    const parsed = JSON.parse(raw) as Partial<RuleConfigText>
    return {
      shuttlecock: parsed.shuttlecock ?? DEFAULT_RULE_TEXT.shuttlecock,
      bag: parsed.bag ?? DEFAULT_RULE_TEXT.bag,
      grip: parsed.grip ?? DEFAULT_RULE_TEXT.grip,
      anchors: parsed.anchors ?? DEFAULT_RULE_TEXT.anchors,
    }
  } catch {
    return { ...DEFAULT_RULE_TEXT }
  }
}

function loadFreightRulesFromStorage(): FreightRuleConfigText {
  try {
    const raw = localStorage.getItem(FREIGHT_RULES_STORAGE_KEY)
    if (!raw) {
      return { ...DEFAULT_FREIGHT_RULE_TEXT }
    }
    const parsed = JSON.parse(raw) as Partial<FreightRuleConfigText>
    return {
      nonFreeRegions: typeof parsed.nonFreeRegions === 'string' ? parsed.nonFreeRegions : DEFAULT_FREIGHT_RULE_TEXT.nonFreeRegions,
      freightAmount:
        typeof parsed.freightAmount === 'number' && Number.isFinite(parsed.freightAmount)
          ? parsed.freightAmount
          : DEFAULT_FREIGHT_RULE_TEXT.freightAmount,
      defaultShipFrom:
        typeof parsed.defaultShipFrom === 'string' && parsed.defaultShipFrom.trim()
          ? parsed.defaultShipFrom.trim()
          : DEFAULT_FREIGHT_RULE_TEXT.defaultShipFrom,
    }
  } catch {
    return { ...DEFAULT_FREIGHT_RULE_TEXT }
  }
}

function loadAiAssistConfigFromStorage(): AiAssistConfigText {
  try {
    const raw = localStorage.getItem(AI_ASSIST_STORAGE_KEY)
    if (!raw) {
      return { ...DEFAULT_AI_ASSIST_CONFIG }
    }
    const parsed = JSON.parse(raw) as Partial<AiAssistConfigText>
    return {
      enabled: Boolean(parsed.enabled),
      fallbackOnWarning: parsed.fallbackOnWarning !== false,
      baseUrl: typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim() ? parsed.baseUrl : DEFAULT_AI_ASSIST_CONFIG.baseUrl,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model : DEFAULT_AI_ASSIST_CONFIG.model,
      timeoutMs:
        typeof parsed.timeoutMs === 'number' && Number.isFinite(parsed.timeoutMs)
          ? Math.max(3000, Math.floor(parsed.timeoutMs))
          : DEFAULT_AI_ASSIST_CONFIG.timeoutMs,
    }
  } catch {
    return { ...DEFAULT_AI_ASSIST_CONFIG }
  }
}

freightRuleText.value = loadFreightRulesFromStorage()
rows.value = ensureRowsSerialNo(loadRowsFromStorage())
ruleText.value = loadRulesFromStorage()
aiAssistConfig.value = loadAiAssistConfigFromStorage()

let rowsSaveTimer: ReturnType<typeof setTimeout> | null = null

watch(
  rows,
  (nextRows) => {
    if (rowsSaveTimer) {
      clearTimeout(rowsSaveTimer)
    }
    rowsSaveTimer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRows))
    }, 300)
  },
  { deep: true },
)

onBeforeUnmount(() => {
  if (rowsSaveTimer) {
    clearTimeout(rowsSaveTimer)
    rowsSaveTimer = null
  }
})

watch(
  ruleText,
  (nextRuleText) => {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(nextRuleText))
  },
  { deep: true },
)

watch(
  freightRuleText,
  (nextFreightRuleText) => {
    localStorage.setItem(FREIGHT_RULES_STORAGE_KEY, JSON.stringify(nextFreightRuleText))
  },
  { deep: true },
)

watch(
  aiAssistConfig,
  (nextAiAssistConfig) => {
    localStorage.setItem(AI_ASSIST_STORAGE_KEY, JSON.stringify(nextAiAssistConfig))
  },
  { deep: true },
)

function createStringFilters(key: keyof OrderRow) {
  const values = Array.from(new Set(rows.value.map((row) => String(row[key] ?? '').trim()).filter(Boolean)))
  return values.slice(0, 30).map((value) => ({ text: value, value }))
}

function getStatusLabel(row: OrderRow): '正常' | '待确认' {
  return row.parseStatus === 'warning' ? '待确认' : '正常'
}

function getIssueText(issues?: ParseIssue[]): string {
  if (!issues?.length) {
    return ''
  }
  return issues.map((issue) => issue.message).join('；')
}

const failedIssueSummary = computed(() => {
  const report = lastParseReport.value
  if (!report?.failedRows.length) {
    return [] as Array<{ code: ParseIssueCode; message: string; count: number }>
  }
  const issueMap = new Map<ParseIssueCode, { message: string; count: number }>()
  report.failedRows.forEach((row) => {
    row.issues.forEach((issue) => {
      const hit = issueMap.get(issue.code)
      if (hit) {
        hit.count += 1
      } else {
        issueMap.set(issue.code, { message: issue.message, count: 1 })
      }
    })
  })
  return Array.from(issueMap.entries()).map(([code, info]) => ({
    code,
    message: info.message,
    count: info.count,
  }))
})

const failedPreviewRows = computed(() => {
  const report = lastParseReport.value
  if (!report?.failedRows.length) {
    return []
  }
  return report.failedRows.slice(0, 5).map((item) => ({
    blockIndex: item.blockIndex,
    reason: getIssueText(item.issues),
    raw: item.raw.replace(/\s+/g, ' ').slice(0, 140),
  }))
})

const columns = computed<TableColumnsType<OrderRow>>(() => [
  {
    title: '序号',
    dataIndex: 'serialNo',
    width: 50,
    align: 'center',
  },
  {
    title: '状态',
    dataIndex: 'parseStatus',
    width: 76,
    align: 'center',
    filters: [
      { text: '正常', value: 'success' },
      { text: '待确认', value: 'warning' },
    ],
    onFilter: (value, record) => {
      if (value === 'warning') {
        return record.parseStatus === 'warning'
      }
      return record.parseStatus !== 'warning'
    },
    sorter: (a, b) => {
      const av = a.parseStatus === 'warning' ? 1 : 0
      const bv = b.parseStatus === 'warning' ? 1 : 0
      return av - bv
    },
  },
  {
    title: '姓名',
    dataIndex: 'name',
    width: 130,
    align: 'center',
    sorter: (a, b) => a.name.localeCompare(b.name, 'zh-CN'),
  },
  {
    title: '联系方式',
    dataIndex: 'phone',
    width: 102,
    align: 'center',
    sorter: (a, b) => a.phone.localeCompare(b.phone),
  },
  { title: '收货地址', dataIndex: 'address', width: 266, ellipsis: true },
  { title: '商品描述', dataIndex: 'productDesc', width: 104 },
  {
    title: '商品数量',
    dataIndex: 'productQty',
    width: 66,
    align: 'center',
    sorter: (a, b) => a.productQty - b.productQty,
  },
  {
    title: '羽毛球数量',
    dataIndex: 'shuttlecockQty',
    width: 76,
    align: 'center',
    sorter: (a, b) => a.shuttlecockQty - b.shuttlecockQty,
  },
  {
    title: '拍包数量',
    dataIndex: 'bagQty',
    width: 66,
    align: 'center',
    sorter: (a, b) => a.bagQty - b.bagQty,
  },
  {
    title: '手胶数量',
    dataIndex: 'gripQty',
    width: 66,
    align: 'center',
    sorter: (a, b) => a.gripQty - b.gripQty,
  },
  {
    title: '代理人',
    dataIndex: 'agent',
    width: 90,
    filters: createStringFilters('agent'),
    onFilter: (value, record) => record.agent.includes(String(value)),
    sorter: (a, b) => a.agent.localeCompare(b.agent, 'zh-CN'),
  },
  {
    title: '发货地',
    dataIndex: 'shipFrom',
    width: 80,
    align: 'center',
    filters: createStringFilters('shipFrom'),
    onFilter: (value, record) => record.shipFrom.includes(String(value)),
    sorter: (a, b) => a.shipFrom.localeCompare(b.shipFrom, 'zh-CN'),
  },
  {
    title: '运费',
    dataIndex: 'freight',
    width: 62,
    align: 'center',
    filters: [
      { text: '免邮(0)', value: '0' },
      { text: '18元', value: '18' },
    ],
    onFilter: (value, record) => String(record.freight) === String(value),
    sorter: (a, b) => a.freight - b.freight,
  },
  { title: '快递单号', dataIndex: 'trackingNo', width: 92 },
  {
    title: '导入时间',
    dataIndex: 'importedAt',
    width: 108,
    sorter: (a, b) => new Date(a.importedAt).getTime() - new Date(b.importedAt).getTime(),
    defaultSortOrder: 'descend',
  },
  { title: '操作', dataIndex: 'action', width: 70 },
])

function formatDateParts(date = new Date()) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return { yyyy, mm, dd, hh, mi, ss }
}

function formatDateTime(date = new Date()): string {
  const { yyyy, mm, dd, hh, mi, ss } = formatDateParts(date)
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

const summary = computed(() => {
  return rows.value.reduce(
    (acc, row) => {
      acc.orders += 1
      acc.productQty += Number(row.productQty || 0)
      acc.shuttlecockQty += Number(row.shuttlecockQty || 0)
      acc.bagQty += Number(row.bagQty || 0)
      acc.gripQty += Number(row.gripQty || 0)
      acc.freight += Number(row.freight || 0)
      return acc
    },
    {
      orders: 0,
      productQty: 0,
      shuttlecockQty: 0,
      bagQty: 0,
      gripQty: 0,
      freight: 0,
    },
  )
})

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: (string | number)[]) => {
    selectedRowKeys.value = keys.map((k) => String(k))
  },
}))

const serialModeOptions = [
  { label: '当前排序序号', value: 'view' },
  { label: '固定原始序号', value: 'origin' },
]

const paginationConfig = {
  defaultPageSize: 50,
  pageSizeOptions: ['50', '100', '200', '300'],
  showSizeChanger: true,
  showQuickJumper: true,
  showTotal: (total: number) => `共 ${total} 条`,
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[\u00A0\u2002-\u200B]/g, ' ')
    .replace(/[【]/g, '[')
    .replace(/[】]/g, ']')
}

function extractAgentFromHeader(line: string): string {
  const clean = line.replace(/：/g, ':').trim()
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

function stripName(raw: string): string {
  return raw.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim()
}

function stripShipFromSuffixInProductDesc(desc: string): string {
  const trimmed = desc.trim()
  if (!trimmed) {
    return ''
  }
  return trimmed.replace(/\s*[\(（][^\)）]+[\)）]\s*$/, '').trim()
}

function normalizeProductDescText(desc: string): string {
  const withoutShipFrom = stripShipFromSuffixInProductDesc(desc)
  return withoutShipFrom.replace(/^（|）$/g, '').replace(/^\(|\)$/g, '').trim()
}

function getDefaultShipFrom(): string {
  const fallback = DEFAULT_FREIGHT_RULE_TEXT.defaultShipFrom
  const current = freightRuleText.value.defaultShipFrom
  if (!current?.trim()) {
    return fallback
  }
  return current.trim()
}

function computeFreight(shipFrom: string): number {
  const amount = Number(freightRuleText.value.freightAmount || 0)
  return nonFreeRegions.value.some((region) => shipFrom.includes(region)) ? amount : 0
}

function buildAiFallbackPrompt(rawText: string): string {
  return [
    '你是商单导入纠错助手。请把用户输入的聊天文本解析为严格 JSON，不要输出任何多余文字。',
    '必须输出对象：{"orders": Order[], "warnings": string[]}。',
    'Order 字段：name, phone, address, virtualNo, productDesc, productQty, shuttlecockQty, bagQty, gripQty, agent, shipFrom, freight。',
    '规则：',
    '1) virtualNo 可从姓名或地址末尾 [数字] 提取，并从姓名/地址中删除该标记。',
    '2) productDesc 去掉末尾地区括号后再返回，例如 vt黑➕vt白(湖南) 返回 vt黑➕vt白。',
    '3) vt 与 vt2 都是型号：vt2黑1 / vt2白1 表示对应型号各1支；vt2黑2 表示该型号2支。',
    '4) 商品数量按拍子支数计算；两支及以上送1羽毛球，单支送0羽毛球。',
    '5) shipFrom 不要从商品描述识别，固定返回默认发货地：' + getDefaultShipFrom() + '。',
    '6) 兼容写法：vt/Vt/VT、➕/+/＋、一只/一个/两只/两个/数字。',
    '7) 地址与商品粘连时要拆分；避免把手机号中的70或门牌70号误判为商品起点。',
    '8) 若字段缺失可置空，但 phone 若存在必须为11位手机号。',
    '9) 不能编造信息，无法确定时写入 warnings。',
    '',
    '不包邮地区：' + nonFreeRegions.value.join(','),
    '不包邮运费：' + String(freightRuleText.value.freightAmount),
    '',
    '原始文本：',
    rawText,
  ].join('\n')
}

async function tryAiAssistParse(source: string, options: ParseOptions): Promise<boolean> {
  const cfg = aiAssistConfig.value
  if (!cfg.enabled || !cfg.apiKey.trim() || !cfg.baseUrl.trim()) {
    return false
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(3000, cfg.timeoutMs || 15000))

  try {
    const response = await fetch(cfg.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: cfg.model || DEFAULT_AI_ASSIST_CONFIG.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: buildAiFallbackPrompt(source),
          },
        ],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      return false
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) {
      return false
    }

    const parsed = JSON.parse(content) as {
      orders?: Array<Partial<OrderRow>>
      warnings?: string[]
    }

    const aiOrders = Array.isArray(parsed.orders) ? parsed.orders : []
    if (!aiOrders.length) {
      return false
    }

    const mappedRows: OrderRow[] = aiOrders.map((item, index) => {
      const rawProductDesc = String(item.productDesc ?? '').trim()
      const cleanedProductDesc = normalizeProductDescText(rawProductDesc)
      const counts = getCounts(cleanedProductDesc)
      const shipFrom = getDefaultShipFrom()
      const freight = Number(item.freight)
      const nameParsed = extractVirtualNoFromName(String(item.name ?? ''))
      const addressParsed = extractVirtualNoFromAddress(String(item.address ?? ''))
      const virtualNoRaw = String(item.virtualNo ?? '').trim()
      const virtualNo = addressParsed.virtualNo || nameParsed.virtualNo || virtualNoRaw
      return {
        id: `${Date.now()}-ai-${index}-${Math.random().toString(16).slice(2, 8)}`,
        serialNo: 0,
        name: appendVirtualNoSuffix(nameParsed.cleanName, virtualNo),
        phone: String(item.phone ?? '').trim(),
        address: appendVirtualNoSuffix(addressParsed.cleanAddress, virtualNo),
        virtualNo,
        productDesc: cleanedProductDesc,
        productQty: Number.isFinite(Number(item.productQty)) ? Number(item.productQty) : counts.productQty,
        shuttlecockQty: Number.isFinite(Number(item.shuttlecockQty)) ? Number(item.shuttlecockQty) : counts.shuttlecockQty,
        bagQty: Number.isFinite(Number(item.bagQty)) ? Number(item.bagQty) : counts.bagQty,
        gripQty: Number.isFinite(Number(item.gripQty)) ? Number(item.gripQty) : counts.gripQty,
        agent: String(item.agent ?? '').trim(),
        shipFrom,
        freight: Number.isFinite(freight) ? freight : computeFreight(shipFrom),
        trackingNo: String(item.trackingNo ?? '').trim(),
        importedAt: formatDateTime(),
        parseStatus: 'warning',
        parseIssues: [createIssue('MISSING_PRODUCT', '已启用 AI 辅助识别，请人工核对关键字段')],
      }
    })

    rows.value =
      options.importMode === 'append' ? ensureRowsSerialNo([...mappedRows, ...rows.value]) : ensureRowsSerialNo(mappedRows)
    lastParseReport.value = {
      successRows: [],
      warningRows: mappedRows,
      failedRows: [],
      totalBlocks: mappedRows.length,
      successCount: 0,
      warningCount: mappedRows.length,
      failedCount: 0,
    }
    message.warning(`AI辅助识别已导入 ${mappedRows.length} 条，请人工复核`)
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

function isValidProductAnchorStart(text: string, index: number): boolean {
  const prev = text[index - 1] ?? ''
  const next = text[index + 2] ?? ''
  const isPrevDigit = /\d/.test(prev)
  const isNextDigit = /\d/.test(next)
  if (isPrevDigit || isNextDigit) {
    return false
  }
  if (next === '号') {
    return false
  }
  return true
}

function splitAddressAndProduct(line: string): { address: string; product: string } {
  const trimmed = line.trim()
  if (!trimmed) {
    return { address: '', product: '' }
  }

  const lower = trimmed.toLowerCase()
  const anchors = ruleConfig.value.productAnchors
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

function extractVirtualNoFromAddress(address: string): { cleanAddress: string; virtualNo: string } {
  const trimmed = address.trim()
  const m = trimmed.match(/^(.*)\[(\d+)\]\s*$/)
  if (!m) {
    return { cleanAddress: trimmed, virtualNo: '' }
  }
  return {
    cleanAddress: (m[1] ?? '').trim(),
    virtualNo: (m[2] ?? '').trim(),
  }
}

function extractVirtualNoFromName(name: string): { cleanName: string; virtualNo: string } {
  const trimmed = name.trim()
  const m = trimmed.match(/^(.*)\[(\d+)\]\s*$/)
  if (!m) {
    return { cleanName: trimmed, virtualNo: '' }
  }
  return {
    cleanName: (m[1] ?? '').trim(),
    virtualNo: (m[2] ?? '').trim(),
  }
}

function appendVirtualNoSuffix(text: string, virtualNo: string): string {
  const clean = text.trim().replace(/\[(\d+)\]\s*$/, '').trim()
  if (!clean) {
    return ''
  }
  return virtualNo ? `${clean}[${virtualNo}]` : clean
}

function normalizeProductDesc(desc: string): string {
  const plusNormalized = desc.replace(/[➕＋]/g, '+').replace(/\s*\+\s*/g, '+').replace(/\s+/g, '')
  return plusNormalized.replace(/(\))(?!\+)/g, '$1+')
}

function splitItems(productDesc: string): string[] {
  const cleaned = normalizeProductDesc(productDesc)
  if (!cleaned) {
    return []
  }

  return cleaned
    .split('+')
    .flatMap((segment) => {
      const normalizedSegment = segment
        .replace(/(?<=[黑白蓝红青\)\]】\d])(?=(?:vt|tv))/gi, '+')
        .replace(/(?<=[黑白蓝红青\)\]】\d])(?=70)/g, '+')
      return normalizedSegment
        .split('+')
        .map((item) => item.trim())
        .filter(Boolean)
    })
}

function chineseNumberToInt(text: string): number {
  const map: Record<string, number> = {
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

function parseItemQty(item: string): number {
  const plain = item.replace(/[\(（][^\)）]*[\)）]/g, '')

  if (/单(只|个|支|拍)/.test(plain)) {
    return 1
  }

  const numMatch = plain.match(/(\d+)\s*(只|个|件|副|条|盒|拍|支)/)
  if (numMatch) {
    return Number(numMatch[1])
  }

  const zhMatch = plain.match(/(一|二|两|三|四|五|六|七|八|九|十)\s*(只|个|件|副|条|盒|拍|支)/)
  if (zhMatch) {
    return chineseNumberToInt(zhMatch[1] ?? '一')
  }

  const colorTailQtyMatch = plain.match(/(?:黑|白|蓝|红|青|紫|黄|粉|绿|灰|橙|金|银)\s*(\d+)\s*$/)
  if (colorTailQtyMatch) {
    return Number(colorTailQtyMatch[1])
  }

  return 1
}

function classifyItem(item: string): 'bag' | 'grip' | 'racket' {
  const noBracket = item.replace(/[\(（][^\)）]*[\)）]/g, '')
  if (ruleConfig.value.bagKeywords.some((key) => noBracket.includes(key))) {
    return 'bag'
  }
  if (ruleConfig.value.gripKeywords.some((key) => noBracket.includes(key))) {
    return 'grip'
  }
  return 'racket'
}

function getCounts(productDesc: string) {
  const items = splitItems(productDesc)
  let productQty = 0
  let shuttlecockQty = 0
  let bagQty = 0
  let gripQty = 0

  for (const item of items) {
    const qty = parseItemQty(item)
    const kind = classifyItem(item)
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

function parseBlock(block: string, index: number): ParseBlockResult {
  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) {
    return {
      kind: 'failed',
      blockIndex: index,
      raw: block,
      issues: [createIssue('EMPTY_BLOCK', '段落为空，无法解析')],
    }
  }

  let agent = ''
  let cursor = 0
  const firstLineRaw = lines[0] ?? ''

  if (firstLineRaw.includes(':') && !/^(收货人|手机号码|地址信息)[:：]/.test(firstLineRaw)) {
    agent = extractAgentFromHeader(firstLineRaw)
    cursor = 1
  }

  const content = lines.slice(cursor)
  if (!content.length) {
    return {
      kind: 'failed',
      blockIndex: index,
      raw: block,
      issues: [createIssue('EMPTY_BLOCK', '段落缺少有效内容')],
    }
  }

  let name = ''
  let phone = ''
  let address = ''
  let virtualNo = ''
  let productDesc = ''

  const receiverLine = content.find((line) => /^收货人[:：]/.test(line))
  if (receiverLine) {
    name = stripName(receiverLine.replace(/^收货人[:：]/, '').trim())
    const phoneLine = content.find((line) => /^手机号码[:：]/.test(line))
    const addressLine = content.find((line) => /^地址信息[:：]/.test(line))
    phone = phoneLine ? phoneLine.replace(/^手机号码[:：]/, '').trim() : ''
    address = addressLine ? addressLine.replace(/^地址信息[:：]/, '').trim() : ''
    const descLines = content.filter(
      (line) => !/^收货人[:：]/.test(line) && !/^手机号码[:：]/.test(line) && !/^地址信息[:：]/.test(line),
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
      const phoneLine = content.find((line, i) => i > 0 && /(1\d{10})/.test(line)) ?? ''
      const phoneMatch = phoneLine.match(/(1\d{10})/)
      phone = phoneMatch ? (phoneMatch[1] ?? '') : ''

      const phoneIndex = phoneLine ? content.indexOf(phoneLine) : 0
      const rest = content.slice(Math.max(phoneIndex + 1, 1))
      const addrCandidate = rest[0] ?? ''
      const split = splitAddressAndProduct(addrCandidate)
      address = split.address
      productDesc = split.product || rest.slice(1).join(' ').trim()
    }
  }

  const issues: ParseIssue[] = []

  if (!phone && !name) {
    return {
      kind: 'failed',
      blockIndex: index,
      raw: block,
      issues: [createIssue('MISSING_NAME_AND_PHONE', '姓名和手机号均缺失，无法识别订单主体')],
    }
  }

  if (!phone) {
    appendIssue(issues, createIssue('MISSING_PHONE', '手机号缺失，请人工补充'))
  } else if (!/^1\d{10}$/.test(phone)) {
    appendIssue(issues, createIssue('INVALID_PHONE', '手机号格式异常，请人工核对'))
  }

  if (!productDesc) {
    const lastLine = content[content.length - 1] ?? ''
    if (lastLine !== address && anchorKeywordRegex.value.test(lastLine)) {
      productDesc = lastLine
    }
  }

  const nameParsed = extractVirtualNoFromName(name)
  name = nameParsed.cleanName

  const virtualNoParsed = extractVirtualNoFromAddress(address)
  address = virtualNoParsed.cleanAddress
  virtualNo = virtualNoParsed.virtualNo || nameParsed.virtualNo

  if (!productDesc) {
    appendIssue(issues, createIssue('MISSING_PRODUCT', '商品描述缺失，请人工补充'))
  }

  const addressValidation = validateAddressSmart(address, { productDesc })
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

  const shipFrom = getDefaultShipFrom()
  const normalizedProductDesc = normalizeProductDescText(productDesc)
  const freight = computeFreight(shipFrom)
  const counts = getCounts(normalizedProductDesc)

  const row: OrderRow = {
    id: `${Date.now()}-${index}-${Math.random().toString(16).slice(2, 8)}`,
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

function parseInputText(text: string): ParseReport {
  const normalized = normalizeText(text)
  const blocks = normalized
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean)

  const successRows: OrderRow[] = []
  const warningRows: OrderRow[] = []
  const failedRows: ParseFailedRow[] = []

  blocks.forEach((block, i) => {
    const result = parseBlock(block, i + 1)
    if (result.kind === 'success') {
      successRows.push(result.row)
    } else if (result.kind === 'warning') {
      warningRows.push(result.row)
    } else {
      failedRows.push({
        blockIndex: result.blockIndex,
        raw: result.raw,
        issues: result.issues,
      })
    }
  })

  return {
    successRows: ensureRowsSerialNo(successRows),
    warningRows: ensureRowsSerialNo(warningRows),
    failedRows,
    totalBlocks: blocks.length,
    successCount: successRows.length,
    warningCount: warningRows.length,
    failedCount: failedRows.length,
  }
}

async function handleParse(options: ParseOptions): Promise<boolean> {
  const source = options.sourceText ?? inputText.value
  if (!source.trim()) {
    message.warning('请先粘贴客户信息')
    return false
  }

  const report = parseInputText(source)
  lastParseReport.value = report

  const importRows = options.includeWarningRows ? [...report.successRows, ...report.warningRows] : [...report.successRows]

  if (!importRows.length) {
    if (aiAssistConfig.value.enabled) {
      const aiOk = await tryAiAssistParse(source, options)
      if (aiOk) {
        return true
      }
    }
    message.error(`未识别到可导入订单（成功 ${report.successCount}，待确认 ${report.warningCount}，失败 ${report.failedCount}）`)
    return false
  }

  const shouldFallbackToAi = aiAssistConfig.value.enabled && aiAssistConfig.value.fallbackOnWarning && report.warningCount > 0
  if (shouldFallbackToAi) {
    const aiOk = await tryAiAssistParse(source, options)
    if (aiOk) {
      return true
    }
  }

  rows.value = options.importMode === 'append' ? ensureRowsSerialNo([...importRows, ...rows.value]) : ensureRowsSerialNo(importRows)

  const summaryText = `总段落 ${report.totalBlocks}，成功 ${report.successCount}，待确认 ${report.warningCount}，失败 ${report.failedCount}`
  if (report.failedCount > 0 || report.warningCount > 0) {
    message.warning(`导入完成：${summaryText}`)
  } else {
    message.success(`导入完成：${summaryText}`)
  }
  return true
}

function openImportModal() {
  importModalOpen.value = true
  lastParseReport.value = null
  importFiles.value = []
}

function openSettingsModal() {
  settingsModalOpen.value = true
}

function onImportFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  importFiles.value = Array.from(input.files ?? []).filter((file) => /\.txt$/i.test(file.name))
}

async function handleImportByTxtFiles() {
  if (!importFiles.value.length) {
    message.warning('请先选择 txt 文件')
    return
  }

  try {
    const contents = await Promise.all(importFiles.value.map((file) => file.text()))
    const mergedText = contents
      .map((content) => content.trim())
      .filter(Boolean)
      .join('\n\n')

    if (!mergedText) {
      message.warning('所选 txt 文件内容为空')
      return
    }

    const ok = await handleParse({
      importMode: importMode.value,
      includeWarningRows: includeWarningRows.value,
      sourceText: mergedText,
    })

    if (ok) {
      importModalOpen.value = false
      inputText.value = ''
      importFiles.value = []
    }
  } catch {
    message.error('读取 txt 文件失败，请重试')
  }
}

async function handleParseInModal() {
  const ok = await handleParse({
    importMode: importMode.value,
    includeWarningRows: includeWarningRows.value,
  })
  if (ok) {
    importModalOpen.value = false
    inputText.value = ''
  }
}

function addEmptyRow() {
  rows.value.unshift({
    id: `${Date.now()}-manual`,
    serialNo: getNextSerialNo(rows.value),
    name: '',
    phone: '',
    address: '',
    virtualNo: '',
    productDesc: '',
    productQty: 0,
    shuttlecockQty: 0,
    bagQty: 0,
    gripQty: 0,
    agent: '',
    shipFrom: getDefaultShipFrom(),
    freight: computeFreight(getDefaultShipFrom()),
    trackingNo: '',
    importedAt: formatDateTime(),
    parseStatus: 'success',
    parseIssues: [],
  })
}

function removeRow(id: string) {
  rows.value = rows.value.filter((row) => row.id !== id)
  selectedRowKeys.value = selectedRowKeys.value.filter((key) => key !== id)
}

function removeSelected() {
  if (!selectedRowKeys.value.length) {
    message.warning('请先选择要删除的行')
    return
  }
  const selected = new Set(selectedRowKeys.value)
  rows.value = rows.value.filter((row) => !selected.has(row.id))
  selectedRowKeys.value = []
  message.success('已删除选中订单')
}

function clearAllRows() {
  if (!rows.value.length) {
    message.warning('当前没有可清空的数据')
    return
  }
  Modal.confirm({
    title: '确认清空全部订单数据？',
    content: '该操作会删除当前表格中的全部订单，且不可撤销。',
    okText: '确认清空',
    cancelText: '取消',
    okButtonProps: { danger: true },
    onOk: () => {
      rows.value = []
      selectedRowKeys.value = []
      message.success('已清空全部订单数据')
    },
  })
}

function refreshCalculatedFields(row: OrderRow) {
  row.productDesc = normalizeProductDescText(row.productDesc)
  const counts = getCounts(row.productDesc)
  row.productQty = counts.productQty
  row.shuttlecockQty = counts.shuttlecockQty
  row.bagQty = counts.bagQty
  row.gripQty = counts.gripQty
  row.freight = computeFreight(row.shipFrom)
}

function handleAddressFocus(row: OrderRow) {
  addressEditSnapshot.value[row.id] = row.address
}

function handleAddressBlur(row: OrderRow) {
  const initialAddress = addressEditSnapshot.value[row.id]
  delete addressEditSnapshot.value[row.id]
  const userEditedAddress = typeof initialAddress === 'string' && row.address !== initialAddress

  const nameParsed = extractVirtualNoFromName(row.name)
  const addressParsed = extractVirtualNoFromAddress(row.address)
  const virtualNo = addressParsed.virtualNo || nameParsed.virtualNo || row.virtualNo

  row.name = appendVirtualNoSuffix(nameParsed.cleanName, virtualNo)
  row.address = addressParsed.cleanAddress

  const validation = validateAddressSmart(row.address, {
    productDesc: row.productDesc,
    ignoreAddressContainsProduct: userEditedAddress,
  })
  row.address = appendVirtualNoSuffix(validation.normalizedAddress, virtualNo)
  row.virtualNo = virtualNo

  const nextIssues = (row.parseIssues ?? []).filter((issue) => !ADDRESS_ISSUE_SET.has(issue.code))
  validation.issues.forEach((issue) => appendIssue(nextIssues, issue))

  row.parseIssues = nextIssues
  row.parseStatus = nextIssues.length ? 'warning' : 'success'
}

function applyBatch() {
  if (!selectedRowKeys.value.length) {
    message.warning('请先选择要批量操作的订单')
    return
  }
  if (!batchTarget.value) {
    message.warning('请先选择修改对象')
    return
  }

  const selected = new Set(selectedRowKeys.value)

  const stringValue = batchValue.value.trim()
  const numberValue = Number(batchNumberValue.value ?? 0)

  if (batchTarget.value !== 'freight' && !stringValue) {
    message.warning('请输入要批量设置的值')
    return
  }
  if (batchTarget.value === 'freight' && batchNumberValue.value === null) {
    message.warning('请输入有效运费')
    return
  }

  const handlerMap: Record<BatchTarget, (row: OrderRow) => void> = {
    agent: (row) => {
      row.agent = stringValue
    },
    shipFrom: (row) => {
      row.shipFrom = stringValue
      row.freight = computeFreight(row.shipFrom)
    },
    trackingNo: (row) => {
      row.trackingNo = stringValue
    },
    freight: (row) => {
      row.freight = numberValue
    },
  }

  const applyToRow = handlerMap[batchTarget.value]
  rows.value.forEach((row) => {
    if (selected.has(row.id)) {
      applyToRow(row)
    }
  })

  message.success('批量更新完成')
}

function onBatchTargetChange() {
  batchValue.value = ''
  batchNumberValue.value = null
}

function formatProductDescForDisplay(row: OrderRow): string {
  const raw = normalizeProductDescText((row.productDesc ?? '').trim())
  if (!raw) {
    return ''
  }
  const clean = raw.replace(/^（|）$/g, '').replace(/^\(|\)$/g, '').trim()
  return clean ? `（${clean}）` : ''
}

function getCellTextValue(row: OrderRow, field: EditableField): string {
  if (field === 'productDesc') {
    return formatProductDescForDisplay(row)
  }
  const value = row[field]
  if (typeof value === 'number') {
    if ((field === 'shuttlecockQty' || field === 'bagQty' || field === 'gripQty' || field === 'freight') && value === 0) {
      return ''
    }
    return String(value)
  }
  return String(value ?? '').trim()
}

function getInputElementId(rowId: string, field: EditableField): string {
  return `editable-${rowId}-${field}`
}

function isCellEditing(row: OrderRow, field: EditableField): boolean {
  return editingCell.value?.rowId === row.id && editingCell.value?.field === field
}

function activateCellEdit(row: OrderRow, field: EditableField) {
  if (isCellEditing(row, field)) {
    return
  }
  if (field === 'productDesc') {
    row.productDesc = normalizeProductDescText((row.productDesc ?? '').trim())
  }
  editingCell.value = { rowId: row.id, field }
  const inputId = getInputElementId(row.id, field)
  setTimeout(() => {
    const element = document.getElementById(inputId) as HTMLInputElement | HTMLTextAreaElement | null
    element?.focus()
    if (element && typeof element.select === 'function') {
      element.select()
    }
  }, 0)
}

function handleEditableBlur(row: OrderRow, field: EditableField) {
  if (!isCellEditing(row, field)) {
    return
  }
  if (field === 'address') {
    handleAddressBlur(row)
  }
  if (field === 'productDesc') {
    row.productDesc = normalizeProductDescText((row.productDesc ?? '').trim())
    refreshCalculatedFields(row)
  }
  if (field === 'shipFrom') {
    row.freight = computeFreight(row.shipFrom)
  }
  editingCell.value = null
}

function handleEditableFocusIn(row: OrderRow, field: EditableField) {
  if (field === 'address') {
    handleAddressFocus(row)
  }
}

function onTextInput(field: 'name' | 'phone' | 'address' | 'agent' | 'shipFrom' | 'trackingNo', row: OrderRow, event: Event) {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | null
  row[field] = target?.value ?? ''
}

function onNumberChange(field: 'productQty' | 'shuttlecockQty' | 'bagQty' | 'gripQty' | 'freight', row: OrderRow, value: unknown) {
  row[field] = Number.isFinite(Number(value)) ? Number(value) : 0
}

function onProductDescInput(row: OrderRow, event: Event) {
  const target = event.target as HTMLTextAreaElement | null
  row.productDesc = normalizeProductDescText(target?.value ?? '')
}

async function exportExcelData(data: OrderRow[], label: '全部' | '选中') {
  const XLSX = await loadXlsx()
  const exportRows = getExportRows(data)
  const ordered = exportRows.map((row, index) => ({
    序号: getExportSerial(row, index),
    姓名: row.name,
    联系方式: row.phone,
    收货地址: row.address,
    商品描述: formatProductDescForDisplay(row),
    商品数量: row.productQty,
    羽毛球数量: row.shuttlecockQty === 0 ? '' : row.shuttlecockQty,
    拍包数量: row.bagQty === 0 ? '' : row.bagQty,
    手胶数量: row.gripQty === 0 ? '' : row.gripQty,
    代理人: row.agent,
    发货地: row.shipFrom,
    运费: row.freight === 0 ? '' : row.freight,
    快递单号: row.trackingNo,
    导入时间: row.importedAt,
  }))
  const sheet = XLSX.utils.json_to_sheet(ordered)

  const headers = [
    '序号',
    '姓名',
    '联系方式',
    '收货地址',
    '商品描述',
    '商品数量',
    '羽毛球数量',
    '拍包数量',
    '手胶数量',
    '代理人',
    '发货地',
    '运费',
    '快递单号',
    '导入时间',
  ]

  sheet['!cols'] = [
    { wch: 7 },
    { wch: 10 },
    { wch: 14 },
    { wch: 34 },
    { wch: 24 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 8 },
    { wch: 16 },
    { wch: 20 },
  ]

  const rangeRef = sheet['!ref']
  if (rangeRef) {
    const range = XLSX.utils.decode_range(rangeRef)
    const borderStyle = {
      top: { style: 'thin', color: { rgb: '000000' } },
      bottom: { style: 'thin', color: { rgb: '000000' } },
      left: { style: 'thin', color: { rgb: '000000' } },
      right: { style: 'thin', color: { rgb: '000000' } },
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
          alignment: {
            vertical: 'center',
            horizontal: colIndex === 0 || (colIndex >= 5 && colIndex <= 8) ? 'center' : 'left',
            wrapText: true,
          },
          border: borderStyle,
        }
      }
    }

    sheet['!rows'] = [{ hpt: 24 }, ...Array.from({ length: Math.max(range.e.r - range.s.r, 0) }, () => ({ hpt: 42 }))]

    XLSX.utils.sheet_add_aoa(sheet, [headers], { origin: 'A1' })
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, '商单')
  const date = new Date()
  const { yyyy, mm, dd } = formatDateParts(date)
  const filename = `商单_${label}_${yyyy}-${mm}-${dd}.xlsx`
  XLSX.writeFile(wb, filename, { cellStyles: true })
}

async function exportAllExcel() {
  try {
    await exportExcelData(rows.value, '全部')
    message.success('已导出全部数据')
  } catch {
    message.error('导出失败，请稍后重试')
  }
}

async function exportSelectedExcel() {
  if (!selectedRowKeys.value.length) {
    message.warning('请先选择要导出的订单')
    return
  }
  const selectedSet = new Set(selectedRowKeys.value)
  const selectedRows = rows.value.filter((row) => selectedSet.has(row.id))
  try {
    await exportExcelData(selectedRows, '选中')
    message.success(`已导出选中数据 ${selectedRows.length} 条`)
  } catch {
    message.error('导出失败，请稍后重试')
  }
}

function getRowKey(record: OrderRow): string {
  return record.id
}
</script>

<template>
  <div v-if="!accessGranted" class="access-page">
    <a-card class="access-card" title="访问验证">
      <a-space direction="vertical" style="width: 100%" :size="12">
        <p class="helper-text">请输入访问密码后进入系统</p>
        <a-input-password
          v-model:value="accessPasswordInput"
          size="large"
          placeholder="请输入访问密码"
          @pressEnter="handleAccessPasswordEnter"
        />
        <a-button type="primary" size="large" block :loading="accessChecking" @click="unlockApp">进入系统</a-button>
      </a-space>
    </a-card>
  </div>

  <div v-else class="page">
    <header class="top-card">
      <div>
        <h1>商单录入系统（羽毛球）</h1>
        <p>粘贴聊天信息 → 智能解析 → 可编辑表格 → 汇总与导出 Excel</p>
      </div>
      <a-space>
        <a-button @click="openSettingsModal">设置</a-button>
        <a-button type="default" @click="openImportModal">导入信息</a-button>
        <a-button @click="exportSelectedExcel">导出选中</a-button>
        <a-button type="primary" @click="exportAllExcel">导出全部</a-button>
      </a-space>
    </header>

    <section class="grid-wrap">
      <a-card class="summary-card compact-card" title="汇总统计">
        <div class="kpi-grid">
          <div class="kpi-item">
            <span>订单数</span>
            <strong>{{ summary.orders }}</strong>
          </div>
          <div class="kpi-item">
            <span>商品数量</span>
            <strong>{{ summary.productQty }}</strong>
          </div>
          <div class="kpi-item">
            <span>羽毛球数量</span>
            <strong>{{ summary.shuttlecockQty }}</strong>
          </div>
          <div class="kpi-item">
            <span>拍包数量</span>
            <strong>{{ summary.bagQty }}</strong>
          </div>
          <div class="kpi-item">
            <span>手胶数量</span>
            <strong>{{ summary.gripQty }}</strong>
          </div>
          <div class="kpi-item">
            <span>运费合计</span>
            <strong>¥{{ summary.freight }}</strong>
          </div>
        </div>
      </a-card>

      <a-card class="batch-card" title="批量操作（对选中行生效）">
        <div class="batch-layout-row">
          <div class="batch-toolbar">
            <a-button type="default" @click="addEmptyRow">新增一行</a-button>
            <a-button danger @click="removeSelected">删除选中</a-button>
            <a-button danger ghost @click="clearAllRows">清空全部</a-button>
          </div>
          <div class="serial-mode-row">
            <span class="serial-mode-label">序号模式：</span>
            <a-radio-group
              v-model:value="serialMode"
              size="small"
              :options="serialModeOptions"
              option-type="button"
              button-style="solid"
            />
          </div>
          <div class="serial-mode-row">
            <a-checkbox v-model:checked="exportSortByOriginSerial">导出按固定原始序号排序</a-checkbox>
          </div>
          <div class="batch-row">
            <a-select
              v-model:value="batchTarget"
              class="batch-col"
              placeholder="选择修改对象"
              :options="batchTargetOptions"
              @change="onBatchTargetChange"
            />
            <a-input
              v-if="!isBatchNumberTarget"
              v-model:value="batchValue"
              class="batch-col"
              placeholder="输入修改值"
              allow-clear
            />
            <a-input-number
              v-else
              v-model:value="batchNumberValue"
              class="batch-col"
              :min="0"
              :step="1"
              placeholder="输入运费"
            />
            <a-button type="primary" @click="applyBatch">应用到选中项</a-button>
          </div>
        </div>
      </a-card>
    </section>

    <a-card class="table-card" title="订单表格（双击单元格可编辑）">
      <a-table
        :data-source="rows"
        :columns="columns"
        :row-key="getRowKey"
        :row-selection="rowSelection"
        :pagination="paginationConfig"
        :scroll="{ x: 1530 }"
        table-layout="fixed"
        size="small"
        bordered
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.dataIndex === 'serialNo'">
            {{ getRowDisplaySerial(record, index) }}
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <a-button danger size="small" @click="removeRow(record.id)">删除</a-button>
          </template>
          <template v-else-if="column.dataIndex === 'parseStatus'">
            <div class="status-cell center">
              <a-tag :color="record.parseStatus === 'warning' ? 'gold' : 'green'">{{ getStatusLabel(record) }}</a-tag>
              <span v-if="record.parseIssues?.length" class="issue-text">{{ getIssueText(record.parseIssues) }}</span>
            </div>
          </template>
          <template v-else-if="column.dataIndex === 'name'">
            <a-input
              v-if="isCellEditing(record, 'name')"
              :id="getInputElementId(record.id, 'name')"
              :value="record.name"
              size="small"
              @input="onTextInput('name', record, $event)"
              @blur="handleEditableBlur(record, 'name')"
            />
            <div v-else class="editable-cell multiline center" @dblclick="activateCellEdit(record, 'name')">
              {{ getCellTextValue(record, 'name') }}
            </div>
          </template>
          <template v-else-if="column.dataIndex === 'phone'">
            <a-input
              v-if="isCellEditing(record, 'phone')"
              :id="getInputElementId(record.id, 'phone')"
              :value="record.phone"
              size="small"
              @input="onTextInput('phone', record, $event)"
              @blur="handleEditableBlur(record, 'phone')"
            />
            <div v-else class="editable-cell center" @dblclick="activateCellEdit(record, 'phone')">{{ getCellTextValue(record, 'phone') }}</div>
          </template>
          <template v-else-if="column.dataIndex === 'address'">
            <a-textarea
              v-if="isCellEditing(record, 'address')"
              :id="getInputElementId(record.id, 'address')"
              :value="record.address"
              :auto-size="{ minRows: 1, maxRows: 2 }"
              @focus="handleEditableFocusIn(record, 'address')"
              @input="onTextInput('address', record, $event)"
              @blur="handleEditableBlur(record, 'address')"
            />
            <div v-else class="editable-cell multiline" @dblclick="activateCellEdit(record, 'address')">{{ getCellTextValue(record, 'address') }}</div>
          </template>
          <template v-else-if="column.dataIndex === 'productDesc'">
            <a-textarea
              v-if="isCellEditing(record, 'productDesc')"
              :id="getInputElementId(record.id, 'productDesc')"
              :value="record.productDesc"
              :auto-size="{ minRows: 1, maxRows: 2 }"
              @input="onProductDescInput(record, $event)"
              @blur="handleEditableBlur(record, 'productDesc')"
            />
            <div v-else class="editable-cell multiline" @dblclick="activateCellEdit(record, 'productDesc')">
              {{ getCellTextValue(record, 'productDesc') }}
            </div>
          </template>
          <template v-else-if="column.dataIndex === 'agent'">
            <a-input
              v-if="isCellEditing(record, 'agent')"
              :id="getInputElementId(record.id, 'agent')"
              :value="record.agent"
              size="small"
              @input="onTextInput('agent', record, $event)"
              @blur="handleEditableBlur(record, 'agent')"
            />
            <div v-else class="editable-cell multiline" @dblclick="activateCellEdit(record, 'agent')">
              {{ getCellTextValue(record, 'agent') }}
            </div>
          </template>
          <template v-else-if="column.dataIndex === 'shipFrom'">
            <a-input
              v-if="isCellEditing(record, 'shipFrom')"
              :id="getInputElementId(record.id, 'shipFrom')"
              :value="record.shipFrom"
              size="small"
              @input="onTextInput('shipFrom', record, $event)"
              @blur="handleEditableBlur(record, 'shipFrom')"
            />
            <div v-else class="editable-cell center" @dblclick="activateCellEdit(record, 'shipFrom')">{{ getCellTextValue(record, 'shipFrom') }}</div>
          </template>
          <template v-else-if="column.dataIndex === 'productQty'">
            <a-input-number
              v-if="isCellEditing(record, 'productQty')"
              :id="getInputElementId(record.id, 'productQty')"
              :value="record.productQty"
              size="small"
              :min="0"
              :step="1"
              style="width: 100%"
              @change="onNumberChange('productQty', record, $event)"
              @blur="handleEditableBlur(record, 'productQty')"
            />
            <div v-else class="editable-cell center" @dblclick="activateCellEdit(record, 'productQty')">{{ getCellTextValue(record, 'productQty') }}</div>
          </template>
          <template v-else-if="column.dataIndex === 'shuttlecockQty'">
            <a-input-number
              v-if="isCellEditing(record, 'shuttlecockQty')"
              :id="getInputElementId(record.id, 'shuttlecockQty')"
              :value="record.shuttlecockQty"
              size="small"
              :min="0"
              :step="1"
              style="width: 100%"
              @change="onNumberChange('shuttlecockQty', record, $event)"
              @blur="handleEditableBlur(record, 'shuttlecockQty')"
            />
            <div v-else class="editable-cell center" @dblclick="activateCellEdit(record, 'shuttlecockQty')">
              {{ getCellTextValue(record, 'shuttlecockQty') }}
            </div>
          </template>
          <template v-else-if="column.dataIndex === 'bagQty'">
            <a-input-number
              v-if="isCellEditing(record, 'bagQty')"
              :id="getInputElementId(record.id, 'bagQty')"
              :value="record.bagQty"
              size="small"
              :min="0"
              :step="1"
              style="width: 100%"
              @change="onNumberChange('bagQty', record, $event)"
              @blur="handleEditableBlur(record, 'bagQty')"
            />
            <div v-else class="editable-cell center" @dblclick="activateCellEdit(record, 'bagQty')">{{ getCellTextValue(record, 'bagQty') }}</div>
          </template>
          <template v-else-if="column.dataIndex === 'gripQty'">
            <a-input-number
              v-if="isCellEditing(record, 'gripQty')"
              :id="getInputElementId(record.id, 'gripQty')"
              :value="record.gripQty"
              size="small"
              :min="0"
              :step="1"
              style="width: 100%"
              @change="onNumberChange('gripQty', record, $event)"
              @blur="handleEditableBlur(record, 'gripQty')"
            />
            <div v-else class="editable-cell center" @dblclick="activateCellEdit(record, 'gripQty')">{{ getCellTextValue(record, 'gripQty') }}</div>
          </template>
          <template v-else-if="column.dataIndex === 'freight'">
            <a-input-number
              v-if="isCellEditing(record, 'freight')"
              :id="getInputElementId(record.id, 'freight')"
              :value="record.freight"
              size="small"
              :min="0"
              :step="1"
              style="width: 100%"
              @change="onNumberChange('freight', record, $event)"
              @blur="handleEditableBlur(record, 'freight')"
            />
            <div v-else class="editable-cell center" @dblclick="activateCellEdit(record, 'freight')">{{ getCellTextValue(record, 'freight') }}</div>
          </template>
          <template v-else-if="column.dataIndex === 'trackingNo'">
            <a-input
              v-if="isCellEditing(record, 'trackingNo')"
              :id="getInputElementId(record.id, 'trackingNo')"
              :value="record.trackingNo"
              size="small"
              @input="onTextInput('trackingNo', record, $event)"
              @blur="handleEditableBlur(record, 'trackingNo')"
            />
            <div v-else class="editable-cell" @dblclick="activateCellEdit(record, 'trackingNo')">{{ getCellTextValue(record, 'trackingNo') }}</div>
          </template>
          <template v-else>
            {{ record[column.dataIndex as keyof OrderRow] }}
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal
      v-model:open="importModalOpen"
      title="导入解析"
      width="760px"
      :mask-closable="false"
      destroy-on-close
    >
      <a-space direction="vertical" style="width: 100%" :size="12">
        <a-textarea
          v-model:value="inputText"
          :rows="12"
          placeholder="粘贴聊天文本，支持：姓名+电话+地址+商品 / 收货人: 手机号码: 地址信息: / 代理聊天格式"
        />

        <div class="import-options">
          <a-radio-group v-model:value="importMode" button-style="solid">
            <a-radio-button value="append">识别并追加</a-radio-button>
            <a-radio-button value="replace">识别并覆盖</a-radio-button>
          </a-radio-group>
          <a-checkbox v-model:checked="includeWarningRows">导入待确认行（Warning）</a-checkbox>
        </div>

        <div class="import-options">
          <input type="file" accept=".txt,text/plain" multiple @change="onImportFileChange" />
          <span v-if="importFiles.length">已选择 {{ importFiles.length }} 个 txt 文件</span>
        </div>

        <div v-if="lastParseReport" class="parse-result-panel">
          <div class="parse-summary-row">
            <span>最近解析：</span>
            <a-tag color="green">成功 {{ lastParseReport.successCount }}</a-tag>
            <a-tag color="gold">待确认 {{ lastParseReport.warningCount }}</a-tag>
            <a-tag color="red">失败 {{ lastParseReport.failedCount }}</a-tag>
          </div>

          <div v-if="failedIssueSummary.length" class="failed-reasons">
            <div class="failed-title">失败原因分布</div>
            <ul>
              <li v-for="item in failedIssueSummary" :key="item.code">{{ item.message }}（{{ item.count }} 条）</li>
            </ul>
          </div>

          <div v-if="failedPreviewRows.length" class="failed-preview">
            <div class="failed-title">失败样例（前 {{ failedPreviewRows.length }} 条）</div>
            <ul>
              <li v-for="item in failedPreviewRows" :key="item.blockIndex">
                <strong>#{{ item.blockIndex }}</strong>
                <span>{{ item.reason }}</span>
                <span class="failed-raw">{{ item.raw }}</span>
              </li>
            </ul>
          </div>
        </div>
      </a-space>
      <template #footer>
        <a-space>
          <a-button @click="importModalOpen = false">取消</a-button>
          <a-button @click="handleImportByTxtFiles">导入TXT文件</a-button>
          <a-button type="primary" @click="handleParseInModal">开始导入</a-button>
        </a-space>
      </template>
    </a-modal>

    <a-modal
      v-model:open="settingsModalOpen"
      title="设置"
      width="760px"
      :mask-closable="false"
      destroy-on-close
    >
      <a-space direction="vertical" style="width: 100%" :size="12">
        <a-card size="small" title="导入识别规则">
          <a-space direction="vertical" style="width: 100%" :size="10">
            <a-input
              v-model:value="ruleText.shuttlecock"
              placeholder="羽毛球关键词，逗号分隔（如：vt,tv,天斧,古红,藏青,70,100zz）"
              allow-clear
            />
            <a-input v-model:value="ruleText.bag" placeholder="拍包关键词，逗号分隔（如：拍包）" allow-clear />
            <a-input v-model:value="ruleText.grip" placeholder="手胶关键词，逗号分隔（如：手胶,胶带,缠把）" allow-clear />
            <a-input
              v-model:value="ruleText.anchors"
              placeholder="商品锚点关键词，逗号分隔（用于地址/商品拆分）"
              allow-clear
            />
          </a-space>
        </a-card>

        <a-card size="small" title="运费规则">
          <div class="batch-row">
            <a-input
              v-model:value="freightRuleText.nonFreeRegions"
              class="batch-col"
              placeholder="不包邮地区，逗号分隔（如：新疆,西藏,青海,海南）"
              allow-clear
            />
            <a-input-number
              v-model:value="freightRuleText.freightAmount"
              class="batch-col"
              :min="0"
              :step="1"
              placeholder="不包邮运费"
            />
            <a-input
              v-model:value="freightRuleText.defaultShipFrom"
              class="batch-col"
              placeholder="默认发货地（如：湖南）"
              allow-clear
            />
            <a-button
              @click="
                freightRuleText = {
                  ...DEFAULT_FREIGHT_RULE_TEXT,
                }
              "
            >
              恢复默认
            </a-button>
          </div>
        </a-card>

        <a-card size="small" title="AI辅助识别">
          <a-space direction="vertical" style="width: 100%" :size="10">
            <a-checkbox v-model:checked="aiAssistConfig.enabled">启用AI辅助识别</a-checkbox>
            <a-checkbox v-model:checked="aiAssistConfig.fallbackOnWarning">识别为Warning时也触发AI兜底</a-checkbox>
            <a-input v-model:value="aiAssistConfig.baseUrl" placeholder="AI接口地址（OpenAI兼容）" allow-clear />
            <a-input-password v-model:value="aiAssistConfig.apiKey" placeholder="API Key" allow-clear />
            <a-input v-model:value="aiAssistConfig.model" placeholder="模型名称（如 gpt-4o-mini）" allow-clear />
            <a-input-number v-model:value="aiAssistConfig.timeoutMs" :min="3000" :step="1000" style="width: 100%" />
            <a-alert
              type="info"
              show-icon
              message="AI提示词已内置：包含姓名/地址虚拟号提取、70误命中规避、商品数量与羽毛球赠送规则。"
            />
          </a-space>
        </a-card>
      </a-space>
      <template #footer>
        <a-space>
          <a-button @click="settingsModalOpen = false">关闭</a-button>
        </a-space>
      </template>
    </a-modal>

  </div>
</template>
