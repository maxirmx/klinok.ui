// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

export type Role = "vet" | "owner" | "company";
export type TabId = "home" | "pets" | "requests" | "materials" | "profile";

export interface UserProfile {
  id: number;
  role: Role;
  firstName: string;
  lastName: string;
  patronymic?: string;
  email: string;
  phone: string;
  city: string;
  organization?: string;
}

export interface Pet {
  id: number;
  name: string;
  species: "Собака" | "Кошка";
  breed: string;
  sex: "Сука" | "Кобель";
  age: number;
  note: string;
  nextEvent: string;
  chip: string;
  weight: string;
}

export interface Visit {
  id: number;
  title: string;
  complaint: string;
  doctor: string;
  role: string;
  pet: string;
  date: string;
  tag: string;
  diagnosis: string;
  recommendation: string;
}

export interface EventItem {
  id: number;
  title: string;
  pet: string;
  date: string;
  tag: string;
}

export interface Doctor {
  id: number;
  name: string;
  role: string;
  experience: string;
  rating: number;
  price: string;
  about: string;
  services: string[];
}

export interface ServiceItem {
  id: number;
  title: string;
  description: string;
  price: string;
}

export interface MaterialSection {
  title: string;
  open: boolean;
  items: string[];
}

export interface MaterialArticle {
  id: string;
  title: string;
  section: string;
  warning: string;
  body: string;
}

export interface AppointmentDraft {
  doctor: string;
  pet: string;
  reason: string;
  urgency: "Планово" | "Срочно" | "Сегодня";
  details: string;
  date: string;
  time: string;
}

export interface AnalysisTemplate {
  id: number;
  title: string;
  kind: string;
  fields: string[];
  note: string;
}

export interface AnalysisDraft {
  pet: string;
  templateId: number;
  date: string;
  rows: string[];
}

export interface NotificationItem {
  id: number;
  title: string;
  description: string;
  date: string;
  unread: boolean;
}

export interface FaqItem {
  id: number;
  question: string;
  answer: string;
}

export interface VetRequest {
  id: number;
  title: string;
  pet: string;
  owner: string;
  urgency: string;
  date: string;
}

export const roles: { id: Role; label: string }[] = [
  { id: "vet", label: "Я - ветеринар" },
  { id: "owner", label: "Я - владелец животного (частный)" },
  { id: "company", label: "Я - юридическое лицо" },
];

export const users: UserProfile[] = [
  {
    id: 1,
    role: "owner",
    firstName: "Константин",
    lastName: "Константинопольский",
    patronymic: "Александрович",
    email: "konstantin@gmail.com",
    phone: "+7 (981) 243 34-35",
    city: "Санкт-Петербург",
  },
  {
    id: 2,
    role: "vet",
    firstName: "Алексей",
    lastName: "Прохоров",
    email: "vet@klinok.app",
    phone: "+7 (921) 000 11-22",
    city: "Санкт-Петербург",
  },
  {
    id: 3,
    role: "company",
    firstName: "Анна",
    lastName: "Петрова",
    email: "office@gazprom.test",
    phone: "+7 (812) 111 22-33",
    city: "Санкт-Петербург",
    organization: "ПАО Газпром",
  },
];

export const pets: Pet[] = [
  {
    id: 1,
    name: "Шарик",
    species: "Собака",
    breed: "Бигль",
    sex: "Кобель",
    age: 4,
    note: "Прививки сделаны",
    nextEvent: "Вакцина через 4 дня",
    chip: "643094100001",
    weight: "12.4 кг",
  },
  {
    id: 2,
    name: "Чарли",
    species: "Собака",
    breed: "Корги",
    sex: "Кобель",
    age: 3,
    note: "Контроль правой лапы",
    nextEvent: "Визит через 3 дня",
    chip: "643094100002",
    weight: "10.8 кг",
  },
  {
    id: 3,
    name: "Боня",
    species: "Кошка",
    breed: "Мейн-кун",
    sex: "Сука",
    age: 6,
    note: "Анализы готовы",
    nextEvent: "Повторить анализ",
    chip: "643094100003",
    weight: "6.1 кг",
  },
  {
    id: 4,
    name: "Марта",
    species: "Кошка",
    breed: "Сфинкс",
    sex: "Сука",
    age: 2,
    note: "Плановый осмотр",
    nextEvent: "Осмотр 24 июня",
    chip: "643094100004",
    weight: "4.7 кг",
  },
];

export const visits: Visit[] = [
  {
    id: 1324312,
    title: "Визит #1324312",
    complaint: "Жалобы на боль в правой лапе",
    doctor: "Иванов И.И.",
    role: "Ветеринар",
    pet: "Чарли",
    date: "12.05.25",
    tag: "Через 3 дня",
    diagnosis: "Ушиб мягких тканей правой передней лапы",
    recommendation: "Повторный осмотр через 3 дня и контроль анализов крови.",
  },
  {
    id: 1324313,
    title: "Вакцина от бешенства",
    complaint: "Плановая вакцинация",
    doctor: "ПАО Газпром",
    role: "Корпоративный заказчик",
    pet: "Чарли",
    date: "18.06.25",
    tag: "Через 4 дня",
    diagnosis: "Плановая вакцинация",
    recommendation: "Наблюдать за состоянием питомца в течение суток.",
  },
  {
    id: 1324314,
    title: "Повторный прием",
    complaint: "Контроль анализов",
    doctor: "Алексей Прохоров",
    role: "Ветеринар",
    pet: "Шарик",
    date: "21.06.25",
    tag: "Планово",
    diagnosis: "Контроль динамики после лечения",
    recommendation: "Принести результаты общего анализа крови.",
  },
];

export const events: EventItem[] = [
  { id: 1, title: "Вакцинация", pet: "Шарик", date: "18.06.25", tag: "Через 4 дня" },
  { id: 2, title: "Повторный прием", pet: "Чарли", date: "21.06.25", tag: "Через 7 дней" },
  { id: 3, title: "Анализ крови", pet: "Боня", date: "24.06.25", tag: "Планово" },
];

export const services: ServiceItem[] = [
  { id: 1, title: "Кастрация", description: "Плановая хирургическая процедура", price: "от 5 500 ₽" },
  { id: 2, title: "Стерилизация", description: "Предоперационная консультация и операция", price: "от 8 000 ₽" },
  { id: 3, title: "Терапевтический прием", description: "Осмотр, сбор анамнеза и назначения", price: "2 500 ₽" },
  { id: 4, title: "Прием нефролога", description: "Диагностика заболеваний почек", price: "3 500 ₽" },
  { id: 5, title: "Взятие крови из вены", description: "Забор материала для лаборатории", price: "700 ₽" },
];

export const doctors: Doctor[] = [
  {
    id: 1,
    name: "Алексей Прохоров",
    role: "Ветеринар",
    experience: "15 лет опыта",
    rating: 5,
    price: "5 500 ₽",
    about:
      "Ведет терапевтический прием, помогает с планом обследований и сопровождает животных после операций.",
    services: [
      "Кастрация",
      "Стерилизация",
      "Терапевтический прием",
      "Прием нефролога",
      "Прием репродуктолога",
      "Взятие крови из вены",
      "Постановка внутреннего катетера",
      "Первичная хирургическая обработка ран",
    ],
  },
  {
    id: 2,
    name: "Мария Соколова",
    role: "Терапевт",
    experience: "9 лет опыта",
    rating: 4.9,
    price: "4 900 ₽",
    about: "Специализируется на первичных приемах, профилактике и поддержке хронических пациентов.",
    services: ["Терапевтический прием", "Вакцинация", "Контроль анализов", "УЗИ брюшной полости"],
  },
  {
    id: 3,
    name: "Иванов И.И.",
    role: "Ветеринар",
    experience: "12 лет опыта",
    rating: 4.8,
    price: "5 100 ₽",
    about: "Принимает срочные обращения и ведет пациентов с травмами опорно-двигательной системы.",
    services: ["Первичный прием", "Обработка ран", "Рентген", "Повторный осмотр"],
  },
];

export const materials: MaterialSection[] = [
  { title: "Справочник препаратов", open: true, items: ["Парацетамол", "Мелоксикам", "Амоксициллин", "Цефтриаксон", "Энтеросгель"] },
  { title: "Обезболивающие", open: true, items: ["Парацетамол", "Карпрофен", "Габапентин"] },
  { title: "Тема 1", open: false, items: ["Материал 1", "Материал 2"] },
  { title: "Справочник болезней", open: false, items: ["Лептоспироз", "Отит", "Дерматит"] },
];

export const materialArticles: MaterialArticle[] = [
  {
    id: "paracetamol",
    title: "Парацетамол",
    section: "Справочник препаратов",
    warning: "Применяется только по назначению врача.",
    body: "Дозировка зависит от веса, состояния животного и сопутствующих заболеваний. При появлении рвоты, слабости или отказа от еды нужно обратиться в клинику.",
  },
  {
    id: "meloxicam",
    title: "Мелоксикам",
    section: "Обезболивающие",
    warning: "Не совмещать с другими НПВС без назначения.",
    body: "Используется для контроля боли и воспаления. Важно соблюдать курс и контролировать аппетит питомца.",
  },
];

export const analysisTemplates: AnalysisTemplate[] = [
  {
    id: 1,
    title: "Общий анализ крови",
    kind: "Кровь",
    fields: ["Гемоглобин", "Лейкоциты", "Эритроциты", "СОЭ"],
    note: "Базовый шаблон для ручного внесения лабораторных показателей.",
  },
  {
    id: 2,
    title: "Биохимия",
    kind: "Кровь",
    fields: ["АЛТ", "АСТ", "Креатинин", "Мочевина", "Глюкоза"],
    note: "Подходит для контроля почек, печени и обмена веществ.",
  },
  {
    id: 3,
    title: "Моча общий",
    kind: "Моча",
    fields: ["Цвет", "Плотность", "Белок", "Глюкоза", "pH"],
    note: "Шаблон для регулярного контроля мочевыделительной системы.",
  },
];

export const analyses: AnalysisDraft[] = [
  {
    pet: "Боня",
    templateId: 1,
    date: "12.06.26",
    rows: ["Гемоглобин 124", "Лейкоциты 8.2", "Эритроциты 6.1", "СОЭ 3"],
  },
];

export const templates = [
  "При температуре",
  "После операции",
  "План вакцинации",
  "Рекомендации после приема",
];

export const notifications: NotificationItem[] = [
  { id: 1, title: "Врач откликнулся", description: "Алексей Прохоров готов принять Чарли 18 июня.", date: "Сегодня", unread: true },
  { id: 2, title: "Анализ сохранен", description: "Общий анализ крови добавлен в карточку Бони.", date: "Вчера", unread: false },
  { id: 3, title: "Напоминание", description: "Плановый осмотр Марты назначен на 24 июня.", date: "12 июня", unread: false },
];

export const faqItems: FaqItem[] = [
  {
    id: 1,
    question: "Как долго хранится история болезни?",
    answer: "История остается в профиле питомца, пока владелец не удалит аккаунт или конкретную запись.",
  },
  {
    id: 2,
    question: "Как поменять врача?",
    answer: "Откройте заявку или визит, выберите другого специалиста и подтвердите изменение.",
  },
  {
    id: 3,
    question: "Как предложить улучшение сервису?",
    answer: "Напишите в поддержку из раздела профиля. Мы фиксируем предложения в продуктовой очереди.",
  },
  {
    id: 4,
    question: "Как удалить аккаунт?",
    answer: "Перейдите в профиль, откройте удаление аккаунта и подтвердите действие кодом из СМС.",
  },
];

export const deleteAccountReasons = [
  "Больше не пользуюсь сервисом",
  "Нашел другой способ вести историю",
  "Есть ошибки в данных",
  "Другая причина",
];

export const vetRequests: VetRequest[] = [
  { id: 5001, title: "Боль в правой лапе", pet: "Чарли", owner: "Даниил", urgency: "Сегодня", date: "18.06.25" },
  { id: 5002, title: "Контроль анализов", pet: "Боня", owner: "Константин", urgency: "Планово", date: "21.06.25" },
];

export const defaultAppointment: AppointmentDraft = {
  doctor: "Алексей Прохоров",
  pet: "Чарли",
  reason: "Боль в правой лапе",
  urgency: "Планово",
  details: "Собака стала меньше наступать на лапу после прогулки.",
  date: "18.06.25",
  time: "13:30",
};

export const defaultAnalysis: AnalysisDraft = {
  pet: "Чарли",
  templateId: 1,
  date: "15.06.26",
  rows: ["Гемоглобин", "Лейкоциты", "Эритроциты", "СОЭ"],
};
