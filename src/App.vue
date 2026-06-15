<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { computed, reactive, ref } from "vue";
import packageJson from "../package.json";
import AppIcon from "./components/AppIcon.vue";
import {
  defaultAppointment,
  doctors,
  materials,
  pets,
  roles,
  templates,
  visits as seedVisits,
  type AppointmentDraft,
  type Role,
  type SheetId,
  type TabId,
  type Visit,
} from "./data";

type AuthStep = "role" | "login" | "otp" | "welcome" | "app";

const authStep = ref<AuthStep>("role");
const selectedRole = ref<Role>("owner");
const activeTab = ref<TabId>("home");
const sheet = ref<SheetId>(null);
const details = ref<"visit" | "faq" | null>(null);
const phone = ref("+7 (900) 000-00-00");
const otp = reactive(["4", "4", "4", "4"]);
const darkMode = ref(false);
const materialMode = ref<"guide" | "templates">("guide");
const toast = ref("");
const petQuery = ref("");
const selectedType = ref("Все");
const selectedSex = ref("Все");
const appointment = reactive<AppointmentDraft>({ ...defaultAppointment });
const analysisRows = ref(["Гемоглобин", "Лейкоциты", "Эритроциты", "СОЭ"]);
const localVisits = ref<Visit[]>([...seedVisits]);
const version = packageJson.version;

const tabs: { id: TabId; label: string; icon: "home" | "bag" | "calendar" | "book" | "user" }[] = [
  { id: "home", label: "Главная", icon: "home" },
  { id: "pets", label: "Питомцы", icon: "bag" },
  { id: "requests", label: "Заявки", icon: "calendar" },
  { id: "materials", label: "Справочник", icon: "book" },
  { id: "profile", label: "Профиль", icon: "user" },
];

const screenTitle = computed(() => {
  if (details.value === "visit") return "Визит";
  if (details.value === "faq") return "FAQ";
  return tabs.find((tab) => tab.id === activeTab.value)?.label ?? "Клинок";
});

const filteredPets = computed(() => {
  const query = petQuery.value.trim().toLowerCase();
  return pets.filter((pet) => {
    const typeMatches = selectedType.value === "Все" || pet.species === selectedType.value;
    const sexMatches = selectedSex.value === "Все" || pet.sex === selectedSex.value;
    const queryMatches = !query || `${pet.name} ${pet.breed}`.toLowerCase().includes(query);
    return typeMatches && sexMatches && queryMatches;
  });
});

function nextAuthStep() {
  if (authStep.value === "role") authStep.value = "login";
  else if (authStep.value === "login") authStep.value = "otp";
  else if (authStep.value === "otp") authStep.value = "welcome";
  else if (authStep.value === "welcome") authStep.value = "app";
}

function goBack() {
  if (details.value) {
    details.value = null;
    return;
  }
  if (authStep.value === "login") authStep.value = "role";
  else if (authStep.value === "otp") authStep.value = "login";
  else if (authStep.value === "welcome") authStep.value = "otp";
}

function navigate(tab: TabId) {
  activeTab.value = tab;
  details.value = null;
}

function openSheet(target: SheetId) {
  sheet.value = target;
}

function closeSheet() {
  sheet.value = null;
}

function showToast(message: string) {
  toast.value = message;
  window.setTimeout(() => {
    if (toast.value === message) toast.value = "";
  }, 1800);
}

function applyFilters(type: string, sex: string) {
  selectedType.value = type;
  selectedSex.value = sex;
  closeSheet();
}

function submitAppointment() {
  localVisits.value.unshift({
    id: 22138,
    title: "Заявка #22138",
    complaint: appointment.reason,
    doctor: appointment.doctor,
    role: "Откликнувшиеся врачи",
    pet: appointment.pet,
    date: appointment.date,
    tag: appointment.urgency,
  });
  sheet.value = "appointment-success";
}

function saveAnalysis() {
  showToast("Анализ сохранен");
  closeSheet();
}

function openVisit() {
  details.value = "visit";
}

function roleLabel(role: Role) {
  return roles.find((item) => item.id === role)?.label ?? "";
}
</script>

<template>
  <div class="prototype" :class="{ 'is-dark': darkMode }">
    <section v-if="authStep !== 'app'" class="auth-surface">
      <div class="status-bar">
        <span>9:41</span>
        <i class="dynamic-island" />
        <div class="status-symbols">
          <span class="signal"><i /><i /><i /><i /></span>
          <span class="wifi" />
          <span class="battery" />
        </div>
      </div>

      <button v-if="authStep !== 'role'" class="back-float" aria-label="Назад" @click="goBack">
        <AppIcon name="chevron-left" />
      </button>

      <div class="auth-center" :class="`step-${authStep}`">
        <template v-if="authStep === 'role'">
          <div class="auth-heading">
            <h1>Добро пожаловать!</h1>
            <p>Давайте познакомимся</p>
          </div>
          <div class="role-list">
            <button
              v-for="role in roles"
              :key="role.id"
              class="input-tile"
              :class="{ selected: selectedRole === role.id }"
              @click="selectedRole = role.id"
            >
              {{ role.label }}
            </button>
          </div>
        </template>

        <template v-else-if="authStep === 'login'">
          <div class="auth-heading">
            <h1>С возвращением!</h1>
            <p>Введите свой номер телефона - отправим код для подтверждения</p>
          </div>
          <label class="text-input">
            <span>Телефон</span>
            <input v-model="phone" inputmode="tel" />
          </label>
        </template>

        <template v-else-if="authStep === 'otp'">
          <div class="auth-heading">
            <h1>Введите код из СМС</h1>
            <p>Код отправлен на номер {{ phone }}</p>
          </div>
          <div class="otp-row">
            <input v-for="(_, index) in otp" :key="index" v-model="otp[index]" maxlength="1" inputmode="numeric" />
          </div>
          <p class="timer">Запросить новый код можно через: 0:52</p>
        </template>

        <template v-else>
          <h1 class="welcome-title">Добро пожаловать, Даниил!</h1>
          <p class="welcome-role">{{ roleLabel(selectedRole) }}</p>
        </template>
      </div>

      <footer class="auth-footer">
        <button class="primary-action" :disabled="authStep === 'role' && !selectedRole" @click="nextAuthStep">
          {{ authStep === "welcome" ? "Перейти в приложение" : "Продолжить" }}
        </button>
        <button v-if="authStep !== 'welcome'" class="link-action" @click="authStep = 'login'">
          <span>{{ authStep === "role" ? "Есть аккаунт ?" : "Нет аккаунта ?" }}</span>
          <strong>{{ authStep === "role" ? "Войти" : "Зарегистрироваться" }}</strong>
        </button>
        <i class="home-indicator" />
      </footer>
    </section>

    <section v-else class="app-layout">
      <aside class="desktop-nav">
        <div class="brand-block">
          <strong>Клинок</strong>
          <span>Здоровье питомца под контролем</span>
        </div>
        <button v-for="tab in tabs" :key="tab.id" :class="{ active: activeTab === tab.id && !details }" @click="navigate(tab.id)">
          <AppIcon :name="tab.icon" />
          <span>{{ tab.label }}</span>
        </button>
        <button class="desktop-add" @click="openSheet('analysis')">
          <AppIcon name="plus" />
          <span>Добавить анализ</span>
        </button>
        <span class="version-info">Версия {{ version }}</span>
      </aside>

      <main class="app-surface">
        <div class="status-bar app-only">
          <span>9:41</span>
          <i class="dynamic-island" />
          <div class="status-symbols">
            <span class="signal"><i /><i /><i /><i /></span>
            <span class="wifi" />
            <span class="battery" />
          </div>
        </div>

        <header v-if="activeTab === 'home' && !details" class="home-header">
          <h1>Здравствуйте, Даниил !</h1>
          <button class="round-icon" aria-label="Уведомления">
            <AppIcon name="bell" />
          </button>
        </header>

        <header v-else class="top-bar">
          <button class="icon-button" aria-label="Назад" @click="details ? (details = null) : navigate('home')">
            <AppIcon name="chevron-left" />
          </button>
          <h1>{{ screenTitle }}</h1>
          <button class="icon-button" aria-label="Еще">
            <AppIcon name="more" />
          </button>
        </header>

        <div class="content-scroll">
          <template v-if="details === 'visit'">
            <section class="visit-document panel">
              <div class="doctor-head">
                <span class="avatar black" />
                <div>
                  <h2>Иванов И.И.</h2>
                  <p>Ветеринар</p>
                </div>
              </div>
              <div class="visit-meta">
                <div><span>Питомец</span><strong>Чарли</strong></div>
                <div><span>Дата визита</span><strong>12.05.25</strong></div>
              </div>
              <hr />
              <h3>Анамнез болезни:</h3>
              <ul>
                <li>25.02.14 владельцы обратились в клинику с жалобами на частую пенистую рвоту у собаки.</li>
                <li>Животное 3 дня отказывается от еды, стала апатичной.</li>
                <li>Стала больше пить, чаще проситься на прогулку.</li>
              </ul>
              <h3>Общее состояние:</h3>
              <ul>
                <li>Температура ректальная — 39,6 °C, ЧСС — 162 удара в минуту.</li>
                <li>Шерстный покров тусклый, сухой, на ощупь мягкий.</li>
              </ul>
              <h3>Рекомендации</h3>
              <ul>
                <li>Повторный осмотр через 3 дня и контроль анализов крови.</li>
              </ul>
            </section>
          </template>

          <template v-else-if="details === 'faq'">
            <section class="panel list-panel">
              <button v-for="item in ['Как долго хранится история болезни?', 'Как поменять врача?', 'Как предложить улучшение сервису?', 'Как удалить аккаунт?']" :key="item" class="plain-row">
                <span>{{ item }}</span>
                <AppIcon name="chevron" />
              </button>
            </section>
          </template>

          <template v-else-if="activeTab === 'home'">
            <section class="panel strip-panel">
              <div class="section-title"><h2>Новости</h2></div>
              <div class="horizontal-cards">
                <article v-for="index in 4" :key="index" class="news-card">Новость {{ index }}</article>
              </div>
            </section>

            <section class="panel">
              <div class="section-title">
                <h2>Мои питомцы</h2>
                <button @click="navigate('pets')">Все</button>
              </div>
              <div class="pet-row">
                <article v-for="pet in pets.slice(0, 3)" :key="pet.id" class="pet-card">
                  <div class="pet-caption">
                    <h3>{{ pet.name }}</h3>
                    <p>{{ pet.breed }}</p>
                    <p>{{ pet.note }}</p>
                  </div>
                </article>
              </div>
            </section>

            <section class="panel">
              <div class="section-title">
                <h2>История контактов</h2>
                <button @click="navigate('requests')">Все</button>
              </div>
              <article class="visit-card" @click="openVisit">
                <div class="visit-card-head">
                  <div>
                    <h3>Визит #1324312</h3>
                    <p>Жалобы на боль в правой лапе</p>
                  </div>
                  <span>Через 3 дня</span>
                </div>
                <dl>
                  <div><dt>Дата визита:</dt><dd>12.05.25</dd></div>
                  <div><dt>Питомец</dt><dd>Чарли</dd></div>
                  <div><dt>Диагноз</dt><dd>Медицинский диагноз</dd></div>
                </dl>
                <div class="doctor-mini"><span class="avatar black" /> <strong>Иванов И.И.</strong><small>Ветеринар</small></div>
              </article>
            </section>

            <section class="panel">
              <div class="section-title"><h2>Ближайшие события</h2><button>Все</button></div>
              <div class="event-grid">
                <article v-for="visit in localVisits.slice(0, 2)" :key="visit.id" class="event-card">
                  <header><h3>{{ visit.title }}</h3><span>{{ visit.tag }}</span></header>
                  <dl>
                    <div><dt>Питомец</dt><dd>{{ visit.pet }}</dd></div>
                    <div><dt>Дата</dt><dd>{{ visit.date }}</dd></div>
                  </dl>
                </article>
              </div>
            </section>
          </template>

          <template v-else-if="activeTab === 'pets'">
            <section class="search-panel">
              <label class="search-input">
                <AppIcon name="search" />
                <input v-model="petQuery" placeholder="Кличка питомца" />
              </label>
              <button class="filter-button" @click="openSheet('filter')"><AppIcon name="filter" /></button>
            </section>
            <section class="pet-grid-full">
              <article v-for="pet in filteredPets" :key="pet.id" class="pet-card large">
                <div class="pet-caption">
                  <h3>{{ pet.name }}</h3>
                  <p>{{ pet.breed }}</p>
                  <p>{{ pet.note }}</p>
                </div>
              </article>
            </section>
          </template>

          <template v-else-if="activeTab === 'requests'">
            <section class="form-panel panel">
              <h2>Запись к врачу</h2>
              <label><span>Врач</span><select v-model="appointment.doctor"><option v-for="doctor in doctors" :key="doctor.id">{{ doctor.name }}</option></select></label>
              <label><span>Выберите питомца</span><select v-model="appointment.pet"><option v-for="pet in pets" :key="pet.id">{{ pet.name }}</option></select></label>
              <div class="segmented compact">
                <button v-for="value in ['Планово', 'Срочно', 'Сегодня']" :key="value" :class="{ active: appointment.urgency === value }" @click="appointment.urgency = value as AppointmentDraft['urgency']">{{ value }}</button>
              </div>
              <label><span>Причина похода</span><input v-model="appointment.reason" /></label>
              <label><span>Описание проблемы</span><textarea v-model="appointment.details" /></label>
              <div class="two-cols">
                <label><span>Дата</span><input v-model="appointment.date" /></label>
                <label><span>Время</span><input v-model="appointment.time" /></label>
              </div>
              <button class="primary-action inline" @click="submitAppointment">Оформить заявку</button>
            </section>
            <section class="panel">
              <div class="section-title"><h2>Откликнувшиеся врачи</h2></div>
              <article v-for="doctor in doctors" :key="doctor.id" class="doctor-card">
                <span class="doctor-photo" />
                <div><h3>{{ doctor.name }}</h3><p>{{ doctor.role }}</p><small>{{ doctor.experience }}</small></div>
                <div class="doctor-price"><span>{{ doctor.rating }} <AppIcon name="star" /></span><strong>{{ doctor.price }}</strong></div>
              </article>
            </section>
          </template>

          <template v-else-if="activeTab === 'materials'">
            <section class="panel materials-panel">
              <h2>Полезные материалы</h2>
              <div class="segmented">
                <button :class="{ active: materialMode === 'guide' }" @click="materialMode = 'guide'">Справочник</button>
                <button :class="{ active: materialMode === 'templates' }" @click="materialMode = 'templates'">Шаблоны</button>
              </div>
              <label class="search-input materials-search">
                <AppIcon name="search" />
                <input placeholder="Поиск" />
              </label>
              <div v-if="materialMode === 'guide'" class="accordion">
                <section v-for="section in materials" :key="section.title">
                  <button class="accordion-head">
                    <span>{{ section.title }}</span>
                    <span class="tiny-control"><AppIcon :name="section.open ? 'chevron-down' : 'chevron'" /></span>
                  </button>
                  <button v-for="item in section.items" v-show="section.open" :key="item" class="material-row" @click="openSheet('material')">
                    <span>{{ item }}</span><AppIcon name="chevron" />
                  </button>
                </section>
              </div>
              <div v-else class="accordion">
                <button v-for="template in templates" :key="template" class="material-row" @click="openSheet('template')">
                  <span>{{ template }}</span><AppIcon name="chevron" />
                </button>
              </div>
            </section>
          </template>

          <template v-else-if="activeTab === 'profile'">
            <section class="profile-hero panel">
              <span class="avatar square" />
              <h2>Константин<br />Константинопольский</h2>
            </section>
            <section class="panel profile-info">
              <h2>Основная информация</h2>
              <p>Данная информация отображается только при заполнении заявки. Остальным пользователям она не видна</p>
              <div class="field"><span>ФИО</span><strong>Константинопольский Константин Александр...</strong></div>
              <div class="field"><span>E-mail</span><strong>konstantin@gmail.com</strong></div>
              <div class="field"><span>Телефон</span><strong>+7 (981) 243 34-35</strong></div>
              <div class="field"><span>Город</span><strong>Санкт-Петербург</strong></div>
            </section>
            <section class="panel settings-panel">
              <h2>Настройки</h2>
              <button class="settings-row" @click="darkMode = !darkMode">
                <span>Темная тема</span><span class="switch" :class="{ on: darkMode }"><i /></span>
              </button>
              <button class="settings-row"><AppIcon name="bell" /><span>Уведомления</span><AppIcon name="chevron" /></button>
              <button class="settings-row"><AppIcon name="book" /><span>О приложении</span><AppIcon name="chevron" /></button>
              <button class="settings-row" @click="details = 'faq'"><span class="question">?</span><span>FAQ</span><AppIcon name="chevron" /></button>
            </section>
          </template>
        </div>

        <nav class="mobile-tabs">
          <button v-for="tab in tabs" :key="tab.id" :class="{ active: activeTab === tab.id && !details }" @click="navigate(tab.id)">
            <AppIcon :name="tab.icon" />
            <span>{{ tab.label }}</span>
          </button>
          <button class="floating-add" aria-label="Добавить анализ" @click="openSheet('analysis')"><AppIcon name="plus" /></button>
          <span class="version-info mobile-version">Версия {{ version }}</span>
        </nav>
      </main>
    </section>

    <div v-if="sheet" class="sheet-layer">
      <button class="sheet-backdrop" aria-label="Закрыть" @click="closeSheet" />
      <section class="bottom-sheet" :class="`sheet-${sheet}`" role="dialog" aria-modal="true">
        <button class="sheet-handle" aria-label="Закрыть" @click="closeSheet" />

        <template v-if="sheet === 'filter'">
          <h2>Фильтр питомцев</h2>
          <div class="filter-section">
            <div class="sheet-line"><span>Тип животного</span><button @click="selectedType = 'Все'">Очистить</button></div>
            <div class="chips">
              <button v-for="type in ['Все', 'Собака', 'Кошка']" :key="type" :class="{ active: selectedType === type }" @click="selectedType = type">{{ type }}</button>
            </div>
          </div>
          <div class="filter-section">
            <div class="sheet-line"><span>Пол животного</span><button @click="selectedSex = 'Все'">Очистить</button></div>
            <div class="chips">
              <button v-for="sex in ['Все', 'Сука', 'Кобель']" :key="sex" :class="{ active: selectedSex === sex }" @click="selectedSex = sex">{{ sex }}</button>
            </div>
          </div>
          <div class="two-cols">
            <label><span>Возраст животного</span><input placeholder="От" /></label>
            <label><span>&nbsp;</span><input placeholder="До" /></label>
          </div>
          <button class="primary-action inline" @click="applyFilters(selectedType, selectedSex)">Применить фильтр</button>
          <button class="outline-action" @click="applyFilters('Все', 'Все')">Очистить фильтр</button>
        </template>

        <template v-else-if="sheet === 'analysis'">
          <h2>Добавление анализов</h2>
          <label><span>Тип анализа</span><select><option>Общий анализ крови</option><option>Биохимия</option></select></label>
          <label><span>Дата анализа</span><input value="15.06.26" /></label>
          <div class="parameter-grid">
            <input v-for="(row, index) in analysisRows" :key="row" v-model="analysisRows[index]" />
            <input placeholder="Параметр" />
            <input placeholder="Параметр" />
          </div>
          <button class="primary-action inline" @click="saveAnalysis">Сохранить</button>
          <button class="outline-action dark" @click="openSheet('template')">Шаблоны</button>
        </template>

        <template v-else-if="sheet === 'material'">
          <h2>Парацетамол</h2>
          <p class="highlight">Текст уведомления. Очень длинный текст уведомления, даже сюда не помещается.</p>
          <p>Применяется только по назначению врача. Дозировка зависит от веса, состояния животного и сопутствующих заболеваний.</p>
          <p>При появлении рвоты, слабости или отказа от еды нужно обратиться в клинику.</p>
        </template>

        <template v-else-if="sheet === 'template'">
          <h2>Название шаблона</h2>
          <p class="highlight">Текст уведомления. Очень длинный текст уведомления, даже сюда не помещается.</p>
          <p>Рекомендации после приема: контроль состояния, повторный осмотр, прием препаратов по назначенной схеме.</p>
          <button class="black-action" @click="showToast('Шаблон скопирован')">Скопировать</button>
        </template>

        <template v-else>
          <div class="success-state">
            <span><AppIcon name="check" /></span>
            <h2>Заявка создана</h2>
            <p>Врачи увидят обращение и смогут откликнуться.</p>
            <button class="primary-action inline" @click="closeSheet">Готово</button>
          </div>
        </template>
      </section>
    </div>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>
