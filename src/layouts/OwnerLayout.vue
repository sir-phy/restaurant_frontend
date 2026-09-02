<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { t, currentLang, setLang } from '../i18n'
import { logout, currentUser, fetchMe } from '../services/auth'
import { notificationService, type CustomerNotificationItem } from '../services/notifications'

const route = useRoute()
const router = useRouter()

const sidebarLinks = computed(() => [
  { name: t('dashboard'), icon: 'grid_view', path: '/dashboard' },
  { name: t('analytics'), icon: 'analytics', path: '/analytics' },
  { name: t('userManagement'), icon: 'manage_accounts', path: '/users' },
  { name: t('settings'), icon: 'settings', path: '/settings' }
])

const pageTitle = computed(() => {
  switch (route.name) {
    case 'analytics':
      return t('analytics')
    case 'users':
      return t('userManagement')
    case 'settings':
      return t('settings')
    default:
      return currentLang.value === 'km' ? 'ផ្ទាំងគ្រប់គ្រងម្ចាស់ហាង' : 'Owner Dashboard'
  }
})

const initials = computed(() => {
  const name = currentUser.value?.name?.trim() || 'Owner'
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
})

const showNotifications = ref(false)
const notifications = ref<CustomerNotificationItem[]>([])
const notificationsLoading = ref(false)
const notifWrap = ref<HTMLElement | null>(null)

const unreadCount = computed(() =>
  notifications.value.filter((item) => item.status === 'UNREAD').length,
)

const loadNotifications = async () => {
  notificationsLoading.value = true
  try {
    const res = await notificationService.getNotifications()
    notifications.value = Array.isArray(res.data) ? res.data.slice(0, 12) : []
  } catch {
    notifications.value = []
  } finally {
    notificationsLoading.value = false
  }
}

const toggleNotifications = async () => {
  showNotifications.value = !showNotifications.value
  if (showNotifications.value) await loadNotifications()
}

const openNotification = async (item: CustomerNotificationItem) => {
  if (item.status === 'UNREAD') {
    try {
      await notificationService.markAsRead(item.id)
      item.status = 'READ'
    } catch {
      /* keep the panel usable */
    }
  }
  showNotifications.value = false
  if (item.orderId) router.push('/chef')
}

const onDocumentClick = (event: MouseEvent) => {
  if (!showNotifications.value) return
  const target = event.target as Node | null
  if (notifWrap.value && target && !notifWrap.value.contains(target)) {
    showNotifications.value = false
  }
}

const handleLogout = async () => {
  await logout()
  router.push('/')
}

onMounted(() => {
  if (!currentUser.value) void fetchMe()
  void loadNotifications()
  document.addEventListener('click', onDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
})
</script>

<template>
  <div class="flex bg-surface min-h-screen">
    <!-- Sidebar (Persistent) -->
    <aside class="w-64 fixed left-0 top-0 h-full hidden lg:flex flex-col bg-white border-r border-surface-variant p-6 gap-8 z-50">
      <div class="px-2">
        <h1 class="text-3xl font-black text-on-surface">TosEat.</h1>
        <p class="text-xs font-bold text-on-surface-variant mt-1 uppercase tracking-widest italic">{{ t('ownerPortal') }}</p>
      </div>

      <nav class="flex flex-col gap-2">
        <router-link 
          v-for="link in sidebarLinks" 
          :key="link.path"
          :to="link.path"
          class="flex items-center gap-3 p-3 rounded-xl transition-all font-bold text-sm"
          :class="route.path === link.path ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-surface-container'"
        >
          <span class="material-symbols-outlined" :style="route.path === link.path ? 'font-variation-settings: \'FILL\' 1' : ''">{{ link.icon }}</span>
          {{ link.name }}
        </router-link>
      </nav>

      <div class="mt-auto flex flex-col gap-4">
        <!-- Language Switcher inside Sidebar -->
        <div class="px-2 py-4 border-t border-surface-variant/40">
          <label class="text-[10px] font-black text-on-surface-variant uppercase tracking-wider block mb-2">{{ currentLang === 'km' ? 'ភាសា / Language' : 'Language / ភាសា' }}</label>
          <div class="flex items-center gap-1 bg-surface-container-low border border-surface-variant rounded-xl p-1 shadow-3xs">
            <button 
              @click="setLang('en')" 
              class="flex-1 py-1.5 text-xs font-bold rounded-lg transition-all"
              :class="currentLang === 'en' ? 'bg-primary text-white shadow-sm font-black' : 'text-on-surface-variant hover:text-on-surface'"
            >
              EN
            </button>
            <button 
              @click="setLang('km')" 
              class="flex-1 py-1.5 text-xs font-bold rounded-lg transition-all"
              :class="currentLang === 'km' ? 'bg-primary text-white shadow-sm font-black' : 'text-on-surface-variant hover:text-on-surface'"
            >
              ខ្មែរ
            </button>
          </div>
        </div>

        <button 
          @click="handleLogout" 
          class="flex items-center gap-3 p-3 rounded-xl text-secondary hover:text-error hover:bg-rose-50/50 transition-colors font-bold text-sm text-left w-full cursor-pointer"
        >
          <span class="material-symbols-outlined">logout</span>
          {{ t('logout') }}
        </button>
      </div>
    </aside>

    <div class="flex-1 lg:pl-64 min-w-0 pb-20 lg:pb-0 flex flex-col min-h-screen">
      <!-- Stays put when switching Dashboard / Analytics / Users / Settings -->
      <header class="sticky top-0 z-40 h-20 bg-white/80 backdrop-blur-md border-b border-surface-variant flex items-center justify-between px-6 md:px-8 gap-4">
        <h2 class="text-lg md:text-xl font-black text-on-surface truncate">{{ pageTitle }}</h2>

        <div class="flex items-center gap-3 md:gap-6 shrink-0">
          <router-link
            to="/chef"
            class="flex items-center px-3 md:px-4 py-2 bg-tertiary/10 rounded-full gap-2 no-underline hover:bg-tertiary/20 transition-colors"
            :title="currentLang === 'km' ? 'បើកផ្ទះបាយ' : 'Open kitchen'"
          >
            <span class="w-2 h-2 bg-tertiary rounded-full animate-pulse"></span>
            <span class="text-[10px] md:text-xs font-bold text-tertiary">{{ currentLang === 'km' ? 'ផ្ទះបាយកំពុងដំណើរការ' : 'KITCHEN LIVE' }}</span>
          </router-link>

          <div ref="notifWrap" class="relative border-l border-surface-variant pl-4 md:pl-6">
            <button
              type="button"
              class="p-2 hover:bg-surface-container rounded-full transition-colors relative cursor-pointer text-on-surface-variant"
              :aria-expanded="showNotifications"
              :title="currentLang === 'km' ? 'ការជូនដំណឹង' : 'Notifications'"
              @click.stop="toggleNotifications"
            >
              <span class="material-symbols-outlined">notifications</span>
              <span
                v-if="unreadCount > 0"
                class="absolute top-1.5 right-1.5 min-w-2 h-2 px-0.5 bg-secondary rounded-full"
              />
            </button>

            <div
              v-if="showNotifications"
              class="absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-2rem))] bg-white border border-surface-variant rounded-2xl shadow-xl overflow-hidden"
            >
              <div class="px-4 py-3 border-b border-surface-variant flex items-center justify-between">
                <p class="text-xs font-black uppercase tracking-wider text-on-surface">
                  {{ currentLang === 'km' ? 'ការជូនដំណឹង' : 'Notifications' }}
                </p>
                <span v-if="unreadCount" class="text-[10px] font-black text-secondary">{{ unreadCount }}</span>
              </div>
              <div class="max-h-80 overflow-y-auto">
                <p v-if="notificationsLoading" class="px-4 py-8 text-center text-xs font-bold text-on-surface-variant">
                  {{ currentLang === 'km' ? 'កំពុងផ្ទុក...' : 'Loading...' }}
                </p>
                <p v-else-if="!notifications.length" class="px-4 py-8 text-center text-xs font-bold text-on-surface-variant">
                  {{ currentLang === 'km' ? 'មិនមានការជូនដំណឹងទេ' : 'No notifications yet' }}
                </p>
                <button
                  v-for="item in notifications"
                  :key="item.id"
                  type="button"
                  class="w-full text-left px-4 py-3 border-b border-surface-variant/50 last:border-0 hover:bg-surface-container-low cursor-pointer"
                  :class="item.status === 'UNREAD' ? 'bg-primary/5' : ''"
                  @click="openNotification(item)"
                >
                  <p class="text-xs font-bold text-on-surface leading-snug">{{ item.message }}</p>
                  <p class="text-[10px] font-bold text-outline mt-1">{{ new Date(item.createdAt).toLocaleString() }}</p>
                </button>
              </div>
            </div>
          </div>

          <div
            class="h-10 w-10 rounded-full bg-primary-container text-on-surface border-2 border-primary-container shrink-0 flex items-center justify-center text-xs font-black"
            :title="currentUser?.name || 'Owner'"
          >
            {{ initials }}
          </div>
        </div>
      </header>

      <div class="flex-1 min-w-0">
        <router-view v-slot="{ Component }">
          <transition name="page-fade" mode="out-in">
            <component :is="Component" :key="route.path" />
          </transition>
        </router-view>
      </div>
    </div>

    <!-- Mobile Bottom Navigation Bar (Visible only on screens below lg) -->
    <nav class="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 px-4 py-2.5 flex justify-around items-center shadow-lg">
      <router-link 
        v-for="link in sidebarLinks" 
        :key="link.path"
        :to="link.path"
        class="flex flex-col items-center gap-1 p-1.5 transition-all font-bold text-[10px]"
        :class="route.path === link.path ? 'text-primary' : 'text-slate-500 hover:text-slate-800'"
      >
        <span class="material-symbols-outlined text-lg leading-none" :style="route.path === link.path ? 'font-variation-settings: \'FILL\' 1' : ''">{{ link.icon }}</span>
        <span>{{ link.name }}</span>
      </router-link>
      <button 
        @click="handleLogout" 
        class="flex flex-col items-center gap-1 p-1.5 text-rose-600 transition-colors font-bold text-[10px] cursor-pointer"
      >
        <span class="material-symbols-outlined text-lg leading-none">logout</span>
        <span>{{ t('logout') }}</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.18s ease;
}

.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
}
</style>
