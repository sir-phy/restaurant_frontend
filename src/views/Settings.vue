<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { t, currentLang } from '../i18n'
import { settingsService, type RestaurantSettings } from '../services/settings.js'
import { tableService, type TableItem, type TableSummary } from '../services/tables.js'
import { downloadDataUrl, printPoster, renderQrDataUrl, renderTableQrPoster } from '../utils/tableQr.js'

const isLoading = ref(true)
const isSaving = ref(false)
const saveMessage = ref('')
const saveError = ref('')

const taxPercent = ref(10)
const serviceFeePercent = ref(2)
const restaurantLat = ref<number | null>(null)
const restaurantLng = ref<number | null>(null)
const orderRadiusM = ref(200)
const isSavingLocation = ref(false)
const locationMessage = ref('')
const locationError = ref('')
const isPinningLocation = ref(false)

const previewSubtotal = 100
const previewTax = computed(() => +(previewSubtotal * (Number(taxPercent.value) || 0) / 100).toFixed(2))
const previewService = computed(() => +(previewSubtotal * (Number(serviceFeePercent.value) || 0) / 100).toFixed(2))
const previewTotal = computed(() => +(previewSubtotal + previewTax.value + previewService.value).toFixed(2))

const loadSettings = async () => {
  isLoading.value = true
  saveError.value = ''
  try {
    const res = await settingsService.getSettings()
    const data = res.data as RestaurantSettings
    if (data) {
      taxPercent.value = Number(data.taxPercent)
      serviceFeePercent.value = Number(data.serviceFeePercent)
      restaurantLat.value = data.restaurantLat ?? null
      restaurantLng.value = data.restaurantLng ?? null
      orderRadiusM.value = Number(data.orderRadiusM) || 200
    }
  } catch (err: any) {
    saveError.value = err?.message || (currentLang.value === 'km' ? 'មិនអាចផ្ទុកការកំណត់បានទេ' : 'Could not load settings')
  } finally {
    isLoading.value = false
  }
}

const saveSettings = async () => {
  const tax = Number(taxPercent.value)
  const fee = Number(serviceFeePercent.value)
  if (!Number.isFinite(tax) || tax < 0 || tax > 100 || !Number.isFinite(fee) || fee < 0 || fee > 100) {
    saveError.value = currentLang.value === 'km'
      ? 'ភាគរយត្រូវនៅចន្លោះ ០ និង ១០០'
      : 'Percents must be between 0 and 100'
    return
  }
  isSaving.value = true
  saveError.value = ''
  saveMessage.value = ''
  try {
    const res = await settingsService.updateSettings({
      taxPercent: tax,
      serviceFeePercent: fee,
    })
    const data = res.data as RestaurantSettings
    if (data) {
      taxPercent.value = Number(data.taxPercent)
      serviceFeePercent.value = Number(data.serviceFeePercent)
      restaurantLat.value = data.restaurantLat ?? null
      restaurantLng.value = data.restaurantLng ?? null
      orderRadiusM.value = Number(data.orderRadiusM) || 200
    }
    saveMessage.value = currentLang.value === 'km'
      ? 'បានរក្សាទុកការកំណត់ពន្ធ និងសេវាកម្ម'
      : 'Tax and service fee rates saved'
    setTimeout(() => { saveMessage.value = '' }, 3500)
  } catch (err: any) {
    saveError.value = err?.message || (currentLang.value === 'km' ? 'មិនអាចរក្សាទុកបានទេ' : 'Could not save settings')
  } finally {
    isSaving.value = false
  }
}

const applyRestaurantPin = (lat: number, lng: number) => {
  restaurantLat.value = lat
  restaurantLng.value = lng
}

const useMyLocationForRestaurant = () => {
  locationError.value = ''
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    locationError.value = currentLang.value === 'km'
      ? 'ឧបករណ៍នេះមិនគាំទ្រ GPS ទេ'
      : 'This device does not support location'
    return
  }
  isPinningLocation.value = true
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      applyRestaurantPin(pos.coords.latitude, pos.coords.longitude)
      isPinningLocation.value = false
    },
    () => {
      locationError.value = currentLang.value === 'km'
        ? 'មិនអាចអានទីតាំងបានទេ។ សូមអនុញ្ញាត GPS។'
        : 'Could not read location. Allow GPS and try again.'
      isPinningLocation.value = false
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
  )
}

const saveLocationSettings = async () => {
  const radius = Number(orderRadiusM.value)
  if (!Number.isFinite(radius) || radius < 20 || radius > 5000) {
    locationError.value = currentLang.value === 'km'
      ? 'កាំត្រូវនៅចន្លោះ ២០ និង ៥០០០ ម៉ែត្រ'
      : 'Radius must be between 20 and 5,000 meters'
    return
  }
  isSavingLocation.value = true
  locationError.value = ''
  locationMessage.value = ''
  try {
    const res = await settingsService.updateSettings({
      restaurantLat: restaurantLat.value,
      restaurantLng: restaurantLng.value,
      orderRadiusM: Math.round(radius),
    })
    const data = res.data as RestaurantSettings
    if (data) {
      restaurantLat.value = data.restaurantLat ?? null
      restaurantLng.value = data.restaurantLng ?? null
      orderRadiusM.value = Number(data.orderRadiusM) || 200
    }
    locationMessage.value = currentLang.value === 'km'
      ? 'បានរក្សាទុកទីតាំងភោជនីយដ្ឋាន'
      : 'Restaurant location saved'
    setTimeout(() => { locationMessage.value = '' }, 3500)
  } catch (err: any) {
    locationError.value = err?.message || (currentLang.value === 'km' ? 'មិនអាចរក្សាទុកបានទេ' : 'Could not save location')
  } finally {
    isSavingLocation.value = false
  }
}

// ── Floor table management ──────────────────────────────────────────────────
const tables = ref<TableItem[]>([])
const tableSummary = ref<TableSummary>({ total: 0, available: 0, occupied: 0, reserved: 0, inactive: 0 })
const tablesLoading = ref(false)
const tableBusyId = ref<number | null>(null)
const tableMessage = ref('')
const tableError = ref('')
const tableSearch = ref('')
const statusFilter = ref<'ALL' | TableItem['status']>('ALL')

const newTableNo = ref('')
const newTableName = ref('')
const newCapacity = ref(4)
const newLocation = ref('')
const isCreatingTable = ref(false)

const rangeFrom = ref(1)
const rangeTo = ref(8)
const rangeCapacity = ref(4)
const rangeLocation = ref('')
const isCreatingRange = ref(false)

const showEditModal = ref(false)
const showDeleteModal = ref(false)
const editingTable = ref<TableItem | null>(null)
const tableToDelete = ref<TableItem | null>(null)
const editForm = ref({ table_number: '', name: '', capacity: 4, location: '' })
const formError = ref('')

const tableNoOf = (table: TableItem | null | undefined) =>
  String(table?.table_number || (table as any)?.tableNo || table?.name || '').trim()

const isTableInactive = (table: TableItem) =>
  table.status === 'INACTIVE' || table.is_active === false

const statusLabel = (status: string) => {
  if (currentLang.value === 'km') {
    if (status === 'AVAILABLE') return 'ទំនេរ'
    if (status === 'OCCUPIED') return 'មានភ្ញៀវ'
    if (status === 'RESERVED') return 'កក់ទុក'
    if (status === 'INACTIVE') return 'បិទ'
  }
  return status
}

const statusClass = (status: string) => {
  if (status === 'AVAILABLE') return 'bg-emerald-50 text-emerald-700'
  if (status === 'OCCUPIED') return 'bg-amber-50 text-amber-800'
  if (status === 'RESERVED') return 'bg-sky-50 text-sky-800'
  return 'bg-slate-100 text-slate-600'
}

const lastCreated = ref<{ tableNo: string; url: string } | null>(null)
const showQrModal = ref(false)
const qrTable = ref<TableItem | null>(null)
const qrPreview = ref('')
const qrPoster = ref('')
const qrBusy = ref(false)
const qrThumbs = ref<Record<string, string>>({})

const guestUrlOf = (table: TableItem | { menu_token?: string | null; url?: string | null; table_number?: string }) => {
  const token = table.menu_token || (typeof table.url === 'string' && table.url.includes('/t/')
    ? table.url.split('/t/').pop()
    : '')
  if (token) return `${window.location.origin}/t/${token}`
  return `${window.location.origin}/menu?table=${encodeURIComponent(tableNoOf(table as TableItem))}`
}

const safeFileName = (tableNo: string) =>
  `TosEat-Table-${String(tableNo).replace(/[^\w.-]+/g, '_')}-QR.png`

const ensureQrThumb = async (url: string) => {
  if (!url || qrThumbs.value[url]) return
  try {
    const dataUrl = await renderQrDataUrl(url, 220)
    qrThumbs.value = { ...qrThumbs.value, [url]: dataUrl }
  } catch {
    /* keep the list usable even if a QR fails to render */
  }
}

const openQrModal = async (table: TableItem, auto = false) => {
  qrTable.value = table
  showQrModal.value = true
  qrBusy.value = true
  qrPreview.value = ''
  qrPoster.value = ''
  const url = guestUrlOf(table)
  try {
    const [preview, poster] = await Promise.all([
      renderQrDataUrl(url, 512),
      renderTableQrPoster({
        tableNo: tableNoOf(table),
        url,
        name: table.name,
        location: table.location,
      }),
    ])
    qrPreview.value = preview
    qrPoster.value = poster
    await ensureQrThumb(url)
    if (auto) {
      flashTableMessage(
        currentLang.value === 'km'
          ? `តុ #${tableNoOf(table)} មាន URL និង QR រួចហើយ`
          : `Table #${tableNoOf(table)} URL and QR are ready`,
      )
    }
  } catch (err: any) {
    tableError.value = friendlyTableError(err?.message)
  } finally {
    qrBusy.value = false
  }
}

const downloadTableQr = async (table?: TableItem | null) => {
  const target = table || qrTable.value
  if (!target) return
  qrBusy.value = true
  try {
    const poster = qrPoster.value && qrTable.value?.id === target.id
      ? qrPoster.value
      : await renderTableQrPoster({
          tableNo: tableNoOf(target),
          url: guestUrlOf(target),
          name: target.name,
          location: target.location,
        })
    downloadDataUrl(poster, safeFileName(tableNoOf(target)))
    flashTableMessage(currentLang.value === 'km' ? 'បានទាញយក QR' : 'QR card downloaded')
  } catch (err: any) {
    tableError.value = friendlyTableError(err?.message)
  } finally {
    qrBusy.value = false
  }
}

const printTableQr = async (table?: TableItem | null) => {
  const target = table || qrTable.value
  if (!target) return
  qrBusy.value = true
  try {
    const poster = qrPoster.value && qrTable.value?.id === target.id
      ? qrPoster.value
      : await renderTableQrPoster({
          tableNo: tableNoOf(target),
          url: guestUrlOf(target),
          name: target.name,
          location: target.location,
        })
    printPoster(poster, `TosEat Table ${tableNoOf(target)}`)
  } catch (err: any) {
    tableError.value = currentLang.value === 'km'
      ? 'មិនអាចបើកបង្អួចព្រីនបានទេ។ សូមអនុញ្ញាត popup។'
      : (err?.message === 'Popup blocked'
        ? 'Allow popups to print the QR card.'
        : friendlyTableError(err?.message))
  } finally {
    qrBusy.value = false
  }
}

const flashTableMessage = (message: string) => {
  tableMessage.value = message
  setTimeout(() => {
    if (tableMessage.value === message) tableMessage.value = ''
  }, 3500)
}

const friendlyTableError = (message?: string) => {
  switch (message) {
    case 'Table number already exists':
      return currentLang.value === 'km' ? 'លេខតុនេះមានរួចហើយ' : 'That table number already exists'
    case 'Cannot delete table that has orders':
      return currentLang.value === 'km'
        ? 'តុនេះមានប្រវត្តិបញ្ជាទិញ។ សូមបិទតុជំនួសការលុប។'
        : 'This table has order history. Deactivate it instead of deleting.'
    case 'Table cannot be deactivated from its current status':
      return currentLang.value === 'km'
        ? 'មិនអាចបិទតុដែលកំពុងមានភ្ញៀវបានទេ។ សូមទូទាត់វិក្កយបត្រជាមុនសិន។'
        : 'An occupied table cannot be deactivated. Settle the bill first.'
    case 'Table cannot be activated while it has an active order':
      return currentLang.value === 'km'
        ? 'មិនអាចបើកតុដែលនៅមានការបញ្ជាទិញសកម្មបានទេ។'
        : 'This table still has an active order.'
    case 'Too many requests, please try again later':
      return currentLang.value === 'km'
        ? 'សំណើច្រើនពេក។ សូមចុចព្យាយាមម្តងទៀត។'
        : 'The server was busy. Tap Retry to load tables.'
    default:
      return message || (currentLang.value === 'km' ? 'មិនអាចធ្វើបច្ចុប្បន្នភាពតុបានទេ' : 'Could not update the table')
  }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
let tableLoadRetry: ReturnType<typeof setTimeout> | null = null

const loadTables = async (isRetry = false) => {
  if (tableLoadRetry) {
    clearTimeout(tableLoadRetry)
    tableLoadRetry = null
  }
  tablesLoading.value = true
  if (!isRetry) tableError.value = ''
  try {
    const [listRes, summaryRes] = await Promise.all([
      tableService.getTables({
        search: tableSearch.value.trim() || undefined,
        status: statusFilter.value === 'ALL' ? undefined : statusFilter.value,
        page: 1,
        limit: 100,
      }),
      tableService.getSummary(),
    ])
    tables.value = Array.isArray(listRes.data) ? listRes.data : []
    if (summaryRes.data) tableSummary.value = summaryRes.data
    tableError.value = ''
    await Promise.all(tables.value.map((table) => ensureQrThumb(guestUrlOf(table))))
  } catch (err: any) {
    const message = friendlyTableError(err?.message)
    tableError.value = message
    if (!isRetry && /too many requests/i.test(String(err?.message || ''))) {
      tableLoadRetry = setTimeout(() => {
        void loadTables(true)
      }, 2500)
    }
  } finally {
    tablesLoading.value = false
  }
}
watch([tableSearch, statusFilter], () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(loadTables, 250)
})

const resetNewTableForm = () => {
  newTableNo.value = ''
  newTableName.value = ''
  newCapacity.value = 4
  newLocation.value = ''
}

const addTable = async () => {
  const tableNo = newTableNo.value.trim()
  const capacity = Number(newCapacity.value)
  if (!tableNo) {
    tableError.value = currentLang.value === 'km' ? 'សូមបញ្ចូលលេខតុ' : 'Enter a table number'
    return
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
    tableError.value = currentLang.value === 'km' ? 'ចំនួនកៅអីត្រូវពី ១ ដល់ ១០០' : 'Capacity must be between 1 and 100'
    return
  }
  isCreatingTable.value = true
  tableError.value = ''
  try {
    const created = await tableService.createTable({
      tableNo,
      name: newTableName.value.trim() || undefined,
      capacity,
      location: newLocation.value.trim() || undefined,
    })
    resetNewTableForm()
    const url = guestUrlOf(created.data as TableItem)
    lastCreated.value = { tableNo, url }
    flashTableMessage(currentLang.value === 'km' ? `បានបន្ថែមតុ #${tableNo}` : `Table #${tableNo} added`)
    await loadTables()
    await openQrModal(created.data as TableItem, true)
  } catch (err: any) {
    tableError.value = friendlyTableError(err?.message)
  } finally {
    isCreatingTable.value = false
  }
}

const addNumberedRange = async () => {
  const from = Number(rangeFrom.value)
  const to = Number(rangeTo.value)
  const capacity = Number(rangeCapacity.value)
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to - from >= 50) {
    tableError.value = currentLang.value === 'km'
      ? 'ចន្លោះលេខតុមិនត្រឹមត្រូវ (អតិបរមា ៥០ តុ)'
      : 'Enter a valid table range (50 tables max)'
    return
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
    tableError.value = currentLang.value === 'km' ? 'ចំនួនកៅអីត្រូវពី ១ ដល់ ១០០' : 'Capacity must be between 1 and 100'
    return
  }
  isCreatingRange.value = true
  tableError.value = ''
  let created = 0
  let skipped = 0
  try {
    for (let n = from; n <= to; n++) {
      const tableNo = String(n).padStart(2, '0')
      try {
        await tableService.createTable({
          tableNo,
          capacity,
          location: rangeLocation.value.trim() || undefined,
        })
        created += 1
      } catch (err: any) {
        if (err?.message === 'Table number already exists') skipped += 1
        else throw err
      }
    }
    flashTableMessage(
      currentLang.value === 'km'
        ? `បានបន្ថែម ${created} តុ` + (skipped ? ` (រំលង ${skipped} ដែលមានរួច)` : '')
        : `Added ${created} table${created === 1 ? '' : 's'}` + (skipped ? ` (${skipped} already existed)` : ''),
    )
    await loadTables()
  } catch (err: any) {
    tableError.value = friendlyTableError(err?.message)
  } finally {
    isCreatingRange.value = false
  }
}

const openEditModal = (table: TableItem) => {
  editingTable.value = table
  formError.value = ''
  editForm.value = {
    table_number: tableNoOf(table),
    name: table.name || '',
    capacity: Number(table.capacity || 4),
    location: table.location || '',
  }
  showEditModal.value = true
}

const saveEditedTable = async () => {
  if (!editingTable.value) return
  const tableNo = editForm.value.table_number.trim()
  const capacity = Number(editForm.value.capacity)
  if (!tableNo) {
    formError.value = currentLang.value === 'km' ? 'សូមបញ្ចូលលេខតុ' : 'Enter a table number'
    return
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
    formError.value = currentLang.value === 'km' ? 'ចំនួនកៅអីត្រូវពី ១ ដល់ ១០០' : 'Capacity must be between 1 and 100'
    return
  }
  tableBusyId.value = editingTable.value.id
  formError.value = ''
  try {
    await tableService.updateTable(editingTable.value.id, {
      tableNo,
      table_number: tableNo,
      name: editForm.value.name.trim() || tableNo,
      capacity,
      location: editForm.value.location.trim() || undefined,
    })
    showEditModal.value = false
    flashTableMessage(currentLang.value === 'km' ? `បានធ្វើបច្ចុប្បន្នភាពតុ #${tableNo}` : `Table #${tableNo} updated`)
    await loadTables()
  } catch (err: any) {
    formError.value = friendlyTableError(err?.message)
  } finally {
    tableBusyId.value = null
  }
}

const toggleTableActive = async (table: TableItem) => {
  tableBusyId.value = table.id
  tableError.value = ''
  try {
    if (isTableInactive(table)) {
      await tableService.activateTable(table.id)
      flashTableMessage(currentLang.value === 'km' ? `បានបើកតុ #${tableNoOf(table)}` : `Table #${tableNoOf(table)} is available again`)
    } else {
      await tableService.deactivateTable(table.id)
      flashTableMessage(currentLang.value === 'km' ? `បានបិទតុ #${tableNoOf(table)}` : `Table #${tableNoOf(table)} deactivated`)
    }
    await loadTables()
  } catch (err: any) {
    tableError.value = friendlyTableError(err?.message)
  } finally {
    tableBusyId.value = null
  }
}

const openDeleteModal = (table: TableItem) => {
  tableToDelete.value = table
  showDeleteModal.value = true
}

const confirmDeleteTable = async () => {
  if (!tableToDelete.value) return
  const table = tableToDelete.value
  tableBusyId.value = table.id
  tableError.value = ''
  try {
    await tableService.deleteTable(table.id)
    showDeleteModal.value = false
    tableToDelete.value = null
    flashTableMessage(currentLang.value === 'km' ? `បានលុបតុ #${tableNoOf(table)}` : `Table #${tableNoOf(table)} deleted`)
    await loadTables()
  } catch (err: any) {
    tableError.value = friendlyTableError(err?.message)
    showDeleteModal.value = false
  } finally {
    tableBusyId.value = null
  }
}

const copyMenuLink = async (table: TableItem) => {
  const url = guestUrlOf(table)
  try {
    await navigator.clipboard.writeText(url)
    flashTableMessage(currentLang.value === 'km' ? `បានចម្លងតំណម៉ឺនុយតុ #${tableNoOf(table)}` : `Copied menu link for table #${tableNoOf(table)}`)
  } catch {
    tableError.value = currentLang.value === 'km' ? 'មិនអាចចម្លងតំណបានទេ' : 'Could not copy the menu link'
  }
}

const copyText = async (url: string, label: string) => {
  try {
    await navigator.clipboard.writeText(url)
    flashTableMessage(currentLang.value === 'km' ? `បានចម្លងតំណ ${label}` : `Copied ${label}`)
  } catch {
    tableError.value = currentLang.value === 'km' ? 'មិនអាចចម្លងតំណបានទេ' : 'Could not copy the menu link'
  }
}

onMounted(async () => {
  await Promise.all([loadSettings(), loadTables()])
})

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
  if (tableLoadRetry) clearTimeout(tableLoadRetry)
})
</script>

<template>
  <div class="p-6 md:p-8 max-w-5xl space-y-8">
    <header>
      <p class="text-[10px] font-black uppercase tracking-widest text-primary mb-1">{{ t('settings') }}</p>
      <h1 class="text-3xl font-black text-on-surface">
        {{ currentLang === 'km' ? 'ការកំណត់ភោជនីយដ្ឋាន' : 'Restaurant settings' }}
      </h1>
      <p class="text-sm font-bold text-on-surface-variant mt-2 max-w-2xl">
        {{ currentLang === 'km'
          ? 'កំណត់ពន្ធ សេវាកម្ម និងលេខតុដែលភ្ញៀវស្កេនដើម្បីបញ្ជាទិញ។'
          : 'Set tax and service rates, and manage the table numbers guests scan to order.' }}
      </p>
    </header>

    <!-- Tax & service -->
    <section>
      <h2 class="text-lg font-black text-on-surface mb-4">
        {{ currentLang === 'km' ? 'ពន្ធ និងសេវាកម្ម' : 'Tax & Service Fee' }}
      </h2>

      <div v-if="isLoading" class="bg-white rounded-3xl border border-surface-variant p-10 text-center font-bold text-on-surface-variant">
        {{ currentLang === 'km' ? 'កំពុងផ្ទុក...' : 'Loading...' }}
      </div>

      <form v-else class="bg-white rounded-3xl border border-surface-variant shadow-xs p-6 md:p-8 space-y-6" @submit.prevent="saveSettings">
        <div class="grid sm:grid-cols-2 gap-5">
          <label class="block space-y-2">
            <span class="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">
              {{ currentLang === 'km' ? 'ពន្ធ និងអាករ (VAT) %' : 'Tax & VAT %' }}
            </span>
            <div class="relative">
              <input
                v-model.number="taxPercent"
                type="number"
                min="0"
                max="100"
                step="0.01"
                class="w-full pl-4 pr-10 py-3 rounded-2xl border border-outline-variant bg-surface-container-low font-black text-lg outline-none focus:ring-2 focus:ring-primary"
              />
              <span class="absolute right-4 top-1/2 -translate-y-1/2 font-black text-outline">%</span>
            </div>
          </label>

          <label class="block space-y-2">
            <span class="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">
              {{ currentLang === 'km' ? 'សេវាកម្ម %' : 'Service Fee %' }}
            </span>
            <div class="relative">
              <input
                v-model.number="serviceFeePercent"
                type="number"
                min="0"
                max="100"
                step="0.01"
                class="w-full pl-4 pr-10 py-3 rounded-2xl border border-outline-variant bg-surface-container-low font-black text-lg outline-none focus:ring-2 focus:ring-primary"
              />
              <span class="absolute right-4 top-1/2 -translate-y-1/2 font-black text-outline">%</span>
            </div>
          </label>
        </div>

        <div class="rounded-2xl bg-surface-container-low border border-dashed border-outline-variant p-4 space-y-2">
          <p class="text-[10px] font-black uppercase tracking-wider text-outline">
            {{ currentLang === 'km' ? 'ឧទាហរណ៍លើវិក្កយបត្រ $100' : 'Preview on a $100 subtotal' }}
          </p>
          <div class="flex justify-between text-xs font-bold text-on-surface-variant">
            <span>{{ currentLang === 'km' ? 'តម្លៃដើម' : 'Subtotal' }}</span>
            <span class="text-on-surface">${{ previewSubtotal.toFixed(2) }}</span>
          </div>
          <div class="flex justify-between text-xs font-bold text-on-surface-variant">
            <span>{{ t('taxAndFees') }} ({{ taxPercent }}%)</span>
            <span class="text-on-surface">${{ previewTax.toFixed(2) }}</span>
          </div>
          <div class="flex justify-between text-xs font-bold text-on-surface-variant">
            <span>{{ t('serviceCharge') }} ({{ serviceFeePercent }}%)</span>
            <span class="text-on-surface">${{ previewService.toFixed(2) }}</span>
          </div>
          <div class="flex justify-between text-sm font-black pt-2 border-t border-outline-variant/40">
            <span>{{ t('grandTotal') }}</span>
            <span class="text-primary">${{ previewTotal.toFixed(2) }}</span>
          </div>
        </div>

        <p v-if="saveError" class="text-xs font-bold text-rose-600">{{ saveError }}</p>
        <p v-if="saveMessage" class="text-xs font-bold text-emerald-700">{{ saveMessage }}</p>

        <button
          type="submit"
          :disabled="isSaving"
          class="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-primary text-white font-black text-sm shadow-lg shadow-primary/20 hover:opacity-95 disabled:opacity-60 cursor-pointer"
        >
          {{ isSaving
            ? (currentLang === 'km' ? 'កំពុងរក្សាទុក...' : 'Saving...')
            : (currentLang === 'km' ? 'រក្សាទុកការកំណត់' : 'Save rates') }}
        </button>
      </form>
    </section>

    <!-- Restaurant pin — dine-in GPS check -->
    <section>
      <h2 class="text-lg font-black text-on-surface mb-2">
        {{ currentLang === 'km' ? 'ទីតាំងភោជនីយដ្ឋាន' : 'Restaurant location' }}
      </h2>
      <p class="text-sm font-bold text-on-surface-variant mb-4">
        {{ currentLang === 'km'
          ? 'កំណត់ទីតាំងហាង ដើម្បីបញ្ឈប់ភ្ញៀវកុម្ម៉ង់ពីផ្ទះ។ ពេលភ្ញៀវកុម្ម៉ង់ ប្រព័ន្ធរក្សាទុក GPS ហើយចុងភៅ និងអ្នកគ្រប់គ្រងអាចមើលឃើញថាការកុម្ម៉ង់មកពីណា។'
          : 'Set the restaurant pin so guests cannot order from home. Each customer order stores GPS once, and chefs and managers can see where it came from.' }}
      </p>

      <div class="bg-white rounded-3xl border border-surface-variant shadow-xs p-6 md:p-8 space-y-5">
        <div
          class="rounded-2xl px-4 py-3 text-sm font-bold"
          :class="restaurantLat != null && restaurantLng != null
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-100'
            : 'bg-amber-50 text-amber-900 border border-amber-100'"
        >
          <template v-if="restaurantLat != null && restaurantLng != null">
            {{ currentLang === 'km' ? 'បានកំណត់ទីតាំងហាង។' : 'Restaurant pin is set.' }}
            {{ restaurantLat.toFixed(5) }}, {{ restaurantLng.toFixed(5) }}
          </template>
          <template v-else>
            {{ currentLang === 'km'
              ? 'មិនទាន់កំណត់ទីតាំង។ ភ្ញៀវនៅតែត្រូវផ្ញើ GPS ប៉ុន្តែមិនត្រូវបានបដិសេធពីចម្ងាយទេ។'
              : 'No pin yet. Customer GPS is still stored, but off-site orders are not blocked.' }}
          </template>
        </div>

        <div class="flex flex-wrap gap-3">
          <button
            type="button"
            :disabled="isPinningLocation"
            class="px-5 py-3 rounded-2xl bg-on-surface text-white font-black text-sm disabled:opacity-60 cursor-pointer"
            @click="useMyLocationForRestaurant"
          >
            {{ isPinningLocation
              ? (currentLang === 'km' ? 'កំពុងអាន GPS...' : 'Reading GPS...')
              : (currentLang === 'km' ? 'ប្រើទីតាំងរបស់ខ្ញុំ' : 'Use my location') }}
          </button>
          <a
            v-if="restaurantLat != null && restaurantLng != null"
            :href="`https://maps.google.com/?q=${restaurantLat},${restaurantLng}`"
            target="_blank"
            rel="noopener noreferrer"
            class="px-5 py-3 rounded-2xl border border-outline-variant font-black text-sm text-on-surface"
          >
            {{ currentLang === 'km' ? 'មើលលើផែនទី' : 'Open in Maps' }}
          </a>
        </div>

        <label class="block space-y-2 max-w-xs">
          <span class="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">
            {{ currentLang === 'km' ? 'កាំកុម្ម៉ង់ (ម៉ែត្រ)' : 'Order radius (meters)' }}
          </span>
          <input
            v-model.number="orderRadiusM"
            type="number"
            min="20"
            max="5000"
            step="10"
            class="w-full px-4 py-3 rounded-2xl border border-outline-variant bg-surface-container-low font-black text-lg outline-none focus:ring-2 focus:ring-primary"
          />
          <span class="text-[11px] font-bold text-outline">
            {{ currentLang === 'km'
              ? 'ភ្ញៀវត្រូវនៅក្នុងកាំនេះ (លំនាំដើម ២០០ ម៉ែត្រ)។'
              : 'Guests must be within this distance (default 200 m).' }}
          </span>
        </label>

        <p v-if="locationError" class="text-xs font-bold text-rose-600">{{ locationError }}</p>
        <p v-if="locationMessage" class="text-xs font-bold text-emerald-700">{{ locationMessage }}</p>

        <button
          type="button"
          :disabled="isSavingLocation"
          class="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-primary text-white font-black text-sm shadow-lg shadow-primary/20 hover:opacity-95 disabled:opacity-60 cursor-pointer"
          @click="saveLocationSettings"
        >
          {{ isSavingLocation
            ? (currentLang === 'km' ? 'កំពុងរក្សាទុក...' : 'Saving...')
            : (currentLang === 'km' ? 'រក្សាទុកទីតាំង' : 'Save location') }}
        </button>
      </div>
    </section>

    <!-- Floor tables -->
    <section>
      <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <h2 class="text-lg font-black text-on-surface">
            {{ currentLang === 'km' ? 'គ្រប់គ្រងតុ' : 'Floor tables' }}
          </h2>
          <p class="text-sm font-bold text-on-surface-variant mt-1">
            {{ currentLang === 'km'
              ? 'បន្ថែមលេខតុ ឬកែតុដែលភ្ញៀវស្កេននៅម៉ឺនុយ។'
              : 'Add table numbers or edit the tables guests open from the menu QR.' }}
          </p>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        <div class="rounded-2xl bg-white border border-surface-variant px-3 py-3">
          <p class="text-[10px] font-black uppercase tracking-wider text-outline">{{ currentLang === 'km' ? 'សរុប' : 'Total' }}</p>
          <p class="text-xl font-black text-on-surface mt-1">{{ tableSummary.total }}</p>
        </div>
        <div class="rounded-2xl bg-white border border-surface-variant px-3 py-3">
          <p class="text-[10px] font-black uppercase tracking-wider text-emerald-700">{{ currentLang === 'km' ? 'ទំនេរ' : 'Available' }}</p>
          <p class="text-xl font-black text-emerald-700 mt-1">{{ tableSummary.available }}</p>
        </div>
        <div class="rounded-2xl bg-white border border-surface-variant px-3 py-3">
          <p class="text-[10px] font-black uppercase tracking-wider text-amber-700">{{ currentLang === 'km' ? 'មានភ្ញៀវ' : 'Occupied' }}</p>
          <p class="text-xl font-black text-amber-700 mt-1">{{ tableSummary.occupied }}</p>
        </div>
        <div class="rounded-2xl bg-white border border-surface-variant px-3 py-3">
          <p class="text-[10px] font-black uppercase tracking-wider text-sky-700">{{ currentLang === 'km' ? 'កក់ទុក' : 'Reserved' }}</p>
          <p class="text-xl font-black text-sky-700 mt-1">{{ tableSummary.reserved }}</p>
        </div>
        <div class="rounded-2xl bg-white border border-surface-variant px-3 py-3">
          <p class="text-[10px] font-black uppercase tracking-wider text-slate-500">{{ currentLang === 'km' ? 'បិទ' : 'Inactive' }}</p>
          <p class="text-xl font-black text-slate-600 mt-1">{{ tableSummary.inactive }}</p>
        </div>
      </div>

      <div class="bg-white rounded-3xl border border-surface-variant shadow-xs p-6 md:p-8 space-y-6">
        <form class="grid sm:grid-cols-12 gap-3 items-end" @submit.prevent="addTable">
          <label class="sm:col-span-3 block space-y-1.5">
            <span class="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">
              {{ currentLang === 'km' ? 'លេខតុ' : 'Table number' }}
            </span>
            <input
              v-model="newTableNo"
              type="text"
              maxlength="50"
              placeholder="12B"
              class="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-container-low font-bold outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <label class="sm:col-span-3 block space-y-1.5">
            <span class="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">
              {{ currentLang === 'km' ? 'ឈ្មោះ (ស្រេចចិត្ត)' : 'Name (optional)' }}
            </span>
            <input
              v-model="newTableName"
              type="text"
              maxlength="100"
              :placeholder="currentLang === 'km' ? 'តុមុខ' : 'Window table'"
              class="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-container-low font-bold outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <label class="sm:col-span-2 block space-y-1.5">
            <span class="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">
              {{ currentLang === 'km' ? 'កៅអី' : 'Seats' }}
            </span>
            <input
              v-model.number="newCapacity"
              type="number"
              min="1"
              max="100"
              class="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-container-low font-bold outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <label class="sm:col-span-2 block space-y-1.5">
            <span class="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">
              {{ currentLang === 'km' ? 'ទីតាំង' : 'Location' }}
            </span>
            <input
              v-model="newLocation"
              type="text"
              maxlength="100"
              :placeholder="currentLang === 'km' ? 'សាលធំ' : 'Main hall'"
              class="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-container-low font-bold outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <button
            type="submit"
            :disabled="isCreatingTable"
            class="sm:col-span-2 py-2.5 rounded-xl bg-primary text-white font-black text-sm shadow-md shadow-primary/20 hover:opacity-95 disabled:opacity-60 cursor-pointer"
          >
            {{ isCreatingTable
              ? (currentLang === 'km' ? 'កំពុងបន្ថែម...' : 'Adding...')
              : (currentLang === 'km' ? 'បន្ថែមតុ' : 'Add table') }}
          </button>
        </form>

        <div
          v-if="lastCreated"
          class="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-4 flex flex-col sm:flex-row gap-4 items-start"
        >
          <img
            v-if="qrThumbs[lastCreated.url]"
            :src="qrThumbs[lastCreated.url]"
            alt="Table QR"
            class="w-28 h-28 rounded-2xl bg-white p-2 border border-emerald-100 shrink-0"
          />
          <div class="min-w-0 flex-1 space-y-2">
            <p class="text-[11px] font-black uppercase tracking-wider text-emerald-800">
              {{ currentLang === 'km' ? 'URL និង QR តុ #' : 'URL & QR for table #' }}{{ lastCreated.tableNo }}
            </p>
            <p class="text-xs font-mono font-bold text-slate-800 break-all">{{ lastCreated.url }}</p>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-black text-[11px] cursor-pointer"
                @click="copyText(lastCreated.url, lastCreated.tableNo)"
              >
                {{ currentLang === 'km' ? 'ចម្លង URL' : 'Copy URL' }}
              </button>
              <a
                :href="lastCreated.url"
                target="_blank"
                rel="noopener"
                class="px-3 py-1.5 rounded-lg bg-white border border-emerald-200 text-emerald-800 font-black text-[11px] no-underline"
              >
                {{ currentLang === 'km' ? 'បើកម៉ឺនុយ' : 'Open menu' }}
              </a>
            </div>
          </div>
        </div>

        <form class="rounded-2xl bg-surface-container-low border border-dashed border-outline-variant p-4 grid sm:grid-cols-12 gap-3 items-end" @submit.prevent="addNumberedRange">
          <p class="sm:col-span-12 text-[10px] font-black uppercase tracking-wider text-outline">
            {{ currentLang === 'km' ? 'បន្ថែមតុលេខតាមចន្លោះ (ឧ. ០១–០៨)' : 'Add numbered tables in a range (e.g. 01–08)' }}
          </p>
          <label class="sm:col-span-2 block space-y-1.5">
            <span class="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">{{ currentLang === 'km' ? 'ពី' : 'From' }}</span>
            <input v-model.number="rangeFrom" type="number" min="1" class="w-full px-3 py-2 rounded-xl border border-outline-variant bg-white font-bold outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <label class="sm:col-span-2 block space-y-1.5">
            <span class="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">{{ currentLang === 'km' ? 'ដល់' : 'To' }}</span>
            <input v-model.number="rangeTo" type="number" min="1" class="w-full px-3 py-2 rounded-xl border border-outline-variant bg-white font-bold outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <label class="sm:col-span-2 block space-y-1.5">
            <span class="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">{{ currentLang === 'km' ? 'កៅអី' : 'Seats' }}</span>
            <input v-model.number="rangeCapacity" type="number" min="1" max="100" class="w-full px-3 py-2 rounded-xl border border-outline-variant bg-white font-bold outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <label class="sm:col-span-3 block space-y-1.5">
            <span class="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">{{ currentLang === 'km' ? 'ទីតាំង' : 'Location' }}</span>
            <input v-model="rangeLocation" type="text" maxlength="100" class="w-full px-3 py-2 rounded-xl border border-outline-variant bg-white font-bold outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <button
            type="submit"
            :disabled="isCreatingRange"
            class="sm:col-span-3 py-2.5 rounded-xl bg-white border border-outline hover:bg-surface-container text-on-surface font-black text-sm cursor-pointer disabled:opacity-60"
          >
            {{ isCreatingRange
              ? (currentLang === 'km' ? 'កំពុងបន្ថែម...' : 'Adding...')
              : (currentLang === 'km' ? 'បន្ថែមចន្លោះ' : 'Add range') }}
          </button>
        </form>

        <div class="flex flex-col sm:flex-row gap-3">
          <div class="relative flex-1">
            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">search</span>
            <input
              v-model="tableSearch"
              type="search"
              :placeholder="currentLang === 'km' ? 'ស្វែងរកលេខតុ ឬឈ្មោះ...' : 'Search table number or name...'"
              class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-outline-variant bg-surface-container-low font-bold outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <select
            v-model="statusFilter"
            class="sm:w-48 px-3 py-2.5 rounded-xl border border-outline-variant bg-surface-container-low font-bold outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="ALL">{{ currentLang === 'km' ? 'គ្រប់ស្ថានភាព' : 'All statuses' }}</option>
            <option value="AVAILABLE">{{ currentLang === 'km' ? 'ទំនេរ' : 'Available' }}</option>
            <option value="OCCUPIED">{{ currentLang === 'km' ? 'មានភ្ញៀវ' : 'Occupied' }}</option>
            <option value="RESERVED">{{ currentLang === 'km' ? 'កក់ទុក' : 'Reserved' }}</option>
            <option value="INACTIVE">{{ currentLang === 'km' ? 'បិទ' : 'Inactive' }}</option>
          </select>
        </div>

        <div v-if="tableError" class="flex flex-wrap items-center gap-3">
          <p class="text-xs font-bold text-rose-600">{{ tableError }}</p>
          <button
            type="button"
            class="text-xs font-black uppercase tracking-wider text-primary cursor-pointer"
            @click="loadTables(true)"
          >
            {{ currentLang === 'km' ? 'ព្យាយាមម្តងទៀត' : 'Retry' }}
          </button>
        </div>
        <p v-if="tableMessage" class="text-xs font-bold text-emerald-700">{{ tableMessage }}</p>

        <div v-if="tablesLoading" class="py-8 text-center font-bold text-on-surface-variant">
          {{ currentLang === 'km' ? 'កំពុងផ្ទុកតុ...' : 'Loading tables...' }}
        </div>

        <div v-else-if="!tables.length" class="py-8 text-center font-bold text-on-surface-variant">
          {{ tableError
            ? (currentLang === 'km' ? 'មិនអាចផ្ទុកបញ្ជីតុបានទេ។' : 'Could not load the table list.')
            : (currentLang === 'km' ? 'មិនទាន់មានតុ។ បន្ថែមលេខតុខាងលើ។' : 'No tables yet. Add a table number above.') }}
        </div>

        <div v-else class="overflow-x-auto -mx-2">
          <table class="w-full min-w-[640px] text-left">
            <thead>
              <tr class="text-[10px] font-black uppercase tracking-wider text-outline border-b border-surface-variant">
                <th class="py-3 px-2">{{ currentLang === 'km' ? 'លេខតុ' : 'Number' }}</th>
                <th class="py-3 px-2">{{ currentLang === 'km' ? 'ឈ្មោះ' : 'Name' }}</th>
                <th class="py-3 px-2">{{ currentLang === 'km' ? 'កៅអី' : 'Seats' }}</th>
                <th class="py-3 px-2">{{ currentLang === 'km' ? 'ទីតាំង' : 'Location' }}</th>
                <th class="py-3 px-2">{{ currentLang === 'km' ? 'ស្ថានភាព' : 'Status' }}</th>
                <th class="py-3 px-2">QR</th>
                <th class="py-3 px-2">URL</th>
                <th class="py-3 px-2 text-right">{{ currentLang === 'km' ? 'សកម្មភាព' : 'Actions' }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="table in tables" :key="table.id" class="border-b border-surface-variant/50 last:border-0">
                <td class="py-3 px-2 font-black text-on-surface">#{{ tableNoOf(table) }}</td>
                <td class="py-3 px-2 font-bold text-on-surface-variant">{{ table.name || '—' }}</td>
                <td class="py-3 px-2 font-bold">{{ table.capacity }}</td>
                <td class="py-3 px-2 font-bold text-on-surface-variant">{{ table.location || '—' }}</td>
                <td class="py-3 px-2">
                  <span class="inline-flex text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full" :class="statusClass(table.status)">
                    {{ statusLabel(table.status) }}
                  </span>
                </td>
                <td class="py-3 px-2">
                  <button
                    type="button"
                    class="block bg-white rounded-xl border border-outline-variant p-1 cursor-pointer hover:border-primary"
                    :title="currentLang === 'km' ? 'មើល QR' : 'View QR'"
                    @click="openQrModal(table)"
                  >
                    <img
                      v-if="qrThumbs[guestUrlOf(table)]"
                      :src="qrThumbs[guestUrlOf(table)]"
                      :alt="'QR table ' + tableNoOf(table)"
                      class="w-12 h-12"
                    />
                    <span v-else class="material-symbols-outlined text-outline w-12 h-12 flex items-center justify-center">qr_code_2</span>
                  </button>
                </td>
                <td class="py-3 px-2 max-w-[220px]">
                  <button
                    type="button"
                    class="text-left text-[10px] font-mono font-bold text-primary hover:underline break-all cursor-pointer bg-transparent border-none p-0"
                    :title="guestUrlOf(table)"
                    @click="copyMenuLink(table)"
                  >
                    {{ guestUrlOf(table) }}
                  </button>
                </td>
                <td class="py-3 px-2">
                  <div class="flex justify-end gap-1">
                    <button
                      type="button"
                      class="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-lg cursor-pointer"
                      :title="currentLang === 'km' ? 'QR និងព្រីន' : 'QR, download & print'"
                      @click="openQrModal(table)"
                    >
                      <span class="material-symbols-outlined text-lg">qr_code_2</span>
                    </button>
                    <button
                      type="button"
                      class="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-lg cursor-pointer"
                      :title="currentLang === 'km' ? 'កែតុ' : 'Edit table'"
                      @click="openEditModal(table)"
                    >
                      <span class="material-symbols-outlined text-lg">edit</span>
                    </button>
                    <button
                      type="button"
                      :disabled="tableBusyId === table.id || table.status === 'OCCUPIED'"
                      class="p-1.5 text-on-surface-variant hover:text-amber-700 hover:bg-amber-50 rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      :title="isTableInactive(table)
                        ? (currentLang === 'km' ? 'បើកតុ' : 'Activate')
                        : (currentLang === 'km' ? 'បិទតុ' : 'Deactivate')"
                      @click="toggleTableActive(table)"
                    >
                      <span class="material-symbols-outlined text-lg">{{ isTableInactive(table) ? 'toggle_off' : 'toggle_on' }}</span>
                    </button>
                    <button
                      type="button"
                      :disabled="tableBusyId === table.id || table.status === 'OCCUPIED'"
                      class="p-1.5 text-on-surface-variant hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      :title="currentLang === 'km' ? 'លុបតុ' : 'Delete table'"
                      @click="openDeleteModal(table)"
                    >
                      <span class="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Table QR card: preview, download, print -->
    <div
      v-if="showQrModal && qrTable"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <div class="bg-white rounded-[28px] max-w-md w-full overflow-hidden shadow-2xl border border-outline-variant max-h-[92vh] flex flex-col">
        <div class="bg-slate-900 text-white px-6 py-5 text-center relative">
          <button
            type="button"
            class="absolute top-3 right-3 p-1.5 rounded-full bg-white/10 hover:bg-white/20 cursor-pointer border-none text-white"
            @click="showQrModal = false"
          >
            <span class="material-symbols-outlined text-lg">close</span>
          </button>
          <p class="text-[10px] font-black uppercase tracking-[0.3em] text-amber-400">TosEat</p>
          <h3 class="text-2xl font-black mt-1">
            {{ currentLang === 'km' ? 'តុលេខ' : 'Table' }} #{{ tableNoOf(qrTable) }}
          </h3>
          <p class="text-xs font-bold text-slate-300 mt-1">
            {{ currentLang === 'km' ? 'ស្កេនដើម្បីបញ្ជាទិញ' : 'Scan to open the menu' }}
          </p>
        </div>

        <div class="p-6 overflow-y-auto space-y-4">
          <div class="mx-auto bg-white rounded-3xl border-4 border-amber-400 p-3 w-64 h-64 flex items-center justify-center shadow-lg">
            <span v-if="qrBusy && !qrPreview" class="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
            <img v-else-if="qrPreview" :src="qrPreview" :alt="'QR table ' + tableNoOf(qrTable)" class="w-full h-full" />
          </div>
          <p class="text-[11px] font-mono font-bold text-center text-on-surface-variant break-all px-1">
            {{ guestUrlOf(qrTable) }}
          </p>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="py-2.5 rounded-xl bg-slate-900 text-white font-black text-xs cursor-pointer disabled:opacity-60"
              :disabled="qrBusy"
              @click="downloadTableQr()"
            >
              <span class="material-symbols-outlined text-sm align-middle mr-1">download</span>
              {{ currentLang === 'km' ? 'ទាញយក QR' : 'Download QR' }}
            </button>
            <button
              type="button"
              class="py-2.5 rounded-xl bg-amber-500 text-slate-900 font-black text-xs cursor-pointer disabled:opacity-60"
              :disabled="qrBusy"
              @click="printTableQr()"
            >
              <span class="material-symbols-outlined text-sm align-middle mr-1">print</span>
              {{ currentLang === 'km' ? 'ព្រីន' : 'Print' }}
            </button>
            <button
              type="button"
              class="py-2.5 rounded-xl border border-outline font-black text-xs cursor-pointer"
              @click="copyMenuLink(qrTable)"
            >
              {{ currentLang === 'km' ? 'ចម្លង URL' : 'Copy URL' }}
            </button>
            <a
              :href="guestUrlOf(qrTable)"
              target="_blank"
              rel="noopener"
              class="py-2.5 rounded-xl border border-outline font-black text-xs text-center no-underline text-on-surface"
            >
              {{ currentLang === 'km' ? 'បើកម៉ឺនុយ' : 'Open menu' }}
            </a>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit table modal -->
    <div
      v-if="showEditModal && editingTable"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
    >
      <div class="bg-white rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl border border-outline-variant">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-xl font-black text-on-surface">
            {{ currentLang === 'km' ? 'កែតុ' : 'Edit table' }} #{{ tableNoOf(editingTable) }}
          </h3>
          <button type="button" class="p-1.5 rounded-lg hover:bg-surface-container cursor-pointer" @click="showEditModal = false">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <p v-if="formError" class="mb-4 text-xs font-bold text-rose-600">{{ formError }}</p>
        <form class="space-y-4" @submit.prevent="saveEditedTable">
          <label class="block space-y-1.5">
            <span class="text-xs font-bold">{{ currentLang === 'km' ? 'លេខតុ' : 'Table number' }}</span>
            <input v-model="editForm.table_number" type="text" maxlength="50" required class="w-full px-4 py-2.5 rounded-xl bg-surface-container ring-1 ring-outline-variant font-bold outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <label class="block space-y-1.5">
            <span class="text-xs font-bold">{{ currentLang === 'km' ? 'ឈ្មោះ' : 'Name' }}</span>
            <input v-model="editForm.name" type="text" maxlength="100" class="w-full px-4 py-2.5 rounded-xl bg-surface-container ring-1 ring-outline-variant font-bold outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <div class="grid grid-cols-2 gap-3">
            <label class="block space-y-1.5">
              <span class="text-xs font-bold">{{ currentLang === 'km' ? 'កៅអី' : 'Seats' }}</span>
              <input v-model.number="editForm.capacity" type="number" min="1" max="100" required class="w-full px-4 py-2.5 rounded-xl bg-surface-container ring-1 ring-outline-variant font-bold outline-none focus:ring-2 focus:ring-primary" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs font-bold">{{ currentLang === 'km' ? 'ទីតាំង' : 'Location' }}</span>
              <input v-model="editForm.location" type="text" maxlength="100" class="w-full px-4 py-2.5 rounded-xl bg-surface-container ring-1 ring-outline-variant font-bold outline-none focus:ring-2 focus:ring-primary" />
            </label>
          </div>
          <div class="flex gap-2 pt-2">
            <button type="button" class="flex-1 py-3 rounded-xl border border-outline font-black text-sm cursor-pointer" @click="showEditModal = false">
              {{ currentLang === 'km' ? 'បោះបង់' : 'Cancel' }}
            </button>
            <button type="submit" :disabled="tableBusyId === editingTable.id" class="flex-1 py-3 rounded-xl bg-primary text-white font-black text-sm cursor-pointer disabled:opacity-60">
              {{ currentLang === 'km' ? 'រក្សាទុក' : 'Save' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete confirm -->
    <div
      v-if="showDeleteModal && tableToDelete"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
    >
      <div class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-outline-variant">
        <h3 class="text-lg font-black text-on-surface mb-2">
          {{ currentLang === 'km' ? 'លុបតុ #' : 'Delete table #' }}{{ tableNoOf(tableToDelete) }}?
        </h3>
        <p class="text-sm font-bold text-on-surface-variant mb-6">
          {{ currentLang === 'km'
            ? 'តុដែលមានប្រវត្តិបញ្ជាទិញមិនអាចលុបបានទេ — សូមបិទតុជំនួស។'
            : 'Tables with order history cannot be deleted. Deactivate them instead.' }}
        </p>
        <div class="flex gap-2">
          <button type="button" class="flex-1 py-3 rounded-xl border border-outline font-black text-sm cursor-pointer" @click="showDeleteModal = false">
            {{ currentLang === 'km' ? 'បោះបង់' : 'Cancel' }}
          </button>
          <button type="button" class="flex-1 py-3 rounded-xl bg-red-600 text-white font-black text-sm cursor-pointer" @click="confirmDeleteTable">
            {{ currentLang === 'km' ? 'លុប' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
