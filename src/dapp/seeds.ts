// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { medicalOutcomeOptions } from "./medical";
import type {
  ComplaintTemplate,
  DappCollections,
  DrugGroup,
  DrugRecord,
  DrugTemplate,
  MedicalHistoryEntry,
  MedicalSectionTemplate,
} from "./types";

export const seedComplaintTemplates: ComplaintTemplate[] = [
  {
    id: "what-happened-tree",
    title: "Что случилось",
    mode: "hierarchical",
    prompt: "Выберите вариант или дополните описание своими словами.",
    options: [
      { id: "ok", label: "Все хорошо" },
      {
        id: "problem",
        label: "Есть проблемы",
        children: [
          {
            id: "behavior",
            label: "С поведением",
            children: [
              { id: "low-activity", label: "Снижение активности" },
              { id: "anxiety", label: "Беспокойство" },
              { id: "appetite", label: "Изменение аппетита" },
            ],
          },
          {
            id: "general",
            label: "С общим самочувствием",
            children: [
              { id: "fever", label: "Температура" },
              { id: "weakness", label: "Слабость" },
              { id: "pain", label: "Боль" },
            ],
          },
          {
            id: "skin",
            label: "С кожными покровами",
            children: [
              { id: "itch", label: "Зуд" },
              { id: "rash", label: "Высыпания" },
              { id: "hair-loss", label: "Выпадение шерсти" },
            ],
          },
          {
            id: "digestion",
            label: "С пищеварением",
            children: [
              { id: "vomiting", label: "Рвота" },
              { id: "diarrhea", label: "Диарея" },
              { id: "constipation", label: "Запор" },
            ],
          },
          {
            id: "breathing",
            label: "С дыханием",
            children: [
              { id: "cough", label: "Кашель" },
              { id: "shortness", label: "Одышка" },
              { id: "nasal", label: "Выделения из носа" },
            ],
          },
          {
            id: "urinary",
            label: "С мочеполовой системой",
            children: [
              { id: "frequent", label: "Частое мочеиспускание" },
              { id: "painful", label: "Болезненность" },
              { id: "discharge", label: "Выделения" },
            ],
          },
          {
            id: "support",
            label: "С опороспособностью",
            children: [
              { id: "limp", label: "Хромота" },
              { id: "refusal", label: "Не наступает на лапу" },
              { id: "stiffness", label: "Скованность" },
            ],
          },
          {
            id: "trauma",
            label: "Травма",
            children: [
              { id: "wound", label: "Рана" },
              { id: "fall", label: "Падение" },
              { id: "bite", label: "Укус" },
            ],
          },
          {
            id: "vision",
            label: "Со зрением",
            children: [
              { id: "redness", label: "Покраснение" },
              { id: "squint", label: "Щурится" },
              { id: "discharge-eye", label: "Выделения из глаз" },
            ],
          },
        ],
      },
      {
        id: "critical",
        label: "Все очень плохо",
        children: [
          { id: "collapse", label: "Потеря сознания" },
          { id: "bleeding", label: "Кровотечение" },
          { id: "seizure", label: "Судороги" },
        ],
      },
    ],
  },
  {
    id: "what-happened-free",
    title: "Что случилось: текст",
    mode: "freeText",
    prompt: "Опишите состояние питомца свободным текстом.",
    options: [],
  },
];

export const seedDrugTemplates: DrugTemplate[] = [
  {
    id: "drug-template-default",
    title: "Шаблон препарата",
    description: "Структура справочной записи по действующему веществу.",
    fields: [
      { id: "activeSubstanceRu", label: "Действующее вещество по-русски", required: true },
      { id: "activeSubstanceLatin", label: "Действующее вещество на латинском" },
      { id: "tradeNames", label: "Торговые названия", multiline: true },
      { id: "pharmacokinetics", label: "Фармакокинетика", multiline: true },
      { id: "pharmacodynamics", label: "Фармакодинамика", multiline: true },
      { id: "dogDoseText", label: "Дозы, способы введения и кратность для собак", multiline: true },
      { id: "dogDoseSource", label: "Источник для собак", multiline: true },
      { id: "catDoseText", label: "Дозы, способы введения и кратность для кошек", multiline: true },
      { id: "catDoseSource", label: "Источник для кошек", multiline: true },
    ],
  },
];

export const seedDrugGroups: DrugGroup[] = [
  {
    id: "drug-group-analgesics",
    title: "Обезболивающие",
    sortOrder: 10,
  },
];

export const seedDrugRecords: DrugRecord[] = [
  {
    id: "drug-paracetamol",
    templateId: "drug-template-default",
    templateTitle: "Шаблон препарата",
    activeSubstanceRu: "Парацетамол",
    activeSubstanceLatin: "Paracetamolum",
    pharmacyType: "human",
    groupIds: ["drug-group-analgesics"],
    tradeNames: [],
    pharmacokinetics: "",
    pharmacodynamics: "",
    dogDose: { text: "", source: "" },
    catDose: { text: "", source: "" },
    createdAt: "2026-06-22T21:03:28.000Z",
    updatedAt: "2026-06-22T21:03:28.000Z",
  },
  {
    id: "drug-meloxicam",
    templateId: "drug-template-default",
    templateTitle: "Шаблон препарата",
    activeSubstanceRu: "Мелоксикам",
    activeSubstanceLatin: "Meloxicamum",
    pharmacyType: "vet",
    groupIds: ["drug-group-analgesics"],
    tradeNames: [],
    pharmacokinetics: "",
    pharmacodynamics: "",
    dogDose: { text: "", source: "" },
    catDose: { text: "", source: "" },
    createdAt: "2026-06-22T21:03:28.000Z",
    updatedAt: "2026-06-22T21:03:28.000Z",
  },
];

export const seedMedicalSectionTemplates: MedicalSectionTemplate[] = [
  {
    id: "what-happened",
    title: "Что случилось",
    sortOrder: 10,
    fields: [{ id: "description", label: "Комментарий", type: "textarea" }],
    options: seedComplaintTemplates[0].options,
  },
  {
    id: "habitus",
    title: "Общие данные/Габитус",
    sortOrder: 20,
    fields: [
      { id: "weight", label: "Вес в кг", type: "text" },
      { id: "temperature", label: "Температура C", type: "text" },
      { id: "heartRate", label: "ЧСС", type: "text" },
      { id: "respiratoryRate", label: "ЧДД", type: "text" },
      { id: "bloodPressure", label: "АД", type: "text" },
    ],
  },
  {
    id: "therapeutic",
    title: "Терапевтический приём",
    sortOrder: 30,
    fields: [
      { id: "diseaseAnamnesis", label: "Анамнез болезни", type: "textarea" },
      { id: "lifeAnamnesis", label: "Анамнез жизни", type: "textarea" },
      { id: "exam", label: "Осмотр", type: "textarea" },
      { id: "recommendations", label: "Рекомендации", type: "textarea" },
      { id: "prescriptions", label: "Назначения", type: "textarea" },
    ],
    suggestions: ["Повторный осмотр через 3 дня", "Контроль аппетита и активности", "Назначения из справочника препаратов"],
  },
  {
    id: "diagnosis",
    title: "Диагноз",
    sortOrder: 40,
    fields: [
      { id: "preliminary", label: "Предварительный диагноз", type: "textarea" },
      { id: "differential", label: "Дифференциальные диагнозы", type: "textarea" },
      { id: "concomitant", label: "Сопутствующие диагнозы", type: "textarea" },
    ],
    suggestions: ["Ушиб мягких тканей", "Дерматит", "Отит", "Гастроэнтерит"],
  },
  {
    id: "vaccination",
    title: "Вакцинация/чипирование",
    sortOrder: 50,
    fields: [
      { id: "previousDate", label: "Дата предыдущей вакцинации", type: "text" },
      { id: "previousVaccine", label: "Название предыдущей вакцины", type: "text" },
      { id: "complications", label: "Осложнения", type: "text" },
      { id: "currentVaccine", label: "Название нынешней вакцины", type: "text" },
      { id: "batch", label: "Серия и/или номер", type: "text" },
      { id: "expiresAt", label: "Срок годности", type: "text" },
      { id: "chipNumber", label: "Номер чипа", type: "text" },
      { id: "injectionSite", label: "Место введения", type: "text" },
    ],
  },
  {
    id: "recommendations",
    title: "Рекомендации",
    sortOrder: 60,
    fields: [{ id: "text", label: "Текст рекомендации", type: "textarea" }],
    suggestions: ["Наблюдать за состоянием в течение суток", "Обеспечить покой", "Связаться с врачом при ухудшении"],
  },
  {
    id: "labs",
    title: "Лабораторные исследования",
    sortOrder: 70,
    repeatable: true,
    fields: [
      { id: "date", label: "Дата исследования", type: "text" },
      { id: "studyName", label: "Название исследования", type: "text" },
      { id: "labName", label: "Лаборатория", type: "text" },
      { id: "technician", label: "Лаборант", type: "text" },
      { id: "equipment", label: "Оборудование", type: "text" },
      { id: "comments", label: "Комментарии", type: "textarea" },
    ],
    suggestions: ["Общий анализ крови", "Биохимия", "Моча общий"],
  },
  {
    id: "instrumental",
    title: "Инструментальные исследования",
    sortOrder: 80,
    fields: [{ id: "text", label: "Описание исследования", type: "textarea" }],
  },
  {
    id: "manipulations",
    title: "Манипуляции",
    sortOrder: 90,
    fields: [{ id: "text", label: "Описание манипуляций", type: "textarea" }],
  },
  {
    id: "outcome",
    title: "Исход",
    sortOrder: 100,
    fields: [{ id: "outcome", label: "Исход", type: "select", options: medicalOutcomeOptions }],
  },
];

export const seedMedicalHistoryEntries: MedicalHistoryEntry[] = [
  {
    id: "medical-charlie-20250618",
    petId: 2,
    date: "18.06.25",
    author: "Алексей Прохоров",
    sections: [
      {
        id: "what-happened",
        title: "Что случилось",
        author: "Алексей Прохоров",
        values: { description: "Собака стала меньше наступать на правую переднюю лапу после прогулки." },
        selectedOptionIds: ["problem", "support", "limp"],
        selectedOptionLabels: ["Есть проблемы", "С опороспособностью", "Хромота"],
      },
      {
        id: "habitus",
        title: "Общие данные/Габитус",
        author: "Алексей Прохоров",
        values: {
          weight: "10.8 кг",
          temperature: "38.6",
          heartRate: "96",
          respiratoryRate: "24",
          bloodPressure: "120/80 сред. 93",
        },
      },
      {
        id: "diagnosis",
        title: "Диагноз",
        author: "Алексей Прохоров",
        values: {
          preliminary: "Ушиб мягких тканей правой передней лапы",
          differential: "Растяжение связок, поверхностная травма",
          concomitant: "",
        },
      },
      {
        id: "vaccination",
        title: "Вакцинация/чипирование",
        author: "Алексей Прохоров",
        values: {
          previousDate: "12.06.24",
          previousVaccine: "Nobivac DHPPI",
          complications: "Нет",
          currentVaccine: "Nobivac Rabies",
          batch: "NR-2256",
          expiresAt: "06.2027",
          chipNumber: "643094100002",
          injectionSite: "Холка",
        },
      },
      {
        id: "labs",
        title: "Лабораторные исследования",
        author: "Алексей Прохоров",
        values: {},
        labStudies: [
          {
            id: "lab-charlie-20250618",
            date: "18.06.25",
            studyName: "Общий анализ крови",
            labName: "Klinok Lab",
            technician: "Смирнова А.",
            equipment: "VetScan HM5",
            indicators: [
              { id: "wbc", name: "Лейкоциты", result: "8.2", unit: "10^9/л", reference: "6.0-17.0" },
              { id: "hb", name: "Гемоглобин", result: "142", unit: "г/л", reference: "120-180" },
            ],
            comments: "Без значимых отклонений.",
          },
        ],
      },
      {
        id: "outcome",
        title: "Исход",
        author: "Алексей Прохоров",
        values: { outcome: "В стадии наблюдения" },
      },
    ],
    createdAt: "2026-06-22T20:58:47.000Z",
    updatedAt: "2026-06-22T20:58:47.000Z",
  },
  {
    id: "medical-charlie-20250512",
    petId: 2,
    date: "12.05.25",
    author: "Иванов И.И.",
    sections: [
      {
        id: "what-happened",
        title: "Что случилось",
        author: "Иванов И.И.",
        values: { description: "Плановый контроль после вакцинации." },
        selectedOptionIds: ["ok"],
        selectedOptionLabels: ["Все хорошо"],
      },
      {
        id: "labs",
        title: "Лабораторные исследования",
        author: "Иванов И.И.",
        values: {},
        labStudies: [
          {
            id: "lab-charlie-20250512",
            date: "12.05.25",
            studyName: "Общий анализ крови",
            labName: "Klinok Lab",
            technician: "",
            equipment: "VetScan HM5",
            indicators: [{ id: "wbc", name: "Лейкоциты", result: "7.9", unit: "10^9/л", reference: "6.0-17.0" }],
            comments: "",
          },
        ],
      },
      {
        id: "outcome",
        title: "Исход",
        author: "Иванов И.И.",
        values: { outcome: "Без наблюдения" },
      },
    ],
    createdAt: "2026-06-22T20:58:46.000Z",
    updatedAt: "2026-06-22T20:58:46.000Z",
  },
];

export function createSeedCollections(): DappCollections {
  return {
    complaintTemplates: seedComplaintTemplates,
    complaintRecords: [],
    medicalSectionTemplates: seedMedicalSectionTemplates,
    medicalHistoryEntries: seedMedicalHistoryEntries,
    drugGroups: seedDrugGroups,
    drugTemplates: seedDrugTemplates,
    drugRecords: seedDrugRecords,
  };
}
