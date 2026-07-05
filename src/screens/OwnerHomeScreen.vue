<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { computed } from "vue";
import { RouterLink } from "vue-router";
import AppShell from "../components/AppShell.vue";
import AppIcon from "../components/AppIcon.vue";
import { doctors, events, materialArticles, pets } from "../data";
import { localVisits } from "../state";

const latestVisit = computed(() => localVisits.value[0] ?? null);
</script>

<template>
  <AppShell title="Здравствуйте, Даниил !" subtitle="Сегодня есть 3 важных события" home>
    <section class="panel strip-panel">
      <div class="section-title">
        <h2>Новости</h2>
      </div>
      <div class="horizontal-cards">
        <article v-for="index in 4" :key="index" class="news-card">
          <span>Новость {{ index }}</span>
        </article>
      </div>
    </section>

    <section class="panel">
      <div class="section-title">
        <h2>Мои питомцы</h2>
        <RouterLink to="/owner/pets">Все</RouterLink>
      </div>
      <div class="pet-row">
        <RouterLink v-for="pet in pets.slice(0, 3)" :key="pet.id" class="pet-card" :to="`/owner/pets/${pet.id}`">
          <div class="pet-art">{{ pet.species === "Кошка" ? "К" : "С" }}</div>
          <div class="pet-caption">
            <h3>{{ pet.name }}</h3>
            <p>{{ pet.breed }}</p>
            <p>{{ pet.note }}</p>
          </div>
        </RouterLink>
      </div>
    </section>

    <section class="panel">
      <div class="section-title">
        <h2>История контактов</h2>
        <RouterLink to="/owner/visits">Все</RouterLink>
      </div>
      <RouterLink v-if="latestVisit" class="visit-card" :to="`/owner/visits/${latestVisit.id}`">
        <div class="visit-card-head">
          <div>
            <h3>{{ latestVisit.title }}</h3>
            <p>{{ latestVisit.complaint }}</p>
          </div>
          <span>{{ latestVisit.tag }}</span>
        </div>
        <dl>
          <div><dt>Дата визита:</dt><dd>{{ latestVisit.date }}</dd></div>
          <div><dt>Питомец</dt><dd>{{ latestVisit.pet }}</dd></div>
          <div><dt>Диагноз</dt><dd>{{ latestVisit.diagnosis }}</dd></div>
        </dl>
        <div class="doctor-mini">
          <span class="avatar black" />
          <strong>{{ latestVisit.doctor }}</strong>
          <small>{{ latestVisit.role }}</small>
        </div>
      </RouterLink>
      <div v-else class="plain-card">
        <strong>История контактов пока пуста</strong>
        <span>Создайте первую заявку, и она появится здесь после синхронизации.</span>
        <RouterLink class="outline-action inline" to="/owner/booking">Создать заявку</RouterLink>
      </div>
    </section>

    <section class="panel">
      <div class="section-title">
        <h2>Ближайшие события</h2>
        <RouterLink to="/owner/booking">Записаться</RouterLink>
      </div>
      <div class="event-grid">
        <article v-for="event in events" :key="event.id" class="event-card">
          <header><h3>{{ event.title }}</h3><span>{{ event.tag }}</span></header>
          <dl>
            <div><dt>Питомец</dt><dd>{{ event.pet }}</dd></div>
            <div><dt>Дата</dt><dd>{{ event.date }}</dd></div>
          </dl>
        </article>
      </div>
    </section>

    <section class="panel">
      <div class="section-title">
        <h2>Откликнувшиеся врачи</h2>
        <RouterLink to="/owner/doctors">Все</RouterLink>
      </div>
      <RouterLink v-for="doctor in doctors.slice(0, 2)" :key="doctor.id" class="doctor-card" :to="`/owner/doctors/${doctor.id}`">
        <span class="doctor-photo" />
        <div><h3>{{ doctor.name }}</h3><p>{{ doctor.role }}</p><small>{{ doctor.experience }}</small></div>
        <div class="doctor-price"><span>{{ doctor.rating }} <AppIcon name="star" /></span><strong>{{ doctor.price }}</strong></div>
      </RouterLink>
    </section>

    <section class="panel">
      <div class="section-title">
        <h2>Полезные статьи</h2>
        <RouterLink to="/owner/materials">Все</RouterLink>
      </div>
      <div class="article-list compact">
        <RouterLink v-for="article in materialArticles" :key="article.id" class="material-row" :to="`/owner/materials/${article.id}`">
          <span>{{ article.title }}</span>
          <AppIcon name="chevron" />
        </RouterLink>
      </div>
    </section>
  </AppShell>
</template>
