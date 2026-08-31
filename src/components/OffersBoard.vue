<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { currentLang, translateDishName } from '../i18n'
import { resolveMediaUrl } from '../services/config.js'
import {
  pairingService,
  promotionService,
  type Pairing,
  type Promotion,
} from '../services/offers.js'

type MenuOption = { id: number; name: string; price: number; image?: string }

const props = withDefaults(defineProps<{
  manage?: boolean
  menuItems?: MenuOption[]
}>(), {
  manage: false,
  menuItems: () => [],
})

const emit = defineEmits<{
  toast: [message: string, type: 'success' | 'error']
  'add-pair': [pairing: Pairing]
  'order-promo': [promo: Promotion]
}>()

const promotions = ref<Promotion[]>([])
const pairings = ref<Pairing[]>([])
const showAllPromos = ref(false)
const showAllPairings = ref(false)
const loading = ref(false)

const visiblePromos = computed(() =>
  showAllPromos.value ? promotions.value : promotions.value.slice(0, 4),
)
const visiblePairings = computed(() =>
  showAllPairings.value ? pairings.value : pairings.value.slice(0, 3),
)

const availableItems = computed(() =>
  (props.menuItems || []).filter((i) => Number(i.id) > 0 && Number(i.price) >= 0),
)

const loadOffers = async () => {
  loading.value = true
  try {
    const status = props.manage ? undefined : 'ACTIVE'
    const [promoRes, pairRes] = await Promise.all([
      promotionService.list(status),
      pairingService.list(status),
    ])
    promotions.value = Array.isArray(promoRes.data) ? promoRes.data : []
    pairings.value = Array.isArray(pairRes.data) ? pairRes.data : []
  } catch (err: any) {
    promotions.value = []
    pairings.value = []
    if (props.manage) {
      emit('toast', err?.message || (km.value ? 'មិនអាចផ្ទុកប្រម៉ូសិនបានទេ' : 'Could not load offers'), 'error')
    }
  } finally {
    loading.value = false
  }
}

onMounted(loadOffers)

const km = computed(() => currentLang.value === 'km')

const isPromoModalOpen = ref(false)
const isPairingModalOpen = ref(false)
const saving = ref(false)
const editingPromoId = ref<number | null>(null)
const editingPairingId = ref<number | null>(null)

const promoForm = ref({
  menuItemId: 0,
  discountPercent: 15,
  promoPrice: 0,
  rating: 5,
  reviewCount: '1k+ Reviews',
  status: 'ACTIVE',
})

const pairingForm = ref({
  name: '',
  description: 'The ultimate hunger-crusher combo for two.',
  leftMenuItemId: 0,
  rightMenuItemId: 0,
  comboPrice: 0,
  badge: '',
  status: 'ACTIVE',
})

const selectedPromoItem = computed(() =>
  availableItems.value.find((i) => i.id === Number(promoForm.value.menuItemId)),
)

const round2 = (n: number) => Math.round(n * 100) / 100
const syncPromoPrice = ref(true)

const applyPromoPrice = () => {
  const item = selectedPromoItem.value
  if (!item || !syncPromoPrice.value) return
  const discount = Number(promoForm.value.discountPercent) || 0
  promoForm.value.promoPrice = round2(Number(item.price) * (1 - discount / 100))
}

watch(
  () => [promoForm.value.menuItemId, promoForm.value.discountPercent],
  applyPromoPrice,
)

watch(
  () => [pairingForm.value.leftMenuItemId, pairingForm.value.rightMenuItemId],
  () => {
    const left = availableItems.value.find((i) => i.id === Number(pairingForm.value.leftMenuItemId))
    const right = availableItems.value.find((i) => i.id === Number(pairingForm.value.rightMenuItemId))
    if (left && right) {
      if (!pairingForm.value.name || pairingForm.value.name.includes('+')) {
        pairingForm.value.name = `${left.name} + ${right.name}`
      }
      if (!editingPairingId.value) {
        pairingForm.value.comboPrice = round2((Number(left.price) + Number(right.price)) * 0.8)
      }
    }
  },
)

const requireMenuItems = (needTwo = false) => {
  const min = needTwo ? 2 : 1
  if (availableItems.value.length < min) {
    emit(
      'toast',
      km.value
        ? 'សូមបន្ថែមមុខម្ហូបជាមុនសិន'
        : needTwo
          ? 'Add at least two menu items first'
          : 'Add a menu item first',
      'error',
    )
    return false
  }
  return true
}

const openAddPromo = () => {
  if (!requireMenuItems()) return
  editingPromoId.value = null
  syncPromoPrice.value = true
  promoForm.value = {
    menuItemId: availableItems.value[0]?.id || 0,
    discountPercent: 15,
    promoPrice: availableItems.value[0]
      ? round2(Number(availableItems.value[0].price) * 0.85)
      : 0,
    rating: 5,
    reviewCount: '1k+ Reviews',
    status: 'ACTIVE',
  }
  isPromoModalOpen.value = true
}

const openEditPromo = (promo: Promotion) => {
  editingPromoId.value = promo.id
  syncPromoPrice.value = false
  promoForm.value = {
    menuItemId: promo.menuItemId,
    discountPercent: promo.discountPercent,
    promoPrice: promo.promoPrice,
    rating: promo.rating,
    reviewCount: promo.reviewCount,
    status: promo.status,
  }
  isPromoModalOpen.value = true
  setTimeout(() => {
    syncPromoPrice.value = true
  }, 0)
}

const savePromo = async () => {
  if (!promoForm.value.menuItemId) {
    emit('toast', km.value ? 'សូមជ្រើសមុខម្ហូប' : 'Please choose a menu item', 'error')
    return
  }
  saving.value = true
  try {
    const payload = {
      menuItemId: Number(promoForm.value.menuItemId),
      discountPercent: Number(promoForm.value.discountPercent),
      promoPrice: Number(promoForm.value.promoPrice),
      rating: Number(promoForm.value.rating),
      reviewCount: promoForm.value.reviewCount,
      status: promoForm.value.status,
    }
    if (editingPromoId.value) {
      await promotionService.update(editingPromoId.value, payload)
      emit('toast', km.value ? 'បានកែប្រម៉ូសិន' : 'Promotion updated', 'success')
    } else {
      await promotionService.create(payload)
      emit('toast', km.value ? 'បានបន្ថែមប្រម៉ូសិន' : 'Promotion added', 'success')
    }
    isPromoModalOpen.value = false
    await loadOffers()
  } catch (err: any) {
    emit('toast', err?.message || (km.value ? 'មិនអាចរក្សាទុកបានទេ' : 'Could not save promotion'), 'error')
  } finally {
    saving.value = false
  }
}

const deletePromo = async (promo: Promotion) => {
  if (!confirm(km.value ? `លុបប្រម៉ូសិន ${promo.name}?` : `Delete promo for ${promo.name}?`)) return
  try {
    await promotionService.remove(promo.id)
    emit('toast', km.value ? 'បានលុបប្រម៉ូសិន' : 'Promotion deleted', 'success')
    await loadOffers()
  } catch (err: any) {
    emit('toast', err?.message || (km.value ? 'មិនអាចលុបបានទេ' : 'Could not delete promotion'), 'error')
  }
}

const pairingBadgeLabel = (badge?: string | null) => {
  if (!badge) return ''
  if (km.value && badge.toLowerCase() === 'most popular') return 'លក់ដាច់បំផុត'
  return badge
}

const openAddPairing = () => {
  if (!requireMenuItems(true)) return
  editingPairingId.value = null
  const a = availableItems.value[0]
  const b = availableItems.value[1] || availableItems.value[0]
  pairingForm.value = {
    name: a && b ? `${a.name} + ${b.name}` : '',
    description: 'The ultimate hunger-crusher combo for two.',
    leftMenuItemId: a?.id || 0,
    rightMenuItemId: b?.id || 0,
    comboPrice: a && b ? round2((Number(a.price) + Number(b.price)) * 0.8) : 0,
    badge: '',
    status: 'ACTIVE',
  }
  isPairingModalOpen.value = true
}

const openEditPairing = (pairing: Pairing) => {
  editingPairingId.value = pairing.id
  pairingForm.value = {
    name: pairing.name,
    description: pairing.description || '',
    leftMenuItemId: pairing.left.id,
    rightMenuItemId: pairing.right.id,
    comboPrice: pairing.comboPrice,
    badge: pairing.badge || '',
    status: pairing.status,
  }
  isPairingModalOpen.value = true
}

const savePairing = async () => {
  if (!pairingForm.value.leftMenuItemId || !pairingForm.value.rightMenuItemId) {
    emit('toast', km.value ? 'សូមជ្រើសមុខម្ហូបពីរ' : 'Please choose two menu items', 'error')
    return
  }
  if (Number(pairingForm.value.leftMenuItemId) === Number(pairingForm.value.rightMenuItemId)) {
    emit('toast', km.value ? 'សូមជ្រើសមុខម្ហូបពីរផ្សេងគ្នា' : 'Pick two different dishes', 'error')
    return
  }
  saving.value = true
  try {
    const payload = {
      name: pairingForm.value.name,
      description: pairingForm.value.description,
      leftMenuItemId: Number(pairingForm.value.leftMenuItemId),
      rightMenuItemId: Number(pairingForm.value.rightMenuItemId),
      comboPrice: Number(pairingForm.value.comboPrice),
      badge: pairingForm.value.badge || null,
      status: pairingForm.value.status,
    }
    if (editingPairingId.value) {
      await pairingService.update(editingPairingId.value, payload)
      emit('toast', km.value ? 'បានកែឈុតចាប់គូ' : 'Pairing updated', 'success')
    } else {
      await pairingService.create(payload)
      emit('toast', km.value ? 'បានបន្ថែមឈុតចាប់គូ' : 'Pairing added', 'success')
    }
    isPairingModalOpen.value = false
    await loadOffers()
  } catch (err: any) {
    emit('toast', err?.message || (km.value ? 'មិនអាចរក្សាទុកបានទេ' : 'Could not save pairing'), 'error')
  } finally {
    saving.value = false
  }
}

const deletePairing = async (pairing: Pairing) => {
  if (!confirm(km.value ? `លុបឈុត ${pairing.name}?` : `Delete pairing ${pairing.name}?`)) return
  try {
    await pairingService.remove(pairing.id)
    emit('toast', km.value ? 'បានលុបឈុតចាប់គូ' : 'Pairing deleted', 'success')
    await loadOffers()
  } catch (err: any) {
    emit('toast', err?.message || (km.value ? 'មិនអាចលុបបានទេ' : 'Could not delete pairing'), 'error')
  }
}

defineExpose({ loadOffers })
</script>

<template>
  <div class="space-y-10">
    <!-- Promo -->
    <section>
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-xl font-black text-on-surface">{{ km ? 'ប្រម៉ូសិនពិសេស' : 'Promo' }}</h3>
        <div class="flex items-center gap-3">
          <button
            v-if="manage"
            type="button"
            class="bg-primary text-white px-4 py-2 rounded-full font-black text-xs hover:opacity-90 flex items-center gap-1 shadow-md shadow-primary/10"
            @click="openAddPromo"
          >
            <span class="material-symbols-outlined text-sm">add</span>
            {{ km ? 'បន្ថែមប្រម៉ូសិន' : 'Add Promo' }}
          </button>
          <button
            type="button"
            class="text-primary text-xs font-bold flex items-center"
            @click="showAllPromos = !showAllPromos"
          >
            {{ km ? (showAllPromos ? 'បង្រួម' : 'មើលទាំងអស់') : (showAllPromos ? 'Show less' : 'View all') }}
            <span class="material-symbols-outlined text-[16px]">{{ showAllPromos ? 'expand_less' : 'chevron_right' }}</span>
          </button>
        </div>
      </div>

      <div v-if="loading" class="bg-white rounded-3xl border border-dashed border-outline-variant px-6 py-10 text-center">
        <p class="text-sm font-black text-on-surface-variant">{{ km ? 'កំពុងផ្ទុក...' : 'Loading promotions…' }}</p>
      </div>
      <div v-else-if="visiblePromos.length === 0" class="bg-white rounded-3xl border border-dashed border-outline-variant px-6 py-10 text-center">
        <p class="text-sm font-black text-on-surface-variant">{{ km ? 'មិនទាន់មានប្រម៉ូសិន' : 'No promotions yet' }}</p>
        <p v-if="manage" class="text-xs text-outline font-bold mt-1">{{ km ? 'ចុចបន្ថែមប្រម៉ូសិនដើម្បីបញ្ចុះតម្លៃមុខម្ហូប។' : 'Add a promo to discount a menu item.' }}</p>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div
          v-for="promo in visiblePromos"
          :key="promo.id"
          class="bg-white p-4 rounded-3xl shadow-sm border border-surface-variant flex gap-4 items-center group hover:border-primary-container transition-all relative"
        >
          <div v-if="manage" class="absolute top-2 right-2 flex gap-1 z-10">
            <button type="button" class="p-1.5 rounded-full bg-white border shadow-sm hover:bg-primary-container" :title="km ? 'កែ' : 'Edit'" @click="openEditPromo(promo)">
              <span class="material-symbols-outlined text-sm">edit</span>
            </button>
            <button type="button" class="p-1.5 rounded-full bg-white border shadow-sm hover:bg-error hover:text-white" :title="km ? 'លុប' : 'Delete'" @click="deletePromo(promo)">
              <span class="material-symbols-outlined text-sm">delete</span>
            </button>
          </div>
          <div class="relative w-24 h-24 shrink-0 overflow-hidden rounded-2xl bg-surface-container">
            <span class="absolute top-0 left-0 bg-secondary text-white px-2 py-0.5 rounded-br-lg text-[10px] font-black z-10">
              {{ km ? 'ចុះសល់ ' : '' }}{{ Number(promo.discountPercent) }}% Off
            </span>
            <img :src="resolveMediaUrl(promo.image)" :alt="promo.name" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
          </div>
          <div class="flex flex-col gap-1 min-w-0 flex-1">
            <h6 class="font-black text-sm line-clamp-1">{{ translateDishName(promo.name) }}</h6>
            <span
              v-if="manage && promo.status !== 'ACTIVE'"
              class="self-start text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant"
            >{{ km ? 'បានលាក់' : 'Hidden' }}</span>
            <div class="flex items-center gap-2">
              <span class="text-primary font-black">${{ Number(promo.promoPrice).toFixed(2) }}</span>
              <span class="text-on-surface-variant/50 text-[10px] line-through">${{ Number(promo.originalPrice).toFixed(2) }}</span>
            </div>
            <div class="flex items-center gap-1 text-primary-container">
              <span class="material-symbols-outlined text-[12px]" style="font-variation-settings: 'FILL' 1">star</span>
              <span class="text-on-surface-variant text-[10px] font-bold">
                {{ Number(promo.rating).toFixed(1) }}
                <span class="opacity-50">({{ promo.reviewCount }})</span>
              </span>
            </div>
            <button
              v-if="!manage"
              type="button"
              class="self-start mt-1.5 bg-primary hover:opacity-90 active:scale-95 text-white px-4 py-1.5 rounded-full font-black text-xs transition-all shadow-md shadow-primary/10"
              @click="$emit('order-promo', promo)"
            >
              {{ km ? 'កុម្ម៉ង់' : 'Order' }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Popular Pairings -->
    <section>
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-xl font-black text-on-surface">{{ km ? 'ឈុតចាប់គូពេញនិយម' : 'Popular Pairings' }}</h3>
        <div class="flex items-center gap-3">
          <button
            v-if="manage"
            type="button"
            class="bg-primary text-white px-4 py-2 rounded-full font-black text-xs hover:opacity-90 flex items-center gap-1 shadow-md shadow-primary/10"
            @click="openAddPairing"
          >
            <span class="material-symbols-outlined text-sm">add</span>
            {{ km ? 'បន្ថែមឈុត' : 'Add Pair' }}
          </button>
          <button
            type="button"
            class="text-primary text-xs font-bold flex items-center"
            @click="showAllPairings = !showAllPairings"
          >
            {{ km ? (showAllPairings ? 'បង្រួម' : 'មើលទាំងអស់') : (showAllPairings ? 'Show less' : 'View all') }}
            <span class="material-symbols-outlined text-[16px]">{{ showAllPairings ? 'expand_less' : 'chevron_right' }}</span>
          </button>
        </div>
      </div>

      <div v-if="loading" class="bg-white rounded-3xl border border-dashed border-outline-variant px-6 py-10 text-center">
        <p class="text-sm font-black text-on-surface-variant">{{ km ? 'កំពុងផ្ទុក...' : 'Loading pairings…' }}</p>
      </div>
      <div v-else-if="visiblePairings.length === 0" class="bg-white rounded-3xl border border-dashed border-outline-variant px-6 py-10 text-center">
        <p class="text-sm font-black text-on-surface-variant">{{ km ? 'មិនទាន់មានឈុតចាប់គូ' : 'No pairings yet' }}</p>
        <p v-if="manage" class="text-xs text-outline font-bold mt-1">{{ km ? 'បន្ថែមឈុតដោយជ្រើសមុខម្ហូបពីរ។' : 'Create a combo from two menu items.' }}</p>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="pairing in visiblePairings"
          :key="pairing.id"
          class="bg-white p-6 rounded-3xl shadow-sm hover:shadow-md transition-all border border-surface-variant flex flex-col group relative"
        >
          <div v-if="manage" class="absolute top-3 right-3 flex gap-1 z-10">
            <button type="button" class="p-1.5 rounded-full bg-white border shadow-sm hover:bg-primary-container" @click="openEditPairing(pairing)">
              <span class="material-symbols-outlined text-sm">edit</span>
            </button>
            <button type="button" class="p-1.5 rounded-full bg-white border shadow-sm hover:bg-error hover:text-white" @click="deletePairing(pairing)">
              <span class="material-symbols-outlined text-sm">delete</span>
            </button>
          </div>
          <div class="flex items-center justify-center gap-2 mb-6">
            <div class="w-24 h-24 rounded-full overflow-hidden border-2 border-surface-container-low group-hover:border-primary-container transition-colors">
              <img class="w-full h-full object-cover" :src="resolveMediaUrl(pairing.left.image)" :alt="pairing.left.name" />
            </div>
            <span class="material-symbols-outlined text-outline">add</span>
            <div class="w-24 h-24 rounded-full overflow-hidden border-2 border-surface-container-low group-hover:border-primary-container transition-colors">
              <img class="w-full h-full object-cover" :src="resolveMediaUrl(pairing.right.image)" :alt="pairing.right.name" />
            </div>
          </div>
          <div class="text-center mb-6">
            <h4 class="text-lg font-black text-on-surface">{{ translateDishName(pairing.name) }}</h4>
            <div v-if="pairing.badge" class="mt-1 bg-tertiary/10 text-tertiary text-[10px] inline-block px-2 py-0.5 rounded-full font-black">
              {{ pairingBadgeLabel(pairing.badge) }}
            </div>
            <p class="text-on-surface-variant text-xs mt-1">{{ pairing.description }}</p>
          </div>
          <div class="mt-auto flex items-center justify-between border-t border-surface-variant pt-4">
            <div class="flex flex-col">
              <span class="text-secondary font-black text-xs uppercase tracking-tighter">{{ km ? 'តម្លៃឈុតរួមគ្នា' : 'Combo Price' }}</span>
              <span class="text-primary font-black text-xl">${{ Number(pairing.comboPrice).toFixed(2) }}</span>
            </div>
            <button
              v-if="!manage"
              type="button"
              class="bg-primary text-white px-6 py-2.5 rounded-full font-black text-xs hover:opacity-90 active:scale-95 transition-all"
              @click="$emit('add-pair', pairing)"
            >
              {{ km ? 'កុម្ម៉ង់ឈុតនេះ' : 'Add Pair' }}
            </button>
            <span v-else class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
              {{ pairing.status === 'ACTIVE' ? (km ? 'កំពុងបង្ហាញ' : 'Live') : (km ? 'បានបិទ' : 'Hidden') }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- Promo modal -->
    <div v-if="isPromoModalOpen" class="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-on-surface/40 backdrop-blur-sm" @click="isPromoModalOpen = false"></div>
      <div class="bg-white w-full max-w-lg rounded-[32px] shadow-2xl relative overflow-hidden">
        <div class="p-6 border-b border-surface-variant flex justify-between items-center">
          <h3 class="text-xl font-black">{{ editingPromoId ? (km ? 'កែប្រម៉ូសិន' : 'Edit Promo') : (km ? 'បន្ថែមប្រម៉ូសិន' : 'Add Promo') }}</h3>
          <button type="button" class="p-2 rounded-full hover:bg-surface-container" @click="isPromoModalOpen = false">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="p-6 space-y-4">
          <label class="block text-xs font-black uppercase tracking-widest text-on-surface-variant">{{ km ? 'មុខម្ហូប' : 'Menu item' }}</label>
          <select v-model.number="promoForm.menuItemId" class="w-full bg-surface-container rounded-2xl p-4 font-bold outline-none">
            <option v-for="item in availableItems" :key="item.id" :value="item.id">{{ item.name }} — ${{ Number(item.price).toFixed(2) }}</option>
          </select>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-2">{{ km ? 'បញ្ចុះតម្លៃ %' : 'Discount %' }}</label>
              <input v-model.number="promoForm.discountPercent" type="number" min="0" max="100" class="w-full bg-surface-container rounded-2xl p-4 font-bold outline-none" />
            </div>
            <div>
              <label class="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-2">{{ km ? 'តម្លៃប្រម៉ូសិន' : 'Promo price' }}</label>
              <input v-model.number="promoForm.promoPrice" type="number" min="0" step="0.01" class="w-full bg-surface-container rounded-2xl p-4 font-bold outline-none" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-2">{{ km ? 'ការវាយតម្លៃ' : 'Rating' }}</label>
              <input v-model.number="promoForm.rating" type="number" min="0" max="5" step="0.1" class="w-full bg-surface-container rounded-2xl p-4 font-bold outline-none" />
            </div>
            <div>
              <label class="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-2">{{ km ? 'ចំនួនវាយតម្លៃ' : 'Reviews label' }}</label>
              <input v-model="promoForm.reviewCount" class="w-full bg-surface-container rounded-2xl p-4 font-bold outline-none" />
            </div>
          </div>
          <select v-model="promoForm.status" class="w-full bg-surface-container rounded-2xl p-4 font-bold outline-none">
            <option value="ACTIVE">{{ km ? 'បង្ហាញ' : 'Active' }}</option>
            <option value="INACTIVE">{{ km ? 'លាក់' : 'Hidden' }}</option>
          </select>
        </div>
        <div class="p-6 border-t border-surface-variant flex gap-3">
          <button type="button" class="flex-1 py-3 rounded-2xl font-black border-2" @click="isPromoModalOpen = false">{{ km ? 'បោះបង់' : 'Cancel' }}</button>
          <button type="button" :disabled="saving" class="flex-1 py-3 rounded-2xl font-black bg-primary text-white disabled:opacity-50" @click="savePromo">
            {{ saving ? (km ? 'កំពុងរក្សាទុក...' : 'Saving...') : (km ? 'រក្សាទុក' : 'Save Promo') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Pairing modal -->
    <div v-if="isPairingModalOpen" class="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-on-surface/40 backdrop-blur-sm" @click="isPairingModalOpen = false"></div>
      <div class="bg-white w-full max-w-lg rounded-[32px] shadow-2xl relative overflow-hidden max-h-[90vh] flex flex-col">
        <div class="p-6 border-b border-surface-variant flex justify-between items-center">
          <h3 class="text-xl font-black">{{ editingPairingId ? (km ? 'កែឈុតចាប់គូ' : 'Edit Pairing') : (km ? 'បន្ថែមឈុតចាប់គូ' : 'Add Pairing') }}</h3>
          <button type="button" class="p-2 rounded-full hover:bg-surface-container" @click="isPairingModalOpen = false">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="p-6 space-y-4 overflow-y-auto">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-2">{{ km ? 'មុខម្ហូបទី១' : 'First dish' }}</label>
              <select v-model.number="pairingForm.leftMenuItemId" class="w-full bg-surface-container rounded-2xl p-4 font-bold outline-none text-sm">
                <option v-for="item in availableItems" :key="'l'+item.id" :value="item.id">{{ item.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-2">{{ km ? 'មុខម្ហូបទី២' : 'Second dish' }}</label>
              <select v-model.number="pairingForm.rightMenuItemId" class="w-full bg-surface-container rounded-2xl p-4 font-bold outline-none text-sm">
                <option v-for="item in availableItems" :key="'r'+item.id" :value="item.id">{{ item.name }}</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-2">{{ km ? 'ឈ្មោះឈុត' : 'Combo name' }}</label>
            <input v-model="pairingForm.name" class="w-full bg-surface-container rounded-2xl p-4 font-bold outline-none" />
          </div>
          <div>
            <label class="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-2">{{ km ? 'ពិពណ៌នា' : 'Description' }}</label>
            <textarea v-model="pairingForm.description" rows="2" class="w-full bg-surface-container rounded-2xl p-4 font-bold outline-none resize-none"></textarea>
          </div>
          <div>
            <label class="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-2">{{ km ? 'តម្លៃឈុត' : 'Combo price' }}</label>
            <input v-model.number="pairingForm.comboPrice" type="number" min="0" step="0.01" class="w-full bg-surface-container rounded-2xl p-4 font-bold outline-none" />
          </div>
          <label class="flex items-center gap-2 text-sm font-bold">
            <input v-model="pairingForm.badge" type="checkbox" true-value="Most Popular" false-value="" class="rounded" />
            {{ km ? 'ស្លាកលក់ដាច់បំផុត' : 'Mark as Most Popular' }}
          </label>
          <select v-model="pairingForm.status" class="w-full bg-surface-container rounded-2xl p-4 font-bold outline-none">
            <option value="ACTIVE">{{ km ? 'បង្ហាញ' : 'Active' }}</option>
            <option value="INACTIVE">{{ km ? 'លាក់' : 'Hidden' }}</option>
          </select>
        </div>
        <div class="p-6 border-t border-surface-variant flex gap-3">
          <button type="button" class="flex-1 py-3 rounded-2xl font-black border-2" @click="isPairingModalOpen = false">{{ km ? 'បោះបង់' : 'Cancel' }}</button>
          <button type="button" :disabled="saving" class="flex-1 py-3 rounded-2xl font-black bg-primary text-white disabled:opacity-50" @click="savePairing">
            {{ saving ? (km ? 'កំពុងរក្សាទុក...' : 'Saving...') : (km ? 'រក្សាទុក' : 'Save Pair') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
