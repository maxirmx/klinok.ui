// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

export type Role = "vet" | "owner" | "company";
export type TabId = "home" | "pets" | "requests" | "materials" | "profile";
export type SheetId = "filter" | "analysis" | "material" | "template" | "appointment-success" | null;

export interface Pet {
  id: number;
  name: string;
  species: "Собака" | "Кошка";
  breed: string;
  sex: "Сука" | "Кобель";
  age: number;
  note: string;
  nextEvent: string;
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
}

export interface Doctor {
  id: number;
  name: string;
  role: string;
  experience: string;
  rating: number;
  price: string;
}

export interface MaterialSection {
  title: string;
  open: boolean;
  items: string[];
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

export const roles: { id: Role; label: string }[] = [
  { id: "vet", label: "Я - ветеринар" },
  { id: "owner", label: "Я - владелец животного (частный)" },
  { id: "company", label: "Я - юридическое лицо" },
];

export const pets: Pet[] = [
  { id: 1, name: "Шарик", species: "Собака", breed: "Бигль", sex: "Кобель", age: 4, note: "Прививки сделаны", nextEvent: "Вакцина через 4 дня" },
  { id: 2, name: "Чарли", species: "Собака", breed: "Корги", sex: "Кобель", age: 3, note: "Контроль правой лапы", nextEvent: "Визит через 3 дня" },
  { id: 3, name: "Боня", species: "Кошка", breed: "Мейн-кун", sex: "Сука", age: 6, note: "Анализы готовы", nextEvent: "Повторить анализ" },
  { id: 4, name: "Марта", species: "Кошка", breed: "Сфинкс", sex: "Сука", age: 2, note: "Плановый осмотр", nextEvent: "Осмотр 24 июня" },
];

export const visits: Visit[] = [
  { id: 1324312, title: "Визит #1324312", complaint: "Жалобы на боль в правой лапе", doctor: "Иванов И.И.", role: "Ветеринар", pet: "Чарли", date: "12.05.25", tag: "Через 3 дня" },
  { id: 1324313, title: "Вакцина от бешенства", complaint: "Плановая вакцинация", doctor: "ПАО Газпром", role: "Корпоративный заказчик", pet: "Чарли", date: "18.06.25", tag: "Через 4 дня" },
  { id: 1324314, title: "Повторный прием", complaint: "Контроль анализов", doctor: "Алексей Прохоров", role: "Ветеринар", pet: "Шарик", date: "21.06.25", tag: "Планово" },
];

export const doctors: Doctor[] = [
  { id: 1, name: "Алексей Прохоров", role: "Ветеринар", experience: "15 лет опыта", rating: 5, price: "5 500 ₽" },
  { id: 2, name: "Мария Соколова", role: "Терапевт", experience: "9 лет опыта", rating: 4.9, price: "4 900 ₽" },
  { id: 3, name: "Иванов И.И.", role: "Ветеринар", experience: "12 лет опыта", rating: 4.8, price: "5 100 ₽" },
];

export const materials: MaterialSection[] = [
  { title: "Справочник препаратов", open: true, items: ["Парацетамол", "Мелоксикам", "Амоксициллин", "Цефтриаксон", "Энтеросгель"] },
  { title: "Обезболивающие", open: true, items: ["Парацетамол", "Карпрофен", "Габапентин"] },
  { title: "Тема 1", open: false, items: ["Материал 1", "Материал 2"] },
  { title: "Справочник болезней", open: false, items: ["Лептоспироз", "Отит", "Дерматит"] },
];

export const templates = [
  "При температуре",
  "После операции",
  "План вакцинации",
  "Рекомендации после приема",
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
